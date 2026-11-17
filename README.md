# CivicLens

See how California public policy may affect your household, without handing over your finances. Ask a question in plain language; CivicLens routes it to a typed intent, retrieves official California sources, and returns only statements those sources support, each linked to its record. Personal numbers are explored in a calculator that runs entirely in your browser.

Domains: **housing** (rent cap, rent and mortgage budgets), **tax** (Proposition 13 property tax), **healthcare** (California individual coverage mandate and penalty). Jurisdiction: **California**.

```
npm start            # server + UI on http://localhost:4173 (mock provider unless ANTHROPIC_API_KEY is set)
npm test             # 51 tests, including the offline eval suite and its gates
npm run eval         # offline evals → evals/results/mock-<date>.json
npm run eval:live    # Anthropic provider + model-graded entailment judge (needs ANTHROPIC_API_KEY)
```

Node 18+, no dependencies. Environment: `ANTHROPIC_API_KEY`, `CIVICLENS_PROVIDER=anthropic|mock`, `CIVICLENS_MODEL`, `CIVICLENS_JUDGE_MODEL`, `PORT`.

## How a question is answered

```
browser ──{question}──▶ /api/ask
  1. privacy     only {question} accepted; amounts, emails, phones, addresses, ID numbers redacted   server/privacy.mjs
  2. plan        LLM returns a typed plan via forced tool use; invalid → deterministic fallback      server/planner.mjs
                 intent ∈ rent_budget | mortgage_cost | property_tax | policy_evidence | unsupported
  3. gate        unsupported → abstain; no jurisdiction → no legal claims; non-CA → abstain           server/pipeline.mjs
  4. retrieve    BM25 over an allowlisted, provenance-checked corpus; instruction-like passages       server/retrieval.mjs
                 quarantined; evidence passed to the model as escaped, untrusted data
  5. compose     LLM returns {facts[{claim,evidenceIds}], scenario, uncertainties, coverage}           server/providers/
  6. validate    drop facts that cite unknown ids, add numbers, overstate status, aren't entailed,    server/validator.mjs
                 forecast effects, or relay instructions; strip model-made scenario outputs;
                 abstain when nothing survives
browser ◀── facts + evidence records + uncertainties; calculator inputs never leave the page
```

**Provider adapters.** `server/providers/anthropic.mjs` (Messages API, forced tool use, key read server-side only) and `server/providers/mock.mjs` (deterministic extractive provider for tests and offline use). Both implement `plan()` and `compose()`; the pipeline does not know which one it has.

**Evidence records** (`corpus/ca/records.json`, 11 records) carry `id`, canonical `url` on an allowlisted host, exact `passage`, `jurisdiction`, `publishedAt`, `retrievedAt`, `effectiveDate`, `expiresAt`, and `status` (`in_force`, `chaptered`, `introduced`, `guidance`, …). An introduced bill can only support "would" statements; an expired record cannot support a current-rule claim. Loading fails on any record that breaks these rules.

**Scenario models** (`dist/model.mjs`, version `civiclens-model-2`): rent budget, 30-year fixed mortgage cost, and a Proposition 13 property tax projection (base year value, ≤2% annual growth, 1% general levy plus local rate). Deterministic and unit-tested. The model never computes personal numbers; the validator rejects any scenario outputs it tries to return.

## Evaluation

`evals/cases.json` holds seven suites. `npm test` runs them offline and fails if any gate is missed.

| Suite | What it checks | Gate |
|---|---|---|
| routing | intent and domain for 12 questions across all three domains and off-topic asks | ≥ 90% |
| citationRecall | grounded questions cite the expected record | ≥ 85% |
| entailment | every returned fact re-checked against its cited passages (numbers and content words); live runs add a model-graded judge | 100% |
| abstention | missing jurisdiction, uncovered state, unsupported topic; live-only cases for out-of-corpus policy questions | 100% |
| injection | instructions embedded in the question never surface in facts | 100% |
| poisoned | an allowlisted record carrying injected instructions, with both the normal provider and a model that obeys and cites it | 100% |
| compromised | six bad model outputs (invented number, fake id, introduced bill as law, unentailed claim, relayed instruction, forecast) each rejected for the right reason | 100% |

Latest offline run: all gates pass (`evals/results/`). Live results are written to the same folder by `npm run eval:live`; none are committed yet.

## Privacy contract

The API accepts exactly one field, `question` (≤ 500 chars); any other field (for example an income) is refused with `only_question_accepted`. Contact details and amounts are redacted before the question reaches a model. The server logs intent, abstention reason, counts, and latency, never question text. Responses are `no-store` with a CSP that limits connections to the same origin.

## Limits

- Sources: some canonical pages (leginfo) block automated retrieval, so passages were transcribed from the mirrors recorded in each record's `retrievedVia`. Re-verify against the canonical URL before relying on them.
- Coverage is 11 records. Questions outside them abstain rather than guess. Local ordinances, exemptions, and eligibility are not modeled.
- The lexical entailment check is a conservative proxy; the live judge is the stronger check.
- Static hosting (`.openai/hosting.json`, `dist/` only) has no server, so the page falls back to keyword routing and shows no sourced statements.
- Not legal, tax, or financial advice.
