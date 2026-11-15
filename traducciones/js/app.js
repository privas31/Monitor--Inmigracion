import { COUNTRIES, DOC_TYPES, getTemplate, getCountry, TEMPLATES } from './templates.js';
import { translateValue, missingNumbers, strip } from './translate.js';
import { readDocument, suggestFields } from './ocr.js';
import { buildPdf, certText } from './pdf.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SEC_ES = { 'Registry data': 'Datos del registro', Registrant: 'Persona registrada', Parents: 'Padres', Marriage: 'Matrimonio', 'Spouse 1': 'Contrayente 1', 'Spouse 2': 'Contrayente 2', Notes: 'Anotaciones, sellos y firmas', Certification: 'Certificación del registro', 'Additional text': 'Texto adicional' };
const QUICK = ['[illegible]', '[seal]', '[signature]', '[sic]', '[blank]'];

// ---------- Almacenamiento local (solo en este navegador) ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(`tradudoc.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`tradudoc.${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};

let S;
function newJob() {
  S = { step: 1, country: 'mx', doc: 'birth', target: 'uscis', pages: [], ocr: null, values: {}, extras: [], active: null, attach: true, fileName: '' };
}
newJob();

// ---------- Navegación ----------
const ROUTES = { nueva: 'Nueva traducción', historial: 'Historial', traductora: 'Mis datos de traductora', plantillas: 'Plantillas por país' };
function renderNav(active) {
  $('#nav').innerHTML = Object.entries(ROUTES).map(([r, l]) => `<a href="#${r}" class="${r === active ? 'active' : ''}">${l}</a>`).join('');
  $('#nav a[href="#nueva"]').onclick = (e) => { e.preventDefault(); if (S.step > 1 && !confirm2()) return; newJob(); go('nueva'); };
}
const confirm2 = () => true; // (los diálogos del navegador están bloqueados en algunos entornos)
function route() {
  const r = (location.hash || '#nueva').slice(1);
  const page = ROUTES[r] ? r : 'nueva';
  renderNav(page);
  ({ nueva: pNew, historial: pHistory, traductora: pTranslator, plantillas: pTemplates })[page]();
  window.scrollTo(0, 0);
}
function go(r) { if (location.hash === `#${r}`) route(); else location.hash = r; }
window.addEventListener('hashchange', route);

const STEPS = ['Documento', 'Subir acta', 'Revisar campos', 'Descargar PDF'];
const stepper = (cur) => `<div class="stepper">${STEPS.map((s, i) => `<div class="s ${i + 1 < cur ? 'done' : i + 1 === cur ? 'cur' : ''}" ${i + 1 < cur ? `data-step="${i + 1}" style="cursor:pointer"` : ''}><span class="n">${i + 1 < cur ? '✓' : i + 1}</span>${s}</div>`).join('')}</div>`;
function bindStepper() { view.querySelectorAll('[data-step]').forEach((el) => { el.onclick = () => { S.step = +el.dataset.step; pNew(); }; }); }

function pNew() { ({ 1: sDoc, 2: sUpload, 3: sReview, 4: sFinish })[S.step](); bindStepper(); }
const tpl = () => getTemplate(S.country, S.doc);
const country = () => getCountry(S.country);
const docType = () => DOC_TYPES.find((d) => d.id === S.doc);

