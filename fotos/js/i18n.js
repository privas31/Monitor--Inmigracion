// Textos de navegación y pasos. Español completo; inglés preparado (parcial).
const STR = {
  es: {
    dashboard: 'Dashboard', create: 'Crear fotografía', history: 'Historial', settings: 'Configuración', profiles: 'Perfiles documentales',
    steps: ['País', 'Documento', 'Subir foto', 'Análisis', 'Procesamiento', 'Editor', 'Validación', 'Descarga'],
  },
  en: {
    dashboard: 'Dashboard', create: 'Create photo', history: 'History', settings: 'Settings', profiles: 'Document profiles',
    steps: ['Country', 'Document', 'Upload', 'Analysis', 'Processing', 'Editor', 'Validation', 'Download'],
  },
};
let lang = 'es';
try { lang = localStorage.getItem('fotodoc.lang') || 'es'; } catch { /* sin almacenamiento */ }
export const t = (k) => (STR[lang] && STR[lang][k]) || STR.es[k];
export const getLang = () => lang;
export function setLang(l) { lang = STR[l] ? l : 'es'; try { localStorage.setItem('fotodoc.lang', lang); } catch { /* */ } }
