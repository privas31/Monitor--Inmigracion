import { COUNTRIES, PROFILES, GROUPS, getProfile, CONSULTED } from './profiles.js';
import { initModels, detect } from './engine/detector.js';
import { analyze } from './engine/analysis.js';
import { refineMask, cleanEdges, buildForeground } from './engine/matting.js';
import { autoFrame, defaultAdjust, autoExposure, render, outputGeometry, buildMaskCanvas } from './engine/framing.js';
import { validate, MANUAL_CHECKS, overallWithManual } from './engine/validator.js';
import { encodeJpeg, layout, drawPreview, buildPdf, download, SHEETS, setPngDpi, sheetCanvas } from './engine/exporter.js';
import { t, setLang, getLang } from './i18n.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS_TXT = { ok: 'CUMPLE', review: 'NECESITA REVISIÓN', fail: 'NO CUMPLE' };
const MAX_FILE = 25 * 1024 * 1024;

// ---------- Estado (solo en memoria; nada se guarda en el disco sin autorización) ----------
const S = {
  settings: { autoExposure: true },
  history: [], // { id, profileId, date, status, thumb }
  processed: 0,
  w: null, // flujo actual
};
function newFlow(profileId = null) {
  S.w = { step: 2, country: profileId ? getProfile(profileId).country : 'us', profileId, img: null, det: null, an: null, frame: null, adj: defaultAdjust(), mask: null, manual: {}, result: null, fmt: 'pdf', sheet: 'letter', copies: 0, compare: 'after' };
}