// ---------- Paso 1: documento ----------
function sDoc() {
  const t = tpl();
  view.innerHTML = `${stepper(1)}<div class="top"><div><h1>Nueva traducción</h1><p class="sub">Elija el país, el tipo de acta y para quién es la traducción.</p></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card ctrl">
      <div><label>País</label><select id="country" class="btn" style="width:100%">${COUNTRIES.map((c) => `<option value="${c.id}" ${c.id === S.country ? 'selected' : ''}>${c.flag} ${esc(c.name)}</option>`).join('')}</select></div>
      <div><label>Tipo de acta</label><select id="doc" class="btn" style="width:100%">${DOC_TYPES.map((d) => `<option value="${d.id}" ${d.id === S.doc ? 'selected' : ''}>${esc(d.es)}</option>`).join('')}</select></div>
      <div><label>La traducción es para</label><select id="target" class="btn" style="width:100%"><option value="uscis" ${S.target === 'uscis' ? 'selected' : ''}>USCIS</option><option value="eoir" ${S.target === 'eoir' ? 'selected' : ''}>Corte de inmigración (EOIR)</option></select></div>
      <button class="btn primary" id="next">Continuar → Subir acta</button>
    </div>
    <div class="card"><div class="row"><h2 style="margin:0">${esc(country().flag)} ${esc(docType().es)}</h2><span class="spacer"></span>${t.status === 'completa' ? '<span class="badge ok">Plantilla completa</span>' : '<span class="badge review">Plantilla general</span>'}</div>
      <p class="small muted">${t.status === 'completa' ? 'Campos del formato vigente.' : 'Plantilla general de partidas centroamericanas. Si su acta tiene datos que no aparecen aquí, agréguelos con “Agregar campo”; la traducción debe ser completa.'}</p>
      <div class="small" style="columns:2;column-gap:20px">${t.fields.map((f) => `<div style="padding:2px 0">${f.req ? '<b>' : ''}${esc(f.es)}${f.req ? '</b> *' : ''}</div>`).join('')}</div>
      <p class="small muted" style="margin-top:8px">* obligatorio</p></div>
  </div>`;
  const reset = () => { S.values = {}; S.extras = []; };
  $('#country').onchange = (e) => { S.country = e.target.value; reset(); sDoc(); bindStepper(); };
  $('#doc').onchange = (e) => { S.doc = e.target.value; reset(); sDoc(); bindStepper(); };
  $('#target').onchange = (e) => { S.target = e.target.value; };
  $('#next').onclick = () => { S.step = S.pages.length ? 3 : 2; pNew(); };
}

// ---------- Paso 2: subir acta ----------
function sUpload() {
  view.innerHTML = `${stepper(2)}<div class="top"><div><h1>Suba el acta</h1><p class="sub">${esc(country().flag)} ${esc(docType().es)} · Foto (JPG, PNG) o PDF</p></div></div>
  <div class="grid" style="grid-template-columns:1.4fr 1fr">
    <div class="card"><div class="drop" id="drop">
      <h2 style="margin-bottom:4px">Arrastre aquí el acta</h2><p class="muted small">JPG, PNG, WEBP o PDF · máximo 25 MB · PDF de hasta 4 páginas</p>
      <div class="row" style="justify-content:center;margin-top:12px"><label class="btn primary">Seleccionar archivo<input type="file" id="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label></div>
    </div>
    <div id="upMsg" class="notice hide" style="margin-top:12px"></div>
    <div class="notice" style="margin-top:12px">🔒 El acta se procesa <b>en este navegador</b>. No se envía a ningún servidor.</div></div>
    <div class="card"><h2>Consejos</h2><ul class="small tips">
      <li>Foto de frente, con buena luz, sin sombras y con el acta completa (incluidos sellos y notas al margen).</li>
      <li>Un PDF escaneado da mejores resultados que una foto con el celular.</li>
      <li>La lectura automática es una ayuda: usted revisa cada campo contra el original.</li></ul></div>
  </div>`;
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => ev.dataTransfer.files[0] && loadFile(ev.dataTransfer.files[0]));
  $('#file').onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
}
const msg = (html, warn) => { const m = $('#upMsg'); if (m) { m.innerHTML = html; m.classList.remove('hide'); m.classList.toggle('warn', !!warn); } };

