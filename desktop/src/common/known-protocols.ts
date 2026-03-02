/**
 * Known LLM provider protocols used by Go's ExtractProtocol().
 * Shared between main process (syncModelList) and renderer (buildProviderOptions).
 *
 * When a model ID contains '/', the prefix before the first '/' is checked against
 * this set to determine if it's a protocol (e.g., "groq/model") or part of the
 * model name (e.g., "meta-llama/model" — HuggingFace org/model format).
 *
 * Must stay in sync with Go's knownProtocols in pkg/config/migration.go.
 */
export const KNOWN_PROTOCOLS = new Set([
  'openai',
  'anthropic',
  'groq',
  'openrouter',
  'gemini',
  'nvidia',
  'ollama',
  'moonshot',
  'shengsuanyun',
  'deepseek',
  'cerebras',
  'volcengine',
  'vllm',
  'qwen',
  'mistral',
  'zhipu',
  'antigravity',
  'github-copilot',
  'copilot',
  'github-models',
  'claude-cli',
  'claudecli',
  'codex-cli',
  'codexcli'
])

/**
 * Check if a model ID already has a known protocol prefix.
 * e.g., "groq/llama-3.1-8b-instant" → true
 *       "meta-llama/llama-4-scout" → false (meta-llama is NOT a protocol)
 */
export function hasKnownProtocolPrefix(modelId: string): boolean {
  const slashIdx = modelId.indexOf('/')
  return slashIdx > 0 && KNOWN_PROTOCOLS.has(modelId.slice(0, slashIdx))
}

/**
 * Ensure a model ID has the correct provider protocol prefix.
 * If the model already starts with a known protocol, return as-is.
 * Otherwise, prepend the provider name.
 *
 * Handles GitHub Copilot name normalization (github_copilot → github-copilot).
 */
export function ensureProtocolPrefix(modelId: string, provider: string): string {
  if (!modelId) return modelId
  if (hasKnownProtocolPrefix(modelId)) return modelId
  const canonicalProvider =
    provider === 'github_copilot' || provider === 'copilot'
      ? 'github-copilot'
      : provider
  return `${canonicalProvider}/${modelId}`
}

/**
 * Strip a known protocol prefix from a model ID.
 * e.g., "groq/llama-3.1-8b-instant" → "llama-3.1-8b-instant"
 *       "groq/meta-llama/llama-4-scout" → "meta-llama/llama-4-scout"
 *       "meta-llama/llama-4-scout" → "meta-llama/llama-4-scout" (no known prefix)
 */
export function stripProtocolPrefix(modelId: string): string {
  const slashIdx = modelId.indexOf('/')
  if (slashIdx > 0 && KNOWN_PROTOCOLS.has(modelId.slice(0, slashIdx))) {
    return modelId.slice(slashIdx + 1)
  }
  return modelId
}