// ---------- Navegación ----------
const ICON = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  create: '<path d="M12 5v14M5 12h14"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  profiles: '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
};
const ROUTES = ['dashboard', 'create', 'history', 'settings', 'profiles'];
function renderNav(active) {
  $('#nav').innerHTML = ROUTES.map((r) => `<a href="#${r}" class="${r === active ? 'active' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[r]}</svg>${t(r)}</a>`).join('');
  const c = $('#nav a[href="#create"]');
  if (c) c.onclick = (e) => { e.preventDefault(); newFlow(S.w?.profileId || null); go('create'); };
}
function route() {
  const r = (location.hash || '#dashboard').slice(1);
  const page = ROUTES.includes(r) ? r : 'dashboard';
  renderNav(page);
  ({ dashboard: pDashboard, create: pCreate, history: pHistory, settings: pSettings, profiles: pProfiles })[page]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function go(r) { if (location.hash === `#${r}`) route(); else location.hash = r; }

// ---------- Dashboard ----------
function pDashboard() {
  const recent = S.history.slice(-6).reverse();
  view.innerHTML = `
  <div class="top"><div><h1>Fotos para documentos oficiales</h1><p class="sub">Suba una foto normal y conviértala en una foto técnicamente ajustada al documento.</p></div>
    <button class="btn primary lg" id="ctaNew">＋ Crear fotografía</button></div>
  <div class="grid g3">
    <button class="choice" data-quick="us-passport"><span class="flag">🇺🇸</span><span class="t">Pasaporte estadounidense</span><span class="muted small">2 × 2 in · fondo blanco</span><span class="badge ok">Disponible</span></button>
    <button class="choice" data-quick="us-visa"><span class="flag">🇺🇸</span><span class="t">Visa estadounidense (DS-160)</span><span class="muted small">600×600 px · JPG ≤ 240 KB</span><span class="badge ok">Disponible</span></button>
    <button class="choice" data-quick="us-ead"><span class="flag">📄</span><span class="t">Permiso de trabajo EAD (I-765)</span><span class="muted small">2 × 2 in · USCIS · 2 fotos idénticas</span><span class="badge ok">Disponible</span></button>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><h2>Documentos disponibles</h2>
      <table><thead><tr><th>Documento</th><th>País</th><th>Estado</th></tr></thead><tbody>
      ${PROFILES.map((p) => `<tr><td>${esc(p.nameEs)}</td><td>${esc(COUNTRIES.find((c) => c.id === p.country).name)}</td><td>${p.status === 'activo' ? '<span class="badge ok">Activo</span>' : '<span class="badge pending">Pendiente</span>'}</td></tr>`).join('')}
      </tbody></table></div>
    <div class="card"><h2>Últimas fotografías (esta sesión)</h2>
      ${recent.length ? `<div class="thumbs">${recent.map(thumbHtml).join('')}</div>` : '<div class="empty">Aún no hay fotos procesadas en esta sesión.</div>'}
      ${S.processed ? `<p class="muted small" style="margin-top:12px">Fotos procesadas en esta sesión: <b>${S.processed}</b></p>` : ''}
    </div>
  </div>`;
  $('#ctaNew').onclick = () => { newFlow(); go('create'); };
  view.querySelectorAll('[data-quick]').forEach((b) => b.onclick = () => {
    const q = b.dataset.quick;
    newFlow(q); go('create');
  });
}
function thumbHtml(h) {
  const p = getProfile(h.profileId);
  return `<div class="thumb"><img src="${h.thumb}" alt=""><div><b>${esc(p.name)}</b><br><span class="badge ${h.status}">${STATUS_TXT[h.status]}</span><br><span class="muted">${h.date}</span></div></div>`;
}

// ---------- Flujo de creación ----------
function stepper(cur) {
  setTimeout(() => view.querySelectorAll('.stepper [data-go]').forEach((el) => { el.onclick = () => setStep(2); }), 0);
  return `<div class="stepper">${t('steps').map((s, i) => {
    const link = i < 2 && cur > 2;
    return `<div class="s ${i + 1 < cur ? 'done' : i + 1 === cur ? 'cur' : ''}" ${link ? 'data-go="2" style="cursor:pointer" title="Cambiar documento"' : ''}><span class="n">${i + 1 < cur ? '✓' : i + 1}</span>${s}</div>`;
  }).join('')}</div>`;
}
function pCreate() {
  if (!S.w) newFlow();
  const st = S.w.step;
  ({ 1: sCountry, 2: sDocument, 3: sUpload, 4: sAnalysis, 5: sProcessing, 6: sEditor, 7: sValidation, 8: sDownload })[st]();
}
function setStep(n) { S.w.step = n; pCreate(); window.scrollTo(0, 0); }

// Pasos 1 y 2 en una sola pantalla: país + documento (menú agrupado) + ficha del documento
function sCountry() { if (!S.w.country) S.w.country = 'us'; S.w.step = 2; sDocument(); }

function sDocument() {
  if (!S.w.country) S.w.country = 'us';
  const list = PROFILES.filter((p) => p.country === S.w.country && p.status === 'activo');
  if (!list.some((p) => p.id === S.w.profileId)) S.w.profileId = list[0]?.id || null;
  const p = S.w.profileId ? getProfile(S.w.profileId) : null;
  const groups = [...GROUPS, ...new Set(list.map((x) => x.group).filter((g) => !GROUPS.includes(g)))];
  const opts = groups.map((g) => {
    const items = list.filter((x) => (x.group || 'Otros') === g);
    return items.length ? `<optgroup label="${esc(g)}">${items.map((x) => `<option value="${x.id}" ${x.id === S.w.profileId ? 'selected' : ''}>${esc(x.name)} — ${esc(x.sizeLabel || '')}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const verifiedAll = p && [p.print, p.head, p.eyes, p.background].every((r) => r.verified);
  const box = (w, h, label, on) => `<div style="text-align:center"><div class="small" style="font-weight:700;margin-bottom:6px">${label}</div>
    <div style="width:${w * 75}px;height:${h * 75}px;border:1.5px dashed ${on ? 'var(--blue)' : '#94a3b8'};border-radius:4px;background:#fff;position:relative;overflow:hidden;margin:0 auto">
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="none"><circle cx="50" cy="42" r="18" fill="#e2e8f0"/><path d="M18 100c4-23 17-32 32-32s28 9 32 32z" fill="#e2e8f0"/></svg></div></div>`;
  const pending = PROFILES.filter((x) => x.status !== 'activo');
  view.innerHTML = `${stepper(2)}<div class="top"><div><h1>¿Para qué documento es la foto?</h1><p class="sub">Elija el país y el documento. Cada uno tiene su propio tamaño y reglas.</p></div></div>
  <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
    <div class="card ctrl">
      <div><div class="small muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">País</div>
        <select id="country" class="btn" style="width:100%;justify-content:flex-start;text-align:left">${COUNTRIES.map((c) => `<option value="${c.id}" ${c.id === S.w.country ? 'selected' : ''} ${c.available ? '' : 'disabled'}>${c.flag} ${esc(c.name)}${c.available ? '' : ' (próximamente)'}</option>`).join('')}</select></div>
      <div><div class="small muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Documento</div>
        <select id="doc" class="btn" style="width:100%;justify-content:flex-start;text-align:left">${opts}</select></div>
      <p class="small muted" style="margin:0">Todos los documentos usan el mismo motor de detección, recorte y validación; cambia solo su ficha de requisitos.</p>
    </div>
    ${p ? `<div class="card">
      <div class="row"><h2 style="margin:0">${esc(p.name)}</h2><span class="spacer"></span>${verifiedAll ? `<span class="badge ok">Verificado</span>` : `<span class="badge review">Algunas medidas son guía no oficial</span>`}</div>
      <p class="small muted" style="margin:4px 0 0">${esc(p.nameEs)}</p>
      <div class="row" style="gap:28px;margin:18px 0 6px;justify-content:center;align-items:flex-end">
        ${box(p.print.widthIn, p.print.heightIn, `${p.print.widthIn} × ${p.print.heightIn} in`, true)}
        ${p.print.widthIn !== 2 ? box(2, 2, '2 × 2 in (referencia)', false) : box(1.5, 1.5, '1.5 × 1.5 in (referencia)', false)}
      </div>
      <p class="small muted" style="text-align:center;margin:0 0 10px">Comparación de tamaños reales</p>
      <table><tbody>
        <tr><td class="muted">Tamaño</td><td><b>${p.print.widthIn} × ${p.print.heightIn} in (${Math.round(p.print.widthIn * 25.4)} × ${Math.round(p.print.heightIn * 25.4)} mm)</b>${p.digital.maxBytes ? `<br><span class="small muted">Digital: ${p.digital.widthPx}×${p.digital.heightPx} px, JPG ≤ ${Math.round(p.digital.maxBytes / 1024)} KB</span>` : ''}</td></tr>
        <tr><td class="muted">Cabeza</td><td>${esc(p.head.label)}${p.head.verified ? '' : ' <span class="badge review">guía</span>'}</td></tr>
        <tr><td class="muted">Ojos</td><td>${esc(p.eyes.label)}${p.eyes.verified ? '' : ' <span class="badge review">guía</span>'}</td></tr>
        <tr><td class="muted">Fondo</td><td>${esc(p.background.label)}</td></tr>
        ${p.rules.copies ? `<tr><td class="muted">Copias</td><td>${p.rules.copies === 1 ? '1 foto' : `${p.rules.copies} fotos idénticas`}</td></tr>` : ''}
        <tr><td class="muted">Reciente</td><td class="small">${esc(p.rules.recency)}</td></tr>
        <tr><td class="muted">Fuente</td><td class="small"><a href="${p.print.source.url}" target="_blank" rel="noopener">${esc(p.print.source.name)}</a></td></tr>
      </tbody></table>
      ${p.rules.note ? `<div class="notice" style="margin-top:10px">${esc(p.rules.note)}</div>` : ''}
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn primary" id="go">Continuar → Subir foto</button></div>
    </div>` : '<div class="card"><div class="empty">No hay documentos activos para este país todavía.</div></div>'}
  </div>
  <div class="card" style="margin-top:16px">
    <div class="row"><h2 style="margin:0">Más adelante: otros países y documentos</h2><span class="spacer"></span><a class="btn sm" href="#profiles">＋ Agregar documento</a></div>
    <p class="small muted" style="margin:8px 0 12px">Cada país o documento nuevo se agrega como una ficha de requisitos verificada en su fuente oficial, sin cambiar el resto de la app.</p>
    <div class="grid g4" style="gap:10px">${COUNTRIES.filter((c) => !c.available).map((c) => `<div class="choice" style="padding:12px;cursor:default"><span class="t">${c.flag} ${esc(c.name)}</span><span class="muted small">${pending.filter((x) => x.country === c.id).map((x) => esc(x.nameEs)).join(', ') || 'Pasaporte, visas…'}</span><span class="badge pending">Próximamente</span></div>`).join('')}</div>
  </div>`;
  $('#country').onchange = (e) => { S.w.country = e.target.value; S.w.profileId = null; sDocument(); };
  $('#doc').onchange = (e) => { S.w.profileId = e.target.value; S.w.adj = defaultAdjust(); sDocument(); };
  const go = $('#go'); if (go) go.onclick = () => { S.w.adj = defaultAdjust(); setStep(S.w.img ? 4 : 3); };
}

function sUpload() {
  const p = getProfile(S.w.profileId);
  const docs = PROFILES.filter((x) => x.country === S.w.country && x.status === 'activo');
  view.innerHTML = `${stepper(3)}<div class="top"><div><h1>Suba la fotografía</h1>
    <div class="row" style="margin-top:8px"><span class="small muted">Documento:</span>
      <select id="docQuick" class="btn sm">${docs.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)} — ${esc(x.sizeLabel || '')}</option>`).join('')}</select></div></div>
    <button class="btn" id="back">← Ver detalles del documento</button></div>
  <div class="grid" style="grid-template-columns:1.5fr 1fr">
    <div class="card"><div class="drop" id="drop">
      <div class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg></div>
      <h2 style="margin-bottom:4px">Arrastre y suelte su foto aquí</h2><p class="muted small">JPG, PNG o WEBP · máximo 25 MB</p>
      <div class="row" style="justify-content:center;margin-top:14px">
        <label class="btn primary">Seleccionar archivo<input type="file" id="file" accept="image/jpeg,image/png,image/webp" hidden></label>
        <button class="btn" id="cam">📷 Tomar foto con la cámara</button>
      </div>
      <p class="muted small" style="margin-top:14px">Desde el teléfono: abra esta misma página en el navegador del celular; “Seleccionar archivo” permite usar la cámara o la galería.</p>
    </div>
    <div id="upErr" class="notice warn hide" style="margin-top:12px"></div>
    <div class="notice" style="margin-top:12px">🔒 La foto se procesa <b>en este navegador</b>. No se sube a ningún servidor, no se guarda y no se usa para entrenar modelos.</div></div>
    <div class="card"><h2>Consejos para una buena foto</h2><ul class="tips small">
      <li>De frente, mirando a la cámara, expresión neutral, boca cerrada.</li>
      <li>Luz pareja de frente (sin flash directo), sin sombras en la cara.</li>
      <li>Deje espacio sobre la cabeza e incluya los hombros.</li>
      <li>Sin lentes, gorras ni accesorios que cubran el rostro.</li>
      <li>Cámara a la altura de los ojos, a 1–1.5 m de distancia.</li>
      <li>El fondo puede sustituirse, pero un fondo claro da mejores bordes.</li></ul></div>
  </div>`;
  $('#back').onclick = () => setStep(2);
  $('#docQuick').onchange = (e) => { S.w.profileId = e.target.value; S.w.adj = defaultAdjust(); sUpload(); };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (ev) => { const f = ev.dataTransfer.files[0]; if (f) handleFile(f); });
  $('#file').onchange = (e) => e.target.files[0] && handleFile(e.target.files[0]);
  $('#cam').onclick = openCamera;
  initModels().catch(() => {}); // precarga de modelos mientras el usuario elige la foto
}

async function sniffType(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'heic';
  return null;
}
function upError(msg) { const e = $('#upErr'); if (e) { e.textContent = msg; e.classList.remove('hide'); } }

async function handleFile(file) {
  if (file.size > MAX_FILE) return upError('El archivo supera 25 MB.');
  const type = await sniffType(file);
  if (type === 'heic') return upError('Formato HEIC (iPhone) aún no soportado en este navegador. En el iPhone: Ajustes › Cámara › Formatos › “Más compatible”, o exporte la foto como JPG.');
  if (!type) return upError('El archivo no es una imagen JPG, PNG o WEBP válida.');
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (Math.min(img.naturalWidth, img.naturalHeight) < 400) { URL.revokeObjectURL(url); return upError(`Resolución muy baja (${img.naturalWidth}×${img.naturalHeight}). Use una foto de al menos 400 px por lado.`); }
    if (S.w.img) URL.revokeObjectURL(S.w.img.src);
    S.w.img = img; S.w.det = null; S.w.an = null; S.w.manual = {}; S.w.adj = defaultAdjust();
    setStep(4);
  };
  img.onerror = () => { URL.revokeObjectURL(url); upError('No se pudo leer la imagen.'); };
  img.src = url;
}

function openCamera() {
  const m = $('#modal');
  m.innerHTML = `<div class="modal"><div class="box"><h2>Tomar foto</h2><video autoplay playsinline muted></video>
    <p class="muted small">Colóquese de frente, con luz pareja, y deje espacio sobre la cabeza.</p>
    <div class="row"><span class="spacer"></span><button class="btn" id="camClose">Cancelar</button><button class="btn primary" id="camShot">Capturar</button></div></div></div>`;
  const video = $('video', m);
  let stream = null;
  const close = () => { stream?.getTracks().forEach((t2) => t2.stop()); m.innerHTML = ''; };
  $('#camClose', m).onclick = close;
  navigator.mediaDevices?.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' } })
    .then((s) => { stream = s; video.srcObject = s; })
    .catch(() => { close(); upError('No se pudo acceder a la cámara (permiso denegado o el sitio no está en HTTPS/localhost).'); });
  $('#camShot', m).onclick = () => {
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    c.toBlob((b) => { close(); handleFile(new File([b], 'camara.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.95);
  };
}

// ---------- Paso 4: análisis ----------
async function sAnalysis() {
  const p = getProfile(S.w.profileId);
  view.innerHTML = `${stepper(4)}<div class="top"><div><h1>Análisis automático</h1><p class="sub">Detección de rostro, ojos, barbilla, contorno de la cabeza y hombros.</p></div><button class="btn" id="back">← Cambiar foto</button></div>
    <div class="card"><div class="loader"><span class="spin"></span>Cargando modelos y analizando la foto…</div></div>`;
  $('#back').onclick = () => setStep(3);
  try {
    if (!S.w.det) {
      const det = await detect(S.w.img);
      det.sourceImage = S.w.img;
      S.w.det = det;
      S.w.an = analyze(det);
      const ce = cleanEdges(det, refineMask(det));
      det.refined = ce.alpha;
      det.fg = buildForeground(det, ce.alpha, ce.bgR, ce.bgG, ce.bgB);
      S.w.mask = buildMaskCanvas(det);
    }
  } catch (e) {
    console.error(e);
    view.querySelector('.card').innerHTML = `<div class="notice warn">No se pudo ejecutar el análisis: ${esc(e.message)}. Asegúrese de abrir la app desde un servidor local (ver README) y no como archivo.</div>`;
    return;
  }
  const an = S.w.an;
  if (!an.ok) {
    view.querySelector('.card').innerHTML = `<div class="status fail"><span class="dot"></span>No se detectó ningún rostro</div><p>Use una foto de frente, con el rostro completo, buena iluminación y sin obstrucciones.</p><button class="btn primary" id="retry">Subir otra foto</button>`;
    $('#retry').onclick = () => setStep(3);
    return;
  }
  // Evaluación preliminar con el encuadre automático, enfocada en la foto original
  const frame = autoFrame(an, p);
  const adj = { ...defaultAdjust(), brightness: S.settings.autoExposure ? autoExposure(an) : 1 };
  const tmp = document.createElement('canvas'); tmp.width = 300; tmp.height = Math.round(300 * p.print.heightIn / p.print.widthIn);
  const M = render(tmp.getContext('2d'), S.w.det, an, frame, adj, S.w.mask, tmp.width, tmp.height);
  const geo = outputGeometry(S.w.det, an, M, tmp.width, tmp.height, S.w.mask, adj);
  const pre = validate(an, geo, p, { bg: adj.bg });
  const origIds = ['face', 'crop', 'yaw', 'eyesOpen', 'mouth', 'sharp', 'exposure', 'glare', 'shadow', 'res', 'shoulders'];
  const issues = pre.items.filter((i) => origIds.includes(i.id));
  const bad = issues.filter((i) => i.status !== 'ok');

  view.querySelector('.card').outerHTML = `<div class="grid" style="grid-template-columns:1fr 1fr">
    <div class="card"><h2>Puntos detectados</h2><canvas id="lmc" style="width:100%;border-radius:10px"></canvas>
      <div class="legend"><span><i style="background:#22c55e"></i>Ojos</span><span><i style="background:#3b82f6"></i>Parte superior de la cabeza</span><span><i style="background:#ef4444"></i>Barbilla</span><span><i style="background:#f59e0b"></i>Contorno de persona</span></div></div>
    <div class="card"><h2>Resultado del análisis de la foto original</h2>
      <p class="small muted">Inclinación detectada: <b>${(an.roll * 180 / Math.PI).toFixed(1)}°</b> · altura de cabeza: <b>${Math.round(an.headPxOriginal)} px</b> · rostros: <b>${an.faceCount}</b>${an.crown.estimated ? ' · coronilla <b>estimada</b>' : ''}</p>
      ${bad.length ? `<p><b>${bad.length}</b> aspecto(s) a revisar:</p>` : '<div class="status ok" style="margin-bottom:10px"><span class="dot"></span>La foto original es apta para procesar</div>'}
      <ul class="mini">${issues.map((i) => `<li><span class="dotc ${i.status}"></span><div><b>${esc(i.param)}</b> — ${esc(i.reason)}${i.status !== 'ok' && i.recommendation ? `<br><span class="muted">${esc(i.recommendation)}</span>` : ''}</div></li>`).join('')}</ul>
      <div class="row" style="margin-top:14px"><button class="btn" id="other">Subir otra foto</button><span class="spacer"></span><button class="btn primary" id="proc">Procesar automáticamente →</button></div>
    </div></div>`;
  drawLandmarks($('#lmc'), S.w.det, an);
  $('#other').onclick = () => setStep(3);
  $('#proc').onclick = () => setStep(5);
}

function drawLandmarks(c, det, an) {
  const k = Math.min(1, 900 / Math.max(det.W, det.H));
  c.width = Math.round(det.W * k); c.height = Math.round(det.H * k);
  const ctx = c.getContext('2d');
  ctx.drawImage(det.canvas, 0, 0, c.width, c.height);
  // contorno de persona
  const m = document.createElement('canvas'); m.width = det.W; m.height = det.H;
  const mc = m.getContext('2d'); mc.drawImage(S.w.mask, 0, 0);
  mc.globalCompositeOperation = 'source-in'; mc.fillStyle = 'rgba(245,158,11,.22)'; mc.fillRect(0, 0, det.W, det.H);
  ctx.drawImage(m, 0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  an.lm.forEach((p, i) => { if (i % 3 === 0) ctx.fillRect(p.x * k - 0.8, p.y * k - 0.8, 1.6, 1.6); });
  const dot = (p, col, r = 5) => { ctx.beginPath(); ctx.arc(p.x * k, p.y * k, r, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); };
  dot(an.eyeL, '#22c55e'); dot(an.eyeR, '#22c55e'); dot(an.crownPt, '#3b82f6', 6); dot(an.chin, '#ef4444', 6);
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(an.eyeL.x * k, an.eyeL.y * k); ctx.lineTo(an.eyeR.x * k, an.eyeR.y * k); ctx.stroke();
}

// ---------- Paso 5: procesamiento ----------
function sProcessing() {
  const p = getProfile(S.w.profileId);
  view.innerHTML = `${stepper(5)}<div class="card"><div class="loader"><span class="spin"></span>Ajustando escala, centrado, inclinación, fondo y exposición…</div></div>`;
  setTimeout(() => {
    S.w.frame = autoFrame(S.w.an, p);
    const prevBg = S.w.adj?.bg;
    S.w.adj = { ...defaultAdjust(), brightness: S.settings.autoExposure ? autoExposure(S.w.an) : 1 };
    if (prevBg && p.background.allowed.some((b) => b.hex === prevBg)) S.w.adj.bg = prevBg;
    S.processed++;
    setStep(6);
  }, 60);
}

// ---------- Paso 6: editor ----------
function currentRender(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const M = render(c.getContext('2d'), S.w.det, S.w.an, S.w.frame, S.w.adj, S.w.mask, W, H);
  const geo = outputGeometry(S.w.det, S.w.an, M, W, H, S.w.mask, S.w.adj);
  return { canvas: c, geo };
}
function runValidation(geo) {
  const p = getProfile(S.w.profileId);
  S.w.result = validate(S.w.an, geo, p, { bg: S.w.adj.bg });
  return S.w.result;
}

function sEditor() {
  const p = getProfile(S.w.profileId);
  const W = 600, H = Math.round(600 * p.print.heightIn / p.print.widthIn);
  const a = S.w.adj;
  view.innerHTML = `${stepper(6)}<div class="top"><div><h1>Editor inteligente</h1><p class="sub">Arrastre para mover, use la rueda para el zoom. Solo se aplican ajustes técnicos: los rasgos faciales no se modifican.</p></div>
    <div class="row"><div class="seg" id="cmp"><button data-v="before">Original</button><button data-v="split">Antes / después</button><button data-v="after" class="on">Procesada</button></div></div></div>
  <div class="editor">
    <div class="card" style="padding:12px"><div class="stage"><div class="canvasWrap" id="wrap" style="width:min(520px,100%)"><canvas id="out" width="${W}" height="${H}" style="width:100%"></canvas><canvas class="guides" id="gd" width="${W}" height="${H}"></canvas></div></div>
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <label class="row small"><input type="checkbox" id="showG" checked> Mostrar guías</label>
        <div class="legend" style="margin:0"><span><i style="background:rgba(34,197,94,.35)"></i>Zona de ojos</span><span><i style="background:rgba(59,130,246,.35)"></i>Zona de la parte superior de la cabeza</span><span><i style="background:#ef4444"></i>Barbilla</span><span><i style="background:rgba(148,163,184,.4)"></i>Hombros</span></div>
      </div></div>
    <div class="card ctrl">
      <div><label>Zoom <span id="vZoom"></span></label><input type="range" id="zoom" min="0.7" max="1.4" step="0.005" value="${a.zoom}"></div>
      <div><label>Posición horizontal <span id="vDx"></span></label><input type="range" id="dx" min="-0.2" max="0.2" step="0.002" value="${a.dx}"></div>
      <div><label>Posición vertical <span id="vDy"></span></label><input type="range" id="dy" min="-0.2" max="0.2" step="0.002" value="${a.dy}"></div>
      <div><label>Rotación adicional <span id="vRot"></span></label><input type="range" id="rot" min="-10" max="10" step="0.1" value="${a.rotDeg}"></div>
      <div><label>Brillo <span id="vBr"></span></label><input type="range" id="br" min="0.8" max="1.25" step="0.01" value="${a.brightness}"></div>
      <div><label>Contraste <span id="vCo"></span></label><input type="range" id="co" min="0.85" max="1.2" step="0.01" value="${a.contrast}"></div>
      <div><label>Fondo</label><div class="row">
        <label class="row small"><input type="checkbox" id="rmbg" ${a.removeBg ? 'checked' : ''}> Sustituir fondo</label>
        <span class="spacer"></span>${p.background.allowed.map((b) => `<button class="swatch ${a.bg === b.hex ? 'sel' : ''}" title="${esc(b.name)}" data-bg="${b.hex}" style="background:${b.hex}"></button>`).join('')}</div>
        <p class="muted small" style="margin:6px 0 0">Solo se ofrecen los colores que permite este documento.</p></div>
      <div class="row"><button class="btn sm" id="reset">Restablecer ajustes</button><button class="btn sm" id="reproc">Procesar nuevamente</button></div>
      <div><h2 style="margin:4px 0 8px">Verificación en vivo</h2><div id="live"></div></div>
      <div class="row"><button class="btn" id="back">← Análisis</button><span class="spacer"></span><button class="btn primary" id="next">Validar →</button></div>
    </div>
  </div>`;

  const out = $('#out'), gd = $('#gd'), octx = out.getContext('2d'), gctx = gd.getContext('2d');
  let geo = null, raf = 0;
  const fmt = { zoom: (v) => `${Math.round(v * 100)}%`, dx: (v) => `${(v * 100).toFixed(1)}%`, dy: (v) => `${(v * 100).toFixed(1)}%`, rot: (v) => `${(+v).toFixed(1)}°`, br: (v) => `${Math.round(v * 100)}%`, co: (v) => `${Math.round(v * 100)}%` };
  const ids = { zoom: 'zoom', dx: 'dx', dy: 'dy', rot: 'rotDeg', br: 'brightness', co: 'contrast' };
  const labels = { zoom: 'vZoom', dx: 'vDx', dy: 'vDy', rot: 'vRot', br: 'vBr', co: 'vCo' };

  function draw() {
    raf = 0;
    const r = currentRender(W, H);
    geo = r.geo;
    const mode = S.w.compare;
    octx.clearRect(0, 0, W, H);
    if (mode === 'before' || mode === 'split') drawOriginalFit(octx, W, H);
    if (mode === 'after') octx.drawImage(r.canvas, 0, 0);
    if (mode === 'split') { octx.save(); octx.beginPath(); octx.rect(W / 2, 0, W / 2, H); octx.clip(); octx.drawImage(r.canvas, 0, 0); octx.restore(); octx.fillStyle = '#fff'; octx.fillRect(W / 2 - 1, 0, 2, H); }
    drawGuides(gctx, W, H, geo, p, mode !== 'before' && $('#showG').checked);
    const res = runValidation(geo);
    $('#live').innerHTML = `<div class="status ${res.overall}" style="padding:10px 12px;font-size:14px"><span class="dot"></span>${STATUS_TXT[res.overall]}</div>
      <ul class="mini" style="margin-top:8px">${res.items.filter((i) => ['head', 'eyes', 'top', 'center', 'roll', 'bg', 'shoulders', 'res'].includes(i.id)).map((i) => `<li><span class="dotc ${i.status}"></span><div><b>${esc(i.param)}</b>: ${esc(i.value)}</div></li>`).join('')}</ul>`;
    for (const k in ids) $(`#${labels[k]}`).textContent = fmt[k](S.w.adj[ids[k]]);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  for (const k in ids) $(`#${k}`).oninput = (e) => { S.w.adj[ids[k]] = parseFloat(e.target.value); schedule(); };
  $('#rmbg').onchange = (e) => { S.w.adj.removeBg = e.target.checked; schedule(); };
  $('#showG').onchange = schedule;
  view.querySelectorAll('[data-bg]').forEach((b) => b.onclick = () => { S.w.adj.bg = b.dataset.bg; view.querySelectorAll('[data-bg]').forEach((x) => x.classList.toggle('sel', x === b)); schedule(); });
  view.querySelectorAll('#cmp button').forEach((b) => { b.classList.toggle('on', b.dataset.v === S.w.compare); b.onclick = () => { S.w.compare = b.dataset.v; view.querySelectorAll('#cmp button').forEach((x) => x.classList.toggle('on', x === b)); schedule(); }; });
  $('#reset').onclick = () => { S.w.adj = { ...defaultAdjust(), bg: S.w.adj.bg, brightness: S.settings.autoExposure ? autoExposure(S.w.an) : 1 }; sEditor(); };
  $('#reproc').onclick = () => setStep(5);
  $('#back').onclick = () => setStep(4);
  $('#next').onclick = () => setStep(7);

  // Arrastrar y zoom con rueda
  const wrap = $('#wrap');
  let drag = null;
  wrap.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, dx: S.w.adj.dx, dy: S.w.adj.dy, w: out.getBoundingClientRect().width }; wrap.classList.add('drag'); wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag) return;
    S.w.adj.dx = clamp(drag.dx + (e.clientX - drag.x) / drag.w, -0.2, 0.2);
    S.w.adj.dy = clamp(drag.dy + (e.clientY - drag.y) / drag.w * (W / H), -0.2, 0.2);
    $('#dx').value = S.w.adj.dx; $('#dy').value = S.w.adj.dy; schedule();
  });
  const end = () => { drag = null; wrap.classList.remove('drag'); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); S.w.adj.zoom = clamp(S.w.adj.zoom * (e.deltaY < 0 ? 1.01 : 0.99), 0.7, 1.4); $('#zoom').value = S.w.adj.zoom; schedule(); }, { passive: false });
  draw();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function drawOriginalFit(ctx, W, H) {
  const img = S.w.img, k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
}

