/**
 * Main-process Windows login sequence.
 *
 * This module runs in the Electron main process (Node.js) so that
 * setTimeout / delays are NOT frozen when macOS is locked.
 * It writes HID reports directly via the Device serial-port interface.
 */

import { device } from './index'

// ── HID keycode helpers ──────────────────────────────────────────

/** Subset of USB HID keycodes needed for login sequences */
const HID: Record<string, number> = {
  // Letters
  KeyA: 0x04, KeyB: 0x05, KeyC: 0x06, KeyD: 0x07,
  KeyE: 0x08, KeyF: 0x09, KeyG: 0x0a, KeyH: 0x0b,
  KeyI: 0x0c, KeyJ: 0x0d, KeyK: 0x0e, KeyL: 0x0f,
  KeyM: 0x10, KeyN: 0x11, KeyO: 0x12, KeyP: 0x13,
  KeyQ: 0x14, KeyR: 0x15, KeyS: 0x16, KeyT: 0x17,
  KeyU: 0x18, KeyV: 0x19, KeyW: 0x1a, KeyX: 0x1b,
  KeyY: 0x1c, KeyZ: 0x1d,
  // Digits
  Digit0: 0x27, Digit1: 0x1e, Digit2: 0x1f, Digit3: 0x20,
  Digit4: 0x21, Digit5: 0x22, Digit6: 0x23, Digit7: 0x24,
  Digit8: 0x25, Digit9: 0x26,
  // Specials
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b,
  Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
  BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31,
  Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38
}

/** Modifier bits for the first byte of the HID keyboard report */
const MOD_LSHIFT = 0x02

/** Character → { code, shift } mapping */
function charToHid(ch: string): { code: number; shift: boolean } | null {
  if (ch >= 'a' && ch <= 'z') return { code: HID['Key' + ch.toUpperCase()]!, shift: false }
  if (ch >= 'A' && ch <= 'Z') return { code: HID['Key' + ch]!, shift: true }
  if (ch >= '0' && ch <= '9') return { code: HID['Digit' + ch]!, shift: false }

  const specials: Record<string, { code: number; shift: boolean }> = {
    ' ': { code: HID.Space, shift: false },
    '-': { code: HID.Minus, shift: false },
    '=': { code: HID.Equal, shift: false },
    '[': { code: HID.BracketLeft, shift: false },
    ']': { code: HID.BracketRight, shift: false },
    '\\': { code: HID.Backslash, shift: false },
    ';': { code: HID.Semicolon, shift: false },
    "'": { code: HID.Quote, shift: false },
    '`': { code: HID.Backquote, shift: false },
    ',': { code: HID.Comma, shift: false },
    '.': { code: HID.Period, shift: false },
    '/': { code: HID.Slash, shift: false },
    // Shifted symbols
    '!': { code: HID.Digit1, shift: true },
    '@': { code: HID.Digit2, shift: true },
    '#': { code: HID.Digit3, shift: true },
    '$': { code: HID.Digit4, shift: true },
    '%': { code: HID.Digit5, shift: true },
    '^': { code: HID.Digit6, shift: true },
    '&': { code: HID.Digit7, shift: true },
    '*': { code: HID.Digit8, shift: true },
    '(': { code: HID.Digit9, shift: true },
    ')': { code: HID.Digit0, shift: true },
    '_': { code: HID.Minus, shift: true },
    '+': { code: HID.Equal, shift: true },
    '{': { code: HID.BracketLeft, shift: true },
    '}': { code: HID.BracketRight, shift: true },
    '|': { code: HID.Backslash, shift: true },
    ':': { code: HID.Semicolon, shift: true },
    '"': { code: HID.Quote, shift: true },
    '~': { code: HID.Backquote, shift: true },
    '<': { code: HID.Comma, shift: true },
    '>': { code: HID.Period, shift: true },
    '?': { code: HID.Slash, shift: true }
  }
  return specials[ch] ?? null
}

// ── Low-level send helpers ───────────────────────────────────────

const ZERO_REPORT = [0, 0, 0, 0, 0, 0, 0, 0]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function sendKb(report: number[]): Promise<void> {
  await device.sendKeyboardData(report)
}

async function sendMs(report: number[]): Promise<void> {
  await device.sendMouseData(report)
}

