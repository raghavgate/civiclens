import { MODEL_VERSION, SCENARIO_MODELS } from '../dist/model.mjs';
import { redact } from './privacy.mjs';
import { planQuestion } from './planner.mjs';
import { retrieve, formatEvidenceForModel } from './retrieval.mjs';
import { validateAnswer, abstention } from './validator.mjs';

export const COVERED_JURISDICTIONS = new Set(['CA']);

// question -> redact -> typed plan -> retrieval from allowlisted corpus -> model answer -> validation.
export async function ask(question, { provider, corpus, today } = {}) {
  const started = Date.now();
  const { text: safeQuestion, redactions } = redact(question);
  const plan = await planQuestion(provider, safeQuestion);
  const meta = { provider: provider.name, model: provider.model, plan, redactions, corpusVersion: corpus.version, modelVersion: MODEL_VERSION };
  const done = result => ({ ...result, meta: { ...meta, ms: Date.now() - started } });

  if (plan.intent === 'unsupported') return done(abstention('unsupported_question', plan));

  // Missing jurisdiction blocks legislative assertions, not local scenario exploration.
  const scenarioOnly = !plan.jurisdiction || !COVERED_JURISDICTIONS.has(plan.jurisdiction);
  if (plan.intent === 'policy_evidence' && scenarioOnly)
    return done(abstention(plan.jurisdiction ? 'jurisdiction_not_covered' : 'jurisdiction_required', plan));
  if (scenarioOnly) {
    return done({
      abstained: false, intent: plan.intent, domain: plan.domain, facts: [], evidence: [], rejected: [],
      scenario: { modelVersion: MODEL_VERSION, model: SCENARIO_MODELS[plan.intent], assumptions: [] },
      uncertainties: ['No state was named, so no legal or policy facts are shown. Name a state (CivicLens currently covers California) to see sourced rules.'],
      coverage: 'none',
    });
  }

  const query = [safeQuestion, ...plan.searchTerms].join(' ');
  const hits = retrieve(corpus, { query, domain: plan.domain, jurisdiction: plan.jurisdiction, today });
  if (plan.intent === 'policy_evidence' && !hits.length) return done(abstention('no_evidence', plan));

  let raw;
  try {
    raw = await provider.compose({
      question: safeQuestion, plan, hits, evidenceText: formatEvidenceForModel(hits),
      modelVersion: MODEL_VERSION, scenarioModel: SCENARIO_MODELS[plan.intent] ?? null,
    });
  } catch (err) {
    return done(abstention('model_error', plan, { error: err.message.slice(0, 120) }));
  }
  meta.composeUsage = raw?.usage ?? null;
  return done(validateAnswer(raw, { hits, plan, today }));
}
