import { IpcEvents } from '@common/ipc-events'
import { KeyboardReport } from './keyboard/keyboard'

// Keyboard report instance for API typing
const keyboardReport = new KeyboardReport()

// ── Video Frame Freshness Monitoring ──────────────────────────────
// Tracks whether the HDMI capture device is actually delivering new frames.
// When the source PC is disconnected, the <video> element holds the last frame
// but no new frames arrive. We use requestVideoFrameCallback to detect this.
let lastVideoFrameTime = 0
let frameMonitorVideoElement: HTMLVideoElement | null = null
let frameMonitorIntervalId: ReturnType<typeof setInterval> | null = null

/** Threshold in ms — if no new frame arrives within this period, video is stale */
const FRAME_STALE_THRESHOLD_MS = 3000

/**
 * Start (or restart) frame delivery monitoring on the given <video> element.
 * Uses requestVideoFrameCallback to track when new frames are actually composed.
 */
function startFrameMonitor(video: HTMLVideoElement): void {
  const now = performance.now()
  // Already monitoring this element and receiving recent frames
  if (frameMonitorVideoElement === video && lastVideoFrameTime > 0 &&
      now - lastVideoFrameTime < FRAME_STALE_THRESHOLD_MS) {
    return
  }

  frameMonitorVideoElement = video
  lastVideoFrameTime = now // seed with current time to avoid immediate stale detection

  if (typeof video.requestVideoFrameCallback !== 'function') {
    console.warn('[API Handler] requestVideoFrameCallback not available — frame freshness check disabled')
    return
  }

  function onFrame(this: HTMLVideoElement, now: DOMHighResTimeStamp): void {
    lastVideoFrameTime = now
    try {
      video.requestVideoFrameCallback(onFrame)
    } catch {
      // callback chain broken (e.g. video source changed)
      frameMonitorVideoElement = null
    }
  }
  video.requestVideoFrameCallback(onFrame)
  console.log('[API Handler] Video frame monitor started')
}

/**
 * Returns true if the video stream is receiving fresh frames.
 */
function isVideoFresh(): boolean {
  if (lastVideoFrameTime === 0) return true // not yet monitoring — assume fresh
  return performance.now() - lastVideoFrameTime < FRAME_STALE_THRESHOLD_MS
}

/**
 * Type text through NanoKVM keyboard interface
 * Called by API server when picoclaw sends a keyboard command
 * @param slowMode - If true, use 300ms delay between characters for PIN field stability
 */
export async function typeText(text: string, slowMode: boolean = false): Promise<void> {
  const charDelay = slowMode ? 300 : 150
  
  for (const char of text) {
    // Press key
    await typeChar(char)
    
    // Wait between characters
    await new Promise((r) => setTimeout(r, charDelay))
  }
  
  // Ensure all keys are released at the end
  const releaseReport = keyboardReport.reset()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
}

