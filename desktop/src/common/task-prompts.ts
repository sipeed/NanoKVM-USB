/**
 * NanoKVM-USB AI Agent task prompts — shared between picoclaw and zeroclaw.
 *
 * @see docs/picoclaw-lock-login-spec.md  ← 仕様の単一ソース (source of truth)
 * @see docs/multi-agent-spec.md Section 5 (HID 操作の統合)
 *
 * ## 使い分け
 * - picoclaw  : Go バイナリ内蔵ツール (nanokvm_lock 等) が直接 API Server を呼ぶ。
 *               Vision プロンプト定数 は /api/screen/verify ハンドラ内で使用される。
 * - zeroclaw  : computer_use でハイレベルアクション (nanokvm_lock 等) を呼ぶ。
 *               buildNanokvmSystemContext() がシステム指示として毎回注入される。
 * - 共通      : Vision プロンプト定数は両エージェントの処理パス (server.ts) で参照する。
 */

// ─────────────────────────────────────────────────────────────────────────────
// Vision プロンプト定数
// (仕様: docs/picoclaw-lock-login-spec.md — Vision 確認ステップ)
//
// NOTE: 言語化指示 (langInstruction) は呼び出し側で末尾に追加すること。
//       例: VISION_PROMPT_LOCK + langInstruction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ロック画面検出プロンプト。
 * 想定キーワード: LOCK_SCREEN | DESKTOP
 */
export const VISION_PROMPT_LOCK =
  'Is this a lock screen or a desktop?\n' +
  'Lock screen indicators:\n' +
  '- Windows: large clock/time, date, wallpaper background, no taskbar\n' +
  '- macOS: large time display centered, date below, wallpaper background, no Dock\n' +
  'Desktop indicators:\n' +
  '- Windows: taskbar at bottom with icons\n' +
  '- macOS: menu bar at top (Apple logo) and Dock at bottom with icons\n\n' +
  'Answer with ONLY one word: LOCK_SCREEN or DESKTOP'

/**
 * ログイン結果検証プロンプト。
 * 想定キーワード: LOGIN_SUCCESS | LOGIN_FAILED | LOCK_SCREEN
 */
export const VISION_PROMPT_LOGIN =
  'After a login attempt, what is currently shown on screen?\n' +
  'Look carefully for these specific indicators:\n' +
  '- Windows: TASKBAR at bottom (thin bar with icons) = LOGIN_SUCCESS\n' +
  '- macOS: Menu bar at top + Dock at bottom = LOGIN_SUCCESS\n' +
  '- Desktop icons, open windows, Start menu = LOGIN_SUCCESS\n' +
  '- "PIN is incorrect" or "password is incorrect" error text = LOGIN_FAILED\n' +
  '- Large clock display, user avatar with PIN/password input field = LOCK_SCREEN\n\n' +
  'IMPORTANT: If you see a taskbar/Dock/menu bar, it is LOGIN_SUCCESS.\n\n' +
  'Answer with ONLY one word: LOGIN_SUCCESS or LOGIN_FAILED or LOCK_SCREEN'

/**
 * Outlook 新規メール作成画面確認プロンプト。
 * 想定キーワード: COMPOSE_OPEN | COMPOSE_NOT_OPEN
 */
export const VISION_PROMPT_EMAIL_COMPOSE =
  'Look at the screen. Is a new email compose/draft form currently visible in Microsoft Outlook?\n\n' +
  'A new email COMPOSE FORM has ALL of the following:\n' +
  '  - A "To:" or "宛先:" address field (for entering recipient email address)\n' +
  '  - A "Subject:" or "件名:" text field\n' +
  '  - A large blank area for typing the email body\n\n' +
  'It may appear as a separate popup window OR as a full-screen/maximized compose view.\n\n' +
  'This is NOT a compose form:\n' +
  '  - The Outlook inbox list showing received emails (no blank To/Subject/Body entry fields)\n' +
  '  - A read-only email view / reading pane (showing content of a received email)\n' +
  '  - A dialog box or settings panel\n\n' +
  'Answer on line 1 with ONLY the classification keyword:\n' +
  '- COMPOSE_OPEN  — A compose form with blank To/Subject/Body fields is visible\n' +
  '- COMPOSE_NOT_OPEN — No compose form open (inbox view, reading pane, dialog, or other)\n' +
  'Line 2+: one sentence describing what is actually visible on screen.'

/**
 * Outlook メール送信完了確認プロンプト。
 * 想定キーワード: SENT_SUCCESS | SEND_ERROR | COMPOSE_OPEN
 */
