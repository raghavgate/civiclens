import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus } from './corpus.mjs';
import { ask } from './pipeline.mjs';
import { parseAskBody, RequestError } from './privacy.mjs';
import { providerFromEnv } from './providers/index.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'",
};
const MAX_BODY = 4096;

export function createApp({ provider, corpus, log = () => {} }) {
  return createServer(async (req, res) => {
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...SECURITY_HEADERS });
      res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/health') return send(200, { ok: true, provider: provider.name, corpusVersion: corpus.version });
      if (url.pathname === '/api/ask') {
        if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, { error: 'json_required' });
        let size = 0; const chunks = [];
        for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(413, { error: 'body_too_large' }); chunks.push(c); }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'invalid_json' }); }
        const question = parseAskBody(body);
        const result = await ask(question, { provider, corpus });
        // Log only operational metadata: never the question text.
        log({ intent: result.intent, abstained: result.abstained, reason: result.reason, facts: result.facts.length, rejected: result.rejected?.length ?? 0, ms: result.meta.ms });
        return send(200, result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'method_not_allowed' });
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
      const file = join(DIST, rel.endsWith('/') ? rel + 'index.html' : rel);
      if (!file.startsWith(DIST)) return send(403, { error: 'forbidden' });
      try { return send(200, await readFile(file), TYPES[extname(file)] ?? 'application/octet-stream'); }
      catch { return send(404, { error: 'not_found' }); }
    } catch (err) {
      if (err instanceof RequestError) return send(err.status, { error: err.code });
      log({ error: err.message });
      return send(500, { error: 'internal_error' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const provider = providerFromEnv();
  const corpus = loadCorpus();
  const port = Number(process.env.PORT ?? 4173);
  createApp({ provider, corpus, log: e => console.log(JSON.stringify(e)) })
    .listen(port, () => console.log(`CivicLens on http://localhost:${port} (provider: ${provider.name}, corpus: ${corpus.version})`));
}
