// Traducción determinística de valores (sin servicios externos).
// Devuelve { en, sure } — sure=false significa "revise manualmente".

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// --- Números escritos en español (actas antiguas: "MIL NOVECIENTOS NOVENTA") ---
const UNITS = { cero: 0, un: 1, uno: 1, una: 1, primero: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const HUNDREDS = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
export function wordsToNumber(text) {
  const words = strip(text).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w && w !== 'y');
  if (!words.length) return null;
  let total = 0, cur = 0, any = false;
  for (const w of words) {
    if (w in UNITS) { cur += UNITS[w]; any = true; } else if (w in HUNDREDS) { cur += HUNDREDS[w]; any = true; } else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; any = true; } else return null;
  }
  return any ? total + cur : null;
}

// --- Fechas ---
export function translateDate(raw) {
  const s = strip(raw);
  if (!s) return { en: '', sure: false };
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/); // dd/mm/aaaa (formato latinoamericano)
  if (m) {
    let [, d, mo, y] = m; y = y.length === 2 ? (Number(y) > 30 ? '19' : '20') + y : y;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return { en: `${MONTHS_EN[+mo - 1]} ${+d}, ${y}`, sure: true };
  }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { en: `${MONTHS_EN[+m[2] - 1]} ${+m[3]}, ${m[1]}`, sure: true };
  // "12 de marzo de 1990" · "doce de marzo de mil novecientos noventa" · "12/MAR/1990"
  const mi = MONTHS.findIndex((mm) => s.includes(mm));
  const abbr = s.match(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\b/);
  const monthIdx = mi >= 0 ? mi : abbr ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'].indexOf(abbr[1] === 'set' ? 'sep' : abbr[1]) : -1;
  if (monthIdx >= 0) {
    const mname = mi >= 0 ? MONTHS[mi] : abbr[1];
    const [before, after] = s.split(mname);
    const dayTxt = before.replace(/\b(el|dia|del|de|a los|los|dias)\b/g, ' ').replace(/[\/\-.,]/g, ' ').trim();
    const yearTxt = after.replace(/\b(de|del|ano|año)\b/g, ' ').replace(/[\/\-.,]/g, ' ').trim();
    const day = /^\d+$/.test(dayTxt) ? +dayTxt : wordsToNumber(dayTxt);
    const year = /^\d{4}$/.test(yearTxt) ? +yearTxt : wordsToNumber(yearTxt);
    if (day && day <= 31 && year && year > 1800) return { en: `${MONTHS_EN[monthIdx]} ${day}, ${year}`, sure: true };
  }
  return { en: raw, sure: false };
}

