// Encuadre automático y renderizado.
// Solo transformaciones geométricas globales (escala, rotación, traslación), sustitución de fondo
// y brillo/contraste globales. NUNCA se deforma ni se retoca el rostro.

const TOP_MARGIN = 0.04; // margen mínimo sobre la cabeza (fracción de la altura)

/** Calcula el encuadre automático en coordenadas normalizadas del lienzo de salida (0..1). */
export function autoFrame(an, profile) {
  const head = profile.head, eyes = profile.eyes;
  const aspect = profile.print.widthIn / profile.print.heightIn; // ancho/alto
  let h = (head.minFrac + head.maxFrac) / 2; // fracción objetivo de la altura de cabeza
  const headPx = an.headAxis;
  const eyeToCrown = an.eyeToCrown;
  // eyeToCrown en fracción de la salida
  let eTarget = (eyes.minFrac + eyes.maxFrac) / 2; // altura de ojos desde abajo
  let crownTop = 1 - eTarget - (eyeToCrown / headPx) * h; // posición de la coronilla desde arriba
  if (crownTop < TOP_MARGIN) {
    // bajar ojos hasta el mínimo permitido
    eTarget = Math.max(eyes.minFrac, eTarget - (TOP_MARGIN - crownTop));
    crownTop = 1 - eTarget - (eyeToCrown / headPx) * h;
    if (crownTop < TOP_MARGIN) h = Math.max(head.minFrac, h * (1 - eTarget - TOP_MARGIN) / ((eyeToCrown / headPx) * h));
  }
  return {
    scale: h / headPx,            // fracción-de-altura por píxel de origen
    rotation: -an.roll,           // radianes, corrige la inclinación
    eyeX: 0.5, eyeY: 1 - eTarget, // posición del punto medio de los ojos en la salida (fracciones)
    aspect,
  };
}

export function defaultAdjust() {
  return { zoom: 1, dx: 0, dy: 0, rotDeg: 0, brightness: 1, contrast: 1, bg: '#FFFFFF', removeBg: true };
}

/** Corrección moderada de exposición: solo brillo global, limitado a ±15%. */
export function autoExposure(an) {
  const target = 0.6;
  const m = an.faceStats.mean || target;
  return Math.min(1.15, Math.max(0.87, 1 + (target - m) * 0.6));
}

/** Matriz que lleva un punto del canvas de procesamiento al lienzo de salida (outW x outH px). */
export function makeMatrix(an, frame, adj, outW, outH) {
  const s = frame.scale * adj.zoom * outH;
  const th = frame.rotation + (adj.rotDeg * Math.PI) / 180;
  const c = Math.cos(th) * s, si = Math.sin(th) * s;
  const tx = (frame.eyeX + adj.dx) * outW, ty = (frame.eyeY + adj.dy) * outH;
  const ex = an.eyeMid.x, ey = an.eyeMid.y;
  // p' = R*S*(p - eye) + t
  return { a: c, b: si, c: -si, d: c, e: tx - (c * ex - si * ey), f: ty - (si * ex + c * ey), s, th };
}

export const apply = (M, p) => ({ x: M.a * p.x + M.c * p.y + M.e, y: M.b * p.x + M.d * p.y + M.f });

/** Máscara refinada como canvas RGBA (alfa = persona). Se calcula una vez por foto. */
export function buildMaskCanvas(det) {
  const { W, H } = det;
  const mask = det.refined || det.mask;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < mask.length; i++) {
    img.data[i * 4 + 3] = Math.round(mask[i] * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Renderiza la foto final en un canvas outW x outH. */
export function render(ctxOut, det, an, frame, adj, maskCanvas, outW, outH) {
  const M = makeMatrix(an, frame, adj, outW, outH);
  ctxOut.save();
  ctxOut.setTransform(1, 0, 0, 1, 0, 0);
  ctxOut.fillStyle = adj.bg;
  ctxOut.fillRect(0, 0, outW, outH);

  const layer = document.createElement('canvas');
  layer.width = outW; layer.height = outH;
  const lc = layer.getContext('2d');
  lc.imageSmoothingQuality = 'high';
  lc.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  lc.filter = `brightness(${adj.brightness}) contrast(${adj.contrast})`;
  // Se dibuja la imagen ORIGINAL a resolución completa (o su capa recortada con bordes limpios)
  if (adj.removeBg && det.fg) {
    lc.drawImage(det.fg, 0, 0, det.W, det.H);
    lc.filter = 'none';
  } else {
    lc.drawImage(det.sourceImage, 0, 0, det.W, det.H);
    lc.filter = 'none';
    if (adj.removeBg) {
      lc.globalCompositeOperation = 'destination-in';
      lc.drawImage(maskCanvas, 0, 0, det.W, det.H);
    }
  }
  ctxOut.drawImage(layer, 0, 0);
  ctxOut.restore();
  return M;
}

/** Geometría resultante en el lienzo (fracciones 0..1) para el validador y las guías. */
export function outputGeometry(det, an, M, outW, outH, maskCanvas, adj) {
  const crown = apply(M, an.crownPt);
  const chin = apply(M, an.chin);
  const eye = apply(M, an.eyeMid);
  // Cobertura de la imagen original sobre el lienzo (para detectar zonas vacías)
  const inv = invert(M);
  const corners = [[0, 0], [outW, 0], [0, outH], [outW, outH]].map(([x, y]) => apply(inv, { x, y }));
  const covered = corners.every((p) => p.x >= -1 && p.y >= -1 && p.x <= det.W + 1 && p.y <= det.H + 1);
  // Hombros: fracción de la fila inferior ocupada por la persona
  let shoulders = 0;
  const yb = outH * 0.97;
  for (let i = 0; i <= 40; i++) {
    const p = apply(inv, { x: (outW * i) / 40, y: yb });
    const xi = Math.round(p.x), yi = Math.round(p.y);
    if (xi >= 0 && yi >= 0 && xi < det.W && yi < det.H && det.mask[yi * det.W + xi] > 0.5) shoulders++;
  }
  // píxeles de origen (resolución original) por píxel de salida
  const srcPerHeight = outH / (M.s * det.scale); // píxeles originales que abarcan la altura del lienzo
  return {
    headFrac: (chin.y - crown.y) / outH,
    eyeFrac: 1 - eye.y / outH,
    crownTop: crown.y / outH,
    chinBottom: chin.y / outH,
    centerOffset: eye.x / outW - 0.5,
    residualRollDeg: ((an.roll + M.th) * 180) / Math.PI,
    covered, shouldersFrac: shoulders / 41, srcPerHeight,
    eyePt: eye, crownPt: crown, chinPt: chin, removeBg: adj.removeBg,
  };
}

function invert(M) {
  const det = M.a * M.d - M.b * M.c;
  const a = M.d / det, b = -M.b / det, c = -M.c / det, d = M.a / det;
  return { a, b, c, d, e: -(a * M.e + c * M.f), f: -(b * M.e + d * M.f) };
}
