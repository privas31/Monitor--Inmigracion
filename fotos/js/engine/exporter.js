// Generación de archivos: JPG digital con control de peso y PDF imprimible a tamaño real.
/* global jspdf */

export const SHEETS = {
  single: { id: 'single', label: 'Foto individual (página del tamaño exacto)', w: null, h: null },
  '4x6': { id: '4x6', label: 'Hoja 4 × 6 in', w: 6, h: 4 },
  letter: { id: 'letter', label: 'Hoja carta (8.5 × 11 in)', w: 8.5, h: 11 },
};

/** Escribe la densidad (DPI) en el encabezado JFIF para que la impresión respete el tamaño físico. */
export async function setJpegDpi(blob, dpi) {
  const b = new Uint8Array(await blob.arrayBuffer());
  // FF D8 FF E0 [len] 'JFIF\0' [ver 2] [units] [Xd 2] [Yd 2]
  if (b[2] === 0xff && b[3] === 0xe0 && b[6] === 0x4a && b[7] === 0x46 && b[8] === 0x49 && b[9] === 0x46) {
    b[13] = 1; b[14] = dpi >> 8; b[15] = dpi & 255; b[16] = dpi >> 8; b[17] = dpi & 255;
  }
  return new Blob([b], { type: 'image/jpeg' });
}

/** Codifica un canvas a JPEG respetando un peso máximo (búsqueda binaria de calidad). */
export async function encodeJpeg(canvas, maxBytes = null, minBytes = null, dpi = null) {
  const enc0 = (q) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  const enc = async (q) => { const b = await enc0(q); return dpi ? setJpegDpi(b, dpi) : b; };
  let blob = await enc(0.95);
  let quality = 0.95;
  if (maxBytes && blob.size > maxBytes) {
    let lo = 0.3, hi = 0.95, best = null;
    for (let i = 0; i < 9; i++) {
      const q = (lo + hi) / 2;
      const b = await enc(q);
      if (b.size <= maxBytes) { best = b; quality = q; lo = q; } else hi = q;
    }
    if (!best) { best = await enc(0.3); quality = 0.3; }
    blob = best;
  }
  return { blob, quality, bytes: blob.size, meetsMax: !maxBytes || blob.size <= maxBytes, meetsMin: !minBytes || blob.size >= minBytes };
}

/** Distribución de fotos en la hoja (pulgadas). Compartida por la vista previa y el PDF. */
export function layout(sheetId, profile, copies) {
  const pw = profile.print.widthIn, ph = profile.print.heightIn;
  if (sheetId === 'single') return { pageW: pw, pageH: ph, slots: [{ x: 0, y: 0 }], max: 1, margin: 0, gap: 0 };
  const s = SHEETS[sheetId];
  const margin = sheetId === 'letter' ? 0.5 : 0.2, gap = 0.2;
  const footer = sheetId === 'letter' ? 1.2 : 0; // espacio para regla de calibración
  const cols = Math.floor((s.w - 2 * margin + gap) / (pw + gap));
  const rows = Math.floor((s.h - 2 * margin - footer + gap) / (ph + gap));
  const max = cols * rows;
  const n = Math.max(1, Math.min(copies || max, max));
  const gridW = cols * pw + (cols - 1) * gap;
  const x0 = (s.w - gridW) / 2, y0 = margin;
  const slots = [];
  for (let i = 0; i < n; i++) slots.push({ x: x0 + (i % cols) * (pw + gap), y: y0 + Math.floor(i / cols) * (ph + gap) });
  return { pageW: s.w, pageH: s.h, slots, max, margin, gap, cols, rows, footer };
}

/** Dibuja la vista previa de impresión en un canvas (escala de pantalla). */
export function drawPreview(canvas, lay, photoCanvas, profile) {
  const ppi = Math.min(560 / lay.pageW, 520 / lay.pageH);
  canvas.width = Math.round(lay.pageW * ppi);
  canvas.height = Math.round(lay.pageH * ppi);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of lay.slots) {
    ctx.drawImage(photoCanvas, s.x * ppi, s.y * ppi, profile.print.widthIn * ppi, profile.print.heightIn * ppi);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.strokeRect(s.x * ppi, s.y * ppi, profile.print.widthIn * ppi, profile.print.heightIn * ppi);
    ctx.setLineDash([]);
  }
  if (lay.footer) {
    ctx.fillStyle = '#0f172a'; ctx.font = `${Math.round(ppi * 0.11)}px system-ui`;
    ctx.fillText('Regla de control: debe medir exactamente 1 pulgada / 25.4 mm', lay.margin * ppi, (lay.pageH - 0.75) * ppi);
    ctx.fillRect(lay.margin * ppi, (lay.pageH - 0.62) * ppi, ppi, 2);
  }
}

