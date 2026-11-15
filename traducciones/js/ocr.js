// Lectura del acta (OCR) 100% local con Tesseract. El acta no sale del equipo.
/* global Tesseract */
const BASE = new URL('../vendor/', import.meta.url).href;
let workerP = null;

function getWorker(onProgress) {
  if (!workerP) {
    workerP = Tesseract.createWorker('spa', 1, {
      workerPath: `${BASE}tesseract/worker.min.js`,
      corePath: `${BASE}tesseract/core`,
      langPath: `${BASE}tesseract/lang`,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
      logger: (m) => onProgress && m.status === 'recognizing text' && onProgress(m.progress),
    });
  }
  return workerP;
}

/** Devuelve líneas con texto y rectángulo (en px de la imagen). */
export async function readDocument(canvas, onProgress) {
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(canvas, {}, { blocks: true });
  const lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const text = l.text.replace(/\s+/g, ' ').trim();
    if (text.length > 1) lines.push({ text, bbox: l.bbox, conf: l.confidence });
  }
  return { text: data.text, lines };
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Pistas para llenar campos automáticamente a partir del texto leído (siempre requieren revisión).
const HINTS = {
  entidad: [/ENTIDAD (FEDERATIVA )?DE REGISTRO/],
  municipio: [/MUNICIPIO (DE REGISTRO)?/, /DELEGACION/],
  oficialia: [/OFICIALIA/],
  libro: [/\bLIBRO\b/],
  acta: [/(NUMERO DE ACTA|NO\.? DE ACTA|ACTA NO)/],
  fechaRegistro: [/FECHA DE REGISTRO/],
  fechaNac: [/FECHA DE NACIMIENTO/],
  lugarNac: [/LUGAR DE NACIMIENTO/],
  partida: [/PARTIDA/, /INSCRIPCION NO/],
  folio: [/\bFOLIO\b/],
  departamento: [/DEPARTAMENTO/],
  fechaCelebracion: [/FECHA DE (CELEBRACION|MATRIMONIO)/],
  regimen: [/REGIMEN/],
  oficial: [/(OFICIAL|JUEZ) DEL REGISTRO CIVIL/],
  padreNombre: [/^PADRE\b/],
  madreNombre: [/^MADRE\b/],
  fechaExpedicion: [/FECHA DE EXPEDICION/],
  identificador: [/IDENTIFICADOR ELECTRONICO/],
};

function valueAfterLabel(lines, i, re) {
  const line = norm(lines[i].text);
  const m = line.match(re);
  let rest = lines[i].text.slice((m.index || 0) + m[0].length).replace(/^[\s:.\-]+/, '').trim();
  if (!rest && lines[i + 1]) rest = lines[i + 1].text.trim();
  return rest;
}

/** Sugerencias de valores en español para los campos de la plantilla. */
export function suggestFields(lines, fields) {
  const out = {};
  const keys = new Set(fields.map((f) => f.key));
  const all = lines.map((l) => l.text).join('\n');
  const curps = norm(all).match(/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g) || [];
  if (keys.has('curp') && curps[0]) out.curp = curps[0];
  const sex = norm(all).match(/\b(HOMBRE|MUJER|MASCULINO|FEMENINO)\b/);
  if (keys.has('sexo') && sex) out.sexo = sex[1];
  // Formato único de México: Nombre(s) + Primer apellido + Segundo apellido
  if (keys.has('nombre')) {
    const part = (re) => { const i = lines.findIndex((l) => re.test(norm(l.text))); return i >= 0 ? valueAfterLabel(lines, i, re) : ''; };
    const full = [part(/NOMBRE\(?S?\)?:?/), part(/PRIMER APELLIDO/), part(/SEGUNDO APELLIDO/)].filter(Boolean).join(' ').trim();
    if (full) out.nombre = full;
  }
  // "Se expide en LUGAR el FECHA"
  const exp = lines.find((l) => /SE EXPIDE/.test(norm(l.text)));
  if (exp) {
    const m = exp.text.match(/se\s+expide\s+(?:la\s+presente\s+)?en\s+(.+?)\s+(?:el|a\s+los|a)\s+(.+)$/i);
    if (m) { if (keys.has('lugarExpedicion')) out.lugarExpedicion = m[1].replace(/[,.]$/, ''); if (keys.has('fechaExpedicion')) out.fechaExpedicion = m[2].replace(/[.]$/, ''); }
  }
  // Nacionalidad que sigue a "Padre" y a "Madre"
  for (const [who, key] of [['PADRE', 'padreNac'], ['MADRE', 'madreNac']]) {
    if (!keys.has(key)) continue;
    const i = lines.findIndex((l) => new RegExp(`^${who}\\b`).test(norm(l.text)));
    if (i < 0) continue;
    for (let j = i; j < Math.min(lines.length, i + 4); j++) {
      const m = norm(lines[j].text).match(/NACIONALIDAD:?\s*(.+)$/);
      if (m) { out[key] = lines[j].text.slice(lines[j].text.length - m[1].length).trim(); break; }
    }
  }
  for (const [key, res] of Object.entries(HINTS)) {
    if (!keys.has(key) || out[key]) continue;
    for (let i = 0; i < lines.length && !out[key]; i++) {
      for (const re of res) if (re.test(norm(lines[i].text))) { const v = valueAfterLabel(lines, i, re); if (v) out[key] = v; break; }
    }
  }
  return out;
}
