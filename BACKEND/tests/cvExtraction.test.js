const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractCv } = require('../services/cvExtraction');
const content = 'Experienced software engineer developing accessible applications and reliable automated tests. '.repeat(3);

test('extracts UTF-8 text and rejects binary, short and oversized text', async () => {
  assert.equal((await extractCv(Buffer.from(content), 'cv.txt')).text, content.trim());
  for (const value of [Buffer.from('short'), Buffer.from('a'.repeat(40001)), Buffer.from([0xff, 0x00])]) {
    await assert.rejects(extractCv(value, 'cv.txt'), { status: 422 });
  }
});

test('rejects renamed files and legacy DOC extraction', async () => {
  await assert.rejects(extractCv(Buffer.from(content), 'cv.pdf'), { status: 422 });
  await assert.rejects(extractCv(Buffer.from(content), 'cv.docx'), { status: 422 });
  await assert.rejects(extractCv(Buffer.from(content), 'cv.doc'), { status: 415 });
});

test('extracts actual DOCX and rejects ZIPs without Word document', async () => {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`);
  assert.equal((await extractCv(await zip.generateAsync({ type: 'nodebuffer' }), 'cv.docx')).text, content.trim());
  zip.remove('word/document.xml');
  await assert.rejects(extractCv(await zip.generateAsync({ type: 'nodebuffer' }), 'cv.docx'), { status: 422 });
});

test('extracts actual PDF text', async () => {
  const stream = `BT /F1 12 Tf 40 700 Td (${content}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const result = await extractCv(Buffer.from(pdf), 'cv.pdf');
  assert.match(result.text, /Experienced software engineer/);
  assert.equal(result.pages, 1);
});
