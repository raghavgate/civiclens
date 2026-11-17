import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Only these hosts may appear as an evidence record's canonical URL.
export const ALLOWED_SOURCE_HOSTS = new Set([
  'leginfo.legislature.ca.gov',
  'oag.ca.gov',
  'www.oag.ca.gov',
  'hbex.coveredca.com',
  'www.coveredca.com',
  'www.ftb.ca.gov',
  'www.boe.ca.gov',
  'www.hcd.ca.gov',
  'www.consumerfinance.gov',
  'www.huduser.gov',
]);

export const DOMAINS = ['housing', 'tax', 'healthcare'];
export const STATUSES = ['in_force', 'chaptered', 'introduced', 'vetoed', 'failed', 'guidance'];
// Statuses that support a claim that something is current law.
export const LAW_STATUSES = new Set(['in_force', 'chaptered']);
const REQUIRED = ['id', 'domain', 'title', 'url', 'sourceType', 'jurisdiction', 'passage', 'retrievedAt', 'status'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateRecord(r) {
  const errors = [];
  for (const k of REQUIRED) if (r[k] === undefined || r[k] === '') errors.push(`${r.id ?? '?'}: missing ${k}`);
  if (errors.length) return errors;
  let host;
  try { host = new URL(r.url).host; } catch { errors.push(`${r.id}: bad url`); }
  if (host && !ALLOWED_SOURCE_HOSTS.has(host)) errors.push(`${r.id}: host ${host} not allowlisted`);
  if (!DOMAINS.includes(r.domain)) errors.push(`${r.id}: unknown domain ${r.domain}`);
  if (!STATUSES.includes(r.status)) errors.push(`${r.id}: unknown status ${r.status}`);
  for (const k of ['publishedAt', 'retrievedAt', 'effectiveDate', 'expiresAt'])
    if (r[k] != null && !DATE.test(r[k])) errors.push(`${r.id}: ${k} must be YYYY-MM-DD`);
  if (r.status === 'introduced' && r.effectiveDate) errors.push(`${r.id}: an introduced bill cannot have an effective date`);
  if (r.passage.length < 40) errors.push(`${r.id}: passage too short to support a claim`);
  return errors;
}

export function loadCorpus(path = fileURLToPath(new URL('../corpus/ca/records.json', import.meta.url))) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const errors = raw.records.flatMap(validateRecord);
  const ids = raw.records.map(r => r.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate record ids');
  if (errors.length) throw new Error(`Invalid corpus:\n${errors.join('\n')}`);
  return { version: raw.corpusVersion, records: raw.records };
}

// A record is stale for "current law" purposes once it has expired.
export function isExpired(record, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(record.expiresAt && record.expiresAt <= today);
}
