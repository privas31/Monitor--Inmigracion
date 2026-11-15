// Mediciones faciales y métricas de calidad sobre la imagen ORIGINAL (canvas de procesamiento).
// Nada de lo que hay aquí modifica la imagen.

const L = {
  irisL: 468, irisR: 473,
  eyeLOut: 33, eyeLIn: 133, eyeLTop: 159, eyeLBot: 145,
  eyeROut: 263, eyeRIn: 362, eyeRTop: 386, eyeRBot: 374,
  chin: 152, forehead: 10, nose: 1, cheekL: 234, cheekR: 454,
  mouthTop: 13, mouthBot: 14, mouthL: 61, mouthR: 291,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function luminanceMap(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const lum = new Float32Array(canvas.width * canvas.height);
  for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
  return lum;
}

/** Busca la parte superior de la cabeza (incluido cabello) usando la máscara de persona. */
function findCrown(mask, W, H, face) {
  const fw = face.right - face.left;
  const x0 = Math.max(0, Math.round(face.cx - fw * 0.3));
  const x1 = Math.min(W - 1, Math.round(face.cx + fw * 0.3));
  const yLimit = Math.round(face.forehead.y);
  const tops = [];
  for (let x = x0; x <= x1; x += 2) {
    // desde la frente hacia arriba: último píxel continuo de persona
    let y = yLimit;
    while (y > 0 && mask[(y - 1) * W + x] > 0.5) y--;
    tops.push(y);
  }
  tops.sort((a, b) => a - b);
  const crownY = tops[Math.floor(tops.length * 0.15)] ?? yLimit;
  const touchesTop = crownY <= 1;
  const faceH = face.chin.y - face.forehead.y;
  // Si la máscara no encontró cabello razonable, se estima (y se marca como estimado)
  const plausible = face.forehead.y - crownY > faceH * 0.05 && face.forehead.y - crownY < faceH * 0.9;
  if (!plausible) return { y: face.forehead.y - faceH * 0.28, estimated: true, touchesTop };
  return { y: crownY, estimated: false, touchesTop };
}

function laplacianVariance(lum, W, box) {
  let sum = 0, sum2 = 0, n = 0;
  const step = Math.max(1, Math.round((box.x1 - box.x0) / 300));
  for (let y = box.y0 + step; y < box.y1 - step; y += step) {
    for (let x = box.x0 + step; x < box.x1 - step; x += step) {
      const c = lum[y * W + x];
      const v = (lum[(y - step) * W + x] + lum[(y + step) * W + x] + lum[y * W + x - step] + lum[y * W + x + step] - 4 * c) * 255;
      sum += v; sum2 += v * v; n++;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sum2 / n - m * m;
}

function regionStats(lum, W, box) {
  let s = 0, n = 0, clip = 0, dark = 0;
  for (let y = box.y0; y < box.y1; y += 2) for (let x = box.x0; x < box.x1; x += 2) {
    const v = lum[y * W + x]; s += v; n++; if (v > 0.97) clip++; if (v < 0.06) dark++;
  }
  return { mean: n ? s / n : 0, clip: n ? clip / n : 0, dark: n ? dark / n : 0 };
}

export function analyze(det) {
  const { W, H, faces, mask, canvas } = det;
  const res = { faceCount: faces.length, ok: faces.length > 0 };
  if (!faces.length) return res;

  // Si hay varias caras se usa la más grande y se reporta
  const sized = faces.map((lm) => ({ lm, h: dist(lm[L.forehead], lm[L.chin]) })).sort((a, b) => b.h - a.h);
  const lm = sized[0].lm;
  res.otherFacesLarge = sized.slice(1).some((f) => f.h > sized[0].h * 0.35);

  const xs = lm.map((p) => p.x), ys = lm.map((p) => p.y);
  const face = {
    left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys),
    chin: lm[L.chin], forehead: lm[L.forehead], nose: lm[L.nose],
  };
  face.cx = (face.left + face.right) / 2;

  const eyeL = lm[L.irisL] || mid(lm[L.eyeLOut], lm[L.eyeLIn]);
  const eyeR = lm[L.irisR] || mid(lm[L.eyeROut], lm[L.eyeRIn]);
  const eyeMid = mid(eyeL, eyeR);
  const roll = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x); // radianes; la imagen no está espejada
  // eyeL es el ojo que aparece a la IZQUIERDA o DERECHA según MediaPipe; normalizamos
  const rollNorm = Math.abs(roll) > Math.PI / 2 ? roll - Math.sign(roll) * Math.PI : roll;

  const crown = findCrown(mask, W, H, face);
  // Punto de coronilla sobre el eje de la cabeza (perpendicular a la línea de ojos)
  const dUp = (eyeMid.y - crown.y) / Math.cos(rollNorm);
  const crownPt = { x: eyeMid.x + Math.sin(rollNorm) * dUp, y: crown.y };
  const ax = { x: Math.sin(rollNorm), y: -Math.cos(rollNorm) }; // vector "arriba" de la cabeza
  const proj = (p) => (p.x - eyeMid.x) * ax.x + (p.y - eyeMid.y) * ax.y;
  const eyeToCrown = proj(crownPt);           // > 0
  const eyeToChin = -proj(face.chin);         // > 0

  // Giro lateral (yaw): posición de la nariz entre ambas mejillas
  const cl = lm[L.cheekL], cr = lm[L.cheekR];
  const yawRatio = (face.nose.x - Math.min(cl.x, cr.x)) / Math.abs(cr.x - cl.x);

  // Apertura de ojos y boca
  const earL = dist(lm[L.eyeLTop], lm[L.eyeLBot]) / dist(lm[L.eyeLOut], lm[L.eyeLIn]);
  const earR = dist(lm[L.eyeRTop], lm[L.eyeRBot]) / dist(lm[L.eyeROut], lm[L.eyeRIn]);
  const mouthOpen = dist(lm[L.mouthTop], lm[L.mouthBot]) / dist(lm[L.mouthL], lm[L.mouthR]);

  // Calidad de imagen en la zona del rostro
  const lum = luminanceMap(canvas);
  const box = {
    x0: Math.max(0, Math.round(face.left)), x1: Math.min(W, Math.round(face.right)),
    y0: Math.max(0, Math.round(face.forehead.y)), y1: Math.min(H, Math.round(face.chin.y)),
  };
  const faceStats = regionStats(lum, W, box);
  // Nitidez normalizada por exposición: una foto oscura no debe parecer borrosa
  const norm = Math.min(4, 0.55 / Math.max(0.05, faceStats.mean));
  const sharp = laplacianVariance(lum, W, box) * norm * norm;
  const midX = Math.round(face.cx);
  const leftStats = regionStats(lum, W, { ...box, x1: midX });
  const rightStats = regionStats(lum, W, { ...box, x0: midX });
  const shadowDiff = Math.abs(leftStats.mean - rightStats.mean) / Math.max(0.05, Math.max(leftStats.mean, rightStats.mean));

  // Fondo original (píxeles con baja probabilidad de persona)
  let bs = 0, bs2 = 0, bn = 0;
  for (let i = 0; i < mask.length; i += 7) if (mask[i] < 0.15) { bs += lum[i]; bs2 += lum[i] * lum[i]; bn++; }
  const bgMean = bn ? bs / bn : 0;
  const bgStd = bn ? Math.sqrt(Math.max(0, bs2 / bn - bgMean * bgMean)) : 0;

  // Resolución: altura de cabeza en píxeles de la imagen ORIGINAL
  const headPxOriginal = (eyeToCrown + eyeToChin) / det.scale;

  Object.assign(res, {
    lm, face, eyeL, eyeR, eyeMid, roll: rollNorm, crown, crownPt, eyeToCrown, eyeToChin, headAxis: eyeToCrown + eyeToChin, chin: face.chin,
    yawRatio, earL, earR, mouthOpen, sharp, faceStats, shadowDiff, bgMean, bgStd, bgFraction: bn * 7 / mask.length,
    headPxOriginal, chinTouchesBottom: face.chin.y > H - 3,
  });
  return res;
}

export const LANDMARKS = L;
