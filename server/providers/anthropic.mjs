import { PLAN_TOOL, PLAN_SYSTEM, ANSWER_TOOL, answerSystem, answerUser } from '../prompts.mjs';

// Anthropic Messages API adapter. Uses forced tool use so the model must return schema-shaped JSON.
// The API key is read on the server only; it never reaches browser code.
export function createAnthropicProvider({
  apiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.CIVICLENS_MODEL ?? 'claude-sonnet-5-5',
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  baseUrl = 'https://api.anthropic.com',
} = {}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  async function callTool({ system, user, tool, maxTokens }) {
    const res = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature: 0, system,
        messages: [{ role: 'user', content: user }],
        tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const block = body.content?.find(b => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new Error('Model did not return the required tool call');
    return { input: block.input, usage: body.usage ?? null };
  }

  return {
    name: 'anthropic',
    model,
    async plan(question) {
      const { input, usage } = await callTool({ system: PLAN_SYSTEM, user: `<question>${question.replace(/</g, '&lt;')}</question>`, tool: PLAN_TOOL, maxTokens: 400 });
      return { ...input, usage };
    },
    async compose({ question, plan, evidenceText, modelVersion, scenarioModel }) {
      const { input, usage } = await callTool({ system: answerSystem({ modelVersion, scenarioModel }), user: answerUser({ question, plan, evidenceText }), tool: ANSWER_TOOL, maxTokens: 1500 });
      return { ...input, usage };
    },
  };
}