async function loadFile(file) {
  if (file.size > 25 * 1024 * 1024) return msg('El archivo supera 25 MB.', true);
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const isImg = (head[0] === 0xff && head[1] === 0xd8) || (head[0] === 0x89 && head[1] === 0x50) || (head[0] === 0x52 && head[1] === 0x49);
  if (!isPdf && !isImg) return msg('El archivo no es una imagen JPG/PNG/WEBP ni un PDF válido.', true);
  msg('<span class="spin" style="display:inline-block;vertical-align:middle;width:16px;height:16px"></span> Preparando el documento…');
  try {
    S.pages = isPdf ? await pdfToCanvases(file) : [await imageToCanvas(file)];
  } catch (e) { console.error(e); return msg(`No se pudo abrir el archivo: ${esc(e.message)}`, true); }
  S.fileName = file.name; S.ocr = null;
  msg(`<b>${esc(file.name)}</b> listo (${S.pages.length} página${S.pages.length > 1 ? 's' : ''}).
    <div class="row" style="margin-top:10px"><button class="btn primary" id="doOcr">Leer el acta automáticamente</button><button class="btn" id="manual">Llenar los campos a mano</button></div>
    <p class="small muted" style="margin:8px 0 0">La lectura automática tarda unos segundos y se hace en este equipo.</p>`);
  $('#manual').onclick = () => { S.step = 3; pNew(); };
  $('#doOcr').onclick = runOcr;
}

async function runOcr() {
  msg('<span class="spin" style="display:inline-block;vertical-align:middle;width:16px;height:16px"></span> Leyendo el acta… <b id="pct">0%</b>');
  try {
    const lines = [];
    for (const [pi, c] of S.pages.entries()) {
      const r = await readDocument(c, (p) => { const el = $('#pct'); if (el) el.textContent = `${Math.round(((pi + p) / S.pages.length) * 100)}%`; });
      r.lines.forEach((l) => lines.push({ ...l, page: pi }));
    }
    S.ocr = { lines };
    const sug = suggestFields(lines, tpl().fields);
    for (const [k, v] of Object.entries(sug)) if (!S.values[k]?.es) setOrig(k, v, true);
    S.step = 3; pNew();
  } catch (e) {
    console.error(e);
    msg(`No se pudo leer el acta automáticamente (${esc(e.message)}). Puede llenar los campos a mano. <button class="btn sm" id="manual2">Continuar a mano</button>`, true);
    $('#manual2').onclick = () => { S.step = 3; pNew(); };
  }
}

async function imageToCanvas(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('imagen no válida')); i.src = url; });
  const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
  return c;
}
async function pdfToCanvases(file) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(4, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 2200 / Math.max(vp0.width, vp0.height)) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(c);
  }
  return out;
}

// ---------- Valores y traducción ----------
function fieldList() {
  return [...tpl().fields, ...S.extras.map((x) => ({ key: x.id, es: x.es || 'Texto adicional', en: x.en || 'Additional text', type: 'longtext', sec: 'Additional text', extra: true }))];
}
function setOrig(key, es, fromOcr = false) {
  const f = fieldList().find((x) => x.key === key);
  const v = S.values[key] || (S.values[key] = { es: '', en: '', edited: false, reviewed: false });
  v.es = es; v.ocr = fromOcr; v.reviewed = false;
  if (!v.edited) {
    const r = translateValue(f.type, es, S.country);
    v.en = r.en; v.sure = r.sure; v.suggestion = r.suggestion || '';
  }
}
function issues() {
  const list = [];
  for (const f of fieldList()) {
    const v = S.values[f.key];
    const has = v && (v.es || v.en);
    if (f.req && !(v && v.en)) list.push({ key: f.key, level: 'fail', text: `Falta: ${f.es}` });
    if (!has) continue;
    if (!v.en) list.push({ key: f.key, level: 'fail', text: `Sin traducción: ${f.es}` });
    if (!v.reviewed) list.push({ key: f.key, level: 'fail', text: `Sin revisar: ${f.es}` });
    const miss = ['date', 'age'].includes(f.type) ? [] : missingNumbers(v.es, v.en); // en fechas el mes numérico pasa a nombre
    if (miss.length && v.en) list.push({ key: f.key, level: 'warn', text: `${f.es}: números del original que no aparecen en la traducción (${miss.join(', ')})` });
    if (f.type === 'name' && v.en && strip(v.es) !== strip(v.en) && v.es) list.push({ key: f.key, level: 'warn', text: `${f.es}: el nombre traducido es distinto al original (los nombres no se traducen)` });
  }
  return list;
}

