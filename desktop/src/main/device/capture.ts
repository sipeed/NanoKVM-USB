/**
 * Main-process screen capture via ffmpeg + AVFoundation.
 *
 * This module bypasses the renderer's getUserMedia/canvas pipeline and reads
 * frames directly from the USB capture card (e.g. NanoKVM-USB "USB3 Video")
 * through ffmpeg's AVFoundation input.
 *
 * Why: When macOS is locked or the display is off, the Electron renderer
 * throttles timers and freezes <video> frame delivery, making the
 * renderer-based captureScreen() unreliable. ffmpeg talks to AVFoundation
 * at the OS level and works regardless of GUI state.
 *
 * Usage: The ApiServer falls back to this when the renderer IPC capture
 * returns null or times out.
 */

import { spawn } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import path from 'path'

/**
 * Get the path to the bundled ffmpeg binary.
 * In production: <app>/Contents/Resources/bin/ffmpeg (via extraResources)
 * In development: uses ffmpeg-static npm package path
 */
function getBundledFfmpegPath(): string {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  if (app.isPackaged) {
    // Production: extraResources copies to Resources/bin/ffmpeg
    return path.join(process.resourcesPath, 'bin', exe)
  } else {
    // Development: use ffmpeg-static package path
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStaticPath = require('ffmpeg-static') as string
    return ffmpegStaticPath
  }
}

/** Search paths: bundled first, then common system locations */
function getFfmpegSearchPaths(): string[] {
  const paths = [getBundledFfmpegPath()]
  if (process.platform === 'darwin') {
    paths.push('/usr/local/bin/ffmpeg')      // Intel Homebrew
    paths.push('/opt/homebrew/bin/ffmpeg')    // Apple Silicon Homebrew
    paths.push('/usr/bin/ffmpeg')             // System
  } else if (process.platform === 'win32') {
    // Common Windows install locations
    paths.push('C:\\ffmpeg\\bin\\ffmpeg.exe')
    paths.push(`${process.env.LOCALAPPDATA || ''}\\ffmpeg\\bin\\ffmpeg.exe`)
  }
  return paths
}

/** Cached ffmpeg binary path (null = not yet searched, '' = not found) */
let cachedFfmpegPath: string | null = null

/** Cached video device index (null = not yet detected) */
let cachedDeviceIndex: number | null = null

/** Cached Windows DirectShow device name (null = not yet detected) */
let cachedDshowDeviceName: string | null = null

/** Known USB capture card name patterns */
const CAPTURE_DEVICE_PATTERNS = [
  'USB3 Video',
  'USB2.0 HD UVC',
  'nanokvm',
  'capture'  // generic, exclude "screen capture" variants
]

/** Check if a device name matches known USB capture card patterns */
function matchesCaptureDevice(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    name.includes('USB3 Video') ||
    name.includes('USB2.0 HD UVC') ||
    lower.includes('nanokvm') ||
    (lower.includes('capture') && !lower.includes('screen'))
  )
}

/**
 * Find the ffmpeg binary on the system.
 * Returns the absolute path or null if not found.
 */
export function findFfmpeg(): string | null {
  if (cachedFfmpegPath !== null) {
    return cachedFfmpegPath || null
  }

  for (const p of getFfmpegSearchPaths()) {
    if (p && existsSync(p)) {
      cachedFfmpegPath = p
      console.log(`[Capture] Found ffmpeg at: ${p}`)
      return p
    }
  }

  cachedFfmpegPath = ''
  console.warn('[Capture] ffmpeg not found on system')
  return null
}

/**
 * Check if ffmpeg-based capture is available on this system.
 * Supported on macOS (AVFoundation) and Windows (DirectShow).
 */
export function isFfmpegCaptureAvailable(): boolean {
  return (process.platform === 'darwin' || process.platform === 'win32') && findFfmpeg() !== null
}

/**
 * Detect the video capture device for the USB capture card.
 * - macOS: AVFoundation device index
 * - Windows: DirectShow device name
 *
 * Looks for device names containing "USB3 Video", "USB2.0 HD UVC", "NanoKVM", or "Capture".
 *
 * @returns device identifier (index for macOS, name for Windows) or null
 */
