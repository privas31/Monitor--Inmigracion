// Plantillas de actas por país y tipo.
// type: cómo se traduce el valor  ·  req: obligatorio  ·  sec: sección en la traducción
// Las plantillas "general" son un punto de partida: ajústelas con un acta real de ese país.

const F = (key, es, en, type = 'text', opts = {}) => ({ key, es, en, type, ...opts });

const SEALS = [
  F('marginal', 'Anotaciones marginales', 'Marginal notes', 'longtext', { req: true, sec: 'Notes' }),
  F('seals', 'Sellos, firmas y timbres', 'Seals, signatures and stamps', 'seal', { req: true, sec: 'Notes' }),
];

const MX_REG = [
  F('entidad', 'Entidad federativa de registro', 'State of registration', 'place', { sec: 'Registry data' }),
  F('municipio', 'Municipio / Delegación', 'Municipality', 'place', { sec: 'Registry data' }),
  F('oficialia', 'Oficialía', 'Civil Registry Office No.', 'code', { sec: 'Registry data' }),
  F('libro', 'Libro', 'Book', 'code', { sec: 'Registry data' }),
  F('acta', 'Número de acta', 'Certificate No.', 'code', { req: true, sec: 'Registry data' }),
  F('fechaRegistro', 'Fecha de registro', 'Date of registration', 'date', { sec: 'Registry data' }),
];
const MX_CERT = [
  F('oficial', 'Nombre del Oficial / Juez del Registro Civil', 'Name of Civil Registry Officer / Judge', 'name', { sec: 'Certification' }),
  F('lugarExpedicion', 'Lugar de expedición', 'Place of issuance', 'place', { sec: 'Certification' }),
  F('fechaExpedicion', 'Fecha de expedición', 'Date of issuance', 'date', { sec: 'Certification' }),
  F('identificador', 'Identificador electrónico / Folio', 'Electronic identifier / Folio', 'code', { sec: 'Certification' }),
];

const person = (p, es, en, sec, extra = []) => [
  F(`${p}Nombre`, `${es}: nombre completo`, `${en}: full name`, 'name', { req: true, sec }),
  F(`${p}Edad`, `${es}: edad`, `${en}: age`, 'age', { sec }),
  F(`${p}Nac`, `${es}: nacionalidad`, `${en}: nationality`, 'nationality', { sec }),
  F(`${p}FechaNac`, `${es}: fecha de nacimiento`, `${en}: date of birth`, 'date', { sec }),
  F(`${p}LugarNac`, `${es}: lugar de nacimiento`, `${en}: place of birth`, 'place', { sec }),
  ...extra,
];

export const COUNTRIES = [
  { id: 'mx', name: 'México', flag: '🇲🇽', en: 'United Mexican States', countryEn: 'Mexico', idLabel: 'CURP' },
  { id: 'gt', name: 'Guatemala', flag: '🇬🇹', en: 'Republic of Guatemala', countryEn: 'Guatemala', idLabel: 'CUI' },
  { id: 'sv', name: 'El Salvador', flag: '🇸🇻', en: 'Republic of El Salvador', countryEn: 'El Salvador', idLabel: 'DUI / NIT' },
  { id: 'hn', name: 'Honduras', flag: '🇭🇳', en: 'Republic of Honduras', countryEn: 'Honduras', idLabel: 'No. de identidad' },
  { id: 'ni', name: 'Nicaragua', flag: '🇳🇮', en: 'Republic of Nicaragua', countryEn: 'Nicaragua', idLabel: 'No. de cédula' },
];

export const DOC_TYPES = [
  { id: 'birth', es: 'Acta de nacimiento', en: 'Birth Certificate' },
  { id: 'marriage', es: 'Acta de matrimonio', en: 'Marriage Certificate' },
];

const MX = {
  birth: {
    status: 'completa',
    header: 'ESTADOS UNIDOS MEXICANOS · ACTA DE NACIMIENTO',
    fields: [
      ...MX_REG,
      F('curp', 'CURP', 'CURP (Unique Population Registry Code)', 'code', { sec: 'Registrant' }),
      F('nombre', 'Nombre(s) y apellidos del registrado', 'Registrant’s full name', 'name', { req: true, sec: 'Registrant' }),
      F('sexo', 'Sexo', 'Sex', 'sex', { req: true, sec: 'Registrant' }),
      F('fechaNac', 'Fecha de nacimiento', 'Date of birth', 'date', { req: true, sec: 'Registrant' }),
      F('lugarNac', 'Lugar de nacimiento', 'Place of birth', 'place', { req: true, sec: 'Registrant' }),
      F('padreNombre', 'Padre: nombre completo', 'Father: full name', 'name', { sec: 'Parents' }),
      F('padreNac', 'Padre: nacionalidad', 'Father: nationality', 'nationality', { sec: 'Parents' }),
      F('padreCurp', 'Padre: CURP', 'Father: CURP', 'code', { sec: 'Parents' }),
      F('madreNombre', 'Madre: nombre completo', 'Mother: full name', 'name', { sec: 'Parents' }),
      F('madreNac', 'Madre: nacionalidad', 'Mother: nationality', 'nationality', { sec: 'Parents' }),
      F('madreCurp', 'Madre: CURP', 'Mother: CURP', 'code', { sec: 'Parents' }),
      ...SEALS, ...MX_CERT,
    ],
  },
  marriage: {
    status: 'completa',
    header: 'ESTADOS UNIDOS MEXICANOS · ACTA DE MATRIMONIO',
    fields: [
      ...MX_REG,
      F('fechaCelebracion', 'Fecha de celebración del matrimonio', 'Date of marriage', 'date', { req: true, sec: 'Marriage' }),
      F('regimen', 'Régimen patrimonial', 'Property regime', 'regime', { sec: 'Marriage' }),
      ...person('c1', 'Contrayente 1', 'Spouse 1', 'Spouse 1', [F('c1Curp', 'Contrayente 1: CURP', 'Spouse 1: CURP', 'code', { sec: 'Spouse 1' })]),
      ...person('c2', 'Contrayente 2', 'Spouse 2', 'Spouse 2', [F('c2Curp', 'Contrayente 2: CURP', 'Spouse 2: CURP', 'code', { sec: 'Spouse 2' })]),
      F('testigos', 'Testigos', 'Witnesses', 'name', { sec: 'Marriage' }),
      ...SEALS, ...MX_CERT,
    ],
  },
};

