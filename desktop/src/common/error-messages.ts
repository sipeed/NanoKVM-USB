/**
 * Common error message translation for picoclaw API errors.
 * Used by both Agent mode (chat UI) and Gateway mode (Telegram)
 * to ensure consistent Japanese error messages.
 */

export interface TranslatedError {
  /** Whether the text was recognized as an error and translated */
  isError: boolean
  /** Japanese error message (or original text if not recognized) */
  message: string
}

/**
 * Translate picoclaw/LLM API error text into a user-friendly Japanese message.
 * Detects rate limit, authentication, and connection errors from various providers
 * (OpenRouter, Groq, OpenAI, Anthropic, Ollama, etc.)
 *
 * @param errorText - Raw error text from picoclaw stderr/stdout
 * @returns TranslatedError with isError flag and Japanese message
 */
export function translateApiError(errorText: string): TranslatedError {
  // Rate limit / credit exhaustion / TPM exceeded
  // OpenRouter 402, Groq 413/429, OpenAI 429, etc.
  if (
    errorText.includes('402') ||
    errorText.includes('413') ||
    errorText.includes('Rate limit') ||
    errorText.includes('rate limit') ||
    errorText.includes('requires more credits') ||
    errorText.includes('rate_limit_exceeded') ||
    errorText.includes('ratelimitexceeded') ||
    errorText.includes('Request too large') ||
    errorText.includes('tokens per minute')
  ) {
    // Check for specific wait time
    const waitMatch = errorText.match(/Wait\s+(\d+)([msh])/i)
    if (waitMatch) {
      const waitTime = waitMatch[1]
      const unit = waitMatch[2] === 'h' ? '時間' : waitMatch[2] === 'm' ? '分' : '秒'
      return {
        isError: true,
        message:
          `🚫 レート制限に達しました\n\n` +
          `無料枠を使い切りました。${waitTime}${unit}後に再試行してください。\n\n` +
          `または、設定から別のLLMプロバイダーに切り替えることができます。`
      }
    }

    return {
      isError: true,
      message:
        '🚫 レート制限エラー\n\n' +
        '無料枠のトークン制限に達しました。1分ほど待ってから再試行してください。\n\n' +
        '改善策:\n' +
        '• 短いメッセージで指示する（例:「ロックして」）\n' +
        '• 1分以上間隔を空ける\n' +
        '• 設定から別のLLMプロバイダーに切り替える'
    }
  }

  // API key / authentication errors
  if (
    (errorText.includes('401') && errorText.includes('API')) ||
    errorText.includes('Invalid API key') ||
    errorText.includes('invalid_api_key') ||
    errorText.includes('API key') ||
    errorText.includes('api_key') ||
    errorText.includes('Authorization')
  ) {
    return {
      isError: true,
      message:
        '🔑 認証エラー\n\n' +
        'APIキーが設定されていないか、無効です。\n\n' +
        '設定からAPIキーを確認してください。'
    }
  }

  // Network / connection errors
  if (
    errorText.includes('failed to send request') ||
    errorText.includes('connection refused') ||
    errorText.includes('connection') ||
    errorText.includes('ECONNREFUSED')
  ) {
    return {
      isError: true,
      message:
        '🌐 接続エラー\n\n' +
        'LLMサービスに接続できませんでした。\n\n' +
        'インターネット接続を確認してください。'
    }
  }

  // Not a recognized error pattern
  return { isError: false, message: errorText }
}
