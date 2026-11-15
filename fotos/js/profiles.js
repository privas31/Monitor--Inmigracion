// Catálogo de perfiles documentales.
// Cada requisito guarda: valor, fuente, fecha de consulta y estado de verificación.
// "verified: false" => el requisito NO se pudo confirmar en una fuente oficial vigente;
// la interfaz lo muestra como tal y el validador no lo presenta como regla oficial.

export const CONSULTED = '2026-11-14';

const SRC = {
  dosPassport: {
    name: 'U.S. Department of State — Passport Photos',
    url: 'https://travel.state.gov/en/passports/apply/help/photos.html',
  },
  dosPassportTemplateArchive: {
    name: 'U.S. Department of State — Photo Composition Template (copia archivada, UNT Web Archive)',
    url: 'https://webarchive.library.unt.edu/web/20120915105327/http://travel.state.gov/passport/pptphotoreq/photocomptemplate/photocomptemplate_5297.html',
  },
  dosVisa: {
    name: 'U.S. Department of State — Visa Photo Requirements',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html',
  },
  dosVisaTemplate: {
    name: 'U.S. Department of State — Visa Photo Composition Template',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos/photo-composition-template.html',
  },
  uscisI765: {
    name: 'USCIS — Form I-765 Instructions (edición 01/20/25), sección "Photographs"',
    url: 'https://www.uscis.gov/sites/default/files/document/forms/I765instr.pdf',
  },
  uscisI485: {
    name: 'USCIS — Form I-485 Instructions, sección "Photographs"',
    url: 'https://www.uscis.gov/sites/default/files/document/forms/i-485instr.pdf',
  },
  uscisN400: {
    name: 'USCIS — Form N-400 Instructions, "Photograph Requirements for Applicants Residing Outside the United States"',
    url: 'https://www.uscis.gov/sites/default/files/document/forms/n-400instr.pdf',
  },
  uscisI130: {
    name: 'USCIS — Form I-130 Instructions (mismo requisito en I-129F, N-600, N-565 y otros)',
    url: 'https://www.uscis.gov/sites/default/files/document/forms/i-130instr.pdf',
  },
  dosDV: {
    name: 'U.S. Department of State — Instrucciones DV-2026, "Submitting a Digital Photograph"',
    url: 'https://travel.state.gov/content/dam/visas/Diversity-Visa/DV-Instructions-Translations/DV-2026-Instructions-Translations/DV%202026%20Plain%20Language%20Instructions%20and%20FAQs.pdf',
  },
  nypd: {
    name: 'NYPD License Division — instrucciones de solicitud ("1 ½ x 1 ½ inches, front view")',
    url: 'https://www.nyc.gov/assets/nypd/downloads/pdf/form_nypdretirees.pdf',
  },
  dosVisaDigital: {
    name: 'U.S. Department of State — Digital Image Requirements',
    url: 'https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos/digital-image-requirements.html',
  },
};

export const COUNTRIES = [
  { id: 'us', name: 'Estados Unidos', flag: '🇺🇸', available: true },
  { id: 'mx', name: 'México', flag: '🇲🇽', available: false },
  { id: 'ca', name: 'Canadá', flag: '🇨🇦', available: false },
  { id: 'uk', name: 'Reino Unido', flag: '🇬🇧', available: false },
  { id: 'es', name: 'España', flag: '🇪🇸', available: false },
];

const WHITE = [{ name: 'Blanco', hex: '#FFFFFF' }, { name: 'Blanco hueso (off-white)', hex: '#F7F5F0' }];

/** Perfil USCIS 2x2 (el mismo párrafo de fotos se repite en las instrucciones de cada formulario). */
function uscis2x2({ id, name, nameEs, src, recency, note, verified = true }) {
  return {
    id, country: 'us', group: 'USCIS', name, nameEs, category: 'migratorio', status: 'activo', version: '1.0.0', updated: CONSULTED,
    sizeLabel: '51×51 mm (2×2 in)', physical: true,
    print: { widthIn: 2, heightIn: 2, printDpi: 600, source: src, verified, note: 'Dos fotos idénticas a color de 2 x 2 in, papel delgado con acabado brillante, sin montar y sin retocar.' },
    digital: { widthPx: 1200, heightPx: 1200, format: 'jpeg', maxBytes: null, minBytes: null, source: src, verified: false,
      note: 'Las instrucciones de USCIS describen fotos impresas; no publican píxeles ni peso para archivo digital. Se exporta 1200×1200 (2 in a 600 DPI).' },
    head: { minFrac: 1 / 2, maxFrac: 1.375 / 2, label: '1 a 1 3/8 in desde la parte superior del cabello hasta la barbilla', source: src, verified },
    eyes: { minFrac: 1.125 / 2, maxFrac: 1.375 / 2, label: 'Ojos entre 1 1/8 y 1 3/8 in desde el borde inferior', source: src, verified },
    background: { allowed: WHITE, label: 'Blanco o blanco hueso', source: src, verified },
    rules: {
      glasses: 'Las instrucciones de USCIS no mencionan lentes; por criterio de foto estilo pasaporte se recomienda quitarlos.',
      expression: 'Rostro completo, vista frontal. Cabeza descubierta salvo prenda religiosa.',
      recency, editing: 'USCIS pide fotos sin retocar ("unretouched").', copies: 2, note, source: src, verified,
    },
  };
}

