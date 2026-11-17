import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus } from '../server/corpus.mjs';
import { ask } from '../server/pipeline.mjs';
import { createApp } from '../server/index.mjs';
import { redact, parseAskBody } from '../server/privacy.mjs';
import { normalizePlan, planQuestion } from '../server/planner.mjs';
import { createMockProvider, createScriptedProvider } from '../server/providers/mock.mjs';
import { createAnthropicProvider } from '../server/providers/anthropic.mjs';
import { providerFromEnv } from '../server/providers/index.mjs';

const corpus = loadCorpus();
const mock = createMockProvider();
const today = '2026-11-16';

test('redaction removes contact details, addresses, and amounts before any model call', () => {
  const { text, redactions } = redact('I earn $85,000 (about 85k a year), live at 1200 Oak Street, call 415-555-0101 or a.b@c.com');
  for (const leak of ['85', '1200 Oak', '415', 'a.b@c.com']) assert.ok(!text.includes(leak), leak);
  assert.ok(redactions >= 4);
});

test('the API accepts only a question: extra fields such as financial inputs are refused', () => {
  assert.equal(parseAskBody({ question: ' rent cap? ' }), 'rent cap?');
  assert.throws(() => parseAskBody({ question: 'q', income: 75000 }), /only_question_accepted/);
  assert.throws(() => parseAskBody({ question: 'x'.repeat(501) }), /question_too_long/);
  assert.throws(() => parseAskBody({ question: '   ' }), /empty_question/);
});

test('plan normalization enforces the typed intent contract', () => {
  assert.equal(normalizePlan({ intent: 'tell_joke' }), null);
  assert.equal(normalizePlan({ intent: 'policy_evidence', domain: null }), null);
  assert.deepEqual(normalizePlan({ intent: 'property_tax', domain: 'housing', jurisdiction: 'ca' }).domain, 'tax');
  assert.equal(normalizePlan({ intent: 'policy_evidence', domain: 'housing', jurisdiction: 'California' }).jurisdiction, null);
});

test('planner falls back to the deterministic router when the model fails or returns junk', async () => {
  const thrown = await planQuestion(createScriptedProvider({ plan: new Error('timeout') }), 'Can my landlord raise rent in California?');
  assert.equal(thrown.source, 'fallback');
  assert.equal(thrown.intent, 'policy_evidence');
  const junk = await planQuestion(createScriptedProvider({ plan: { intent: 'do_anything' } }), 'Could I afford to buy a home?');
  assert.equal(junk.intent, 'mortgage_cost');
});

test('end to end (mock): California rent cap question returns cited facts', async () => {
  const r = await ask('How much can my landlord raise my rent in California?', { provider: mock, corpus, today });
  assert.equal(r.abstained, false);
  assert.ok(r.facts.length && r.facts.every(f => f.evidenceIds.length));
  assert.ok(r.evidence.every(e => e.jurisdiction === 'CA'));
});

test('end to end: policy question without a jurisdiction abstains; scenario question still works', async () => {
  assert.equal((await ask('Is there a rent cap?', { provider: mock, corpus, today })).reason, 'jurisdiction_required');
  const s = await ask('Could I afford to buy a home?', { provider: mock, corpus, today });
  assert.equal(s.abstained, false);
  assert.equal(s.scenario.model, 'mortgage_cost');
  assert.equal(s.facts.length, 0);
});

test('end to end: uncovered state and unsupported topics abstain', async () => {
  const tx = await ask('rent cap law', { provider: createScriptedProvider({ plan: { intent: 'policy_evidence', domain: 'housing', jurisdiction: 'TX', searchTerms: [] } }), corpus, today });
  assert.equal(tx.reason, 'jurisdiction_not_covered');
  assert.equal((await ask('Who should I vote for?', { provider: mock, corpus, today })).reason, 'unsupported_question');
});

test('end to end: a model error abstains instead of failing open', async () => {
  const p = createScriptedProvider({ plan: { intent: 'policy_evidence', domain: 'tax', jurisdiction: 'CA', searchTerms: ['prop 13'] }, answer: new Error('500') });
  assert.equal((await ask('prop 13 property tax', { provider: p, corpus, today })).reason, 'model_error');
});

test('Anthropic adapter: forced tool use, key only in header, redacted question only', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const tool = JSON.parse(init.body).tool_choice.name;
    const input = tool === 'submit_plan'
      ? { intent: 'policy_evidence', domain: 'housing', jurisdiction: 'CA', needsCurrentStatus: true, searchTerms: ['rent cap'] }
      : { facts: [{ claim: 'Annual rent increases are capped at 5% plus the percentage change in the cost of living, up to a maximum of 10%.', evidenceIds: ['ca-oag-rent-caps'] }], scenario: null, uncertainties: ['Local rules may differ.'], coverage: 'full' };
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: tool, input }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  };
  const provider = createAnthropicProvider({ apiKey: 'sk-test', model: 'test-model', fetchImpl });
  const r = await ask('I pay $2,400 rent in California. How much can my landlord raise it?', { provider, corpus, today });
  assert.equal(r.abstained, false);
  assert.equal(calls.length, 2);
  for (const c of calls) {
    assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(c.init.headers['x-api-key'], 'sk-test');
    assert.equal(c.body.tool_choice.type, 'tool');
    assert.ok(!JSON.stringify(c.body).includes('2,400') && !JSON.stringify(c.body).includes('sk-test'));
  }
  assert.match(calls[1].body.messages[0].content, /<evidence id="ca-/);
});

