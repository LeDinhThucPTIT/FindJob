const path = require('node:path');
const { fork } = require('node:child_process');
let active = 0;

function extractCv(buffer, filename) {
  const extension = path.extname(filename).toLowerCase();
  if (!['.pdf', '.docx', '.txt'].includes(extension)) {
    return Promise.reject(Object.assign(new Error('Chỉ đọc PDF, DOCX hoặc TXT. Với DOC, hãy lưu lại thành DOCX/PDF.'), { status: 415 }));
  }
  if (active >= 2) return Promise.reject(Object.assign(new Error('Hệ thống đang đọc CV khác. Vui lòng thử lại sau.'), { status: 429 }));
  active++;
  return new Promise((resolve, reject) => {
    let worker;
    let timer;
    let finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      active--;
      clearTimeout(timer);
      worker?.kill();
      error ? reject(error) : resolve(value);
    };
    try {
      worker = fork(path.join(__dirname, 'cvExtractionWorker.js'), [], {
        serialization: 'advanced',
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: ['--max-old-space-size=128'],
      });
      timer = setTimeout(() => finish(Object.assign(new Error('Đọc file quá thời gian. Hãy dùng file nhỏ hơn hoặc dán văn bản.'), { status: 422 })), 20000);
      worker.once('message', (result) => result.error
        ? finish(Object.assign(new Error(result.error), { status: 422 }))
        : finish(null, result));
      worker.once('error', () => finish(Object.assign(new Error('Không thể đọc file này. Hãy xuất lại PDF/DOCX hoặc dán văn bản.'), { status: 422 })));
      worker.once('exit', () => { if (!finished) finish(Object.assign(new Error('Không thể đọc file này.'), { status: 422 })); });
      worker.send({ buffer, extension });
    } catch (error) { finish(error); }
  });
}
module.exports = { extractCv };
