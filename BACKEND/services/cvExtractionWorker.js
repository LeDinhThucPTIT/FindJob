
// Inspect the archive before decompression; never extract files to disk.
function validateDocx(buffer) {
  return new Promise((resolve, reject) => {
    require('yauzl').fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      let size = 0;
      let count = 0;
      const names = new Set();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        size += entry.uncompressedSize;
        count++;
        if (size > 30 * 1024 * 1024 || count > 500 || entry.isEncrypted() || /vbaProject\.bin$/i.test(entry.fileName)) {
          zip.close();
          return reject(new Error('DOCX quá lớn sau giải nén hoặc chứa nội dung không được hỗ trợ.'));
        }
        names.add(entry.fileName);
        zip.readEntry();
      });
      zip.on('end', () => names.has('[Content_Types].xml') && names.has('word/document.xml')
        ? resolve() : reject(new Error('File không phải tài liệu DOCX hợp lệ.')));
      zip.readEntry();
    });
  });
}

process.once('message', async (workerData) => {
  const buffer = Buffer.from(workerData.buffer);
  try {
  let text;
  let pages;
  if (workerData.extension === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Nội dung file không phải PDF.');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer, isEvalSupported: false });
    try {
      const info = await parser.getInfo();
      if (info.total > 30) throw new Error('Chỉ hỗ trợ PDF tối đa 30 trang.');
      const result = await parser.getText();
      text = result.text;
      pages = info.total;
    } finally { await parser.destroy(); }
  } else if (workerData.extension === '.docx') {
    await validateDocx(buffer);
    text = (await require('mammoth').extractRawText({ buffer })).value;
  } else {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error('TXT phải là văn bản UTF-8 hợp lệ.');
  }
  text = text.replace(/\r\n?/g, '\n').trim();
  if (text.length < 100) throw new Error('Không đọc được đủ văn bản. PDF ảnh scan cần OCR; hãy dán nội dung CV (ít nhất 100 ký tự).');
  if (text.length > 40000) throw new Error('CV vượt quá 40.000 ký tự. Hãy rút gọn hoặc dán phần cần chấm.');
  process.send({ text, pages, characters: text.length });
  } catch (error) {
    process.send({ error: error.message.startsWith('Cannot') || /password|encrypt/i.test(error.message)
      ? 'File bị khóa hoặc không đọc được. Hãy xuất lại PDF/DOCX không có mật khẩu.' : error.message });
  }
});
