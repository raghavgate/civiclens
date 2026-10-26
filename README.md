# CivicLens — housing MVP

A dependency-free, question-first housing explorer. Serve `dist/` with any static HTTP server. Run `npm run dev` (Python 3 required) and open http://localhost:4173. Run `npm test` with Node 18+.

## Implemented

Responsive question intake; bounded keyword routing with an explicit unsupported-topic response; local rent and fixed-rate mortgage models; interactive sensitivity tests; itemized math; linked primary sources; uncertainty and example labels; no sign-in, analytics, storage, or financial-input transmission. The default household is invented. Google Fonts requests contain no form values; system fonts work offline.

## Evidence and model boundary

- **Reference facts:** housing-cost-burden convention from California HCD, payment components from CFPB; mechanism summaries link to HUD. These are educational sources, not local data or legislative records.
- **Modeled scenario:** deterministic arithmetic in `dist/model.mjs`, with all assumptions exposed. Dollar figures are rounded only for display. Mortgage loan term is fixed at 30 years. Mortgage insurance is a simplified annual percentage of initial principal below 20% down, not an amortizing cancellation schedule. Upkeep is a reserve. Cost-burden comparison includes upkeep for buyers and is an illustrative budget screen, not a direct reproduction of an official statistical measure.
- **Uncertainty:** no causal mapping from zoning or assistance to rent changes; sensitivity sliders are user-imposed changes, not forecasts. No eligibility, lender approval, investment, or policy recommendations.

## LLM orchestration design (not connected in this MVP)

1. Accept a question only. Never include financial slider values in remote requests. Redact personal details or ask users to remove them before any future remote question submission.
2. An intent planner returns a typed intent (`rent_budget`, `mortgage_cost`, `policy_evidence`, `unsupported`) and jurisdiction/date requirements. Missing jurisdiction blocks legislative assertions, not local scenario exploration.
3. Retrieval uses an allowlist of primary legislative and statistical sources. An evidence record requires stable ID, URL, exact supporting passage, jurisdiction, publication/retrieval timestamps, effective date, and status. Never infer enacted status from a bill introduction. Retrieved documents are untrusted data, not executable instructions.
4. A validator distinguishes source-backed facts from hypotheses. Missing, conflicting, stale, or irrelevant evidence yields abstention and a visible limitation. No record means no legislative claim.
5. The local browser runs a versioned, tested model using ephemeral inputs. Only validated model outputs enter the local result renderer. A future LLM may explain generic model relationships; numeric personalization remains a local template unless the privacy contract is explicitly changed.
6. A structured answer contains `facts[{claim,evidenceIds}]`, `scenario{modelVersion,assumptions,outputs}`, `uncertainties[]`, and `coverage`. Reject unknown evidence IDs, invented numeric outputs, missing caveats, or unsupported policy-effect estimates. Render the three categories separately.

Production gates: source-specific ingestion and provenance tests, citation entailment evaluation, prompt-injection tests, freshness/status checks, model review, accessibility and device testing, deployment access review. Do not expose a provider secret in browser code.

## Validation

Seven automated tests cover a known mortgage reference, zero-interest and zero-principal cases, rent budget arithmetic, cost components and PMI threshold, sensitivity direction, invalid inputs, and routing/abstention. Browser smoke tests cover example questions, buying mode, slider changes, math disclosure, and reset. Mobile CSS is included; a physical mobile device has not been tested.

## Next slice

Integrate one jurisdiction and one official housing dataset with dated observations and source provenance. Add a read-only retrieval adapter and structured answer validation before enabling any LLM. The present app intentionally has no remote AI endpoint.
