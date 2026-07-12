// Uncompressed (YUY2/yuyv422) capture engine. A platform backend (see
// backends.ts) enumerates devices and provides a capture process that writes
// raw frames to stdout; this module assembles exact-size frames (O(n) fill
// buffer — a naive Buffer.concat is O(n^2) and throttles the pipeline) and
// pushes each one to the renderer over a MessagePortMain.
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { performance } from 'perf_hooks'
import type { MessagePortMain } from 'electron'

import { pickBackend } from './backends'

export type CaptureDevice = { index: number; name: string }
export type CaptureOptions = {
  deviceName?: string
  deviceIndex?: number
  width: number
  height: number
  fps: number
  requestId?: number
}
export type Mode = { width: number; height: number; fps: number[] }
// device is the backend-specific id: AVFoundation/DirectShow device NAME
// (indices are not stable — e.g. Continuity cameras shift the macOS list),
// or the /dev/videoN path on Linux.
export type ResolvedCapture = { device: string; width: number; height: number; fps: number }
export type StreamSpec = {
  command: string
  args: string[]
  // true: the process reports actually-delivered dimensions via a stderr
  // "META {json}" line before frames flow (the capture stack may serve the
  // signal-native mode regardless of the request). false: frames are exactly
  // the requested size, and the first stdout data signals a healthy start.
  awaitMeta: boolean
}
export type Backend = {
  listDevices(): Promise<{ id: string; name: string }[]>
  listModes(id: string): Promise<Mode[]>
  streamSpec(resolved: ResolvedCapture): StreamSpec
}

const backend = pickBackend()

const nowAbs = (): number => performance.timeOrigin + performance.now()

/** Enumerate video capture devices. */
export async function listDevices(): Promise<CaptureDevice[]> {
  return (await backend.listDevices()).map((d, index) => ({ index, name: d.name }))
}

/** Pick the most likely capture device when the caller doesn't specify one. */
function autoPick<T extends { name: string }>(devices: T[]): T | undefined {
  return (
    devices.find(
      (d) =>
        /usb|video|capture|hdmi|kvm/i.test(d.name) &&
        !/facetime|desk view|iphone|capture screen/i.test(d.name)
    ) || devices[0]
  )
}

/**
 * Resolve a requested capture to a device + a mode the device advertises.
 * If the requested resolution isn't offered, fall back to the largest one.
 */
export async function resolveCapture(opts: CaptureOptions): Promise<ResolvedCapture> {
  const devices = await backend.listDevices()
  const byName = opts.deviceName ? devices.find((d) => d.name === opts.deviceName) : undefined
  const byIndex = opts.deviceIndex !== undefined ? devices[opts.deviceIndex] : undefined
  const device = byName || byIndex || autoPick(devices)
  if (!device) throw new Error('no capture device found')

  const modes = await backend.listModes(device.id)

  let { width, height } = opts
  let mode = modes.find((m) => m.width === width && m.height === height)
  if (!mode && modes.length) {
    mode = modes.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
    width = mode.width
    height = mode.height
  }

  // Highest advertised fps <= requested (small tolerance), else the lowest.
  // Backends that don't report per-mode rates (v4l2) leave fps empty and the
  // driver clamps the requested rate itself.
  let fps = opts.fps
  if (mode && mode.fps.length) {
    const candidates = [...mode.fps].sort((a, b) => a - b)
    const atMost = candidates.filter((f) => f <= opts.fps + 0.5)
    fps = atMost.length ? atMost[atMost.length - 1] : candidates[0]
  }

  return { device: device.id, width, height, fps }
}

export class CaptureSession {
  private proc: ChildProcessWithoutNullStreams | null = null
  private stopping = false

