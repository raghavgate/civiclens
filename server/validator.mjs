import { tokens, numbers } from './text.mjs';
import { LAW_STATUSES } from './corpus.mjs';
import { MODEL_VERSION, SCENARIO_MODELS } from '../dist/model.mjs';

export const COVERAGE = ['full', 'partial', 'none'];
// Claims that something was enacted need a chaptered/in-force record; claims about what a rule currently does may
// also rest on official agency guidance. A bill that was only introduced supports neither.
const ENACTMENT_CLAIM = /\b(is (now |currently )?(state )?law|enacted|signed into law|became law|took effect|chaptered)\b/i;
const RULE_CLAIM = /\b(in effect|in force|requires?|prohibits?|caps?|capped|limits?|imposes?|imposed|must|shall)\b/i;
const RULE_STATUSES = new Set([...LAW_STATUSES, 'guidance']);
const FORECAST = /\b(will|would|could) (save|cost|lower|raise|reduce|increase|cut|drop)\b[^.]*\d/i;
const INSTRUCTION_LIKE = /(ignore (all |any )?(previous|prior|above) (instructions|rules)|system prompt|you are now|disregard the|as an ai\b)/i;
export const MIN_SUPPORT = 0.6;

// Fraction of the claim's content words found in the cited text. A cheap, deterministic entailment proxy;
// the live eval adds a model-graded entailment check on top.
export function support(claim, citedText) {
  const c = tokens(claim).filter(t => !/\d/.test(t));
  if (!c.length) return 0;
  const bag = new Set(tokens(citedText));
  return c.filter(t => bag.has(t)).length / c.length;
}

export function checkFact(fact, byId, today) {
  if (!fact || typeof fact.claim !== 'string' || fact.claim.trim().length < 10 || fact.claim.length > 400) return 'malformed_fact';
  if (!Array.isArray(fact.evidenceIds) || !fact.evidenceIds.length) return 'missing_citation';
  const cited = fact.evidenceIds.map(id => byId.get(id));
  if (cited.some(r => !r)) return 'unknown_evidence';
  if (INSTRUCTION_LIKE.test(fact.claim)) return 'instruction_like';
  const citedText = cited.map(r => `${r.title} ${r.passage}`).join(' ');
  const available = numbers(citedText);
  for (const n of numbers(fact.claim)) if (!available.has(n)) return 'unsupported_number';
  if (FORECAST.test(fact.claim)) return 'unsupported_estimate';
  const live = r => !(r.expiresAt && r.expiresAt <= today);
  const proposal = /\bwould\b/i.test(fact.claim);
  if (ENACTMENT_CLAIM.test(fact.claim) && !cited.some(r => LAW_STATUSES.has(r.status) && live(r))) return 'status_not_supported';
  if (RULE_CLAIM.test(fact.claim) && !proposal && !cited.some(r => RULE_STATUSES.has(r.status) && live(r))) return 'status_not_supported';
  if (support(fact.claim, citedText) < MIN_SUPPORT) return 'not_entailed';
  return null;
}

function checkScenario(scenario, intent) {
  if (scenario == null) return null;
  if (typeof scenario !== 'object') return 'malformed_scenario';
  if (scenario.modelVersion !== MODEL_VERSION) return 'unknown_model_version';
  if (!SCENARIO_MODELS[intent] || scenario.model !== SCENARIO_MODELS[intent]) return 'wrong_scenario_model';
  if ('outputs' in scenario) return 'model_generated_outputs'; // numeric personalization stays in the browser
  if (!Array.isArray(scenario.assumptions) || !scenario.assumptions.every(a => typeof a === 'string')) return 'malformed_assumptions';
  return null;
}

export function abstention(reason, plan, extra = {}) {
  return {
    abstained: true,
    reason,
    intent: plan?.intent ?? 'unsupported',
    domain: plan?.domain ?? null,
    facts: [],
    evidence: [],
    rejected: [],
    scenario: SCENARIO_MODELS[plan?.intent] ? { modelVersion: MODEL_VERSION, model: SCENARIO_MODELS[plan.intent], assumptions: [] } : null,
    uncertainties: ['No source-backed answer was produced for this question.'],
    coverage: 'none',
    ...extra,
  };
}

// Validates a model-proposed structured answer against the evidence actually retrieved for this request.
// Invalid facts are dropped (and reported); structural failures or an empty evidence answer cause abstention.
export function validateAnswer(answer, { hits, plan, today = new Date().toISOString().slice(0, 10) }) {
  const byId = new Map(hits.map(h => [h.record.id, h.record]));
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.facts)) return abstention('malformed_answer', plan);
  if (!Array.isArray(answer.uncertainties) || !answer.uncertainties.length || !answer.uncertainties.every(u => typeof u === 'string' && u.trim()))
    return abstention('missing_uncertainties', plan);
  if (!COVERAGE.includes(answer.coverage)) return abstention('malformed_coverage', plan);

  const facts = [], rejected = [];
  for (const fact of answer.facts) {
    const reason = checkFact(fact, byId, today);
    if (reason) rejected.push({ claim: String(fact?.claim ?? ''), reason });
    else facts.push({ claim: fact.claim.trim(), evidenceIds: [...new Set(fact.evidenceIds)] });
  }
  const scenarioError = checkScenario(answer.scenario, plan.intent);
  if (scenarioError) rejected.push({ claim: 'scenario', reason: scenarioError });
  const scenario = scenarioError ? (SCENARIO_MODELS[plan.intent] ? { modelVersion: MODEL_VERSION, model: SCENARIO_MODELS[plan.intent], assumptions: [] } : null) : (answer.scenario ?? null);

  if (plan.intent === 'policy_evidence' && !facts.length) return abstention(rejected.length ? 'no_valid_facts' : 'no_facts', plan, { rejected });

  let coverage = answer.coverage;
  if (!facts.length) coverage = 'none';
  else if (rejected.length && coverage === 'full') coverage = 'partial';
  const uncertainties = [...answer.uncertainties];
  if (rejected.length) uncertainties.push(`${rejected.length} statement(s) were removed because the cited sources did not support them.`);
  const evidence = [...new Set(facts.flatMap(f => f.evidenceIds))].map(id => {
    const r = byId.get(id);
    return { id, title: r.title, url: r.url, status: r.status, jurisdiction: r.jurisdiction, effectiveDate: r.effectiveDate ?? null, retrievedAt: r.retrievedAt, passage: r.passage };
  });
  return { abstained: false, intent: plan.intent, domain: plan.domain, facts, scenario, uncertainties, coverage, evidence, rejected };
}