export async function detectCaptureDevice(): Promise<number | string | null> {
  if (process.platform === 'darwin') {
    return detectCaptureDeviceMac()
  } else if (process.platform === 'win32') {
    return detectCaptureDeviceWin()
  }
  return null
}

/** macOS: Detect AVFoundation device index */
async function detectCaptureDeviceMac(): Promise<number | null> {
  if (cachedDeviceIndex !== null) {
    return cachedDeviceIndex
  }

  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return null

  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, [
      '-f', 'avfoundation',
      '-list_devices', 'true',
      '-i', ''
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''
    proc.stderr?.on('data', (data) => { stderr += data.toString() })

    proc.on('close', () => {
      const lines = stderr.split('\n')
      let inVideoSection = false

      for (const line of lines) {
        if (line.includes('AVFoundation video devices:')) {
          inVideoSection = true
          continue
        }
        if (line.includes('AVFoundation audio devices:')) {
          break
        }
        if (!inVideoSection) continue

        const match = line.match(/\[(\d+)]\s+(.+)/)
        if (match) {
          const idx = parseInt(match[1])
          const name = match[2].trim()

          if (matchesCaptureDevice(name)) {
            cachedDeviceIndex = idx
            console.log(`[Capture] Found USB capture device (AVFoundation): [${idx}] ${name}`)
            resolve(idx)
            return
          }
        }
      }

      console.warn('[Capture] No USB capture device found in AVFoundation devices')
      resolve(null)
    })

    proc.on('error', (err) => {
      console.error('[Capture] Failed to list AVFoundation devices:', err)
      resolve(null)
    })

    setTimeout(() => { proc.kill(); resolve(null) }, 5000)
  })
}

/** Windows: Detect DirectShow device name */
async function detectCaptureDeviceWin(): Promise<string | null> {
  if (cachedDshowDeviceName !== null) {
    return cachedDshowDeviceName
  }

  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return null

  return new Promise((resolve) => {
    const proc = spawn(ffmpeg, [
      '-f', 'dshow',
      '-list_devices', 'true',
      '-i', 'dummy'
    ], { stdio: ['pipe', 'pipe', 'pipe'] })

    let stderr = ''
    proc.stderr?.on('data', (data) => { stderr += data.toString() })

    proc.on('close', () => {
      // Parse DirectShow device list from stderr
      // Format: [dshow @ ...] "USB3 Video" (video)
      //   or:   [dshow @ ...]  Alternative name
      const lines = stderr.split('\n')

      for (const line of lines) {
        // Match quoted device name: "Device Name"
        const match = line.match(/"([^"]+)"/)
        if (match) {
          const name = match[1].trim()
          if (matchesCaptureDevice(name)) {
            cachedDshowDeviceName = name
            console.log(`[Capture] Found USB capture device (DirectShow): "${name}"`)
            resolve(name)
            return
          }
        }
      }

      console.warn('[Capture] No USB capture device found in DirectShow devices')
      resolve(null)
    })

    proc.on('error', (err) => {
      console.error('[Capture] Failed to list DirectShow devices:', err)
      resolve(null)
    })

    setTimeout(() => { proc.kill(); resolve(null) }, 5000)
  })
}

/** Result of a native capture attempt */
export interface NativeCaptureResult {
  /** Base64 data URL (image/jpeg), or null on failure */
  dataUrl: string | null
  /** Rejection reason if dataUrl is null */
  rejectReason?: string
}

/**
 * Capture a single frame from the USB capture card via ffmpeg.
 *
 * Spawns ffmpeg to grab one frame, outputs JPEG to stdout as raw bytes,
 * then converts to base64 data URL.
 *
 * Works even when the OS screen is locked:
 * - macOS: ffmpeg uses AVFoundation's low-level API directly
 * - Windows: ffmpeg uses DirectShow (no GUI dependency)
 *
 * @param width  Capture width (default: 1920)
 * @param height Capture height (default: 1080)
 * @param quality JPEG quality 1-31, lower=better (default: 5)
 * @returns NativeCaptureResult
 */