function drawGuides(ctx, W, H, geo, p, show) {
  ctx.clearRect(0, 0, W, H);
  if (!show) return;
  const okHead = geo.headFrac >= p.head.minFrac && geo.headFrac <= p.head.maxFrac;
  const okEyes = geo.eyeFrac >= p.eyes.minFrac && geo.eyeFrac <= p.eyes.maxFrac;
  // zona de ojos
  const eTop = H * (1 - p.eyes.maxFrac), eBot = H * (1 - p.eyes.minFrac);
  ctx.fillStyle = 'rgba(34,197,94,.16)'; ctx.fillRect(0, eTop, W, eBot - eTop);
  // zona válida para la parte superior de la cabeza, según la barbilla actual
  const chinY = geo.chinPt.y;
  const tTop = chinY - H * p.head.maxFrac, tBot = chinY - H * p.head.minFrac;
  ctx.fillStyle = 'rgba(59,130,246,.16)'; ctx.fillRect(0, Math.max(0, tTop), W, tBot - Math.max(0, tTop));
  // hombros
  ctx.fillStyle = 'rgba(148,163,184,.18)'; ctx.fillRect(0, H * 0.9, W, H * 0.1);
  ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(15,23,42,.45)'; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.setLineDash([]);
  const line = (y, col, txt) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W * 0.18, y); ctx.lineTo(W * 0.82, y); ctx.stroke(); ctx.fillStyle = col; ctx.font = '600 13px system-ui'; ctx.fillText(txt, W * 0.83, y + 4); };
  line(geo.crownPt.y, okHead ? '#2563eb' : '#dc2626', 'Cabeza');
  line(geo.eyePt.y, okEyes ? '#16a34a' : '#dc2626', 'Ojos');
  line(geo.chinPt.y, okHead ? '#ef4444' : '#dc2626', 'Barbilla');
  ctx.fillStyle = 'rgba(15,23,42,.55)'; ctx.font = '600 12px system-ui'; ctx.fillText('Hombros', 8, H - 10);
}

