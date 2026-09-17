// Serves the game and proxies /move to TypeSafe, so the API key stays server-side.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// >>> Your TypeSafe API key goes here, as an environment variable. <<<
//     PowerShell:  $env:TYPESAFE_API_KEY = "your key"
//     bash:        export TYPESAFE_API_KEY="your key"
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) {
  console.error('Missing TYPESAFE_API_KEY. Put your TypeSafe API key in that environment variable and run again.');
  process.exit(1);
}
const PORT = process.env.PORT || 8080;
const FILES = { '/': ['index.html', 'text/html'], '/tetris.js': ['tetris.js', 'text/javascript'] };

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/move') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const r = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body,
      });
      res.writeHead(r.status, { 'Content-Type': 'application/json' });
      res.end(await r.text());
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }
  const f = FILES[req.url];
  if (!f) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': f[1] });
  res.end(await readFile(new URL(f[0], import.meta.url)));
}).listen(PORT, () => console.log(`Agent (JEV) playing Tetris -> http://localhost:${PORT}`));
