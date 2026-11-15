// Detección facial (MediaPipe Face Mesh, 478 puntos con iris) y segmentación de persona
// (MediaPipe Selfie Segmentation). Todo se ejecuta en el navegador: la foto no sale del equipo.
/* global FaceMesh, SelfieSegmentation */

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;
const PROC_MAX = 1280; // lado mayor para procesar

let faceMesh = null;
let segmenter = null;
let ready = null;

function once(model, input) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Tiempo de espera agotado en el modelo')), 30000);
    model.onResults((r) => { clearTimeout(t); resolve(r); });
    model.send({ image: input }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

export function initModels() {
  if (ready) return ready;
  ready = (async () => {
    faceMesh = new FaceMesh({ locateFile: (f) => `${BASE}face_mesh/${f}` });
    faceMesh.setOptions({ maxNumFaces: 3, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    segmenter = new SelfieSegmentation({ locateFile: (f) => `${BASE}selfie_segmentation/${f}` });
    segmenter.setOptions({ modelSelection: 0 });
    await faceMesh.initialize();
    await segmenter.initialize();
  })();
  return ready;
}

/** Copia la imagen a un canvas de procesamiento (máx PROC_MAX px). */
export function toProcCanvas(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const k = Math.min(1, PROC_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, scale: k };
}

/** Lee la máscara devuelta por el modelo y la normaliza a Float32 [0..1] del tamaño del canvas. */
function readMask(maskImage, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(maskImage, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  // Algunas versiones guardan la confianza en alfa y otras en rojo: se detecta cuál varía.
  let aVar = 0, rVar = 0;
  for (let i = 0; i < d.length; i += 4 * 97) { aVar += d[i + 3] < 250 ? 1 : 0; rVar += d[i] > 5 ? 1 : 0; }
  const ch = aVar > rVar ? 3 : 0;
  const m = new Float32Array(w * h);
  for (let i = 0, j = 0; j < m.length; i += 4, j++) m[j] = d[i + ch] / 255;
  return m;
}

/**
 * Ejecuta ambos modelos sobre una imagen.
 * Devuelve landmarks en píxeles del canvas de procesamiento y la máscara de persona.
 */
export async function detect(img) {
  await initModels();
  const { canvas, scale } = toProcCanvas(img);
  faceMesh.reset();
  const fr = await once(faceMesh, canvas);
  const sr = await once(segmenter, canvas);
  const W = canvas.width, H = canvas.height;
  const faces = (fr.multiFaceLandmarks || []).map((lm) => lm.map((p) => ({ x: p.x * W, y: p.y * H, z: p.z * W })));
  const mask = readMask(sr.segmentationMask, W, H);
  return { canvas, scale, W, H, faces, mask };
}
