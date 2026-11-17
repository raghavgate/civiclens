import { createAnthropicProvider } from './anthropic.mjs';
import { createMockProvider } from './mock.mjs';

// CIVICLENS_PROVIDER=anthropic|mock. Defaults to anthropic when a key is present, otherwise mock.
export function providerFromEnv(env = process.env) {
  const name = env.CIVICLENS_PROVIDER ?? (env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  if (name === 'anthropic') return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.CIVICLENS_MODEL });
  if (name === 'mock') return createMockProvider();
  throw new Error(`Unknown CIVICLENS_PROVIDER: ${name}`);
}