/** Genera el PDF con medidas físicas exactas (unidad: pulgadas). */
export function buildPdf(lay, photoCanvasHiRes, profile, meta) {
  const { jsPDF } = jspdf;
  const orientation = lay.pageW > lay.pageH ? 'landscape' : 'portrait';
  const doc = new jsPDF({ unit: 'in', format: [lay.pageW, lay.pageH], orientation, compress: true });
  doc.setProperties({ title: `Foto ${profile.name}`, creator: 'FotoDoc', subject: 'Imprimir al 100% / tamaño real' });
  const data = photoCanvasHiRes.toDataURL('image/jpeg', 0.95);
  const pw = profile.print.widthIn, ph = profile.print.heightIn;
  for (const s of lay.slots) {
    doc.addImage(data, 'JPEG', s.x, s.y, pw, ph, 'photo', 'NONE');
    if (lay.slots.length > 1 || lay.footer) {
      // marcas de corte
      doc.setDrawColor(150); doc.setLineWidth(0.005);
      const t = 0.12;
      [[s.x, s.y], [s.x + pw, s.y], [s.x, s.y + ph], [s.x + pw, s.y + ph]].forEach(([x, y]) => {
        doc.line(x - t, y, x - 0.03, y); doc.line(x + 0.03, y, x + t, y);
        doc.line(x, y - t, x, y - 0.03); doc.line(x, y + 0.03, x, y + t);
      });
    }
  }
  if (lay.footer) {
    const y = lay.pageH - 0.62;
    doc.setFontSize(8); doc.setTextColor(40);
    doc.text('Imprima al 100% ("Tamaño real"). NO use "Ajustar a la página".', lay.margin, lay.pageH - 0.95);
    doc.text('Regla de control: la línea debe medir exactamente 1 pulgada (25.4 mm).', lay.margin, lay.pageH - 0.78);
    doc.setDrawColor(0); doc.setLineWidth(0.02);
    doc.line(lay.margin, y, lay.margin + 1, y);
    doc.line(lay.margin, y - 0.06, lay.margin, y + 0.06); doc.line(lay.margin + 1, y - 0.06, lay.margin + 1, y + 0.06);
    doc.text(`${profile.name} · ${pw} x ${ph} in · ${profile.print.printDpi} DPI · ${meta.date}`, lay.margin, lay.pageH - 0.35);
    doc.text('Evaluación técnica orientativa. La autoridad correspondiente decide la aceptación.', lay.margin, lay.pageH - 0.2);
  }
  return doc.output('blob');
}

let dl = null;
const dlReady = (async () => { try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch { dl = null; } })();

/**
 * Descarga: usa el sistema de descargas de la plataforma si existe; si no, un enlace normal.
 * Devuelve true (descargado), false (cancelado por el usuario) o un texto de error.
 */
export async function download(blob, filename) {
  if (!dl) await Promise.race([dlReady, new Promise((r) => setTimeout(r, 300))]);
  if (dl) {
    try { await dl.save({ filename, data: blob }); return true; }
    catch (e) {
      if (e && e.code === 'declined') return false;
      if (e && e.code === 'rate_limited') return 'Ya hay una descarga pendiente de confirmar; espere un momento.';
      console.warn('descarga', e);
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/** Escribe la resolución física (DPI) en un PNG (fragmento pHYs) para que imprima al tamaño correcto. */
export async function setPngDpi(blob, dpi) {
  const b = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  // CRC32 de tipo + datos
  let c = ~0;
  for (let i = 4; i < 17; i++) { c ^= chunk[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  dv.setUint32(17, ~c >>> 0);
  const ihdrEnd = 8 + 25; // firma (8) + IHDR (4+4+13+4)
  const out = new Uint8Array(b.length + 21);
  out.set(b.subarray(0, ihdrEnd), 0); out.set(chunk, ihdrEnd); out.set(b.subarray(ihdrEnd), ihdrEnd + 21);
  return new Blob([out], { type: 'image/png' });
}

/** Dibuja la hoja completa (o la foto individual) a la resolución indicada, para exportarla como imagen. */
export function sheetCanvas(lay, photoCanvas, profile, dpi) {
  const c = document.createElement('canvas');
  c.width = Math.round(lay.pageW * dpi); c.height = Math.round(lay.pageH * dpi);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  const pw = profile.print.widthIn * dpi, ph = profile.print.heightIn * dpi;
  for (const s of lay.slots) ctx.drawImage(photoCanvas, Math.round(s.x * dpi), Math.round(s.y * dpi), Math.round(pw), Math.round(ph));
  if (lay.slots.length > 1 || lay.footer) {
    ctx.strokeStyle = '#999'; ctx.lineWidth = Math.max(1, dpi / 200);
    const t = 0.12 * dpi, g = 0.03 * dpi;
    for (const s of lay.slots) {
      const x0 = s.x * dpi, y0 = s.y * dpi;
      [[x0, y0], [x0 + pw, y0], [x0, y0 + ph], [x0 + pw, y0 + ph]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.moveTo(x - t, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + t, y);
        ctx.moveTo(x, y - t); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + t);
        ctx.stroke();
      });
    }
  }
  if (lay.footer) {
    ctx.fillStyle = '#222'; ctx.font = `${Math.round(dpi * 0.11)}px sans-serif`;
    ctx.fillText('Imprima al 100% ("Tamaño real"). NO use "Ajustar a la página".', lay.margin * dpi, (lay.pageH - 0.95) * dpi);
    ctx.fillText('Regla de control: la línea debe medir exactamente 1 pulgada (25.4 mm).', lay.margin * dpi, (lay.pageH - 0.78) * dpi);
    ctx.fillRect(lay.margin * dpi, (lay.pageH - 0.62) * dpi, dpi, Math.max(2, dpi / 50));
  }
  return c;
}