// ---------- Paso 3: revisión ----------
function sReview() {
  const t = tpl();
  const fields = fieldList();
  const filled = fields.filter((f) => S.values[f.key]?.es || S.values[f.key]?.en);
  const reviewed = filled.filter((f) => S.values[f.key]?.reviewed).length;
  let lastSec = null;
  const rows = fields.map((f) => {
    const v = S.values[f.key] || {};
    const secRow = f.sec !== lastSec ? `<tr><td colspan="4" style="background:#f8fafc;font-weight:700;font-size:12px;color:var(--navy)">${esc(SEC_ES[f.sec] || f.sec)}</td></tr>` : '';
    lastSec = f.sec;
    const st = !v.en && !v.es ? '' : v.reviewed ? '<span class="ok" title="Revisado">✓</span>' : (v.sure === false || f.type === 'longtext' || f.type === 'seal') ? '<span style="color:#b45309;font-weight:800" title="Revise">!</span>' : '<span class="muted">•</span>';
    const quick = ['longtext', 'seal', 'text', 'place', 'name', 'code', 'date'].includes(f.type) ? `<div class="row" style="gap:4px;margin-top:4px">${QUICK.map((q) => `<button class="btn sm qk" data-k="${f.key}" data-q="${q}" style="padding:2px 6px;font-size:11px">${q}</button>`).join('')}</div>` : '';
    return `${secRow}<tr data-row="${f.key}" class="${S.active === f.key ? 'act' : ''}">
      <td style="width:22%"><div style="font-weight:600;font-size:13px">${esc(f.es)}${f.req ? ' *' : ''}</div><div class="muted" style="font-size:11.5px">${esc(f.en)}</div>${f.extra ? `<button class="btn sm rmx" data-k="${f.key}" style="margin-top:4px;padding:2px 6px;font-size:11px">Quitar</button>` : ''}</td>
      <td><textarea class="ta es" data-k="${f.key}" rows="${f.type === 'longtext' ? 3 : 1}" placeholder="Como aparece en el acta">${esc(v.es || '')}</textarea>${v.ocr ? '<div class="small" style="color:#b45309">Leído automáticamente: verifique</div>' : ''}</td>
      <td><textarea class="ta en" data-k="${f.key}" rows="${f.type === 'longtext' ? 3 : 1}" placeholder="English">${esc(v.en || '')}</textarea>${v.suggestion ? `<div class="small muted">Sugerencia: ${esc(v.suggestion)}</div>` : ''}${quick}</td>
      <td style="width:70px;text-align:center">${st}<br><label class="small" style="display:inline-flex;gap:4px;align-items:center;margin-top:4px"><input type="checkbox" class="rv" data-k="${f.key}" ${v.reviewed ? 'checked' : ''} ${v.en ? '' : 'disabled'}>Revisado</label></td></tr>`;
  }).join('');
  const iss = issues();
  view.innerHTML = `${stepper(3)}<div class="top"><div><h1>Revisar la traducción</h1><p class="sub">${esc(country().flag)} ${esc(docType().es)} · ${S.target === 'eoir' ? 'Corte (EOIR)' : 'USCIS'} — Compare cada campo con el acta. Usted revisa, corrige y firma.</p></div>
    <span class="badge ${reviewed === filled.length && filled.length ? 'ok' : 'review'}">${reviewed} de ${filled.length} campos revisados</span></div>
  <div class="grid" style="grid-template-columns:330px 1fr;align-items:start;gap:16px">
    <div class="card" style="padding:12px;position:sticky;top:12px">
      <div class="small muted" style="font-weight:700;margin-bottom:6px">ACTA ORIGINAL</div>
      <div id="imgWrap" style="position:relative;max-height:58vh;overflow:auto;border:1px solid var(--line);border-radius:6px"></div>
      ${S.ocr ? `<div class="small muted" style="font-weight:700;margin:10px 0 4px">TEXTO LEÍDO <span style="font-weight:400">— clic en una línea para copiarla al campo seleccionado</span></div>
      <div id="ocrList" style="max-height:24vh;overflow:auto;font-size:12px;border:1px solid var(--line);border-radius:6px">${S.ocr.lines.map((l, i) => `<div class="ol" data-i="${i}" style="padding:4px 8px;border-bottom:1px solid #f1f5f9;cursor:pointer">${esc(l.text)}</div>`).join('')}</div>` : '<p class="small muted" style="margin-top:8px">Escriba cada dato tal como aparece en el acta.</p>'}
    </div>
    <div class="card" style="padding:12px">
      <table class="ft"><thead><tr><th>Campo</th><th>Original (español)</th><th>Traducción (inglés)</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="addX">＋ Agregar campo / texto adicional</button><button class="btn sm" id="revAll">Marcar como revisados los campos con ✓ automático</button><span class="spacer"></span><button class="btn primary" id="next">Continuar → Descargar</button></div>
      <div id="iss" style="margin-top:12px">${iss.length ? `<div class="notice warn"><b>Antes de descargar:</b><ul class="small" style="margin:6px 0 0;padding-left:18px">${iss.slice(0, 12).map((i) => `<li>${esc(i.text)}</li>`).join('')}${iss.length > 12 ? `<li>… y ${iss.length - 12} más</li>` : ''}</ul></div>` : '<div class="notice">Todo revisado.</div>'}</div>
    </div>
  </div>`;
  drawOriginal();
  const rerender = () => { const y = window.scrollY; sReview(); bindStepper(); window.scrollTo(0, y); };
  view.querySelectorAll('textarea.es').forEach((ta) => {
    ta.onfocus = () => { S.active = ta.dataset.k; markActive(); };
    ta.onchange = () => { setOrig(ta.dataset.k, ta.value.trim()); rerender(); };
  });
  view.querySelectorAll('textarea.en').forEach((ta) => {
    ta.onfocus = () => { S.active = ta.dataset.k; markActive(); };
    ta.onchange = () => { const v = S.values[ta.dataset.k] || (S.values[ta.dataset.k] = { es: '' }); v.en = ta.value.trim(); v.edited = true; v.reviewed = false; rerender(); };
  });
  view.querySelectorAll('.rv').forEach((cb) => { cb.onchange = () => { S.values[cb.dataset.k].reviewed = cb.checked; rerender(); }; });
  view.querySelectorAll('.qk').forEach((b) => { b.onclick = () => {
    const v = S.values[b.dataset.k] || (S.values[b.dataset.k] = { es: '', en: '' });
    v.en = (v.en && v.en !== '[blank]' ? `${v.en} ` : '') + b.dataset.q; v.edited = true; v.reviewed = false;
    if (!v.es) v.es = { '[illegible]': '[ilegible]', '[seal]': '[sello]', '[signature]': '[firma]', '[sic]': '[sic]', '[blank]': '[en blanco]' }[b.dataset.q];
    rerender();
  }; });
  view.querySelectorAll('.rmx').forEach((b) => { b.onclick = () => { S.extras = S.extras.filter((x) => x.id !== b.dataset.k); delete S.values[b.dataset.k]; rerender(); }; });
  $('#addX').onclick = () => { const id = `x${Date.now()}`; S.extras.push({ id, es: 'Texto adicional', en: 'Additional text' }); S.active = id; rerender(); };
  $('#revAll').onclick = () => { for (const f of fieldList()) { const v = S.values[f.key]; if (v && v.en && v.sure && !['longtext', 'seal'].includes(f.type) && !v.ocr) v.reviewed = true; } rerender(); };
  view.querySelectorAll('.ol').forEach((el) => {
    el.onmouseenter = () => highlight(+el.dataset.i);
    el.onclick = () => { if (!S.active) return; const cur = S.values[S.active]?.es; const txt = S.ocr.lines[+el.dataset.i].text; setOrig(S.active, cur && fieldList().find((f) => f.key === S.active)?.type === 'longtext' ? `${cur} ${txt}` : txt); rerender(); };
  });
  $('#next').onclick = () => { S.step = 4; pNew(); };
}
function markActive() { view.querySelectorAll('tr[data-row]').forEach((tr) => tr.classList.toggle('act', tr.dataset.row === S.active)); }
function drawOriginal() {
  const wrap = $('#imgWrap'); if (!wrap) return;
  wrap.innerHTML = '';
  S.pages.forEach((c, i) => { const im = document.createElement('img'); im.src = c.toDataURL('image/jpeg', 0.85); im.style.cssText = 'width:100%;display:block'; im.dataset.page = i; wrap.appendChild(im); });
  const hl = document.createElement('div'); hl.id = 'hl'; hl.style.cssText = 'position:absolute;border:2px solid #2563eb;background:rgba(37,99,235,.12);border-radius:3px;pointer-events:none;display:none'; wrap.appendChild(hl);
}
function highlight(i) {
  const l = S.ocr.lines[i], hl = $('#hl'), im = $(`#imgWrap img[data-page="${l.page}"]`); if (!hl || !im) return;
  const k = im.clientWidth / S.pages[l.page].width;
  hl.style.display = 'block';
  hl.style.left = `${l.bbox.x0 * k}px`; hl.style.top = `${im.offsetTop + l.bbox.y0 * k}px`;
  hl.style.width = `${(l.bbox.x1 - l.bbox.x0) * k}px`; hl.style.height = `${(l.bbox.y1 - l.bbox.y0) * k}px`;
}

