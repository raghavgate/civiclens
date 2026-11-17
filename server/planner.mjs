import { INTENTS, routeQuestion } from '../dist/model.mjs';
import { DOMAINS } from './corpus.mjs';

const SCENARIO_DOMAIN = { rent_budget: 'housing', mortgage_cost: 'housing', property_tax: 'tax' };

// Validates and normalizes a model-proposed plan. Returns null if the plan cannot be trusted.
export function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object' || !INTENTS.includes(raw.intent)) return null;
  const intent = raw.intent;
  let domain = raw.domain ?? null;
  if (domain !== null && !DOMAINS.includes(domain)) return null;
  if (SCENARIO_DOMAIN[intent]) domain = SCENARIO_DOMAIN[intent];
  if (intent === 'policy_evidence' && !domain) return null;
  if (intent === 'unsupported') domain = null;
  let jurisdiction = typeof raw.jurisdiction === 'string' ? raw.jurisdiction.trim().toUpperCase() : null;
  if (jurisdiction && !/^[A-Z]{2}$/.test(jurisdiction)) jurisdiction = null;
  const searchTerms = Array.isArray(raw.searchTerms) ? raw.searchTerms.filter(t => typeof t === 'string').slice(0, 8).map(t => t.slice(0, 80)) : [];
  return { intent, domain, jurisdiction, needsCurrentStatus: Boolean(raw.needsCurrentStatus), searchTerms };
}

export async function planQuestion(provider, question) {
  try {
    const raw = await provider.plan(question);
    const plan = normalizePlan(raw);
    if (plan) return { ...plan, source: provider.name, usage: raw.usage ?? null };
  } catch (err) {
    return { ...fallback(question), source: 'fallback', fallbackReason: err.message.slice(0, 120) };
  }
  return { ...fallback(question), source: 'fallback', fallbackReason: 'invalid_plan' };
}

function fallback(question) {
  const { intent, domain } = routeQuestion(question);
  return { intent, domain, jurisdiction: /\bcalifornia\b/i.test(question) ? 'CA' : null, needsCurrentStatus: intent === 'policy_evidence', searchTerms: [] };
}
