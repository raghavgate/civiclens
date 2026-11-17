import { routeQuestion } from '../../dist/model.mjs';

// Deterministic offline provider: keyword planning and extractive answers. Used for tests, CI evals,
// and local development without an API key. It cannot paraphrase, so it quotes the leading sentence of each passage.
export function createMockProvider() {
  return {
    name: 'mock',
    model: 'extractive-v1',
    async plan(question) {
      const { intent, domain } = routeQuestion(question);
      const jurisdiction = /\b(california|ca|calif\.?)\b/i.test(question) ? 'CA' : null;
      return { intent, domain, jurisdiction, needsCurrentStatus: intent === 'policy_evidence', searchTerms: [] };
    },
    async compose({ hits, modelVersion, scenarioModel }) {
      const facts = hits.slice(0, 3).map(({ record }) => {
        const first = record.passage.split(/(?<=\.)\s+(?=[A-Z])/)[0];
        const claim = first.length > 380 ? first.slice(0, first.lastIndexOf(' ', 377)) + '…' : first;
        return { claim, evidenceIds: [record.id] };
      });
      return {
        facts,
        scenario: scenarioModel ? { modelVersion, model: scenarioModel, assumptions: [] } : null,
        uncertainties: ['Extractive answer: passages are quoted, not interpreted. Local ordinances and exemptions may apply.'],
        coverage: facts.length ? 'partial' : 'none',
      };
    },
  };
}

// Returns fixed outputs. Used by tests and evals to simulate a compromised or careless model.
export function createScriptedProvider({ plan, answer }) {
  return {
    name: 'scripted',
    model: 'scripted',
    async plan() { if (plan instanceof Error) throw plan; return structuredClone(plan); },
    async compose() { if (answer instanceof Error) throw answer; return structuredClone(answer); },
  };
}
