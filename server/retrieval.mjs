import { tokens } from './text.mjs';
import { isExpired } from './corpus.mjs';

// Lexical retrieval (BM25) over the allowlisted corpus, filtered by domain and jurisdiction.
// Retrieval never fetches the open web at request time: the corpus is curated and provenance-checked.
export function retrieve(corpus, { query, domain, jurisdiction = 'CA', k = 4, minScore = 1.0, today } = {}) {
  // IDF and length statistics come from the whole corpus so small per-domain pools still rank sensibly.
  const all = corpus.records.map(r => ({ r, d: tokens(`${r.title} ${r.passage} ${(r.keywords ?? []).join(' ')}`) }));
  const avg = all.reduce((a, x) => a + x.d.length, 0) / all.length;
  const df = new Map();
  for (const { d } of all) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = all.length;
  const scoped = all.filter(({ r }) => (!domain || r.domain === domain) && r.jurisdiction === jurisdiction);
  if (!scoped.length) return [];
  const pool = scoped.map(x => x.r), docs = scoped.map(x => x.d);
  const q = [...new Set(tokens(query))];
  const K1 = 1.2, B = 0.75;
  return pool
    .map((r, i) => {
      const d = docs[i];
      let score = 0;
      for (const t of q) {
        const tf = d.filter(x => x === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
        score += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * d.length / avg));
      }
      return { record: r, score, expired: isExpired(r, today) };
    })
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Evidence handed to a model is wrapped and labeled as untrusted data.
export function formatEvidenceForModel(hits) {
  return hits.map(({ record: r, expired }) =>
    `<evidence id="${r.id}" status="${r.status}" jurisdiction="${r.jurisdiction}" effective="${r.effectiveDate ?? 'unknown'}"${expired ? ' expired="true"' : ''}>\n` +
    `<title>${r.title}</title>\n<passage>${r.passage.replace(/</g, '&lt;')}</passage>\n</evidence>`).join('\n');
}
