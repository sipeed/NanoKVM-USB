// Platform backends for the uncompressed-capture engine. Each backend
// enumerates devices/modes and provides the command for a capture process
// that writes raw yuyv422 (YUY2) frames to stdout.
//
//  - macOS: bundled nanokvm-capture Swift helper (native AVFoundation —
//    ffmpeg's avfoundation input silently freezes on >=1080p uncompressed
//    frames). Reports the actually-delivered dimensions via a stderr META
//    line (awaitMeta).
//  - Windows: system ffmpeg with DirectShow (devices are addressed by name).
//  - Linux: system ffmpeg with V4L2 (devices are addressed by /dev/videoN).
import { execFile } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import type { Backend, Mode, ResolvedCapture, StreamSpec } from './engine'

function ffmpegPath(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/snap/bin/ffmpeg'
  ].filter(Boolean) as string[]
  return candidates.find((p) => existsSync(p)) || 'ffmpeg'
}

function execStderr(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, (_err, _stdout, stderr) => resolve(stderr || ''))
  })
}

const LOW_LATENCY_ARGS = [
  '-hide_banner',
  '-loglevel',
  'error',
  '-fflags',
  'nobuffer',
  '-flags',
  'low_delay'
]
const RAW_OUT_ARGS = ['-pix_fmt', 'yuyv422', '-f', 'rawvideo', '-']

// ---------------------------------------------------------------- macOS ----

const HELPER_CANDIDATES = [
  process.env.NANOKVM_CAPTURE_PATH,
  // packaged: resources/ is asarUnpacked (binaries can't execute from asar)
  join(__dirname, '../../resources/nanokvm-capture').replace('app.asar', 'app.asar.unpacked')
].filter(Boolean) as string[]

function helperPath(): string {
  const p = HELPER_CANDIDATES.find((c) => existsSync(c))
  if (!p) throw new Error('nanokvm-capture helper not found (build it with pnpm build:capture)')
  return p
}

type HelperFormat = { pixfmt: string; width: number; height: number; fps: number[] }
type HelperDevice = { name: string; formats: HelperFormat[] }

function helperList(): Promise<HelperDevice[]> {
  return new Promise((resolve) => {
    execFile(helperPath(), ['list'], (_err, stdout) => {
      try {
        resolve(JSON.parse(stdout).devices as HelperDevice[])
      } catch {
        resolve([])
      }
    })
  })
}

const darwin: Backend = {
  async listDevices() {
    return (await helperList()).map((d) => ({ id: d.name, name: d.name }))
  },

  async listModes(id: string) {
    const device = (await helperList()).find((d) => d.name === id)
    const modes = new Map<string, Mode>()
    for (const f of device?.formats ?? []) {
      if (f.pixfmt !== 'yuvs') continue
      const key = `${f.width}x${f.height}`
      const mode = modes.get(key) || { width: f.width, height: f.height, fps: [] }
      for (const v of f.fps) if (v && !mode.fps.includes(v)) mode.fps.push(v)
      modes.set(key, mode)
    }
    return [...modes.values()]
  },

  streamSpec(r: ResolvedCapture): StreamSpec {
    return {
      command: helperPath(),
      args: [
        'stream',
        '--device',
        r.device,
        '--width',
        String(r.width),
        '--height',
        String(r.height),
        '--fps',
        String(r.fps)
      ],
      awaitMeta: true
    }
  }
}

// -------------------------------------------------------------- Windows ----

const dshow: Backend = {
  async listDevices() {
    const stderr = await execStderr(ffmpegPath(), [
      '-hide_banner',
      '-list_devices',
      'true',
      '-f',
      'dshow',
      '-i',
      'dummy'
    ])
    const devices: { id: string; name: string }[] = []
    for (const m of stderr.matchAll(/"(.+?)"\s+\(video\)/g)) {
      devices.push({ id: m[1], name: m[1] })
    }
    return devices
  },

  async listModes(id: string) {
    const stderr = await execStderr(ffmpegPath(), [
      '-hide_banner',
      '-list_options',
      'true',
      '-f',
      'dshow',
      '-i',
      `video=${id}`
    ])
    const modes = new Map<string, Mode>()
    for (const m of stderr.matchAll(/pixel_format=yuyv422.*?max s=(\d+)x(\d+) fps=([\d.]+)/g)) {
      const width = Number(m[1])
      const height = Number(m[2])
      const fps = Number(m[3])
      const key = `${width}x${height}`
      const mode = modes.get(key) || { width, height, fps: [] }
      if (fps && !mode.fps.includes(fps)) mode.fps.push(fps)
      modes.set(key, mode)
    }
    return [...modes.values()]
  },

  streamSpec(r: ResolvedCapture): StreamSpec {
    return {
      command: ffmpegPath(),
      args: [
        ...LOW_LATENCY_ARGS,
        '-f',
        'dshow',
        '-rtbufsize',
        '128M',
        '-pixel_format',
        'yuyv422',
        '-video_size',
        `${r.width}x${r.height}`,
        '-framerate',
        String(r.fps),
        '-i',
        `video=${r.device}`,
        ...RAW_OUT_ARGS
      ],
      awaitMeta: false
    }
  }
}

// ---------------------------------------------------------------- Linux ----

const v4l2: Backend = {
  async listDevices() {
    let nodes: string[] = []
    try {
      nodes = readdirSync('/dev').filter((f) => /^video\d+$/.test(f))
    } catch {
      /* no /dev access */
    }
    nodes.sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))
    return nodes.map((node) => {
      let name = node
      try {
        name = readFileSync(`/sys/class/video4linux/${node}/name`, 'utf8').trim()
      } catch {
        /* sysfs name unavailable */
      }
      return { id: `/dev/${node}`, name: `${name} (/dev/${node})` }
    })
  },

  async listModes(id: string) {
    // "[video4linux2 ...] Raw : yuyv422 : YUYV 4:2:2 : 640x480 1280x720 ..."
    const stderr = await execStderr(ffmpegPath(), [
      '-hide_banner',
      '-f',
      'v4l2',
      '-list_formats',
      'all',
      '-i',
      id
    ])
    const modes: Mode[] = []
    const line = stderr.split('\n').find((l) => l.includes('yuyv422'))
    if (line) {
      for (const m of line.matchAll(/(\d+)x(\d+)/g)) {
        // fps per size isn't listed here; the driver clamps to what it supports
        modes.push({ width: Number(m[1]), height: Number(m[2]), fps: [] })
      }
    }
    return modes
  },

  streamSpec(r: ResolvedCapture): StreamSpec {
    return {
      command: ffmpegPath(),
      args: [
        ...LOW_LATENCY_ARGS,
        '-f',
        'v4l2',
        '-input_format',
        'yuyv422',
        '-video_size',
        `${r.width}x${r.height}`,
        '-framerate',
        String(r.fps),
        '-i',
        r.device,
        ...RAW_OUT_ARGS
      ],
      awaitMeta: false
    }
  }
}

export function pickBackend(): Backend {
  if (process.platform === 'darwin') return darwin
  if (process.platform === 'win32') return dshow
  return v4l2
}
