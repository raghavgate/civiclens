import { createAnthropicProvider } from './anthropic.mjs';
import { createOpenAIProvider } from './openai.mjs';
import { createMockProvider } from './mock.mjs';

// CIVICLENS_PROVIDER=anthropic|openai|mock. Unset: Anthropic if its key is present, else OpenAI, else mock.
export function providerFromEnv(env = process.env) {
  const name = env.CIVICLENS_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : 'mock');
  if (name === 'anthropic') return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.CIVICLENS_MODEL || undefined });
  if (name === 'openai') return createOpenAIProvider({ apiKey: env.OPENAI_API_KEY, model: env.CIVICLENS_MODEL });
  if (name === 'mock') return createMockProvider();
  throw new Error(`Unknown CIVICLENS_PROVIDER: ${name}`);
}
