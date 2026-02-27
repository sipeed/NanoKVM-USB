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
import { existsSync } from 'fs'

/** Common ffmpeg installation paths on macOS */
const FFMPEG_SEARCH_PATHS = [
  '/usr/local/bin/ffmpeg',
  '/opt/homebrew/bin/ffmpeg',
  '/usr/bin/ffmpeg'
]

/** Cached ffmpeg binary path (null = not yet searched, '' = not found) */
let cachedFfmpegPath: string | null = null

/** Cached video device index (null = not yet detected) */
let cachedDeviceIndex: number | null = null

/**
 * Find the ffmpeg binary on the system.
 * Returns the absolute path or null if not found.
 */
export function findFfmpeg(): string | null {
  if (cachedFfmpegPath !== null) {
    return cachedFfmpegPath || null
  }

  for (const p of FFMPEG_SEARCH_PATHS) {
    if (existsSync(p)) {
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
 */
export function isFfmpegCaptureAvailable(): boolean {
  return process.platform === 'darwin' && findFfmpeg() !== null
}

/**
 * Detect the AVFoundation video device index for the USB capture card.
 * Looks for device names containing "USB3 Video", "USB2.0 HD UVC", "NanoKVM", or "Capture".
 *
 * @returns device index or null
 */
export async function detectCaptureDevice(): Promise<number | null> {
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
      // Parse video device list from stderr
      // Format: [AVFoundation indev @ ...] [0] USB3 Video
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

        // Match: [index] Device Name
        const match = line.match(/\[(\d+)]\s+(.+)/)
        if (match) {
          const idx = parseInt(match[1])
          const name = match[2].trim()

          // Match known USB capture card names
          if (
            name.includes('USB3 Video') ||
            name.includes('USB2.0 HD UVC') ||
            name.toLowerCase().includes('nanokvm') ||
            (name.toLowerCase().includes('capture') && !name.toLowerCase().includes('screen'))
          ) {
            cachedDeviceIndex = idx
            console.log(`[Capture] Found USB capture device: [${idx}] ${name}`)
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

    // The -list_devices command exits immediately, but set a safety timeout
    setTimeout(() => {
      proc.kill()
      resolve(null)
    }, 5000)
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
 * The capture works even when macOS is locked or the display is off,
 * because ffmpeg uses AVFoundation's low-level API directly.
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

  const deviceIndex = await detectCaptureDevice()
  if (deviceIndex === null) {
    return { dataUrl: null, rejectReason: 'no USB capture device detected' }
  }

  return new Promise((resolve) => {
    const startTime = Date.now()

    const proc = spawn(ffmpeg, [
      '-f', 'avfoundation',
      '-framerate', '30',
      '-video_size', `${width}x${height}`,
      '-i', `${deviceIndex}`,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      '-q:v', `${quality}`,
      '-'
    ], {
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

      // ── Black screen detection (same logic as renderer) ──
      // Check JPEG file size — solid black frames compress very small
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
  console.log('[Capture] Device cache cleared')
}