test('Anthropic adapter surfaces API errors and missing tool calls', async () => {
  const bad = createAnthropicProvider({ apiKey: 'k', fetchImpl: async () => new Response('overloaded', { status: 529 }) });
  await assert.rejects(bad.plan('q'), /529/);
  const noTool = createAnthropicProvider({ apiKey: 'k', fetchImpl: async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'hi' }] })) });
  await assert.rejects(noTool.plan('q'), /tool call/);
  assert.throws(() => createAnthropicProvider({ apiKey: '' }), /ANTHROPIC_API_KEY/);
});

test('provider selection from environment', () => {
  assert.equal(providerFromEnv({}).name, 'mock');
  assert.equal(providerFromEnv({ ANTHROPIC_API_KEY: 'k' }).name, 'anthropic');
  assert.throws(() => providerFromEnv({ CIVICLENS_PROVIDER: 'other' }), /Unknown/);
});

test('HTTP server: /api/ask contract, static files, and traversal guard', async () => {
  const server = createApp({ provider: mock, corpus }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = body => fetch(`${base}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const good = await post({ question: 'What does Prop 13 say about property tax in California?' });
    assert.equal(good.status, 200);
    assert.equal((await good.json()).domain, 'tax');
    const extra = await post({ question: 'rent', income: 90000 });
    assert.equal(extra.status, 400);
    assert.equal((await extra.json()).error, 'only_question_accepted');
    assert.equal((await fetch(`${base}/api/ask`)).status, 405);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
  } finally { server.close(); }
});

test('rate limits: per-client window, daily cap, and 429 from the API', async () => {
  const { createLimiter, clientId } = await import('../server/limits.mjs');
  let t = 0;
  const lim = createLimiter({ perMinute: 2, perDay: 3, now: () => t });
  assert.ok(lim.check('a').ok && lim.check('a').ok);
  assert.equal(lim.check('a').error, 'rate_limited');
  t = 61000;
  assert.ok(lim.check('b').ok);
  assert.equal(lim.check('a').error, 'daily_limit_reached');
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientId(req, true), '9.9.9.9');
  assert.equal(clientId(req, false), '10.0.0.1');

  const server = createApp({ provider: mock, corpus, limiter: createLimiter({ perMinute: 1, perDay: 100 }) }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const post = () => fetch(`${base}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'rent cap in California?' }) });
    assert.equal((await post()).status, 200);
    const limited = await post();
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  } finally { server.close(); }
});

test('OpenAI adapter: forced function call, bearer key in header, redacted question only', async () => {
  const { createOpenAIProvider } = await import('../server/providers/openai.mjs');
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const name = body.tool_choice.function.name;
    const args = name === 'submit_plan'
      ? { intent: 'policy_evidence', domain: 'tax', jurisdiction: 'CA', needsCurrentStatus: true, searchTerms: ['prop 13'] }
      : { facts: [{ claim: 'The maximum ad valorem tax on real property shall not exceed 1 percent of its full cash value.', evidenceIds: ['ca-const-xiiia-1a'] }], scenario: null, uncertainties: ['Local voter-approved rates add to the 1%.'], coverage: 'partial' };
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 20, completion_tokens: 7 } }));
  };
  const provider = createOpenAIProvider({ apiKey: 'sk-openai-test', model: 'test-model', fetchImpl });
  const r = await ask('My home cost $900,000. What does Prop 13 say about the tax rate in California?', { provider, corpus, today });
  assert.equal(r.abstained, false);
  assert.equal(r.meta.provider, 'openai');
  for (const c of calls) {
    assert.equal(c.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(c.init.headers.authorization, 'Bearer sk-openai-test');
    assert.equal(c.body.tool_choice.type, 'function');
    assert.ok(!JSON.stringify(c.body).includes('900,000'));
  }
  assert.deepEqual(r.meta.composeUsage, { input_tokens: 20, output_tokens: 7 });
  await assert.rejects(createOpenAIProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: 'submit_plan', arguments: '{bad' } }] } }] })) }).plan('q'), /invalid tool arguments/);
  assert.throws(() => createOpenAIProvider({ apiKey: 'k', model: '' }), /CIVICLENS_MODEL/);
  assert.equal(providerFromEnv({ OPENAI_API_KEY: 'k', CIVICLENS_MODEL: 'm' }).name, 'openai');
  assert.equal(providerFromEnv({ OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k2' }).name, 'anthropic');
});
