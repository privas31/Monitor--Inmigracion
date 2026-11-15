// Refinamiento de la máscara de persona con un filtro guiado (He et al., 2010)
// usando la propia foto como guía: los bordes de la máscara se ajustan a los bordes reales
// del cabello y los hombros, eliminando halos y escalones. No modifica la imagen.

function boxFilter(src, W, H, r) {
  // suma acumulada por filas y columnas (O(N))
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0; const row = y * W;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc;
      acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  const n = (2 * r + 1) * (2 * r + 1);
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / n;
      acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/** Filtro guiado con guía en escala de grises. */
export function guidedFilter(I, p, W, H, r, eps) {
  const N = W * H;
  const Ip = new Float32Array(N), II = new Float32Array(N);
  for (let i = 0; i < N; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = boxFilter(I, W, H, r), mp = boxFilter(p, W, H, r);
  const mIp = boxFilter(Ip, W, H, r), mII = boxFilter(II, W, H, r);
  const a = new Float32Array(N), b = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i];
    a[i] = cov / (v + eps); b[i] = mp[i] - a[i] * mI[i];
  }
  const ma = boxFilter(a, W, H, r), mb = boxFilter(b, W, H, r);
  const q = new Float32Array(N);
  for (let i = 0; i < N; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

/**
 * Máscara final [0..1]:
 * 1) se suaviza la máscara del modelo,
 * 2) se refina con el filtro guiado en dos escalas (grande para la forma, fina para el cabello),
 * 3) se estrecha la transición para evitar halo del fondo original.
 */
export function refineMask(det) {
  const { W, H, mask, canvas } = det;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const I = new Float32Array(W * H);
  for (let i = 0, j = 0; j < I.length; i += 4, j++) I[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  const base = Math.max(W, H);
  const p0 = new Float32Array(W * H);
  for (let i = 0; i < p0.length; i++) p0[i] = mask[i] > 0.5 ? 1 : mask[i] * 0.6;
  const q1 = guidedFilter(I, p0, W, H, Math.max(4, Math.round(base / 90)), 1e-3);
  const q2 = guidedFilter(I, q1, W, H, Math.max(2, Math.round(base / 320)), 2e-4);
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) {
    let t = (q2[i] - 0.42) / 0.3; t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[i] = t * t * (3 - 2 * t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Limpieza de bordes: elimina halos y sombras del fondo original.
// 1) Estima el color del fondo detrás de cada píxel (promedio de fondo cercano).
// 2) En la franja del borde, baja la opacidad de los píxeles que se parecen al fondo
//    o a su sombra (mismo tono pero más oscuro).
// 3) Descontaminación de color: F = (I - (1 - a) * B) / a, para que el borde no
//    conserve el color de la pared anterior.
// Solo afecta la franja del contorno; el interior del rostro no se toca.

const smooth = (e0, e1, x) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export function cleanEdges(det, alpha) {
  const { W, H, canvas } = det;
  const N = W * H;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const R = new Float32Array(N), G = new Float32Array(N), Bc = new Float32Array(N), w = new Float32Array(N);
  for (let i = 0, j = 0; j < N; i += 4, j++) {
    const bg = alpha[j] < 0.04 ? 1 : 0;
    w[j] = bg; R[j] = d[i] * bg; G[j] = d[i + 1] * bg; Bc[j] = d[i + 2] * bg;
  }
  // Fondo estimado (promedio normalizado en dos escalas para rellenar detrás de la persona)
  const base = Math.max(W, H);
  const est = (r) => {
    const mw = boxFilter(w, W, H, r), mr = boxFilter(R, W, H, r), mg = boxFilter(G, W, H, r), mb = boxFilter(Bc, W, H, r);
    return { mw, mr, mg, mb };
  };
  const s1 = est(Math.round(base / 40)), s2 = est(Math.round(base / 8));
  const bgR = new Float32Array(N), bgG = new Float32Array(N), bgB = new Float32Array(N);
  for (let j = 0; j < N; j++) {
    const use1 = s1.mw[j] > 0.02;
    const s = use1 ? s1 : s2;
    const k = s.mw[j] > 1e-4 ? 1 / s.mw[j] : 0;
    bgR[j] = s.mr[j] * k; bgG[j] = s.mg[j] * k; bgB[j] = s.mb[j] * k;
  }
  // Franja del borde: todo lo que no es "núcleo" (máscara erosionada)
  const solid = new Float32Array(N);
  for (let j = 0; j < N; j++) solid[j] = alpha[j] > 0.5 ? 1 : 0;
  const core = boxFilter(solid, W, H, Math.max(3, Math.round(base / 40)));
  const out = new Float32Array(N);
  for (let j = 0, i = 0; j < N; j++, i += 4) {
    let a = alpha[j];
    if (a > 0 && core[j] < 0.995) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const br = bgR[j], bgg = bgG[j], bb = bgB[j];
      const sI = r + g + b + 1, sB = br + bgg + bb + 1;
      const chroma = Math.abs(r / sI - br / sB) + Math.abs(g / sI - bgg / sB) + Math.abs(b / sI - bb / sB);
      const lumRatio = sI / sB;
      const colorDist = (Math.abs(r - br) + Math.abs(g - bgg) + Math.abs(b - bb)) / 765;
      // parecido al fondo (mismo color) o a su sombra (mismo tono, 35–100% de luz)
      const likeBg = 1 - smooth(0.035, 0.09, colorDist);
      const likeShadow = (1 - smooth(0.02, 0.045, chroma)) * smooth(0.3, 0.45, lumRatio) * (1 - smooth(1.02, 1.1, lumRatio));
      const bgness = Math.max(likeBg, likeShadow);
      const edge = 1 - smooth(0.6, 0.995, core[j]); // más fuerte hacia el exterior
      a *= 1 - bgness * edge;
    }
    out[j] = a;
  }
  // Suavizado final con la foto como guía: bordes continuos, sin escalones ni puntos
  const I = new Float32Array(N);
  for (let j = 0, i = 0; j < N; j++, i += 4) I[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  const sm = guidedFilter(I, out, W, H, Math.max(2, Math.round(base / 400)), 4e-3);
  for (let j = 0; j < N; j++) {
    if (core[j] >= 0.995) continue; // el interior no se toca
    let v = Math.min(sm[j], alpha[j]); // nunca agrega opacidad nueva
    v = v < 0.06 ? 0 : v > 0.97 ? 1 : v;
    out[j] = v;
  }
  return { alpha: out, bgR, bgG, bgB };
}

/**
 * Construye la capa de persona a alta resolución (lado mayor ≤ 2400 px) con alfa y colores
 * de borde descontaminados. Se dibuja directamente sobre el color de fondo nuevo.
 */
export function buildForeground(det, alpha, bgR, bgG, bgB) {
  const src = det.sourceImage;
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const k = Math.min(1, 2400 / Math.max(sw, sh));
  const FW = Math.round(sw * k), FH = Math.round(sh * k);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // alfa y fondo estimado a resolución de procesamiento → canvas → escalado suave
  const small = mk(det.W, det.H), sctx = small.getContext('2d');
  const id = sctx.createImageData(det.W, det.H);
  const small2 = mk(det.W, det.H), s2 = small2.getContext('2d');
  const id2 = s2.createImageData(det.W, det.H);
  for (let j = 0, i = 0; j < alpha.length; j++, i += 4) {
    const v = Math.round(alpha[j] * 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    id2.data[i] = bgR[j]; id2.data[i + 1] = bgG[j]; id2.data[i + 2] = bgB[j]; id2.data[i + 3] = 255;
  }
  sctx.putImageData(id, 0, 0); s2.putImageData(id2, 0, 0);
  const big = mk(FW, FH), bctx = big.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, FW, FH); const A = bctx.getImageData(0, 0, FW, FH).data;
  bctx.drawImage(small2, 0, 0, FW, FH); const Bk = bctx.getImageData(0, 0, FW, FH).data;
  bctx.drawImage(src, 0, 0, FW, FH);
  const img = bctx.getImageData(0, 0, FW, FH); const I = img.data;
  for (let i = 0; i < I.length; i += 4) {
    const a = A[i] / 255;
    if (a <= 0.004) { I[i + 3] = 0; continue; }
    if (a < 0.98) {
      const ae = Math.max(a, 0.35), ia = 1 / ae, na = 1 - ae;
      for (let c = 0; c < 3; c++) {
        const f = Math.min(255, Math.max(0, (I[i + c] - na * Bk[i + c]) * ia));
        I[i + c] = I[i + c] * 0.2 + f * 0.8;
      }
    }
    I[i + 3] = Math.round(a * 255);
  }
  bctx.putImageData(img, 0, 0);
  return big;
}