// --- Diccionarios ---
const SEX = { hombre: 'Male', masculino: 'Male', h: 'Male', m: 'Male', varon: 'Male', mujer: 'Female', femenino: 'Female', f: 'Female' };
const NATIONALITY = {
  mexicana: 'Mexican', mexicano: 'Mexican', guatemalteca: 'Guatemalan', guatemalteco: 'Guatemalan', salvadorena: 'Salvadoran', salvadoreno: 'Salvadoran',
  hondurena: 'Honduran', hondureno: 'Honduran', nicaraguense: 'Nicaraguan', estadounidense: 'American (U.S.)', norteamericana: 'American (U.S.)', norteamericano: 'American (U.S.)',
  costarricense: 'Costa Rican', panamena: 'Panamanian', panameno: 'Panamanian', colombiana: 'Colombian', colombiano: 'Colombian', venezolana: 'Venezuelan', venezolano: 'Venezuelan',
  cubana: 'Cuban', cubano: 'Cuban', dominicana: 'Dominican', dominicano: 'Dominican', ecuatoriana: 'Ecuadorian', ecuatoriano: 'Ecuadorian', peruana: 'Peruvian', peruano: 'Peruvian', espanola: 'Spanish', espanol: 'Spanish',
};
const REGIME = { 'sociedad conyugal': 'Conjugal partnership (joint property)', 'separacion de bienes': 'Separate property', 'comunidad de bienes': 'Community property', 'comunidad absoluta de bienes': 'Absolute community property', 'comunidad de gananciales': 'Community of acquired property', 'participacion en las ganancias': 'Participation in profits', 'regimen mixto': 'Mixed regime' };
const NONE = { ninguna: 'None', ninguno: 'None', 'sin anotaciones': 'No marginal notes', 'sin anotacion': 'No marginal notes', 'no hay anotaciones': 'No marginal notes', 'no aplica': 'Not applicable', 'n/a': 'N/A', 'en blanco': '[blank]', '---': '[blank]', ilegible: '[illegible]', '[ilegible]': '[illegible]' };
const SEAL_WORDS = [
  [/sello(s)?/g, '[seal$1]'], [/firma(s)?/g, '[signature$1]'], [/rubrica(s)?/g, '[flourish$1]'], [/timbre(s)? fiscal(es)?/g, '[revenue stamp$1]'], [/timbre(s)?/g, '[stamp$1]'],
  [/huella(s)? digital(es)?/g, '[fingerprint$1]'], [/codigo qr/g, '[QR code]'], [/codigo de barras/g, '[barcode]'], [/escudo nacional/g, '[national coat of arms]'], [/escudo/g, '[coat of arms]'],
  [/holograma/g, '[hologram]'], [/firma electronica/g, '[electronic signature]'], [/ilegible/g, 'illegible'],
  [/del oficial del registro civil/g, 'of the Civil Registry Officer'], [/del juez del registro civil/g, 'of the Civil Registry Judge'], [/del registrador civil/g, 'of the Civil Registrar'], [/del registrador/g, 'of the Registrar'], [/del alcalde/g, 'of the Mayor'],
  [/oficial del registro civil/g, 'Civil Registry Officer'], [/registro civil/g, 'Civil Registry'], [/\by\b/g, 'and'], [/\bcon\b/g, 'with'], [/\bdel\b/g, 'of the'], [/\bde la\b/g, 'of the'], [/\bde\b/g, 'of'],
];
// Se aplican sobre el texto ORIGINAL (sin quitar acentos) para no alterar los nombres propios
const PLACES = [
  [/ciudad de m[eé]xico/gi, 'Mexico City'], [/distrito federal/gi, 'Federal District'], [/estado de m[eé]xico/gi, 'State of Mexico'], [/departamento de /gi, 'Department of '], [/municipio de /gi, 'Municipality of '],
  [/rep[uú]blica de /gi, 'Republic of '], [/estados unidos mexicanos/gi, 'United Mexican States'], [/estados unidos de am[eé]rica/gi, 'United States of America'],
];
const GLOSSARY = [
  [/se cancela/g, 'is cancelled'], [/por resolucion/g, 'by resolution'], [/rectificacion/g, 'rectification'], [/reconocimiento/g, 'acknowledgment'], [/divorcio/g, 'divorce'], [/disolucion del vinculo matrimonial/g, 'dissolution of the marriage bond'],
  [/sentencia/g, 'judgment'], [/juzgado/g, 'court'], [/expediente/g, 'file'], [/adopcion/g, 'adoption'], [/nulidad/g, 'annulment'], [/defuncion/g, 'death'], [/matrimonio/g, 'marriage'], [/nacimiento/g, 'birth'],
];

function applyRules(s, rules) { let out = s; for (const [re, rep] of rules) out = out.replace(re, rep); return out; }
function keepCase(original, en) { return original === original.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(original) ? en.toUpperCase().replace(/\[(.*?)\]/g, (m) => m.toLowerCase()) : en; }

/** Traduce un valor según el tipo de campo. */
export function translateValue(type, raw, country) {
  const v = String(raw ?? '').trim();
  if (!v) return { en: '', sure: false };
  const k = strip(v);
  if (k in NONE) return { en: NONE[k], sure: true };
  switch (type) {
    case 'name':
    case 'code':
      return { en: v, sure: true }; // nombres y códigos NO se traducen
    case 'date': return translateDate(v);
    case 'sex': return k in SEX ? { en: SEX[k], sure: true } : { en: v, sure: false };
    case 'nationality': return k in NATIONALITY ? { en: keepCase(v, NATIONALITY[k]), sure: true } : { en: v, sure: false };
    case 'regime': return k in REGIME ? { en: REGIME[k], sure: true } : { en: v, sure: false };
    case 'age': {
      const n = /^\d+/.test(k) ? parseInt(k, 10) : wordsToNumber(k.replace(/\banos?\b|\bde edad\b/g, ''));
      return n ? { en: `${n} years old`, sure: true } : { en: v, sure: false };
    }
    case 'place': {
      const en = applyRules(v, PLACES);
      return { en: v === v.toUpperCase() ? en.toUpperCase() : en, sure: true };
    }
    case 'seal': {
      const en = applyRules(k, SEAL_WORDS);
      const clean = en.replace(/\s+/g, ' ').trim();
      const left = clean.toLowerCase().replace(/\[.*?\]/g, ' ').replace(/\b(and|with|of|the|civil|registry|officer|judge|registrar|mayor|illegible)\b/g, ' ');
      return { en: clean, sure: !/[a-z]{3,}/.test(left) };
    }
    case 'longtext': {
      const en = applyRules(k, GLOSSARY);
      return { en: v, suggestion: en !== k ? en : '', sure: false }; // siempre revisión manual
    }
    default:
      return { en: v, sure: false };
  }
}

/** Números presentes en el original que no aparecen en la traducción (protección contra errores). */
export function missingNumbers(orig, en) {
  const nums = (String(orig).match(/\d+/g) || []).filter((n) => n.length >= 1);
  const enDigits = String(en);
  return nums.filter((n) => !enDigits.includes(n) && !enDigits.includes(String(+n)));
}