export const VISION_PROMPT_EMAIL_SENT =
  'After pressing Ctrl+Enter to send an email in Outlook, what is the current screen state?\n\n' +
  'Answer on line 1 with ONLY the classification keyword:\n' +
  '- SENT_SUCCESS  — Send complete (compose window closed, returned to Inbox/mail list)\n' +
  '- SEND_ERROR    — Error dialog is visible (e.g. delivery failure, auth error)\n' +
  '- COMPOSE_OPEN  — Compose window is still open (email may not have been sent)\n' +
  'Line 2+: one sentence explanation.'

/**
 * 画面状態概要確認プロンプト (screen_check / status 用)。
 * 仕様: docs/picoclaw-lock-login-spec.md — 「画面状態確認機能」
 * 想定キーワード: DESKTOP | LOCK_SCREEN | LOGIN_SCREEN | DESCRIBED
 */
export const VISION_PROMPT_SCREEN_STATUS =
  'Analyze the current screen content and classify it.\n' +
  'Answer on line 1 with ONLY one classification keyword:\n' +
  '- DESKTOP    — Windows or macOS desktop is shown (taskbar/Dock/menu bar visible)\n' +
  '- LOCK_SCREEN — Lock screen is shown (large clock, wallpaper, no taskbar)\n' +
  '- LOGIN_SCREEN — Sign-in / PIN input screen is shown (input field visible)\n' +
  '- DESCRIBED  — None of the above (describe below)\n' +
  "Line 2+: one sentence describing what is visible on screen (in the user's language)."

// ─────────────────────────────────────────────────────────────────────────────
// zeroclaw システムコンテキスト
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the NanoKVM system context injected into every zeroclaw message.
 *
 * zeroclaw には NanoKVM 組み込みツールがないため、このシステム指示で
 * 「ハイレベルアクション (nanokvm_lock 等) を /v1/actions 経由で呼ぶ」
 * ことを LLM に伝える。picoclaw には注入しない（Go バイナリが直接処理）。
 *
 * @param language - User's language preference ('ja', 'en', etc.)
 */
export function buildNanokvmSystemContext(language: string): string {
  const respondLang =
    language === 'ja'
      ? '日本語'
      : language === 'zh' || language === 'zh_tw'
        ? '中国語'
        : language === 'ko'
          ? '韓国語'
          : 'English'

  return `[NanoKVM-USB Context]
You control a remote Windows PC via KVM. ASCII-only keyboard input. Respond in ${respondLang}.

API: POST http://127.0.0.1:18792/v1/actions

High-level actions (preferred for lock/login/email):
- {"action":"nanokvm_lock"} — Win+L lock + Vision verify
- {"action":"nanokvm_login"} — login via Vault (or add "params":{"password":"PIN"})
- {"action":"nanokvm_send_email","params":{"to":"addr","subject":"Hi","body":"text"}} — Outlook (ASCII only)

Low-level actions (other tasks only):
- {"action":"key_press","params":{"key":"Ctrl+C"}}
- {"action":"key_type","params":{"text":"hello"}}
- {"action":"screen_capture"}
- {"action":"mouse_click","params":{"x":100,"y":200,"button":"left"}}

Rules:
1. ONE action per request. Report result then STOP. Do NOT chain actions.
2. lock->nanokvm_lock only. login->nanokvm_login only.
3. nanokvm_lock/nanokvm_login have built-in verification. Do NOT add extra screen_capture after them.
4. If user asks to see the screen / capture / screenshot -> use screen_capture.
5. vault_locked -> ask user for master password.
6. Email: params must be ASCII. Collect to/subject/body, confirm, then send.
`
}

// ─────────────────────────────────────────────────────────────────────────────
// Intent detection helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect whether the user message likely intends a login operation.
 */
export function isLoginIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('login') ||
    lower.includes('log in') ||
    lower.includes('ログイン') ||
    lower.includes('sign in') ||
    lower.includes('サインイン') ||
    lower.includes('unlock') ||
    lower.includes('ロック解除') ||
    lower.includes('入って') ||
    lower.includes('パスワード') ||
    lower.includes('pin') ||
    lower.includes('password')
  )
}

/**
 * Detect whether the user message likely intends a lock operation.
 */
export function isLockIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('lock') ||
    lower.includes('ロック') ||
    lower.includes('画面ロック') ||
    lower.includes('スクリーンロック')
  )
}

/**
 * Detect whether the user message likely intends an email send operation.
 */
export function isEmailIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('email') ||
    lower.includes('e-mail') ||
    lower.includes('mail') ||
    lower.includes('メール') ||
    lower.includes('送信') ||
    lower.includes('outlook')
  )
}