export async function captureFrameNative(
  width: number = 1920,
  height: number = 1080,
  quality: number = 5
): Promise<NativeCaptureResult> {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    return { dataUrl: null, rejectReason: 'ffmpeg not available' }
  }

  const device = await detectCaptureDevice()
  if (device === null) {
    return { dataUrl: null, rejectReason: 'no USB capture device detected' }
  }

  // Build platform-specific ffmpeg arguments
  const args: string[] = []
  if (process.platform === 'darwin') {
    args.push(
      '-f', 'avfoundation',
      '-framerate', '30',
      '-video_size', `${width}x${height}`,
      '-i', `${device}`
    )
  } else if (process.platform === 'win32') {
    args.push(
      '-f', 'dshow',
      '-video_size', `${width}x${height}`,
      '-i', `video=${device}`
    )
  } else {
    return { dataUrl: null, rejectReason: `unsupported platform: ${process.platform}` }
  }
  // Output: single JPEG frame to stdout
  args.push(
    '-frames:v', '1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', `${quality}`,
    '-'
  )

  return new Promise((resolve) => {
    const startTime = Date.now()

    const proc = spawn(ffmpeg, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      chunks.push(data)
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      const elapsed = Date.now() - startTime

      if (code !== 0) {
        console.error(`[Capture] ffmpeg exited with code ${code} (${elapsed}ms)`)
        // Check for common errors
        if (stderr.includes('Device not found') || stderr.includes('No such device')) {
          cachedDeviceIndex = null // Reset cache so next attempt re-detects
          cachedDshowDeviceName = null
          resolve({ dataUrl: null, rejectReason: 'capture device not found (disconnected?)' })
        } else if (stderr.includes('Resource busy') || stderr.includes('Could not open')) {
          resolve({ dataUrl: null, rejectReason: 'capture device busy (in use by another process?)' })
        } else {
          resolve({ dataUrl: null, rejectReason: `ffmpeg error (code=${code})` })
        }
        return
      }

      if (chunks.length === 0) {
        resolve({ dataUrl: null, rejectReason: 'ffmpeg produced no output' })
        return
      }

      const buffer = Buffer.concat(chunks)
      if (buffer.length < 100) {
        resolve({ dataUrl: null, rejectReason: `ffmpeg output too small (${buffer.length} bytes)` })
        return
      }

      const base64 = buffer.toString('base64')
      const dataUrl = `data:image/jpeg;base64,${base64}`

      console.log(`[Capture] Native capture OK: ${buffer.length} bytes (${Math.round(buffer.length / 1024)}KB) in ${elapsed}ms`)

      // ── Black screen detection ──
      // Check zero-byte ratio — a real image has diverse byte values,
      // but a black frame from USB capture is almost entirely zero bytes.
      // Also check JPEG file size — solid black frames compress very small.
      const zeroCount = buffer.reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0)
      const zeroRatio = zeroCount / buffer.length
      if (zeroRatio > 0.90) {
        console.warn(`[Capture] Frame is ${(zeroRatio * 100).toFixed(1)}% zero bytes — black/no-signal screen`)
        resolve({ dataUrl: null, rejectReason: `black/no-signal screen (${(zeroRatio * 100).toFixed(0)}% zero bytes)` })
        return
      }
      if (buffer.length < 2000) {
        console.warn(`[Capture] Frame suspiciously small (${buffer.length} bytes), may be black/no-signal`)
        // Still return the frame — let the caller/Vision decide
      }

      resolve({ dataUrl })
    })

    proc.on('error', (err) => {
      console.error('[Capture] Failed to spawn ffmpeg:', err)
      resolve({ dataUrl: null, rejectReason: `spawn error: ${err.message}` })
    })

    // Safety timeout — ffmpeg should complete within 5 seconds for a single frame
    setTimeout(() => {
      proc.kill('SIGKILL')
      resolve({ dataUrl: null, rejectReason: 'ffmpeg capture timed out (5s)' })
    }, 5000)
  })
}

/**
 * Reset cached device detection (e.g., when USB device is reconnected).
 */
export function resetCaptureCache(): void {
  cachedDeviceIndex = null
  cachedDshowDeviceName = null
  console.log('[Capture] Device cache cleared')
}