// ---------- Paso 7: validación ----------
function sValidation() {
  const p = getProfile(S.w.profileId);
  const W = 600, H = Math.round(600 * p.print.heightIn / p.print.widthIn);
  const { canvas, geo } = currentRender(W, H);
  const res = runValidation(geo);
  const overall = overallWithManual(res, S.w.manual);
  view.innerHTML = `${stepper(7)}<div class="top"><div><h1>Validación técnica</h1><p class="sub">${esc(p.nameEs)} · perfil v${p.version} · requisitos consultados el ${p.updated}</p></div><button class="btn" id="back">← Editor</button></div>
  <div class="grid" style="grid-template-columns:280px 1fr">
    <div class="card"><img src="${canvas.toDataURL('image/jpeg', 0.9)}" style="width:100%;border-radius:6px;border:1px solid var(--line)">
      <div class="status ${overall}" style="margin-top:12px"><span class="dot"></span>${STATUS_TXT[overall]}</div>
      <p class="small muted">${overall === 'ok' ? 'La fotografía cumple los parámetros técnicos evaluables.' : overall === 'review' ? 'Hay aspectos que requieren revisión manual o que no pueden verificarse automáticamente.' : 'La fotografía presenta incumplimientos técnicos detectables.'}</p>
      <p class="small muted">Evaluación técnica orientativa. La autoridad correspondiente conserva la decisión final.</p></div>
    <div class="card"><h2>Parámetros evaluados</h2>
      <div style="overflow:auto"><table><thead><tr><th>Parámetro</th><th>Resultado</th><th>Valor</th><th>Motivo</th><th>Recomendación / acción</th></tr></thead><tbody>
      ${res.items.map((i) => `<tr><td><b>${esc(i.param)}</b>${i.official ? '' : '<br><span class="badge pending">guía no oficial vigente</span>'}</td><td><span class="badge ${i.status}">${STATUS_TXT[i.status]}</span></td><td class="small">${esc(i.value)}</td><td class="small">${esc(i.reason)}</td><td class="small">${i.status !== 'ok' ? `${esc(i.recommendation)}${i.action ? `<br><b>${esc(i.action)}</b>` : ''}` : '<span class="muted">—</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <h2 style="margin-top:20px">Confirmación manual <span class="muted small">(no se puede verificar automáticamente con fiabilidad)</span></h2>
      ${MANUAL_CHECKS.map((m) => `<label class="row small" style="padding:5px 0"><input type="checkbox" data-m="${m.id}" ${S.w.manual[m.id] ? 'checked' : ''}> ${esc(m.id === 'recent' ? `Foto reciente — ${p.rules.recency}` : m.id === 'glasses' ? `Lentes — ${p.rules.glasses}` : m.label)}</label>`).join('')}
      <div class="row" style="margin-top:16px"><button class="btn" id="edit">Corregir en el editor</button><span class="spacer"></span><button class="btn primary" id="next">Continuar a descarga →</button></div>
    </div></div>`;
  view.querySelectorAll('[data-m]').forEach((c) => c.onchange = () => { S.w.manual[c.dataset.m] = c.checked; sValidation(); });
  $('#back').onclick = $('#edit').onclick = () => setStep(6);
  $('#next').onclick = () => setStep(8);
}

// ---------- Paso 8: descarga ----------
function sDownload() {
  const p = getProfile(S.w.profileId);
  const res = S.w.result;
  const overall = overallWithManual(res, S.w.manual);
  const lay = layout(S.w.sheet, p, S.w.copies);
  const pngAllowed = p.digital.format !== 'jpeg' || !p.digital.verified;
  view.innerHTML = `${stepper(8)}<div class="top"><div><h1>Descarga</h1><p class="sub">${esc(p.nameEs)} · estado: <span class="badge ${overall}">${STATUS_TXT[overall]}</span></p></div><button class="btn" id="back">← Validación</button></div>
  ${overall === 'fail' ? '<div class="notice warn" style="margin-bottom:14px">La foto tiene incumplimientos detectables. Puede descargarla, pero se recomienda corregirla antes de usarla.</div>' : ''}
  <div class="grid" style="grid-template-columns:1fr">
    <div class="card"><h2>Su foto ${p.print.widthIn} × ${p.print.heightIn} in en JPG</h2>
      <div class="row" style="align-items:flex-start;gap:20px">
        <div style="text-align:center"><img id="single" alt="Foto final ${p.print.widthIn}x${p.print.heightIn} in" style="width:240px;height:auto;border:1px solid var(--line);border-radius:4px;display:block">
          <span class="muted small">Esta imagen ES el archivo JPG final</span></div>
        <div class="grid" style="gap:10px;flex:1;min-width:220px">
          <button class="btn primary" id="dHi" disabled>Descargar foto ${p.print.widthIn}×${p.print.heightIn} in — JPG ${p.print.printDpi} DPI (${p.print.widthIn * p.print.printDpi}×${p.print.heightIn * p.print.printDpi} px)</button>
          <button class="btn" id="dJpg" disabled>Descargar foto digital para subir en línea — JPG ${p.digital.widthPx}×${p.digital.heightPx}${p.digital.maxBytes ? `, ≤ ${Math.round(p.digital.maxBytes / 1024)} KB` : ''}</button>
          <button class="btn" id="dPng" disabled>Descargar PNG ${pngAllowed ? '' : '(este documento solo acepta JPEG)'}</button>
        </div>
      </div>
      <p class="small muted" style="margin-top:10px">El JPG de ${p.print.printDpi} DPI lleva el tamaño físico en el archivo: al imprimir al 100% mide exactamente ${p.print.widthIn} × ${p.print.heightIn} in. ${esc(p.digital.note)}</p>
      <div class="notice" style="margin-top:10px"><b>Si el botón no descarga:</b> haga clic derecho sobre la foto (en el celular, mantenga el dedo presionado) y elija <b>“Guardar imagen como…”</b>. Se guarda el mismo JPG ${p.print.widthIn}×${p.print.heightIn} in a ${p.print.printDpi} DPI.</div>
      <p class="small" id="dInfo" style="margin-top:6px">Preparando archivos…</p>
    </div>
    <div class="card"><h2>Imprimir: foto individual u hoja con varias fotos</h2>
      <div class="row"><select id="sheet" class="btn">${Object.values(SHEETS).map((s) => `<option value="${s.id}" ${S.w.sheet === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
        <select id="fmt" class="btn"><option value="pdf" ${S.w.fmt === 'pdf' ? 'selected' : ''}>PDF</option><option value="jpg" ${S.w.fmt === 'jpg' ? 'selected' : ''}>JPG</option><option value="png" ${S.w.fmt === 'png' ? 'selected' : ''}>PNG</option></select>
        ${lay.max > 1 ? `<label class="row small">Copias <input type="number" id="copies" min="1" max="${lay.max}" value="${lay.slots.length}" class="btn" style="width:80px"></label><span class="muted small">máx. ${lay.max}</span>` : ''}</div>
      <div class="stage" style="margin-top:12px"><canvas id="prev"></canvas></div>
      ${p.rules.copies ? `<div class="notice" style="margin-top:10px">${p.group === 'USCIS' ? `USCIS pide <b>${p.rules.copies} fotos idénticas</b> por formulario. Escriba con lápiz suave su nombre y número A (si tiene) en el reverso.` : `Este trámite pide <b>${p.rules.copies === 1 ? '1 foto' : `${p.rules.copies} fotos`}</b>.`}</div>` : ''}
      <p class="small muted">Cada foto mide exactamente ${p.print.widthIn} × ${p.print.heightIn} in. Imprima al <b>100% / “Tamaño real”</b>, sin “Ajustar a la página”, en papel fotográfico. La hoja carta incluye una regla de 1 pulgada para comprobar la escala.</p>
      <div class="row"><button class="btn primary" id="dPdf" disabled>Preparando…</button><span class="small" id="pInfo"></span></div>
    </div>
  </div>`;
  const W = 600, H = Math.round(600 * p.print.heightIn / p.print.widthIn);
  const { canvas } = currentRender(W, H);
  drawPreview($('#prev'), lay, canvas, p);
  const info = (m) => { $('#dInfo').innerHTML = m; };
  const stamp = new Date().toLocaleDateString('en-CA'); // fecha local AAAA-MM-DD
  const base = `${p.id}-${stamp}`;
  addHistory(canvas, overall);

  // Los archivos se generan ANTES del clic: así la descarga ocurre dentro del gesto del usuario.
  const files = {};
  const token = S.w.dlToken = (S.w.dlToken || 0) + 1; // evita que un cálculo viejo escriba en la pantalla nueva
  const stale = () => token !== S.w.dlToken;
  const hiPx = [p.print.widthIn * p.print.printDpi, p.print.heightIn * p.print.printDpi];
  const save = async (key) => {
    const f = files[key]; if (!f) return;
    const r = await download(f.blob, f.name);
    info(r === true ? `Descargado: <b>${esc(f.name)}</b> · ${f.desc}` : r === false ? 'Descarga cancelada.' : `<span class="badge fail">No se pudo descargar</span> ${esc(r)}`);
  };
  (async () => {
    const hi = currentRender(hiPx[0], hiPx[1]).canvas;
    const rh = await encodeJpeg(hi, null, null, p.print.printDpi);
    files.hi = { blob: rh.blob, name: `${base}-${p.print.widthIn}x${p.print.heightIn}in-${p.print.printDpi}dpi.jpg`, desc: `${hiPx[0]}×${hiPx[1]} px · ${p.print.printDpi} DPI · ${(rh.bytes / 1024).toFixed(0)} KB` };
    $('#single').src = URL.createObjectURL(rh.blob);
    const dc = currentRender(p.digital.widthPx, p.digital.heightPx).canvas;
    const rd = await encodeJpeg(dc, p.digital.maxBytes, p.digital.minBytes, Math.round(p.digital.widthPx / p.print.widthIn));
    files.jpg = { blob: rd.blob, name: `${base}-digital.jpg`, desc: `${p.digital.widthPx}×${p.digital.heightPx} px · ${(rd.bytes / 1024).toFixed(1)} KB ${rd.meetsMax ? '<span class="badge ok">peso dentro del límite</span>' : '<span class="badge fail">supera el límite</span>'}` };
    if (pngAllowed) {
      const pb = await new Promise((r) => hi.toBlob(r, 'image/png'));
      files.png = { blob: pb, name: `${base}.png`, desc: `PNG · ${(pb.size / 1024).toFixed(0)} KB` };
    }
    if (stale() || !$('#dHi')) return; // el usuario cambió de pantalla
    $('#dHi').disabled = false; $('#dJpg').disabled = false; $('#dPng').disabled = !pngAllowed;
    info('Archivos listos.');
  })();
  $('#dHi').onclick = () => save('hi');
  $('#dJpg').onclick = () => save('jpg');
  $('#dPng').onclick = () => save('png');
  $('#sheet').onchange = (e) => { S.w.sheet = e.target.value; S.w.copies = 0; sDownload(); };
  const cp = $('#copies'); if (cp) cp.onchange = (e) => { S.w.copies = clamp(parseInt(e.target.value, 10) || 1, 1, lay.max); sDownload(); };
  // Archivo de impresión en el formato elegido, preparado antes del clic
  const fmt = S.w.fmt || 'pdf';
  const sheetName = { single: `${p.print.widthIn}x${p.print.heightIn}in`, '4x6': 'hoja-4x6', letter: 'hoja-carta' }[S.w.sheet];
  let printFile = null;
  (async () => {
    const hiPhoto = currentRender(hiPx[0], hiPx[1]).canvas;
    let blob;
    const dpi = S.w.sheet === 'single' ? p.print.printDpi : 300;
    if (fmt === 'pdf') blob = buildPdf(lay, hiPhoto, p, { date: stamp });
    else {
      const sc = sheetCanvas(lay, hiPhoto, p, dpi);
      if (fmt === 'jpg') blob = (await encodeJpeg(sc, null, null, dpi)).blob;
      else blob = await setPngDpi(await new Promise((r) => sc.toBlob(r, 'image/png')), dpi);
    }
    if (stale()) return;
    printFile = { blob, name: `${base}-${sheetName}.${fmt}` };
    const btn = $('#dPdf'); if (!btn) return;
    btn.disabled = false;
    btn.textContent = `Descargar ${fmt.toUpperCase()}${S.w.sheet === 'single' ? ` — foto ${p.print.widthIn}×${p.print.heightIn} in` : ` — ${lay.slots.length} fotos`}`;
    $('#pInfo').textContent = fmt === 'pdf' ? '' : `${Math.round(lay.pageW * dpi)}×${Math.round(lay.pageH * dpi)} px a ${dpi} DPI · ${(blob.size / 1024).toFixed(0)} KB`;
  })();
  $('#fmt').onchange = (e) => { S.w.fmt = e.target.value; sDownload(); };
  $('#dPdf').onclick = async () => {
    if (!printFile) return;
    const r = await download(printFile.blob, printFile.name);
    $('#pInfo').innerHTML = r === true ? `Descargado: <b>${esc(printFile.name)}</b>` : r === false ? 'Descarga cancelada.' : `<span class="badge fail">No se pudo descargar</span> ${esc(r)}`;
  };
  $('#back').onclick = () => setStep(7);
}

function addHistory(canvas, status) {
  const t2 = document.createElement('canvas'); t2.width = 200; t2.height = Math.round(200 * canvas.height / canvas.width);
  t2.getContext('2d').drawImage(canvas, 0, 0, t2.width, t2.height);
  const entry = { id: S.w.histId || crypto.randomUUID(), profileId: S.w.profileId, date: new Date().toLocaleString('es'), status, thumb: t2.toDataURL('image/jpeg', 0.8) };
  S.w.histId = entry.id;
  const i = S.history.findIndex((h) => h.id === entry.id);
  if (i >= 0) S.history[i] = entry; else S.history.push(entry);
}

// ---------- Historial ----------
function pHistory() {
  view.innerHTML = `<div class="top"><div><h1>Historial de fotografías</h1><p class="sub">Solo de esta sesión. Por privacidad, se borra al cerrar o recargar la página.</p></div>${S.history.length ? '<button class="btn" id="clr">Eliminar todo</button>' : ''}</div>
  <div class="card">${S.history.length ? `<div class="thumbs">${S.history.slice().reverse().map((h) => thumbHtml(h).replace('</div></div>', `<br><button class="btn sm" data-del="${h.id}" style="margin-top:6px">Eliminar</button></div></div>`)).join('')}</div>` : '<div class="empty">No hay fotografías en esta sesión.</div>'}</div>
  <p class="muted small" style="margin-top:12px">Guardar historial de forma permanente requiere autorización expresa y almacenamiento cifrado en servidor: <span class="badge pending">Pendiente — Fase 7</span></p>`;
  const c = $('#clr'); if (c) c.onclick = () => { S.history = []; pHistory(); };
  view.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { S.history = S.history.filter((h) => h.id !== b.dataset.del); pHistory(); });
}

// ---------- Configuración ----------
function pSettings() {
  view.innerHTML = `<div class="top"><div><h1>Configuración</h1></div></div>
  <div class="grid g2">
    <div class="card ctrl"><h2>Preferencias</h2>
      <div><label>Idioma</label><select id="lang" class="btn"><option value="es">Español</option><option value="en">English (parcial, en preparación)</option></select></div>
      <label class="row small"><input type="checkbox" id="ae" ${S.settings.autoExposure ? 'checked' : ''}> Corrección automática moderada de exposición (máx. ±15%, solo brillo global)</label>
    </div>
    <div class="card"><h2>Privacidad y datos</h2><ul class="small tips">
      <li>Todo el análisis (detección facial, segmentación, validación) se ejecuta <b>en este navegador</b> con modelos locales.</li>
      <li>No se envían imágenes a servicios externos. No hay registros (logs) de fotos.</li>
      <li>Las fotos solo existen en la memoria de esta pestaña y se eliminan al cerrarla.</li>
      <li>Las fotos nunca se usan para entrenar modelos.</li></ul>
      <button class="btn" id="wipe">Eliminar ahora todas las fotos de esta sesión</button><p class="small" id="wiped"></p></div>
  </div>`;
  $('#lang').value = getLang();
  $('#lang').onchange = (e) => { setLang(e.target.value); route(); };
  $('#ae').onchange = (e) => { S.settings.autoExposure = e.target.checked; };
  $('#wipe').onclick = () => { if (S.w?.img) URL.revokeObjectURL(S.w.img.src); S.history = []; S.w = null; $('#wiped').textContent = 'Listo: no queda ninguna foto en memoria.'; };
}

// ---------- Perfiles documentales (administración) ----------
function pProfiles() {
  const src = (o) => o?.source ? `<a href="${o.source.url}" target="_blank" rel="noopener">${esc(o.source.name)}</a>` : '—';
  const ver = (o) => (o?.verified ? '<span class="badge ok">verificado</span>' : '<span class="badge review">no verificado en fuente vigente</span>');
  view.innerHTML = `<div class="top"><div><h1>Perfiles documentales</h1><p class="sub">Requisitos técnicos, fuentes oficiales y fecha de consulta (${CONSULTED}).</p></div><button class="btn" id="exp">Exportar JSON</button></div>
  <div class="notice" style="margin-bottom:14px">Los perfiles se definen como datos (<code>js/profiles.js</code>): agregar un documento no requiere modificar el motor. Edición desde esta pantalla, versiones y aprobación: <span class="badge pending">Pendiente — requiere backend (Fase 5)</span></div>
  ${PROFILES.map((p) => p.status !== 'activo' ? `<div class="card" style="margin-bottom:12px"><div class="row"><b>${esc(p.nameEs)}</b><span class="badge pending">Pendiente</span><span class="spacer"></span><span class="muted small">Requisitos no verificados: no se muestran medidas.</span></div></div>` : `
  <div class="card" style="margin-bottom:12px"><div class="row"><h2 style="margin:0">${esc(p.nameEs)}</h2><span class="badge ok">Activo · v${p.version}</span><span class="spacer"></span><span class="muted small">Actualizado ${p.updated}</span></div>
  <table style="margin-top:10px"><thead><tr><th>Requisito</th><th>Valor</th><th>Fuente</th><th>Estado</th></tr></thead><tbody>
    <tr><td>Tamaño impreso</td><td>${p.print.widthIn} × ${p.print.heightIn} in · ${p.print.printDpi} DPI</td><td>${src(p.print)}</td><td>${ver(p.print)}</td></tr>
    <tr><td>Digital</td><td>${p.digital.widthPx}×${p.digital.heightPx}px · ${p.digital.format.toUpperCase()}${p.digital.maxBytes ? ` · ≤ ${p.digital.maxBytes / 1024} KB` : ''}<br><span class="muted small">${esc(p.digital.note)}</span></td><td>${src(p.digital)}</td><td>${ver(p.digital)}</td></tr>
    <tr><td>Altura de cabeza</td><td>${esc(p.head.label)}</td><td>${src(p.head)}</td><td>${ver(p.head)}</td></tr>
    <tr><td>Posición de ojos</td><td>${esc(p.eyes.label)}${p.eyes.note ? `<br><span class="muted small">${esc(p.eyes.note)}</span>` : ''}</td><td>${src(p.eyes)}</td><td>${ver(p.eyes)}</td></tr>
    <tr><td>Fondo</td><td>${esc(p.background.label)}</td><td>${src(p.background)}</td><td>${ver(p.background)}</td></tr>
    <tr><td>Reglas</td><td class="small">${esc(p.rules.glasses)} ${esc(p.rules.expression)} ${esc(p.rules.recency)} ${esc(p.rules.editing)}</td><td>${src(p.rules)}</td><td>${ver(p.rules)}</td></tr>
  </tbody></table></div>`).join('')}`;
  $('#exp').onclick = () => download(new Blob([JSON.stringify(PROFILES, null, 2)], { type: 'application/json' }), `perfiles-${CONSULTED}.json`);
}

// Exponer estado para pruebas automatizadas (solo lectura)
window.__fotodoc = { S, go, setStep, handleFile };
route();