// ---------- Paso 4: certificación y PDF ----------
function personName() {
  const v = (k) => S.values[k]?.en;
  return S.doc === 'marriage' ? [v('c1Nombre'), v('c2Nombre')].filter(Boolean).join(' and ') : v('nombre') || '';
}
function pdfRows() {
  return fieldList().filter((f) => S.values[f.key]?.en).map((f) => ({ sec: f.sec, en: f.extra ? (S.extras.find((x) => x.id === f.key)?.en || 'Additional text') : f.en, value: S.values[f.key].en }));
}
function sFinish() {
  const tr = store.get('translator', {});
  const iss = issues();
  const blocking = iss.filter((i) => i.level === 'fail');
  const warns = iss.filter((i) => i.level === 'warn');
  const trOk = tr.name && tr.address && (tr.phone || tr.email);
  S.ackWarn = S.ackWarn && warns.length ? S.ackWarn : false;
  const ready = !blocking.length && trOk && (!warns.length || S.ackWarn) && pdfRows().length > 0;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const cert = certText(S.target, { name: tr.name || '[translator name]' }, docType().en, personName());
  view.innerHTML = `${stepper(4)}<div class="top"><div><h1>Certificación y descarga</h1><p class="sub">${esc(country().flag)} ${esc(docType().es)} · ${S.target === 'eoir' ? 'Corte (EOIR)' : 'USCIS'}</p></div></div>
  <div class="grid" style="grid-template-columns:1fr 1.1fr;align-items:start">
    <div class="card ctrl">
      <h2 style="margin:0">Verificación antes de descargar</h2>
      <ul class="mini">
        <li><span class="dotc ${blocking.length ? 'fail' : 'ok'}"></span><div>${blocking.length ? `<b>${blocking.length} pendiente(s):</b> ${blocking.slice(0, 5).map((i) => esc(i.text)).join(' · ')}${blocking.length > 5 ? '…' : ''}` : 'Todos los campos con datos están traducidos y revisados.'}</div></li>
        <li><span class="dotc ${trOk ? 'ok' : 'fail'}"></span><div>${trOk ? `Traductora: <b>${esc(tr.name)}</b>` : 'Faltan sus datos de traductora (nombre, dirección y teléfono o correo). <a href="#traductora">Completar</a>'}</div></li>
        <li><span class="dotc ${warns.length ? (S.ackWarn ? 'ok' : 'review') : 'ok'}"></span><div>${warns.length ? `${warns.map((w) => esc(w.text)).join('<br>')}<br><label class="row small" style="margin-top:6px"><input type="checkbox" id="ack" ${S.ackWarn ? 'checked' : ''}> Revisé estas advertencias contra el acta original y la traducción es correcta</label>` : 'Sin advertencias.'}</div></li>
      </ul>
      <div><label>Certificación</label><select id="target" class="btn" style="width:100%"><option value="uscis" ${S.target === 'uscis' ? 'selected' : ''}>USCIS — "complete and accurate" (8 CFR 103.2(b)(3))</option><option value="eoir" ${S.target === 'eoir' ? 'selected' : ''}>Corte de inmigración (EOIR) — "true and accurate to the best of my abilities"</option></select></div>
      <label class="row small"><input type="checkbox" id="attach" ${S.attach ? 'checked' : ''}> Anexar copia del acta original al final del PDF</label>
      <div class="row"><button class="btn primary" id="dl" ${ready ? '' : 'disabled'}>Descargar PDF de la traducción</button><span class="small" id="dlInfo"></span></div>
      <p class="small muted" style="margin:0">Firme a mano la certificación impresa (o con su firma electrónica) antes de presentarla. Usted es responsable de que la traducción sea completa y exacta.</p>
    </div>
    <div class="card"><div class="small muted" style="font-weight:700;margin-bottom:6px">VISTA PREVIA</div>
      <div class="page" style="font-family:'Times New Roman',serif;font-size:12px;border:1px solid var(--line);padding:22px 26px;background:#fff">
        <div style="text-align:center;font-weight:bold;font-size:14px">CERTIFIED ENGLISH TRANSLATION</div>
        <div style="text-align:center;font-size:11px">${esc(docType().en)} — ${esc(country().en)}</div>
        <div style="text-align:center;font-size:10px;color:#555;margin-bottom:10px">Translated from Spanish into English</div>
        ${(() => { let ls = null; return pdfRows().map((r) => { const h = r.sec !== ls ? `<div style="font-weight:bold;border-bottom:1px solid #aaa;margin:8px 0 4px">${esc(String(r.sec).toUpperCase())}</div>` : ''; ls = r.sec; return `${h}<div style="display:flex;gap:10px"><b style="width:40%">${esc(r.en)}:</b><span style="flex:1">${esc(r.value)}</span></div>`; }).join(''); })() || '<p class="muted">Sin campos todavía.</p>'}
        <div style="border:1.5px solid #111;padding:10px 12px;margin-top:14px"><b>CERTIFICATE OF TRANSLATION</b><br>${esc(cert)}
          <div style="display:flex;gap:40px;margin-top:22px"><div style="border-top:1px solid #111;width:180px;font-size:10px">Signature</div><div style="border-top:1px solid #111;width:120px;font-size:10px">Date: ${esc(today)}</div></div>
          <div style="font-size:10px;margin-top:4px">${esc([tr.name, tr.address, tr.phone, tr.email].filter(Boolean).join(' · '))}</div></div>
      </div></div>
  </div>`;
  $('#target').onchange = (e) => { S.target = e.target.value; sFinish(); bindStepper(); };
  $('#attach').onchange = (e) => { S.attach = e.target.checked; };
  const ack = $('#ack'); if (ack) ack.onchange = (e) => { S.ackWarn = e.target.checked; sFinish(); bindStepper(); };
  $('#dl').onclick = () => {
    const blob = buildPdf({
      title: docType().en, subtitle: country().en, rows: pdfRows(), cert, translator: tr, dateStr: today,
      originals: S.attach ? S.pages : [], kindLabel: S.target === 'eoir' ? 'EOIR' : 'USCIS',
    });
    const who = (personName() || 'documento').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const name = `traduccion-${S.doc === 'birth' ? 'nacimiento' : 'matrimonio'}-${who}-${new Date().toLocaleDateString('en-CA')}.pdf`;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    const h = store.get('history', []); h.unshift({ date: new Date().toLocaleString('es'), country: S.country, doc: S.doc, person: personName(), target: S.target, file: S.fileName });
    store.set('history', h.slice(0, 300));
    $('#dlInfo').innerHTML = `Descargado: <b>${esc(name)}</b>`;
  };
}

