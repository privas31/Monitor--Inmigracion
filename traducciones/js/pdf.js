// PDF de la traducción certificada (carta, 8.5 x 11 in).
/* global jspdf */

export function certText(kind, t, docEn, person) {
  const who = person ? ` of ${person}` : '';
  if (kind === 'eoir') {
    return `I, ${t.name}, certify that I am competent to translate from Spanish into English, and that the foregoing translation of the attached ${docEn}${who} is true and accurate to the best of my abilities.`;
  }
  return `I, ${t.name}, certify that I am fluent in the English and Spanish languages, that I am competent to translate from Spanish into English, and that the foregoing is a complete and accurate translation of the attached ${docEn}${who}.`;
}

/**
 * rows: [{ sec, en (etiqueta en inglés), value }]  ·  originals: [canvas] para anexar copia del acta.
 */
export function buildPdf({ title, subtitle, rows, cert, translator, dateStr, originals = [], kindLabel }) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612, H = 792, M = 54;
  let y = M;
  const newPage = () => { doc.addPage(); y = M; };
  const ensure = (h) => { if (y + h > H - M - 20) newPage(); };

  doc.setFont('times', 'bold'); doc.setFontSize(15);
  doc.text('CERTIFIED ENGLISH TRANSLATION', W / 2, y, { align: 'center' }); y += 18;
  doc.setFont('times', 'normal'); doc.setFontSize(11);
  doc.text(`${title} — ${subtitle}`, W / 2, y, { align: 'center' }); y += 14;
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text('Translated from Spanish into English', W / 2, y, { align: 'center' }); doc.setTextColor(0); y += 22;

  let lastSec = null;
  const labelW = 190;
  for (const r of rows) {
    if (r.sec !== lastSec) {
      ensure(30); y += 6;
      doc.setFont('times', 'bold'); doc.setFontSize(11);
      doc.text(String(r.sec).toUpperCase(), M, y); y += 4;
      doc.setDrawColor(160); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 13;
      lastSec = r.sec;
    }
    doc.setFontSize(10.5);
    const valLines = doc.splitTextToSize(String(r.value), W - M * 2 - labelW);
    const labLines = doc.splitTextToSize(`${r.en}:`, labelW - 10);
    const h = Math.max(valLines.length, labLines.length) * 13 + 3;
    ensure(h);
    doc.setFont('times', 'bold'); doc.text(labLines, M, y);
    doc.setFont('times', 'normal'); doc.text(valLines, M + labelW, y);
    y += h;
  }

  // Certificación
  const certLines = doc.splitTextToSize(cert, W - M * 2 - 24);
  const boxH = 40 + certLines.length * 13 + 92;
  ensure(boxH + 10); y += 14;
  doc.setDrawColor(0); doc.setLineWidth(1); doc.rect(M, y, W - M * 2, boxH);
  let cy = y + 20;
  doc.setFont('times', 'bold'); doc.setFontSize(11.5); doc.text(`CERTIFICATE OF TRANSLATION${kindLabel ? ` (${kindLabel})` : ''}`, M + 12, cy); cy += 18;
  doc.setFont('times', 'normal'); doc.setFontSize(10.5); doc.text(certLines, M + 12, cy); cy += certLines.length * 13 + 34;
  doc.setLineWidth(0.6); doc.line(M + 12, cy, M + 230, cy); doc.line(M + 300, cy, M + 440, cy);
  doc.setFontSize(9); doc.text('Signature', M + 12, cy + 11); doc.text(`Date: ${dateStr}`, M + 300, cy + 11);
  cy += 26;
  doc.setFontSize(9.5);
  doc.text(`${translator.name}${translator.address ? ' · ' + translator.address : ''}`, M + 12, cy);
  doc.text([translator.phone, translator.email].filter(Boolean).join(' · '), M + 12, cy + 12);
  y += boxH;

  // Copia del original anexada
  for (const [i, c] of originals.entries()) {
    newPage();
    doc.setFont('times', 'bold'); doc.setFontSize(10);
    doc.text(`Copy of original document (Spanish)${originals.length > 1 ? ` — page ${i + 1}` : ''}`, M, y); y += 10;
    const maxW = W - M * 2, maxH = H - M * 2 - 30;
    const k = Math.min(maxW / c.width, maxH / c.height);
    doc.addImage(c.toDataURL('image/jpeg', 0.88), 'JPEG', M, y, c.width * k, c.height * k);
  }

  // Numeración de páginas
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont('times', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110);
    doc.text(`Page ${p} of ${n}`, W / 2, H - 28, { align: 'center' }); doc.setTextColor(0);
  }
  return doc.output('blob');
}
