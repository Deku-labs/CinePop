// Tiny http GET helper that doesn't trip on HTTP/1.0 connection: close.
const http = require('http');
function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, text: body });
      });
    });
    req.on('error', reject);
  });
}
module.exports = { get };