// ---------- Otras pantallas ----------
function pTranslator() {
  const t = store.get('translator', {});
  view.innerHTML = `<div class="top"><div><h1>Mis datos de traductora</h1><p class="sub">Aparecen en la certificación de cada traducción. Se guardan solo en este navegador.</p></div></div>
  <div class="card ctrl" style="max-width:620px">
    ${[['name', 'Nombre completo', 'Patricia …'], ['address', 'Dirección', 'Calle, ciudad, estado, ZIP'], ['phone', 'Teléfono', ''], ['email', 'Correo electrónico', '']].map(([k, l, ph]) => `<div><label>${l}</label><input class="btn" style="width:100%;justify-content:flex-start;font-weight:400" data-k="${k}" value="${esc(t[k] || '')}" placeholder="${esc(ph)}"></div>`).join('')}
    <div class="notice">En la certificación no se usa el título “Certified Translator”: solo se declara que usted es competente en español e inglés, que es lo que pide USCIS.</div>
    <div class="row"><button class="btn primary" id="save">Guardar</button><span class="small" id="saved"></span></div>
  </div>`;
  $('#save').onclick = () => { const o = {}; view.querySelectorAll('input[data-k]').forEach((i) => { o[i.dataset.k] = i.value.trim(); }); store.set('translator', o); $('#saved').textContent = 'Guardado.'; };
}
function pHistory() {
  const h = store.get('history', []);
  view.innerHTML = `<div class="top"><div><h1>Historial</h1><p class="sub">Registro de traducciones descargadas en este navegador (sin copias de las actas).</p></div>${h.length ? '<button class="btn" id="clr">Borrar historial</button>' : ''}</div>
  <div class="card">${h.length ? `<table><thead><tr><th>Fecha</th><th>Persona</th><th>Documento</th><th>Para</th><th>Archivo original</th></tr></thead><tbody>${h.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.person)}</td><td>${esc(getCountry(x.country)?.flag || '')} ${esc(DOC_TYPES.find((d) => d.id === x.doc)?.es || '')}</td><td>${x.target === 'eoir' ? 'Corte' : 'USCIS'}</td><td class="small">${esc(x.file)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Todavía no hay traducciones.</div>'}</div>
  <p class="small muted">Guarde siempre una copia del PDF firmado junto con el acta original en el expediente del cliente.</p>`;
  const c = $('#clr'); if (c) c.onclick = () => { store.set('history', []); pHistory(); };
}
function pTemplates() {
  view.innerHTML = `<div class="top"><div><h1>Plantillas por país</h1><p class="sub">Campos de cada tipo de acta. Las plantillas “general” se afinarán con actas reales de cada país.</p></div></div>
  ${COUNTRIES.map((c) => `<div class="card" style="margin-bottom:12px"><h2 style="margin:0 0 8px">${c.flag} ${esc(c.name)}</h2><div class="grid g2">${DOC_TYPES.map((d) => { const t = TEMPLATES[c.id][d.id]; return `<div><div class="row"><b>${esc(d.es)}</b>${t.status === 'completa' ? '<span class="badge ok">completa</span>' : '<span class="badge review">general</span>'}</div><div class="small muted">${t.fields.map((f) => esc(f.es)).join(' · ')}</div></div>`; }).join('')}</div></div>`).join('')}`;
}

window.__tradudoc = { get S() { return S; }, setOrig, issues };
route();