  /**
   * Spawn the capture process and resolve with the frame dimensions once the
   * stream is up (META line, or first data for exact-size backends). Frames
   * then flow to `port`.
   */
  start(
    port: MessagePortMain,
    opts: ResolvedCapture,
    onError: (msg: string) => void
  ): Promise<{ width: number; height: number }> {
    this.stopping = false

    const spec = backend.streamSpec(opts)
    const proc = spawn(spec.command, spec.args)
    this.proc = proc

    return new Promise((resolve, reject) => {
      let stderr = ''
      let seq = 0
      let started = false

      const startupTimeout = setTimeout(() => {
        if (!started) {
          this.stop()
          reject(new Error('capture start timed out'))
        }
      }, 10000)

      const begin = (width: number, height: number): void => {
        started = true
        clearTimeout(startupTimeout)
        attachPump(width, height)
        resolve({ width, height })
      }

      const attachPump = (width: number, height: number): void => {
        const frameBytes = width * height * 2 // yuyv422
        const frameBuf = Buffer.allocUnsafe(frameBytes)
        let filled = 0

        // Ack-based backpressure: only one frame in flight; while the renderer
        // is busy the freshest frame waits in pendingBuf (older ones drop).
        // Flooding the port faster than the renderer draws backs up the message
        // queue and starves its event loop (input goes dead).
        let rendererReady = true
        let hasPending = false
        const pendingBuf = Buffer.allocUnsafe(frameBytes)

        const post = (buf: Buffer): void => {
          const ab = new ArrayBuffer(frameBytes)
          new Uint8Array(ab).set(buf)
          rendererReady = false
          try {
            port.postMessage({ seq: seq++, emitAbs: nowAbs(), width, height, buf: ab })
          } catch {
            this.stop()
          }
        }

        port.on('message', () => {
          if (hasPending) {
            hasPending = false
            post(pendingBuf)
          } else {
            rendererReady = true
          }
        })

        proc.stdout.on('data', (chunk: Buffer) => {
          let off = 0
          while (off < chunk.length) {
            const take = Math.min(frameBytes - filled, chunk.length - off)
            chunk.copy(frameBuf, filled, off, off + take)
            filled += take
            off += take
            if (filled < frameBytes) break

            filled = 0
            if (rendererReady) {
              post(frameBuf)
            } else {
              frameBuf.copy(pendingBuf)
              hasPending = true
            }
          }
        })
      }

      if (spec.awaitMeta) {
        proc.stderr.on('data', (d: Buffer) => {
          const text = d.toString()
          const meta = text.match(/^META\s+(\{.*\})/m)
          if (meta && !started) {
            try {
              const { width, height } = JSON.parse(meta[1])
              begin(width, height)
            } catch (e) {
              this.stop()
              clearTimeout(startupTimeout)
              reject(e)
            }
            return
          }
          stderr += text
        })
      } else {
        proc.stderr.on('data', (d: Buffer) => {
          stderr += d.toString()
        })
        proc.stdout.once('data', () => {
          if (!started) begin(opts.width, opts.height)
        })
      }

      proc.on('close', () => {
        const wasCurrent = this.proc === proc
        if (wasCurrent) this.proc = null
        clearTimeout(startupTimeout)
        // Any unexpected end (device unplugged, signal loss) => notify the
        // renderer so it doesn't keep showing a frozen frame.
        if (wasCurrent && !this.stopping) {
          const msg = stderr.trim() || 'capture ended (device disconnected?)'
          if (started) onError(msg)
          else reject(new Error(msg))
        }
      })
      proc.on('error', (e) => {
        clearTimeout(startupTimeout)
        const err = e as NodeJS.ErrnoException
        const msg =
          err.code === 'ENOENT'
            ? spec.awaitMeta
              ? `capture helper not found: ${spec.command}`
              : 'FFmpeg not found — install FFmpeg or set FFMPEG_PATH'
            : e.message
        if (started) onError(msg)
        else reject(new Error(msg))
      })
    })
  }

  stop(): void {
    this.stopping = true
    if (this.proc) {
      const proc = this.proc
      this.proc = null
      // Graceful first: SIGINT lets the process tear down the capture session
      // cleanly (hard kills can wedge the device / camera daemon). On Windows
      // there are no signals — ffmpeg quits on 'q' via stdin.
      try {
        if (process.platform === 'win32') {
          proc.stdin.write('q')
        } else {
          proc.kill('SIGINT')
        }
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          /* already gone */
        }
      }, 1500)
    }
  }

  get running(): boolean {
    return this.proc !== null
  }
}