async function typeChar(char: string): Promise<void> {
  const needsShift = char >= 'A' && char <= 'Z'
  
  // Press Shift if needed
  if (needsShift) {
    const shiftReport = keyboardReport.keyDown('ShiftLeft')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, shiftReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  const code = getCodeForChar(char)
  if (!code) {
    console.warn(`[API Handler] Unsupported character: ${char}`)
    // Release Shift if it was pressed and reset
    if (needsShift) {
      const releaseShift = keyboardReport.keyUp('ShiftLeft')
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
    }
    // Ensure clean state
    const resetReport = keyboardReport.reset()
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, resetReport)
    return
  }

  // Press key
  const pressReport = keyboardReport.keyDown(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
  
  await new Promise((r) => setTimeout(r, 30))
  
  // Release key
  const releaseReport = keyboardReport.keyUp(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
  
  await new Promise((r) => setTimeout(r, 30))
  
  // Release Shift if it was pressed
  if (needsShift) {
    const releaseShift = keyboardReport.keyUp('ShiftLeft')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
    await new Promise((r) => setTimeout(r, 30))
  }
  
  // Critical: Ensure all keys are released before next character
  const finalReset = keyboardReport.reset()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, finalReset)
  await new Promise((r) => setTimeout(r, 30))
}

function getCodeForChar(char: string): string | null {
  // Map common characters to keyboard codes
  if (char >= 'a' && char <= 'z') return 'Key' + char.toUpperCase()
  if (char >= 'A' && char <= 'Z') return 'Key' + char
  if (char >= '0' && char <= '9') return 'Digit' + char
  
  // Special characters
  const specialChars: Record<string, string> = {
    ' ': 'Space',
    '\n': 'Enter',
    '\t': 'Tab',
    '-': 'Minus',
    '=': 'Equal',
    '[': 'BracketLeft',
    ']': 'BracketRight',
    '\\': 'Backslash',
    ';': 'Semicolon',
    "'": 'Quote',
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    '`': 'Backquote'
  }
  
  return specialChars[char] || null
}

/**
 * Normalize common key name aliases to DOM KeyboardEvent.code format.
 * LLMs frequently use short names like "Win", "Ctrl", "Alt" instead of
 * "MetaLeft", "ControlLeft", "AltLeft", etc.
 */
const KEY_ALIASES: Record<string, string> = {
  // Modifier aliases (case-insensitive lookup done below)
  win: 'MetaLeft',
  windows: 'MetaLeft',
  meta: 'MetaLeft',
  super: 'MetaLeft',
  cmd: 'MetaLeft',
  command: 'MetaLeft',
  ctrl: 'ControlLeft',
  control: 'ControlLeft',
  alt: 'AltLeft',
  option: 'AltLeft',
  shift: 'ShiftLeft',
  // Right-side modifiers
  rctrl: 'ControlRight',
  ralt: 'AltRight',
  rshift: 'ShiftRight',
  rwin: 'MetaRight',
  // Special keys
  del: 'Delete',
  esc: 'Escape',
  return: 'Enter',
  bs: 'Backspace',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  pgdown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  printscreen: 'PrintScreen',
  prtsc: 'PrintScreen',
  scrolllock: 'ScrollLock',
  numlock: 'NumLock',
  capslock: 'CapsLock',
  contextmenu: 'ContextMenu',
  menu: 'ContextMenu'
}

function normalizeKeyName(key: string): string {
  // Already a valid DOM code? Return as-is
  // Check common patterns: "KeyX", "DigitN", "FN", "ArrowX", etc.
  if (/^(Key[A-Z]|Digit\d|F\d{1,2}|Arrow\w+|Control\w+|Shift\w+|Alt\w+|Meta\w+|Numpad\w+)$/.test(key)) {
    return key
  }

  // Check exact match in known keys (Enter, Tab, Space, Delete, etc.)
  const knownExact = [
    'Enter', 'Tab', 'Space', 'Backspace', 'Delete', 'Escape', 'Insert',
    'Home', 'End', 'PageUp', 'PageDown', 'CapsLock', 'NumLock', 'ScrollLock',
    'PrintScreen', 'Pause', 'ContextMenu',
    'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
    'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash'
  ]
  for (const k of knownExact) {
    if (key === k) return k
  }

  // Lookup alias (case-insensitive)
  const alias = KEY_ALIASES[key.toLowerCase()]
  if (alias) return alias

  // Single letter → KeyX
  if (/^[a-zA-Z]$/.test(key)) return 'Key' + key.toUpperCase()

  // Single digit → DigitN
  if (/^\d$/.test(key)) return 'Digit' + key

  // F-key (e.g. "F1" - "F24")
  if (/^[Ff]\d{1,2}$/.test(key)) return key.toUpperCase()

  console.warn(`[API Handler] Unknown key name "${key}", passing through as-is`)
  return key
}

/**
 * Send keyboard shortcut (e.g., Win+L, Ctrl+Alt+Del)
 * Accepts both DOM codes (MetaLeft, KeyL) and common aliases (Win, L, Ctrl, Alt, Del)
 */
export async function sendShortcut(keys: string[]): Promise<void> {
  const keyboardReport = new KeyboardReport()
  const normalizedKeys = keys.map(normalizeKeyName)
  console.log(`[API Handler] Shortcut: ${keys.join('+')} → ${normalizedKeys.join('+')}`)
  
  // Press all keys
  for (const key of normalizedKeys) {
    const pressReport = keyboardReport.keyDown(key)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  // Hold for a moment
  await new Promise((r) => setTimeout(r, 100))
  
  // Release all keys in reverse order
  for (let i = normalizedKeys.length - 1; i >= 0; i--) {
    const releaseReport = keyboardReport.keyUp(normalizedKeys[i])
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  // Final release
  const finalRelease = keyboardReport.reset()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, finalRelease)
}

/**
 * Click mouse button at current or specified position
 */
export async function clickMouse(button: string, x?: number, y?: number): Promise<void> {
  // Convert button name to button bits
  let buttonBits = 0
  switch (button) {
    case 'left':
      buttonBits = 0x01
      break
    case 'right':
      buttonBits = 0x02
      break
    case 'middle':
      buttonBits = 0x04
      break
  }

  // If coordinates are provided, move first
  if (x !== undefined && y !== undefined) {
    // TODO: Implement mouse move via IPC
    // For now, just click at current position
    console.log(`[API Handler] Mouse move to (${x}, ${y}) - not implemented yet`)
  }

  // Send click (press + release)
  await sendMouse(buttonBits, 0, 0)
  await new Promise((r) => setTimeout(r, 50))
  await sendMouse(0, 0, 0)
}

/**
 * Move mouse to specified position
 */
export async function moveMouse(x: number, y: number): Promise<void> {
  // TODO: Implement absolute mouse positioning
  console.log(`[API Handler] Mouse move to (${x}, ${y}) - not implemented yet`)
}

/**
 * Press and release a single key using a fresh KeyboardReport
 */
async function pressKey(code: string, holdMs: number = 50): Promise<void> {
  const kr = new KeyboardReport()
  const press = kr.keyDown(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, press)
  await new Promise((r) => setTimeout(r, holdMs))
  const release = kr.keyUp(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, release)
  await new Promise((r) => setTimeout(r, 30))
  // Ensure clean state
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, kr.reset())
}

/**
 * Login to Windows with PIN or username+password
 *
 * Windows lock screen behavior:
 *   - Win+L → shows clock/image lock screen
 *   - Any key press → shows PIN/password entry
 *   - PIN field is AUTO-FOCUSED (no click needed!)
 *
 * Simplified sequence:
 *   1. Space     → wake sign-in screen (shows PIN field)
 *   2. Wait 3s   → let Windows render the PIN input
 *   3. Backspace ×20 → clear any leftover characters (Ctrl+A doesn't work in PIN fields)
 *   4. Type PIN one character at a time
 *   5. Enter     → submit
 *
 * @param password - PIN code or password
 * @param username - Username (optional, for full login with username + password)
 */
export async function loginToWindows(password: string, username?: string): Promise<void> {
  // --- Step 0: Dismiss any leftover error dialog ---
  // If a previous login failed, Windows shows "PIN is incorrect" with OK button.
  // Press Escape to dismiss it before starting the login sequence.
  console.log('[API Handler] Step 0: Pressing Escape to dismiss any error dialog...')
  await pressKey('Escape')
  await new Promise((r) => setTimeout(r, 300))

  // --- Step 1: Wake sign-in screen ---
  console.log('[API Handler] Step 1: Pressing Space to wake sign-in screen...')
  await pressKey('Space')
  await new Promise((r) => setTimeout(r, 500))
  
  // Press Space again as backup wake
  console.log('[API Handler] Step 1b: Pressing Space again as backup...')
  await pressKey('Space')

  // Wait for PIN / password input to appear and auto-focus
  console.log('[API Handler] Step 2: Waiting 3s for sign-in screen...')
  await new Promise((r) => setTimeout(r, 3000))

  // --- Step 2: Clear any existing content with Backspace ---
  // Windows PIN field doesn't support Ctrl+A, so use Backspace
  console.log('[API Handler] Step 3: Clearing field with Backspace...')
  for (let i = 0; i < 20; i++) {
    await pressKey('Backspace', 30)
    await new Promise((r) => setTimeout(r, 30))
  }
  await new Promise((r) => setTimeout(r, 300))

  if (username) {
    // Full login: username → Tab → password → Enter
    console.log('[API Handler] Step 4: Typing username...')
    await typeText(username)
    await new Promise((r) => setTimeout(r, 300))

    console.log('[API Handler] Step 5: Pressing Tab...')
    await pressKey('Tab')
    await new Promise((r) => setTimeout(r, 300))

    console.log('[API Handler] Step 6: Typing password...')
    await typeText(password)
    await new Promise((r) => setTimeout(r, 300))

    console.log('[API Handler] Step 7: Pressing Enter...')
    await pressKey('Enter')
  } else {
    // PIN-only login
    console.log(`[API Handler] Step 4: Typing PIN (${password.length} chars)...`)
    await typeText(password, false) // 150ms per character
    await new Promise((r) => setTimeout(r, 300))

    console.log('[API Handler] Step 5: Pressing Enter...')
    await pressKey('Enter')
  }

  // Final safety: ensure all keys released
  const finalKr = new KeyboardReport()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, finalKr.reset())

  console.log('[API Handler] Login sequence completed')
}

