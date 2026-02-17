import { IpcEvents } from '@common/ipc-events'
import { KeyboardReport } from './keyboard/keyboard'

// Keyboard report instance for API typing
const keyboardReport = new KeyboardReport()

/**
 * Type text through NanoKVM keyboard interface
 * Called by API server when picoclaw sends a keyboard command
 */
export async function typeText(text: string): Promise<void> {
  for (const char of text) {
    // Press key
    await typeChar(char)
    
    // Wait between characters
    await new Promise((r) => setTimeout(r, 100))
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
    // Release Shift if it was pressed
    if (needsShift) {
      const releaseShift = keyboardReport.keyUp('ShiftLeft')
      await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
    }
    return
  }

  // Press key
  const pressReport = keyboardReport.keyDown(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
  
  await new Promise((r) => setTimeout(r, 50))
  
  // Release key
  const releaseReport = keyboardReport.keyUp(code)
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseReport)
  
  // Release Shift if it was pressed
  if (needsShift) {
    await new Promise((r) => setTimeout(r, 20))
    const releaseShift = keyboardReport.keyUp('ShiftLeft')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, releaseShift)
  }
}

function getCodeForChar(char: string): string | null {
  const ascii = char.charCodeAt(0)
  
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
 * Send keyboard shortcut (e.g., Win+L, Ctrl+Alt+Del)
 */
export async function sendShortcut(keys: string[]): Promise<void> {
  const keyboardReport = new KeyboardReport()
  
  // Press all keys
  for (const key of keys) {
    const pressReport = keyboardReport.keyDown(key)
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, pressReport)
    await new Promise((r) => setTimeout(r, 20))
  }
  
  // Hold for a moment
  await new Promise((r) => setTimeout(r, 100))
  
  // Release all keys in reverse order
  for (let i = keys.length - 1; i >= 0; i--) {
    const releaseReport = keyboardReport.keyUp(keys[i])
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
 * Login to Windows with PIN or username+password
 * @param password - PIN code or password
 * @param username - Username (optional, for full login)
 */
export async function loginToWindows(password: string, username?: string): Promise<void> {
  const keyboardReport = new KeyboardReport()
  
  if (username) {
    // Full login: username → Tab → password → Enter
    console.log('[API Handler] Performing full login with username')
    
    // Type username
    await typeText(username)
    await new Promise((r) => setTimeout(r, 200))
    
    // Press Tab to move to password field
    const tabPress = keyboardReport.keyDown('Tab')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, tabPress)
    await new Promise((r) => setTimeout(r, 50))
    const tabRelease = keyboardReport.keyUp('Tab')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, tabRelease)
    await new Promise((r) => setTimeout(r, 200))
    
    // Type password
    await typeText(password)
    await new Promise((r) => setTimeout(r, 200))
    
    // Press Enter
    const enterPress = keyboardReport.keyDown('Enter')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, enterPress)
    await new Promise((r) => setTimeout(r, 50))
    const enterRelease = keyboardReport.keyUp('Enter')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, enterRelease)
  } else {
    // PIN-only login: password → Enter
    console.log('[API Handler] Performing PIN login')
    
    // Type PIN
    await typeText(password)
    await new Promise((r) => setTimeout(r, 200))
    
    // Press Enter
    const enterPress = keyboardReport.keyDown('Enter')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, enterPress)
    await new Promise((r) => setTimeout(r, 50))
    const enterRelease = keyboardReport.keyUp('Enter')
    await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, enterRelease)
  }
  
  // Final cleanup
  const finalRelease = keyboardReport.reset()
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, finalRelease)
  
  console.log('[API Handler] Login sequence completed')
}

async function sendKeyboard(modifier: number, code: number): Promise<void> {
  const keys = [modifier, 0, code, 0, 0, 0, 0, 0]
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD, keys)
}

async function sendMouse(buttons: number, deltaX: number, deltaY: number): Promise<void> {
  const data = [buttons, deltaX, deltaY]
  await window.electron.ipcRenderer.invoke(IpcEvents.SEND_MOUSE, data)
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

  // Register IPC listeners
  window.electron.ipcRenderer.on('api:keyboard:type', handleKeyboardType)
  window.electron.ipcRenderer.on('api:keyboard:shortcut', handleKeyboardShortcut)
  window.electron.ipcRenderer.on('api:keyboard:login', handleKeyboardLogin)
  window.electron.ipcRenderer.on('api:mouse:click', handleMouseClick)
  window.electron.ipcRenderer.on('api:mouse:move', handleMouseMove)

  // Return cleanup function
  return () => {
    window.electron.ipcRenderer.removeListener('api:keyboard:type', handleKeyboardType)
    window.electron.ipcRenderer.removeListener('api:keyboard:shortcut', handleKeyboardShortcut)
    window.electron.ipcRenderer.removeListener('api:keyboard:login', handleKeyboardLogin)
    window.electron.ipcRenderer.removeListener('api:mouse:click', handleMouseClick)
    window.electron.ipcRenderer.removeListener('api:mouse:move', handleMouseMove)
  }
}