/** Press and release a single key */
async function pressKey(keyName: string, holdMs = 50): Promise<void> {
  const code = HID[keyName]
  if (code === undefined) {
    console.warn(`[Login] Unknown key: ${keyName}`)
    return
  }
  await sendKb([0, 0, code, 0, 0, 0, 0, 0])
  await sleep(holdMs)
  await sendKb(ZERO_REPORT)
  await sleep(30)
}

/** Type a single character (handles Shift for uppercase / symbols) */
async function typeChar(ch: string): Promise<void> {
  const mapping = charToHid(ch)
  if (!mapping) {
    console.warn(`[Login] Unsupported char: ${ch}`)
    return
  }
  const mod = mapping.shift ? MOD_LSHIFT : 0
  // Press
  await sendKb([mod, 0, mapping.code, 0, 0, 0, 0, 0])
  await sleep(30)
  // Release
  await sendKb(ZERO_REPORT)
  await sleep(30)
}

/** Type a string character by character */
async function typeText(text: string, charDelay = 150): Promise<void> {
  for (const ch of text) {
    await typeChar(ch)
    await sleep(charDelay)
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Login to Windows with PIN or username+password.
 *
 * Runs entirely in the main process so macOS lock-screen
 * cannot freeze the timers.
 *
 * @param password  - PIN or password string
 * @param username  - If provided, uses username+Tab+password flow
 * @param skipWake  - If true, skip S3 wake sequence (screen already confirmed awake)
 *
 * Sequence (full):
 *   0. Escape         → dismiss leftover error dialog
 *   1. Mouse click + Space → wake from S3 sleep   (skipped if skipWake)
 *   1b. Wait 5 s      → HDMI signal stabilisation (skipped if skipWake)
 *   2. Space ×2        → transition lock-screen → PIN entry
 *   2b. Wait 1.5 s    → let Windows render the PIN input
 *   3. Backspace ×10   → clear leftover characters
 *   4. Type PIN / username+Tab+password
 *   5. Enter           → submit
 */
export async function loginToWindows(
  password: string,
  username?: string,
  skipWake = false
): Promise<void> {
  // ── Step 0: Dismiss leftover error dialog ──
  console.log('[Login] Step 0: Escape to dismiss error dialog')
  await pressKey('Escape')
  await sleep(200)

  if (!skipWake) {
    // ── Step 1: Wake from S3 sleep ──
    console.log('[Login] Step 1: Mouse click + Space to wake')
    try {
      // Relative-mode mouse left-click press
      await sendMs([0x01, 0x01, 0x00, 0x00, 0x00])
      await sleep(50)
      // Release
      await sendMs([0x01, 0x00, 0x00, 0x00, 0x00])
      await sleep(100)
    } catch (err) {
      console.warn('[Login] Mouse wake failed (non-fatal):', err)
    }
    await pressKey('Space')

    console.log('[Login] Step 1b: Waiting 5 s for S3 wake + HDMI sync')
    await sleep(5000)
  } else {
    console.log('[Login] Step 1: Skipped wake (screen already confirmed awake)')
  }

  // ── Step 2: Lock-screen → PIN entry ──
  console.log('[Login] Step 2: Space ×2 to show PIN entry')
  await pressKey('Space')
  await sleep(400)
  await pressKey('Space')

  console.log('[Login] Step 2b: Waiting 1.5 s for PIN entry field')
  await sleep(1500)

  // ── Step 3: Clear any leftover content ──
  console.log('[Login] Step 3: Backspace ×10 to clear field')
  for (let i = 0; i < 10; i++) {
    await pressKey('Backspace', 30)
    await sleep(20)
  }
  await sleep(200)

  if (username) {
    // Full login: username → Tab → password → Enter
    console.log('[Login] Step 4: Typing username')
    await typeText(username, 80)
    await sleep(200)

    console.log('[Login] Step 5: Tab')
    await pressKey('Tab')
    await sleep(200)

    console.log('[Login] Step 6: Typing password')
    await typeText(password, 80)
    await sleep(200)

    console.log('[Login] Step 7: Enter')
    await pressKey('Enter')
  } else {
    // PIN-only login
    console.log(`[Login] Step 4: Typing PIN (${password.length} chars)`)
    await typeText(password, 80)
    await sleep(200)

    console.log('[Login] Step 5: Enter')
    await pressKey('Enter')
  }

  // Final safety: release all keys
  await sendKb(ZERO_REPORT)
  console.log('[Login] Login sequence completed')
}