export const PROFILES = [
  {
    id: 'us-passport',
    country: 'us',
    group: 'Departamento de Estado',
    sizeLabel: '51×51 mm (2×2 in)',
    physical: true,
    name: 'Passport',
    nameEs: 'Pasaporte estadounidense',
    category: 'pasaporte',
    status: 'activo',
    version: '1.0.0',
    updated: CONSULTED,
    print: {
      widthIn: 2, heightIn: 2, printDpi: 600,
      source: SRC.dosPassport, verified: true,
      note: '2 x 2 pulgadas (51 x 51 mm), papel fotográfico mate o brillante.',
    },
    digital: {
      // La página vigente del pasaporte NO publica dimensiones digitales.
      widthPx: 1200, heightPx: 1200, format: 'jpeg', maxBytes: null, minBytes: null,
      source: SRC.dosPassport, verified: false,
      note: 'La página oficial vigente no especifica píxeles ni peso para la renovación en línea. Se exporta 1200×1200 (2 in a 600 DPI) como formato de alta calidad; confirme en el portal donde la suba.',
    },
    head: {
      minFrac: 25 / 50.8, maxFrac: 35 / 50.8, // 25–35 mm sobre 50.8 mm
      label: '1 a 1 3/8 in (25–35 mm) de la barbilla a la parte superior de la cabeza',
      source: SRC.dosPassport, verified: true,
    },
    eyes: {
      minFrac: 28 / 50.8, maxFrac: 35 / 50.8, // desde el borde inferior
      label: 'Ojos entre 1 1/8 y 1 3/8 in (28–35 mm) desde el borde inferior',
      source: SRC.dosPassportTemplateArchive, verified: false,
      note: 'Dato de la plantilla oficial archivada; la página vigente no lo especifica. Se usa como guía, no como regla oficial actual.',
    },
    background: {
      allowed: [{ name: 'Blanco', hex: '#FFFFFF' }, { name: 'Blanco hueso (off-white)', hex: '#F7F5F0' }],
      label: 'Blanco o blanco hueso, sin sombras, texturas, objetos ni líneas',
      source: SRC.dosPassport, verified: true,
    },
    rules: {
      glasses: 'No se permiten lentes (salvo nota médica firmada).',
      expression: 'Expresión neutral, ambos ojos abiertos, boca cerrada (se permite sonrisa con boca cerrada).',
      recency: 'Tomada en los últimos 6 meses.',
      editing: 'La página oficial indica que la foto debe enviarse sin editar.',
      source: SRC.dosPassport, verified: true,
    },
  },
  {
    id: 'us-visa',
    country: 'us',
    group: 'Departamento de Estado',
    sizeLabel: '51×51 mm (2×2 in)',
    name: 'Visa',
    nameEs: 'Foto para visa estadounidense (DS-160)',
    category: 'visa',
    status: 'activo',
    version: '1.0.0',
    updated: CONSULTED,
    print: {
      widthIn: 2, heightIn: 2, printDpi: 600,
      source: SRC.dosVisa, verified: true,
      note: '2 x 2 pulgadas (51 x 51 mm) si se escanea o imprime.',
    },
    digital: {
      widthPx: 600, heightPx: 600, format: 'jpeg', maxBytes: 240 * 1024, minBytes: null,
      minPx: 600, maxPx: 1200,
      source: SRC.dosVisaDigital, verified: true,
      note: 'JPEG, cuadrada, 600×600 a 1200×1200 px, máximo 240 KB, color sRGB 24 bits.',
    },
    head: {
      minFrac: 0.50, maxFrac: 0.69,
      label: 'Cabeza (barbilla a parte superior incluido el cabello) entre 50% y 69% de la altura',
      source: SRC.dosVisaTemplate, verified: true,
    },
    eyes: {
      minFrac: 0.56, maxFrac: 0.69,
      label: 'Altura de ojos entre 56% y 69% desde el borde inferior',
      source: SRC.dosVisaDigital, verified: true,
    },
    background: {
      allowed: [{ name: 'Blanco', hex: '#FFFFFF' }, { name: 'Blanco hueso (off-white)', hex: '#F7F5F0' }],
      label: 'Blanco o blanco hueso, liso',
      source: SRC.dosVisa, verified: true,
    },
    rules: {
      glasses: 'No se permiten lentes (salvo excepciones médicas documentadas).',
      expression: 'Expresión neutral, ambos ojos abiertos, de frente a la cámara.',
      recency: 'Tomada en los últimos 6 meses.',
      editing: 'No altere digitalmente la apariencia; revise si el reemplazo de fondo es aceptable para su trámite.',
      source: SRC.dosVisa, verified: true,
    },
  },
  // Perfiles pendientes: aparecen en el catálogo pero NO se pueden usar hasta verificar sus fuentes.
  uscis2x2({ id: 'us-greencard', name: 'Green Card (Permanent Resident)', nameEs: 'Green Card / Residencia (I-485)', src: SRC.uscisI485,
    recency: 'Tomada recientemente (las instrucciones del I-485 no fijan número de días).' }),
  uscis2x2({ id: 'us-n400', name: 'Citizenship (N-400)', nameEs: 'Ciudadanía (N-400)', src: SRC.uscisN400,
    recency: 'Tomada recientemente.',
    note: 'USCIS solo pide fotos con el N-400 a quien vive fuera de EE. UU.; a los demás les toma la foto en la cita de biometría.' }),
  uscis2x2({ id: 'us-uscis-forms', name: 'USCIS Forms Photo', nameEs: 'Formas USCIS (I-130, I-129F, N-600, otras)', src: SRC.uscisI130,
    recency: 'Revise su formulario: el I-130 y el I-129F piden fotos tomadas dentro de los 30 días antes de presentar.' }),
  {
    id: 'us-dv', country: 'us', group: 'Departamento de Estado', name: 'Electronic Diversity Visa Lottery Photo', nameEs: 'Lotería de visas (DV)',
    category: 'visa', status: 'activo', version: '1.0.0', updated: CONSULTED, sizeLabel: '600×600 px · digital',
    print: { widthIn: 2, heightIn: 2, printDpi: 600, source: SRC.dosDV, verified: true,
      note: 'La inscripción es digital. Si sale seleccionado, para la entrevista se llevan 2 fotos impresas de 2 x 2 in.' },
    digital: { widthPx: 600, heightPx: 600, format: 'jpeg', maxBytes: 240 * 1024, minBytes: null, source: SRC.dosDV, verified: true,
      note: 'Inscripción DV: JPEG, cuadrada, exactamente 600×600 px, máximo 240 KB, en color.' },
    head: { minFrac: 0.50, maxFrac: 0.69, label: 'Cabeza entre 50% y 69% de la altura de la imagen', source: SRC.dosDV, verified: true },
    eyes: { minFrac: 0.56, maxFrac: 0.69, label: 'Altura de ojos entre 56% y 69% desde el borde inferior', source: SRC.dosVisaDigital, verified: true },
    background: { allowed: WHITE, label: 'Blanco o blanco hueso, liso', source: SRC.dosDV, verified: true },
    rules: {
      glasses: 'No se permiten lentes (mismas normas que la foto de visa).',
      expression: 'Expresión neutral, ambos ojos abiertos, de frente.',
      recency: 'Tomada en los últimos 6 meses; no repita la foto de una inscripción de años anteriores.',
      editing: 'Una foto manipulada puede descalificar la inscripción.',
      source: SRC.dosDV, verified: true,
    },
  },
  {
    id: 'us-nygun', country: 'us', group: 'Estatal / local', name: 'NY Gun License', nameEs: 'Licencia de armas de NY (NYPD)',
    category: 'otros', status: 'activo', version: '1.0.0', updated: CONSULTED, sizeLabel: '38×38 mm (1.5×1.5 in)', physical: true,
    print: { widthIn: 1.5, heightIn: 1.5, printDpi: 600, source: SRC.nypd, verified: true,
      note: 'Una foto reciente a color, estilo pasaporte, de 1 ½ x 1 ½ in, de frente.' },
    digital: { widthPx: 900, heightPx: 900, format: 'jpeg', maxBytes: null, minBytes: null, source: SRC.nypd, verified: false,
      note: 'El NYPD no publica píxeles ni peso para la foto digital del portal. Se exporta 900×900 (1.5 in a 600 DPI).' },
    head: { minFrac: 0.75 / 1.5, maxFrac: 1 / 1.5, label: 'Cabeza de 0.75 a 1 in (guía de la industria; el NYPD no la publica)', source: SRC.nypd, verified: false },
    eyes: { minFrac: 0.56, maxFrac: 0.69, label: 'Ojos entre 56% y 69% desde abajo (guía estilo pasaporte)', source: SRC.nypd, verified: false,
      note: 'El NYPD no publica la posición de los ojos; se usa como guía, no como regla oficial.' },
    background: { allowed: WHITE, label: 'Fondo claro liso (estilo pasaporte; el NYPD no especifica color)', source: SRC.nypd, verified: false },
    rules: {
      glasses: 'El NYPD no lo especifica; por criterio de foto estilo pasaporte se recomienda quitarlos.',
      expression: 'Vista frontal, rostro descubierto.',
      recency: 'Foto reciente.',
      editing: 'Revise si el reemplazo de fondo es aceptable para su trámite.',
      copies: 1, source: SRC.nypd, verified: true,
    },
  },
  {
    id: 'us-ead',
    country: 'us',
    group: 'USCIS',
    sizeLabel: '51×51 mm (2×2 in)',
    physical: true,
    name: 'Employment Authorization (EAD)',
    nameEs: 'Permiso de trabajo EAD (I-765)',
    category: 'migratorio',
    status: 'activo',
    version: '1.0.0',
    updated: CONSULTED,
    print: {
      widthIn: 2, heightIn: 2, printDpi: 600,
      source: SRC.uscisI765, verified: true,
      note: 'Dos fotos idénticas a color de 2 x 2 in, papel delgado con acabado brillante, sin montar y sin retocar.',
    },
    digital: {
      widthPx: 1200, heightPx: 1200, format: 'jpeg', maxBytes: null, minBytes: null,
      source: SRC.uscisI765, verified: false,
      note: 'Las instrucciones del I-765 describen fotos impresas; no publican píxeles ni peso para archivo digital. Se exporta 1200×1200 (2 in a 600 DPI); si presenta en línea, siga lo que indique su cuenta USCIS.',
    },
    head: {
      minFrac: 1 / 2, maxFrac: 1.375 / 2,
      label: '1 a 1 3/8 in desde la parte superior del cabello hasta la barbilla',
      source: SRC.uscisI765, verified: true,
    },
    eyes: {
      minFrac: 1.125 / 2, maxFrac: 1.375 / 2,
      label: 'Ojos entre 1 1/8 y 1 3/8 in desde el borde inferior',
      source: SRC.uscisI765, verified: true,
    },
    background: {
      allowed: [{ name: 'Blanco', hex: '#FFFFFF' }, { name: 'Blanco hueso (off-white)', hex: '#F7F5F0' }],
      label: 'Blanco o blanco hueso',
      source: SRC.uscisI765, verified: true,
    },
    rules: {
      glasses: 'Las instrucciones del I-765 no mencionan lentes; por criterio de foto estilo pasaporte se recomienda quitarlos.',
      expression: 'Rostro completo, vista frontal. Cabeza descubierta salvo prenda religiosa.',
      recency: 'Tomada recientemente (el I-765 no fija número de días; otros formularios como el I-130 piden 30 días).',
      editing: 'Las instrucciones del I-765 piden fotos sin retocar ("unretouched").',
      copies: 2,
      source: SRC.uscisI765, verified: true,
    },
  },
  { id: 'mx-passport', country: 'mx', name: 'Pasaporte mexicano', nameEs: 'Pasaporte mexicano (SRE)', category: 'pasaporte', status: 'pendiente' },
  { id: 'mx-tramites', country: 'mx', name: 'Trámites oficiales', nameEs: 'Fotografías para trámites oficiales', category: 'otros', status: 'pendiente' },
];

// Orden y grupos del menú de documentos
export const GROUPS = ['Departamento de Estado', 'USCIS', 'Estatal / local'];
const ORDER = ['us-visa', 'us-passport', 'us-dv', 'us-greencard', 'us-n400', 'us-ead', 'us-uscis-forms', 'us-nygun'];
PROFILES.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));

export const getProfile = (id) => PROFILES.find((p) => p.id === id);
