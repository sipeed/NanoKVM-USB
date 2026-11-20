import { describe, expect, it } from 'vitest'

import { Device } from '../device'
import { CmdEvent, CmdPacket, InfoPacket } from '../proto'
import type { SerialTransport } from '../transport'

function createTransport(overrides: Partial<SerialTransport> = {}): SerialTransport & {
  writes: number[][]
} {
  const writes: number[][] = []

  const transport: SerialTransport & { writes: number[][] } = {
    writes,
    kind: 'ipc',
    isSupported: () => true,
    supportsEnumeration: () => true,
    list: async () => [],
    request: async () => {},
    open: async () => {},
    close: async () => {},
    read: async () => [],
    write: async (data: number[]) => {
      writes.push(data)
    },
    onDisconnect: () => () => {},
    ...overrides
  }

  return transport
}

describe('CmdPacket', () => {
  it('encodes an empty packet with checksum', () => {
    const packet = new CmdPacket(0x00, CmdEvent.GET_INFO)
    expect(packet.encode()).toEqual([0x57, 0xab, 0x00, 0x01, 0x00, 0x03])
  })

  it('encodes data length and checksum', () => {
    const packet = new CmdPacket(0x01, CmdEvent.SEND_KB_GENERAL_DATA, [1, 2, 3])
    // 0x57 + 0xab + 0x01 + 0x02 + 0x03 + 1 + 2 + 3 = 0x110 -> 0x0e
    expect(packet.encode()).toEqual([0x57, 0xab, 0x01, 0x02, 0x03, 1, 2, 3, 0x0e])
  })

  it('round-trips an empty-data packet through decode', () => {
    const encoded = new CmdPacket(0x02, CmdEvent.GET_PARA_CFG).encode()
    const decoded = new CmdPacket(-1, -1, encoded)

    expect(decoded.ADDR).toBe(0x02)
    expect(decoded.CMD).toBe(CmdEvent.GET_PARA_CFG)
    expect(decoded.LEN).toBe(0)
    expect(decoded.DATA).toEqual([])
  })

  it('locks the legacy checksum quirk of decode', () => {
    // decode() 的求和区间比 encode() 少最后一个字节（历史实现如此，两端共用）。
    // 数据包 encode 后直接 decode 会校验失败，此处锁定该行为，避免被无意修改。
    const encoded = new CmdPacket(0x02, CmdEvent.SEND_MS_ABS_DATA, [9, 8, 7]).encode()
    const decoded = new CmdPacket(-1, -1, encoded)

    expect(decoded.decode(encoded)).toBe(-1)
  })

  it('finds the header after garbage bytes', () => {
    const encoded = new CmdPacket(0x00, CmdEvent.GET_INFO).encode()
    const decoded = new CmdPacket(-1, -1, [0xff, 0x00, ...encoded])

    expect(decoded.CMD).toBe(CmdEvent.GET_INFO)
  })

  it('rejects a bad checksum', () => {
    const encoded = new CmdPacket(0x00, CmdEvent.GET_INFO).encode()
    encoded[encoded.length - 1] ^= 0xff

    expect(new CmdPacket(-1, -1, encoded).decode(encoded)).toBe(-1)
  })

  it('rejects a missing header', () => {
    expect(new CmdPacket(-1, -1, [0x00, 0x01, 0x02, 0x03, 0x04, 0x05]).decode([0, 1, 2])).toBe(-1)
  })

  it('rejects a truncated packet', () => {
    const encoded = new CmdPacket(0x00, CmdEvent.GET_INFO).encode()

    expect(new CmdPacket(-1, -1, encoded.slice(0, 4)).decode(encoded.slice(0, 4))).toBe(-1)
  })
})

describe('InfoPacket', () => {
  it('parses version, connection and lock states', () => {
    // 0x32 -> V1.2, connected, caps lock (bit 1) + scroll lock (bit 2)
    const info = new InfoPacket([0x32, 0x01, 0b110])
    expect(info.CHIP_VERSION).toBe('V1.2')
    expect(info.IS_CONNECTED).toBe(true)
    expect(info.NUM_LOCK).toBe(false)
    expect(info.CAPS_LOCK).toBe(true)
    expect(info.SCROLL_LOCK).toBe(true)
  })

  it('parses a disconnected device', () => {
    const info = new InfoPacket([0x30, 0x00, 0x00])
    expect(info.CHIP_VERSION).toBe('V1.0')
    expect(info.IS_CONNECTED).toBe(false)
    expect(info.CAPS_LOCK).toBe(false)
  })

  it('throws on a version older than 0x30', () => {
    expect(() => new InfoPacket([0x2f, 0x00, 0x00])).toThrow('version error')
  })
})

describe('Device', () => {
  it('writes encoded keyboard reports', async () => {
    const transport = createTransport()
    const device = new Device(transport)

    await device.sendKeyboardData([0x01, 0x02])

    expect(transport.writes).toHaveLength(1)
    expect(transport.writes[0]).toEqual([0x57, 0xab, 0x00, 0x02, 0x02, 0x01, 0x02, 0x09])
  })

  it('uses the relative mouse command for report[0] === 0x01', async () => {
    const transport = createTransport()
    const device = new Device(transport)

    await device.sendMouseData([0x01, 0x0a, 0x0b, 0x00])

    expect(transport.writes[0]?.[3]).toBe(CmdEvent.SEND_MS_REL_DATA)
  })

  it('uses the absolute mouse command otherwise', async () => {
    const transport = createTransport()
    const device = new Device(transport)

    await device.sendMouseData([0x02, 0x01, 0x00, 0x02, 0x00, 0x00])

    expect(transport.writes[0]?.[3]).toBe(CmdEvent.SEND_MS_ABS_DATA)
  })

  it('ignores empty mouse reports', async () => {
    const transport = createTransport()
    const device = new Device(transport)

    await device.sendMouseData([])

    expect(transport.writes).toHaveLength(0)
  })

  it('queries device info over the transport', async () => {
    const transport = createTransport({
      read: async () => [0x57, 0xab, 0x00, 0x01, 0x03, 0x33, 0x01, 0x00, 0x3a]
    })
    const device = new Device(transport)

    const info = await device.getInfo()

    expect(transport.writes[0]?.[3]).toBe(CmdEvent.GET_INFO)
    expect(info.CHIP_VERSION).toBe('V1.3')
    expect(info.IS_CONNECTED).toBe(true)
  })
})