async function sendMouse(buttons: number, deltaX: number, deltaY: number): Promise<void> {
  const data = [buttons, deltaX, deltaY]
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, data)
}

/**
 * Capture result with optional rejection reason for diagnostics
 */
interface CaptureResult {
  dataUrl: string | null
  rejectReason?: string
}

/**
 * Capture the current screen from the HDMI video feed.
 * Returns a base64 JPEG data URL, or null when the video stream is unavailable/stale.
 */
export async function captureScreen(): Promise<CaptureResult> {
  const video = document.getElementById('video') as HTMLVideoElement
  if (!video || !video.videoWidth || !video.videoHeight) {
    const reason = `video element not ready (exists=${!!video}, w=${video?.videoWidth}, h=${video?.videoHeight})`
    console.warn(`[API Handler] ${reason}`)
    return { dataUrl: null, rejectReason: reason }
  }

  // ── Check MediaStreamTrack health ──
  const stream = video.srcObject as MediaStream | null
  if (stream) {
    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length === 0) {
      return { dataUrl: null, rejectReason: 'no video tracks in stream' }
    }
    const track = videoTracks[0]
    console.log(`[API Handler] Track state: readyState=${track.readyState}, muted=${track.muted}, enabled=${track.enabled}`)
    if (track.readyState === 'ended') {
      return { dataUrl: null, rejectReason: 'video track ended' }
    }
    // NOTE: track.muted can be transiently true during signal re-acquisition.
    // Don't reject based on muted alone — let the black-screen pixel check handle it.
  } else {
    return { dataUrl: null, rejectReason: 'video.srcObject is null' }
  }

  // ── Ensure frame monitor is running ──
  startFrameMonitor(video)

  // ── Check frame freshness ──
  if (!isVideoFresh()) {
    const elapsed = Math.round(performance.now() - lastVideoFrameTime)
    return { dataUrl: null, rejectReason: `video stream frozen (no new frame for ${elapsed}ms)` }
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    console.warn('[API Handler] Failed to create canvas context')
    return { dataUrl: null, rejectReason: 'failed to create canvas context' }
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  // ── Black/no-signal screen detection ──
  // When the HDMI source PC is off or disconnected, the capture card often outputs
  // solid black frames. Detect this and return null to trigger the NO_VIDEO flow
  // instead of wasting a Vision LLM call on a black image.
  const checkSize = 32
  const checkCanvas = document.createElement('canvas')
  checkCanvas.width = checkSize
  checkCanvas.height = checkSize
  const checkCtx = checkCanvas.getContext('2d')
  if (checkCtx) {
    checkCtx.drawImage(video, 0, 0, checkSize, checkSize)
    const pixelData = checkCtx.getImageData(0, 0, checkSize, checkSize).data
    let totalBrightness = 0
    for (let i = 0; i < pixelData.length; i += 4) {
      totalBrightness += pixelData[i] + pixelData[i + 1] + pixelData[i + 2]
    }
    const avgBrightness = totalBrightness / (checkSize * checkSize * 3)
    console.log(`[API Handler] Black screen check: avgBrightness=${avgBrightness.toFixed(1)}`)
    if (avgBrightness < 3) {
      return { dataUrl: null, rejectReason: `black/no-signal screen (brightness=${avgBrightness.toFixed(1)})` }
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
  console.log(`[API Handler] Screen captured: ${canvas.width}x${canvas.height}, size: ${Math.round(dataUrl.length / 1024)}KB`)
  return { dataUrl }
}

/**
 * Initialize API event handlers
 * Call this in App.tsx useEffect
 */
export function initializeApiHandlers(): () => void {
  const handleKeyboardType = (_event, text: string): void => {
    console.log(`[API Handler] Typing text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`)
    typeText(text).catch((err) => {
      console.error('[API Handler] Failed to type text:', err)
    })
  }

  const handleKeyboardShortcut = (_event, keys: string[]): void => {
    console.log(`[API Handler] Sending shortcut: ${keys.join('+')}`)
    sendShortcut(keys).catch((err) => {
      console.error('[API Handler] Failed to send shortcut:', err)
    })
  }

  const handleMouseClick = (_event, params: { button: string; x?: number; y?: number }): void => {
    console.log(`[API Handler] Clicking ${params.button} button`, params.x, params.y)
    clickMouse(params.button, params.x, params.y).catch((err) => {
      console.error('[API Handler] Failed to click mouse:', err)
    })
  }

  const handleMouseMove = (_event, params: { x: number; y: number }): void => {
    console.log(`[API Handler] Moving mouse to (${params.x}, ${params.y})`)
    moveMouse(params.x, params.y).catch((err) => {
      console.error('[API Handler] Failed to move mouse:', err)
    })
  }

  // Wake screen by sending mouse click + keyboard key press
  // Uses both inputs for maximum compatibility — some PCs in S3 sleep
  // only respond to keyboard, not mouse.
  const handleMouseWake = async (_event): Promise<void> => {
    console.log('[API Handler] Sending mouse click + keyboard Space to wake screen')
    try {
      // 1. Mouse left click press + release
      const pressReport = [0x01, 0x01, 0x00, 0x00, 0x00]
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, pressReport)
      await new Promise((r) => setTimeout(r, 50))
      const releaseReport = [0x01, 0x00, 0x00, 0x00, 0x00]
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, releaseReport)

      await new Promise((r) => setTimeout(r, 100))

      // 2. Keyboard Space key press + release (HID usage code 0x2C)
      // Report: [modifiers, reserved, key1, key2, key3, key4, key5, key6]
      const spacePress = [0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x00]
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, spacePress)
      await new Promise((r) => setTimeout(r, 50))
      const spaceRelease = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, spaceRelease)

      console.log('[API Handler] Wake click + keyboard sent successfully')
    } catch (err) {
      console.error('[API Handler] Failed to send wake input:', err)
    }
  }

  const handleKeyboardLogin = (
    _event,
    params: { password: string; username?: string }
  ): void => {
    console.log(
      `[API Handler] Logging in ${params.username ? 'with username' : 'with PIN'}`
    )
    loginToWindows(params.password, params.username).catch((err) => {
      console.error('[API Handler] Failed to login:', err)
    })
  }

  const handleScreenCapture = (_event): void => {
    console.log('[API Handler] Screen capture requested')
    captureScreen().then((result) => {
      if (result.rejectReason) {
        console.warn(`[API Handler] Capture rejected: ${result.rejectReason}`)
      }
      // Send both dataUrl and reason through IPC
      window.electron.ipcRenderer.send(IpcEvents.SCREEN_CAPTURE_RESULT, result.dataUrl, result.rejectReason || null)
    }).catch((err) => {
      console.error('[API Handler] Failed to capture screen:', err)
      window.electron.ipcRenderer.send(IpcEvents.SCREEN_CAPTURE_RESULT, null, `exception: ${err}`)
    })
  }

  // Start frame freshness monitor when video becomes available
  frameMonitorIntervalId = setInterval(() => {
    const video = document.getElementById('video') as HTMLVideoElement
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      startFrameMonitor(video)
    }
  }, 2000)

  // Register IPC listeners
  window.electron.ipcRenderer.on('api:keyboard:type', handleKeyboardType)
  window.electron.ipcRenderer.on('api:keyboard:shortcut', handleKeyboardShortcut)
  window.electron.ipcRenderer.on('api:keyboard:login', handleKeyboardLogin)
  window.electron.ipcRenderer.on('api:mouse:click', handleMouseClick)
  window.electron.ipcRenderer.on('api:mouse:move', handleMouseMove)
  window.electron.ipcRenderer.on('api:mouse:wake', handleMouseWake)
  window.electron.ipcRenderer.on(IpcEvents.SCREEN_CAPTURE, handleScreenCapture)

  // Return cleanup function
  return () => {
    window.electron.ipcRenderer.removeListener('api:keyboard:type', handleKeyboardType)
    window.electron.ipcRenderer.removeListener('api:keyboard:shortcut', handleKeyboardShortcut)
    window.electron.ipcRenderer.removeListener('api:keyboard:login', handleKeyboardLogin)
    window.electron.ipcRenderer.removeListener('api:mouse:click', handleMouseClick)
    window.electron.ipcRenderer.removeListener('api:mouse:move', handleMouseMove)
    window.electron.ipcRenderer.removeListener('api:mouse:wake', handleMouseWake)
    window.electron.ipcRenderer.removeListener(IpcEvents.SCREEN_CAPTURE, handleScreenCapture)
    if (frameMonitorIntervalId) {
      clearInterval(frameMonitorIntervalId)
      frameMonitorIntervalId = null
    }
  }
}
