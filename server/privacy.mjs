// Privacy contract: the server accepts a question string and nothing else. Personal details and amounts
// are redacted before any text reaches a model provider. Financial inputs never leave the browser.
export const MAX_QUESTION_CHARS = 500;

const RULES = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[id-number]'],
  [/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone]'],
  [/\b\d{1,6}\s+(?:[A-Z][a-z]+\s){1,3}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)\b\.?/g, '[address]'],
  [/\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|K|m|M|thousand|million)?\b/g, '[amount]'],
  [/\b\d[\d,]*(?:\.\d+)?\s?(?:k|K|thousand|grand)\b(?:\s*(?:a|per)\s*(?:year|month))?/g, '[amount]'],
  [/\b\d{2,3},\d{3}\b/g, '[amount]'],
];

export function redact(text) {
  let out = text, count = 0;
  for (const [re, label] of RULES) out = out.replace(re, () => { count++; return label; });
  return { text: out, redactions: count };
}

export class RequestError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

export function parseAskBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError('invalid_body');
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'question') throw new RequestError('only_question_accepted');
  if (typeof body.question !== 'string') throw new RequestError('invalid_question');
  const question = body.question.replace(/[\u0000-\u001f]/g, ' ').trim();
  if (!question) throw new RequestError('empty_question');
  if (question.length > MAX_QUESTION_CHARS) throw new RequestError('question_too_long');
  return question;
}
