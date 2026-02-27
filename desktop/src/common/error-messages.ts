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
  /** Rate limit specific information (only set for rate limit errors) */
  rateLimit?: RateLimitInfo
}

export interface RateLimitInfo {
  /** Seconds to wait before retrying */
  waitSeconds: number
  /** Human-readable wait time (e.g., "14秒", "2分30秒") */
  waitTimeText: string
  /** Token or request limit that was exceeded */
  limitType?: 'tokens' | 'requests'
  /** The limit value (e.g., 6000 TPM) */
  limitValue?: number
  /** ISO timestamp when quota resets (if available) */
  resetAt?: string
}

/**
 * Parse wait/reset time from error text and rate limit headers.
 * Handles Groq, OpenAI, OpenRouter, and Anthropic formats.
 */
function parseRateLimitInfo(errorText: string): RateLimitInfo | undefined {
  let waitSeconds = 0
  let limitType: 'tokens' | 'requests' | undefined
  let limitValue: number | undefined
  let resetAt: string | undefined

  // Pattern 1: "Wait Xs" or "Wait X.XXXs" (Groq format)
  const waitSecondsMatch = errorText.match(/Wait\s+([\d.]+)\s*s/i)
  if (waitSecondsMatch) {
    waitSeconds = Math.ceil(parseFloat(waitSecondsMatch[1]))
  }

  // Pattern 2: "Wait Xm" (minutes)
  const waitMinutesMatch = errorText.match(/Wait\s+([\d.]+)\s*m(?:in)?/i)
  if (waitMinutesMatch && !waitSecondsMatch) {
    waitSeconds = Math.ceil(parseFloat(waitMinutesMatch[1]) * 60)
  }

  // Pattern 3: "Wait Xh" (hours)
  const waitHoursMatch = errorText.match(/Wait\s+([\d.]+)\s*h/i)
  if (waitHoursMatch) {
    waitSeconds = Math.ceil(parseFloat(waitHoursMatch[1]) * 3600)
  }

  // Pattern 4: "try again in Xs" or "retry after Xs"
  const retryMatch = errorText.match(/(?:try again|retry after)\s+(?:in\s+)?([\d.]+)\s*s/i)
  if (retryMatch && !waitSeconds) {
    waitSeconds = Math.ceil(parseFloat(retryMatch[1]))
  }

  // Pattern 5: Retry-After header (seconds)
  const retryAfterMatch = errorText.match(/Retry-After:\s*([\d.]+)/i)
  if (retryAfterMatch && !waitSeconds) {
    waitSeconds = Math.ceil(parseFloat(retryAfterMatch[1]))
  }

  // Pattern 6: X-Ratelimit-Reset-Tokens header (e.g., "14.4s", "2m30s")
  const resetTokensMatch = errorText.match(/X-Ratelimit-Reset-Tokens:\s*([\d.]+[smh][\d.]*[smh]?)/i)
  if (resetTokensMatch && !waitSeconds) {
    waitSeconds = parseDurationString(resetTokensMatch[1])
  }

  // Pattern 7: X-Ratelimit-Reset-Requests header
  const resetRequestsMatch = errorText.match(/X-Ratelimit-Reset-Requests:\s*([\d.]+[smh][\d.]*[smh]?)/i)
  if (resetRequestsMatch && !waitSeconds) {
    waitSeconds = parseDurationString(resetRequestsMatch[1])
  }

  // Detect limit type
  if (errorText.includes('tokens per minute') || errorText.includes('TPM')) {
    limitType = 'tokens'
    const tpmMatch = errorText.match(/(\d+)\s*tokens?\s*per\s*minute/i)
    if (tpmMatch) {
      limitValue = parseInt(tpmMatch[1])
    }
  } else if (errorText.includes('requests per minute') || errorText.includes('RPM')) {
    limitType = 'requests'
    const rpmMatch = errorText.match(/(\d+)\s*requests?\s*per\s*minute/i)
    if (rpmMatch) {
      limitValue = parseInt(rpmMatch[1])
    }
  } else if (errorText.includes('requests per day') || errorText.includes('RPD')) {
    limitType = 'requests'
    const rpdMatch = errorText.match(/(\d+)\s*requests?\s*per\s*day/i)
    if (rpdMatch) {
      limitValue = parseInt(rpdMatch[1])
    }
  }

  // Default wait time if none detected
  if (!waitSeconds) {
    waitSeconds = 60 // Conservative default: 1 minute
  }

  // Calculate reset time
  resetAt = new Date(Date.now() + waitSeconds * 1000).toISOString()

  return {
    waitSeconds,
    waitTimeText: formatWaitTime(waitSeconds),
    limitType,
    limitValue,
    resetAt
  }
}

/**
 * Parse duration strings like "14.4s", "2m30s", "1h5m"
 */
function parseDurationString(s: string): number {
  let total = 0
  const hours = s.match(/([\d.]+)h/i)
  const minutes = s.match(/([\d.]+)m(?!s)/i)
  const seconds = s.match(/([\d.]+)s/i)
  if (hours) total += parseFloat(hours[1]) * 3600
  if (minutes) total += parseFloat(minutes[1]) * 60
  if (seconds) total += parseFloat(seconds[1])
  return Math.ceil(total)
}

/**
 * Format seconds into human-readable Japanese text
 */
function formatWaitTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}秒`
  }
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (sec === 0) {
    return `${min}分`
  }
  return `${min}分${sec}秒`
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
    errorText.includes('tokens per minute') ||
    errorText.includes('429')
  ) {
    const rateLimit = parseRateLimitInfo(errorText)
    const waitText = rateLimit?.waitTimeText || '1分'
    const limitInfo = rateLimit?.limitType === 'tokens' && rateLimit.limitValue
      ? `（上限: ${rateLimit.limitValue.toLocaleString()} トークン/分）`
      : rateLimit?.limitType === 'requests' && rateLimit.limitValue
        ? `（上限: ${rateLimit.limitValue.toLocaleString()} リクエスト/分）`
        : ''

    return {
      isError: true,
      message:
        `🚫 APIレート制限に達しました ${limitInfo}\n\n` +
        `${waitText}後に自動的に使えるようになります。\n` +
        `復帰予定: ${rateLimit?.resetAt ? new Date(rateLimit.resetAt).toLocaleTimeString('ja-JP') : '約1分後'}\n\n` +
        `💡 ヒント:\n` +
        `• 短いメッセージで指示する（例:「ロックして」）\n` +
        `• 別のLLMプロバイダーに切り替える`,
      rateLimit
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
