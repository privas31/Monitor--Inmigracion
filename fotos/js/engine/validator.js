// Motor de validación independiente del editor.
// Entrada: análisis de la foto original + geometría del resultado + perfil.
// Salida: lista de verificaciones con estado verde / amarillo / rojo.
// Es una evaluación técnica orientativa: la autoridad correspondiente decide.

export const STATUS = { OK: 'ok', REVIEW: 'review', FAIL: 'fail' };
const rank = { ok: 0, review: 1, fail: 2 };

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const inch = (frac, profile) => `${(frac * profile.print.heightIn).toFixed(2)} in`;
const mm = (frac, profile) => `${(frac * profile.print.heightIn * 25.4).toFixed(1)} mm`;

function check(id, param, status, value, reason, recommendation, action, official = true) {
  return { id, param, status, value, reason, recommendation, action, official };
}

export function validate(an, geo, profile, opts = {}) {
  const out = [];
  const P = profile;

  // 1. Rostro
  if (an.faceCount === 0) {
    out.push(check('face', 'Detección de rostro', 'fail', '0 rostros', 'No se detectó ningún rostro.', 'Use una foto de frente, con la cara completa y buena luz.', 'Subir otra foto'));
    return summarize(out);
  }
  out.push(an.otherFacesLarge
    ? check('face', 'Una sola persona', 'fail', `${an.faceCount} rostros`, 'Se detectó más de una persona en la foto.', 'La foto debe mostrar solo al solicitante.', 'Subir otra foto')
    : check('face', 'Una sola persona', 'ok', '1 rostro', 'Se detectó un rostro.', '', ''));

  // 2. Tamaño de cabeza
  const hMin = P.head.minFrac, hMax = P.head.maxFrac;
  const hv = geo.headFrac;
  const headLabel = P.physical ? `${inch(hv, P)} (${pct(hv)})` : pct(hv);
  if (hv < hMin) out.push(check('head', 'Altura de la cabeza', 'fail', headLabel, `La cabeza ocupa menos del mínimo (${P.head.label}).`, 'Acerque el encuadre.', 'Aumentar zoom en el editor', P.head.verified));
  else if (hv > hMax) out.push(check('head', 'Altura de la cabeza', 'fail', headLabel, `La cabeza supera el máximo (${P.head.label}).`, 'Aleje el encuadre.', 'Reducir zoom en el editor', P.head.verified));
  else out.push(check('head', 'Altura de la cabeza', 'ok', headLabel, `Dentro del rango: ${P.head.label}.`, '', '', P.head.verified));
  if (an.crown.estimated) out.push(check('crown', 'Parte superior de la cabeza', 'review', 'estimada', 'No se pudo localizar con precisión el borde superior del cabello; la altura de cabeza es una estimación.', 'Verifique visualmente que la guía superior coincida con el cabello.', 'Ajustar zoom/posición manualmente'));
  if (an.crown.touchesTop) out.push(check('crop', 'Cabeza completa en la foto original', 'fail', 'cortada', 'La parte superior de la cabeza toca el borde de la foto original.', 'Tome la foto dejando espacio sobre la cabeza.', 'Subir otra foto'));

  // 3. Altura de ojos
  const ev = geo.eyeFrac;
  const eyeVal = P.physical ? `${inch(ev, P)} (${pct(ev)})` : pct(ev);
  const eyeStatusIn = ev >= P.eyes.minFrac && ev <= P.eyes.maxFrac;
  out.push(check('eyes', 'Altura de los ojos', eyeStatusIn ? (P.eyes.verified ? 'ok' : 'review') : (P.eyes.verified ? 'fail' : 'review'), eyeVal,
    eyeStatusIn ? `Dentro del rango: ${P.eyes.label}.` : `Fuera del rango: ${P.eyes.label}.`,
    P.eyes.verified ? (eyeStatusIn ? '' : 'Mueva la foto verticalmente.') : (P.eyes.note || ''),
    eyeStatusIn ? '' : 'Ajustar posición vertical', P.eyes.verified));

  // 4. Márgenes
  if (geo.crownTop < 0.01) out.push(check('top', 'Espacio superior', 'fail', pct(geo.crownTop), 'La cabeza queda cortada en la parte superior.', 'Baje la foto o reduzca el zoom.', 'Ajustar posición'));
  else out.push(check('top', 'Espacio superior', 'ok', pct(geo.crownTop), 'Hay espacio sobre la cabeza.', '', ''));
  if (geo.chinBottom > 0.98) out.push(check('chin', 'Barbilla visible', 'fail', pct(geo.chinBottom), 'La barbilla queda cortada.', 'Suba la foto o reduzca el zoom.', 'Ajustar posición'));

  // 5. Centrado e inclinación
  const off = Math.abs(geo.centerOffset);
  out.push(check('center', 'Centrado horizontal', off <= 0.03 ? 'ok' : off <= 0.06 ? 'review' : 'fail', `${(geo.centerOffset * 100).toFixed(1)}%`,
    off <= 0.03 ? 'El rostro está centrado.' : 'El rostro está desplazado respecto al centro.', 'Centre el rostro.', off <= 0.03 ? '' : 'Ajustar posición horizontal'));
  const r = Math.abs(geo.residualRollDeg);
  out.push(check('roll', 'Inclinación de la cabeza', r <= 2 ? 'ok' : r <= 5 ? 'review' : 'fail', `${geo.residualRollDeg.toFixed(1)}°`,
    r <= 2 ? 'La línea de los ojos está nivelada.' : 'La cabeza está inclinada en la foto final.', 'Nivele con el control de rotación.', r <= 2 ? '' : 'Ajustar rotación'));
  const yaw = Math.abs(an.yawRatio - 0.5);
  out.push(check('yaw', 'Rostro de frente', yaw <= 0.07 ? 'ok' : yaw <= 0.13 ? 'review' : 'fail', yaw.toFixed(2),
    yaw <= 0.07 ? 'El rostro mira de frente a la cámara.' : 'El rostro parece girado hacia un lado.', 'Tome la foto mirando directo a la cámara (no se corrige digitalmente).', yaw <= 0.07 ? '' : 'Tomar otra foto'));

  // 6. Ojos y boca
  const ear = Math.min(an.earL, an.earR);
  out.push(check('eyesOpen', 'Ojos abiertos', ear >= 0.2 ? 'ok' : ear >= 0.14 ? 'review' : 'fail', ear.toFixed(2),
    ear >= 0.2 ? 'Ambos ojos parecen abiertos.' : 'Uno o ambos ojos parecen cerrados o entrecerrados.', 'Tome la foto con los ojos bien abiertos.', ear >= 0.2 ? '' : 'Tomar otra foto'));
  out.push(check('mouth', 'Boca cerrada', an.mouthOpen <= 0.12 ? 'ok' : 'review', an.mouthOpen.toFixed(2),
    an.mouthOpen <= 0.12 ? 'La boca parece cerrada.' : 'La boca parece abierta.', 'Expresión neutral con la boca cerrada.', an.mouthOpen <= 0.12 ? '' : 'Tomar otra foto'));

  // 7. Calidad
  out.push(check('sharp', 'Nitidez', an.sharp >= 60 ? 'ok' : an.sharp >= 25 ? 'review' : 'fail', Math.round(an.sharp),
    an.sharp >= 60 ? 'La foto tiene nitidez suficiente.' : 'La foto se ve borrosa o desenfocada.', 'Limpie el lente, use buena luz y mantenga el teléfono firme.', an.sharp >= 60 ? '' : 'Tomar otra foto'));
  const exposure = an.faceStats.mean;
  out.push(check('exposure', 'Exposición del rostro', exposure >= 0.33 && exposure <= 0.82 ? 'ok' : exposure >= 0.22 && exposure <= 0.9 ? 'review' : 'fail', pct(exposure),
    exposure < 0.33 ? 'El rostro está oscuro.' : exposure > 0.82 ? 'El rostro está sobreexpuesto.' : 'La exposición es adecuada.', 'Use luz frontal, uniforme y natural.', exposure >= 0.33 && exposure <= 0.82 ? '' : 'Ajustar brillo o tomar otra foto'));
  out.push(check('glare', 'Reflejos / brillos', an.faceStats.clip <= 0.02 ? 'ok' : an.faceStats.clip <= 0.06 ? 'review' : 'fail', pct(an.faceStats.clip),
    an.faceStats.clip <= 0.02 ? 'Sin zonas quemadas relevantes.' : 'Hay zonas muy brillantes (flash o reflejo).', 'Evite el flash directo.', an.faceStats.clip <= 0.02 ? '' : 'Tomar otra foto'));
  out.push(check('shadow', 'Sombras en el rostro', an.shadowDiff <= 0.22 ? 'ok' : an.shadowDiff <= 0.38 ? 'review' : 'fail', pct(an.shadowDiff),
    an.shadowDiff <= 0.22 ? 'La iluminación es pareja.' : 'Un lado del rostro está notablemente más oscuro.', 'Ilumine de frente o junto a una ventana de frente.', an.shadowDiff <= 0.22 ? '' : 'Tomar otra foto'));

  // 8. Resolución
  // mínimo útil: la salida digital o una impresión a 300 DPI, lo que sea menor
  const needOut = Math.min(P.digital.heightPx, Math.round(P.print.heightIn * 300));
  const effPx = geo.srcPerHeight; // píxeles originales disponibles para la salida digital
  const ratio = effPx / needOut;
  out.push(check('res', 'Resolución', ratio >= 1 ? 'ok' : ratio >= 0.7 ? 'review' : 'fail', `${Math.round(an.headPxOriginal)} px de cabeza`,
    ratio >= 1 ? 'Resolución suficiente para la salida digital.' : `La salida de ${needOut}px requiere ampliar la foto original (${Math.round(effPx)} px reales).`,
    'Use una foto de mayor resolución o tómela más cerca.', ratio >= 1 ? '' : 'Subir foto de mayor calidad'));

  // 9. Encuadre y hombros
  if (!geo.covered && !geo.removeBg) out.push(check('cover', 'Cobertura del encuadre', 'fail', 'zonas vacías', 'La foto original no cubre todo el encuadre.', 'Reduzca el zoom o active el reemplazo de fondo.', 'Ajustar zoom'));
  out.push(check('shoulders', 'Hombros visibles', geo.shouldersFrac >= 0.45 ? 'ok' : geo.shouldersFrac >= 0.2 ? 'review' : 'fail', pct(geo.shouldersFrac),
    geo.shouldersFrac >= 0.45 ? 'Se ven los hombros en la parte inferior.' : 'No se aprecian bien los hombros (foto original muy cerrada).', 'Tome la foto incluyendo la parte superior del torso.', geo.shouldersFrac >= 0.45 ? '' : 'Tomar otra foto'));

  // 10. Fondo
  if (geo.removeBg) {
    const allowed = P.background.allowed.some((b) => b.hex.toLowerCase() === (opts.bg || '').toLowerCase());
    out.push(check('bg', 'Color de fondo', allowed ? 'ok' : 'fail', opts.bg, allowed ? `Permitido: ${P.background.label}.` : 'Color no permitido por este documento.', '', allowed ? '' : 'Elegir fondo permitido', P.background.verified));
    out.push(check('edited', 'Edición digital', 'review', 'fondo sustituido', P.rules.editing, 'Si su foto original ya tiene fondo blanco liso, puede desactivar el reemplazo de fondo.', 'Revisar manualmente'));
  } else {
    const okBg = an.bgMean >= 0.8 && an.bgStd <= 0.08;
    out.push(check('bg', 'Fondo original', okBg ? 'ok' : 'fail', `luz ${pct(an.bgMean)} · var ${an.bgStd.toFixed(2)}`, okBg ? 'El fondo original es claro y uniforme.' : 'El fondo original no es blanco liso.', 'Active el reemplazo de fondo.', okBg ? '' : 'Activar reemplazo de fondo'));
  }

  return summarize(out);
}

export const MANUAL_CHECKS = [
  { id: 'glasses', label: 'La persona no usa lentes (o tiene nota médica)' },
  { id: 'hat', label: 'Sin gorra, sombrero ni accesorios que cubran la cabeza (salvo motivo religioso o médico)' },
  { id: 'recent', label: 'La foto fue tomada en los últimos 6 meses' },
  { id: 'expression', label: 'Expresión neutral y ojos visibles (sin cabello sobre los ojos)' },
  { id: 'nofilter', label: 'La foto no tiene filtros de belleza ni retoques' },
];

function summarize(items) {
  const worst = items.reduce((w, i) => (rank[i.status] > rank[w] ? i.status : w), 'ok');
  return { items, overall: worst };
}

export function overallWithManual(result, manual) {
  const allManual = MANUAL_CHECKS.every((m) => manual[m.id]);
  if (result.overall === 'fail') return 'fail';
  if (result.overall === 'review' || !allManual) return 'review';
  return 'ok';
}