// Plantilla general para Centroamérica (inscripción en Registro Civil / RENAP / RNPN / RNP).
function general(country) {
  const reg = [
    F('registro', 'Registro / institución que expide', 'Issuing registry / institution', 'text', { sec: 'Registry data' }),
    F('departamento', 'Departamento', 'Department', 'place', { sec: 'Registry data' }),
    F('municipio', 'Municipio', 'Municipality', 'place', { sec: 'Registry data' }),
    F('partida', 'Partida / Inscripción No.', 'Entry / Record No.', 'code', { req: true, sec: 'Registry data' }),
    F('folio', 'Folio', 'Folio', 'code', { sec: 'Registry data' }),
    F('libro', 'Libro / Tomo', 'Book / Volume', 'code', { sec: 'Registry data' }),
    F('fechaInscripcion', 'Fecha de inscripción', 'Date of registration', 'date', { sec: 'Registry data' }),
  ];
  const cert = [
    F('registrador', 'Nombre del registrador / funcionario', 'Name of Registrar / official', 'name', { sec: 'Certification' }),
    F('lugarExpedicion', 'Lugar de expedición', 'Place of issuance', 'place', { sec: 'Certification' }),
    F('fechaExpedicion', 'Fecha de expedición', 'Date of issuance', 'date', { sec: 'Certification' }),
    F('verificacion', 'Código de verificación / número de certificación', 'Verification code / certification No.', 'code', { sec: 'Certification' }),
  ];
  return {
    birth: {
      status: 'general',
      header: `${country.name.toUpperCase()} · CERTIFICACIÓN DE PARTIDA DE NACIMIENTO`,
      fields: [
        ...reg,
        F('idPersona', country.idLabel, country.idLabel, 'code', { sec: 'Registrant' }),
        F('nombre', 'Nombre completo del inscrito', 'Registrant’s full name', 'name', { req: true, sec: 'Registrant' }),
        F('sexo', 'Sexo', 'Sex', 'sex', { req: true, sec: 'Registrant' }),
        F('fechaNac', 'Fecha de nacimiento', 'Date of birth', 'date', { req: true, sec: 'Registrant' }),
        F('horaNac', 'Hora de nacimiento', 'Time of birth', 'text', { sec: 'Registrant' }),
        F('lugarNac', 'Lugar de nacimiento', 'Place of birth', 'place', { req: true, sec: 'Registrant' }),
        F('padreNombre', 'Padre: nombre completo', 'Father: full name', 'name', { sec: 'Parents' }),
        F('padreNac', 'Padre: nacionalidad', 'Father: nationality', 'nationality', { sec: 'Parents' }),
        F('madreNombre', 'Madre: nombre completo', 'Mother: full name', 'name', { sec: 'Parents' }),
        F('madreNac', 'Madre: nacionalidad', 'Mother: nationality', 'nationality', { sec: 'Parents' }),
        F('compareciente', 'Compareciente / declarante', 'Declarant', 'name', { sec: 'Parents' }),
        ...SEALS, ...cert,
      ],
    },
    marriage: {
      status: 'general',
      header: `${country.name.toUpperCase()} · CERTIFICACIÓN DE PARTIDA DE MATRIMONIO`,
      fields: [
        ...reg,
        F('fechaCelebracion', 'Fecha de celebración del matrimonio', 'Date of marriage', 'date', { req: true, sec: 'Marriage' }),
        F('lugarCelebracion', 'Lugar de celebración', 'Place of marriage', 'place', { sec: 'Marriage' }),
        F('autoridad', 'Autoridad que celebró el matrimonio', 'Officiating authority', 'name', { sec: 'Marriage' }),
        F('regimen', 'Régimen económico', 'Property regime', 'regime', { sec: 'Marriage' }),
        ...person('c1', 'Contrayente 1', 'Spouse 1', 'Spouse 1', [F('c1Id', `Contrayente 1: ${country.idLabel}`, `Spouse 1: ${country.idLabel}`, 'code', { sec: 'Spouse 1' })]),
        ...person('c2', 'Contrayente 2', 'Spouse 2', 'Spouse 2', [F('c2Id', `Contrayente 2: ${country.idLabel}`, `Spouse 2: ${country.idLabel}`, 'code', { sec: 'Spouse 2' })]),
        F('testigos', 'Testigos', 'Witnesses', 'name', { sec: 'Marriage' }),
        ...SEALS, ...cert,
      ],
    },
  };
}

export const TEMPLATES = { mx: MX };
for (const c of COUNTRIES) if (!TEMPLATES[c.id]) TEMPLATES[c.id] = general(c);

export const getTemplate = (country, doc) => TEMPLATES[country]?.[doc];
export const getCountry = (id) => COUNTRIES.find((c) => c.id === id);
