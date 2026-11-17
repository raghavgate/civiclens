import { PLAN_TOOL, PLAN_SYSTEM, ANSWER_TOOL, answerSystem, answerUser } from '../prompts.mjs';

// OpenAI Chat Completions adapter. Same contract as the Anthropic adapter: forced function calling returns
// schema-shaped JSON; the API key is read on the server only.
export function createOpenAIProvider({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.CIVICLENS_MODEL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
  baseUrl = 'https://api.openai.com',
} = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  if (!model) throw new Error('Set CIVICLENS_MODEL to the OpenAI model ID to use');

  async function callTool({ system, user, tool, maxTokens }) {
    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }],
        tool_choice: { type: 'function', function: { name: tool.name } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const call = body.choices?.[0]?.message?.tool_calls?.find(c => c.function?.name === tool.name);
    if (!call) throw new Error('Model did not return the required tool call');
    let input;
    try { input = JSON.parse(call.function.arguments); } catch { throw new Error('Model returned invalid tool arguments'); }
    const usage = body.usage ? { input_tokens: body.usage.prompt_tokens ?? 0, output_tokens: body.usage.completion_tokens ?? 0 } : null;
    return { input, usage };
  }

  return {
    name: 'openai',
    model,
    async plan(question) {
      const { input, usage } = await callTool({ system: PLAN_SYSTEM, user: `<question>${question.replace(/</g, '&lt;')}</question>`, tool: PLAN_TOOL, maxTokens: 1000 });
      return { ...input, usage };
    },
    async compose({ question, plan, evidenceText, modelVersion, scenarioModel }) {
      const { input, usage } = await callTool({ system: answerSystem({ modelVersion, scenarioModel }), user: answerUser({ question, plan, evidenceText }), tool: ANSWER_TOOL, maxTokens: 3000 });
      return { ...input, usage };
    },
  };
}
