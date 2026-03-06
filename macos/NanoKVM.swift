import AppKit
import AudioToolbox
import AVFoundation
import CoreMedia
import VideoToolbox
import UniformTypeIdentifiers

struct Config {
    static let windowWidth:  CGFloat = 1280
    static let windowHeight: CGFloat = 720
    static var scrollDirection = -1
    static var scrollSpeed: Double = 0.01
    static let flushInterval = 1.0 / 30.0
    static var mouseAbsolute = true
    static var cursorHidden = false
}

final class AudioRingBuffer {
    private var buf: [Float32]
    private let cap: Int
    private let mask: Int
    private var ri = 0, wi = 0, n = 0
    private var lock = os_unfair_lock()

    init(capacity: Int) {
        assert(capacity > 0 && capacity & (capacity - 1) == 0, "capacity must be power of 2")
        cap = capacity
        mask = capacity - 1
        buf = [Float32](repeating: 0, count: capacity)
    }

    func write(_ src: UnsafePointer<Float32>, count: Int) {
        os_unfair_lock_lock(&lock)
        buf.withUnsafeMutableBufferPointer { bp in
            let first = min(count, cap - wi)
            memcpy(bp.baseAddress! + wi, src, first * MemoryLayout<Float32>.stride)
            if first < count {
                memcpy(bp.baseAddress!, src + first, (count - first) * MemoryLayout<Float32>.stride)
            }
        }
        wi = (wi + count) & mask
        let overflow = (n + count) - cap
        if overflow > 0 { ri = (ri + overflow) & mask }
        n = min(cap, n + count)
        os_unfair_lock_unlock(&lock)
    }

    func read(_ dst: UnsafeMutablePointer<Float32>, count: Int) {
        os_unfair_lock_lock(&lock)
        if n < count {
            memset(dst, 0, count * MemoryLayout<Float32>.size)
        } else {
            buf.withUnsafeMutableBufferPointer { bp in
                let first = min(count, cap - ri)
                memcpy(dst, bp.baseAddress! + ri, first * MemoryLayout<Float32>.stride)
                if first < count {
                    memcpy(dst + first, bp.baseAddress!, (count - first) * MemoryLayout<Float32>.stride)
                }
            }
            ri = (ri + count) & mask
            n -= count
        }
        os_unfair_lock_unlock(&lock)
    }

    func drain() {
        os_unfair_lock_lock(&lock)
        ri = 0; wi = 0; n = 0
        os_unfair_lock_unlock(&lock)
    }
}

class SerialPort {
    private var fd: Int32 = -1
    private let writeQueue = DispatchQueue(label: "com.nanokvm.serial", qos: .userInitiated)
    private var sendBuf = [UInt8](repeating: 0, count: 32)
    var isOpen: Bool { fd >= 0 }
    func open(path: String) -> Bool {
        fd = Darwin.open(path, O_RDWR | O_NOCTTY | O_NONBLOCK)
        guard fd >= 0 else { return false }
        var tty = termios()
        tcgetattr(fd, &tty)
        cfsetispeed(&tty, speed_t(B57600))
        cfsetospeed(&tty, speed_t(B57600))
        cfmakeraw(&tty)
        tty.c_cflag |= tcflag_t(CS8 | CLOCAL | CREAD)
        tty.c_cflag &= ~tcflag_t(PARENB | CSTOPB)
        withUnsafeMutablePointer(to: &tty.c_cc) {
            let p = UnsafeMutableRawPointer($0).assumingMemoryBound(to: cc_t.self)
            p[Int(VMIN)] = 0; p[Int(VTIME)] = 5
        }
        tcsetattr(fd, TCSANOW, &tty)
        let flags = fcntl(fd, F_GETFL)
        _ = fcntl(fd, F_SETFL, flags & ~O_NONBLOCK)
        // Drain any pending data instead of blocking sleep
        var drain = [UInt8](repeating: 0, count: 64)
        _ = Darwin.read(fd, &drain, drain.count)
        return true
    }
    func close() {
        writeQueue.sync {
            guard fd >= 0 else { return }
            Darwin.close(fd); fd = -1
        }
    }
    private func send(cmd: UInt8, data: [UInt8]) {
        guard fd >= 0, data.count <= 26 else { return }
        writeQueue.async { [self] in
            guard self.fd >= 0 else { return }
            let n = data.count
            let len = 6 + n
            sendBuf[0]=0x57;sendBuf[1]=0xAB;sendBuf[2]=0x00;sendBuf[3]=cmd;sendBuf[4]=UInt8(n)
            for i in 0..<n { sendBuf[5+i] = data[i] }
            var s: UInt32 = 0
            for i in 0..<(5+n) { s += UInt32(sendBuf[i]) }
            sendBuf[5+n] = UInt8(s & 0xFF)
            let written = sendBuf.withUnsafeBufferPointer {
                Darwin.write(self.fd, $0.baseAddress!, len)
            }
            if written < 0 {
                Darwin.close(self.fd); self.fd = -1
                DispatchQueue.main.async { print("Serial: device disconnected") }
            }
        }
    }
    func sendKeyboard(_ r: [UInt8]) { send(cmd: 0x02, data: r) }
    func sendMouseAbsolute(_ r: [UInt8]) { send(cmd: 0x04, data: r) }
    func sendMouseRelative(_ r: [UInt8]) { send(cmd: 0x05, data: r) }
    func getInfo(completion: @escaping ([UInt8]?) -> Void) {
        writeQueue.async { [self] in
            guard fd >= 0 else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            var b = [UInt8](repeating: 0, count: 32)
            b[0]=0x57;b[1]=0xAB;b[2]=0x00;b[3]=0x01;b[4]=0x01;b[5]=0x00
            var s: UInt32 = 0
            for i in 0..<6 { s += UInt32(b[i]) }
            b[6] = UInt8(s & 0xFF)
            _ = b.withUnsafeBufferPointer { Darwin.write(fd, $0.baseAddress!, 7) }
            var resp = [UInt8](repeating: 0, count: 8)
            let result = Darwin.read(fd, &resp, 8) == 8 ? resp : nil
            DispatchQueue.main.async { completion(result) }
        }
    }
}

class KeyboardHID {
    private var mods: UInt8 = 0
    private var keys = [UInt8]()
    private var buf: [UInt8] = [0,0,0,0,0,0,0,0]
    func keyDown(_ h: UInt8) -> [UInt8] {
        if let m = modBit(h) { mods |= m }
        else if !keys.contains(h) && keys.count < 6 { keys.append(h) }
        return report()
    }
    func keyUp(_ h: UInt8) -> [UInt8] {
        if let m = modBit(h) { mods &= ~m }
        else { keys.removeAll { $0 == h } }
        return report()
    }
    func releaseAll() -> [UInt8] { mods = 0; keys.removeAll(); return report() }
    private func report() -> [UInt8] {
        buf[0] = mods; buf[1] = 0
        for i in 0..<6 { buf[2+i] = i < keys.count ? keys[i] : 0 }
        return buf
    }
    private func modBit(_ h: UInt8) -> UInt8? {
        switch h {
        case 0xE0: return 0x01; case 0xE1: return 0x02
        case 0xE2: return 0x04; case 0xE3: return 0x08
        case 0xE4: return 0x10; case 0xE5: return 0x20
        case 0xE6: return 0x40; case 0xE7: return 0x80
        default: return nil
        }
    }
}

class MouseHID {
    var buttons: UInt8 = 0
    private var absReport: [UInt8] = [0x02, 0, 0, 0, 0, 0, 0]
    private var relReport: [UInt8] = [0x01, 0, 0, 0, 0]
    func buttonDown(_ b: Int) { buttons |= bit(b) }
    func buttonUp(_ b: Int) { buttons &= ~bit(b) }
    func build(nx: Double, ny: Double, scroll: Int = 0) -> [UInt8] {
        let x = UInt16(clamping: Int(max(0,min(1,nx))*4095))
        let y = UInt16(clamping: Int(max(0,min(1,ny))*4095))
        absReport[1] = buttons
        absReport[2] = UInt8(x&0xFF); absReport[3] = UInt8(x>>8)
        absReport[4] = UInt8(y&0xFF); absReport[5] = UInt8(y>>8)
        absReport[6] = UInt8(bitPattern: Int8(clamping: max(-127,min(127,scroll))))
        return absReport
    }
    func buildRelative(dx: Int, dy: Int, scroll: Int = 0) -> [UInt8] {
        relReport[1] = buttons
        relReport[2] = UInt8(bitPattern: Int8(clamping: dx))
        relReport[3] = UInt8(bitPattern: Int8(clamping: dy))
        relReport[4] = UInt8(bitPattern: Int8(clamping: scroll))
        return relReport
    }
    func reset() -> [UInt8] { buttons = 0; return build(nx:0,ny:0) }
    private func bit(_ b: Int) -> UInt8 {
        switch b {
        case 0: return 0x01; case 1: return 0x02; case 2: return 0x04
        case 3: return 0x08; case 4: return 0x10; default: return 0
        }
    }
}

// macOS virtual keycode → USB HID usage ID (flat array, index = keycode)
// Keycodes verified against Carbon/HIToolbox kVK constants
let macToHID: [UInt8] = {
    var t = [UInt8](repeating: 0, count: 128)
    // Letters – left hand
    t[0x00]=0x04; t[0x01]=0x16; t[0x02]=0x07; t[0x03]=0x09; t[0x04]=0x0B // a s d f h
    t[0x05]=0x0A; t[0x06]=0x1D; t[0x07]=0x1B; t[0x08]=0x06; t[0x09]=0x19 // g z x c v
    t[0x0B]=0x05; t[0x0C]=0x14; t[0x0D]=0x1A; t[0x0E]=0x08; t[0x0F]=0x15 // b q w e r
    t[0x10]=0x1C; t[0x11]=0x17                                             // y t
    // Letters – right hand
    t[0x20]=0x18; t[0x22]=0x0C; t[0x1F]=0x12; t[0x23]=0x13               // u i o p
    t[0x26]=0x0D; t[0x28]=0x0E; t[0x25]=0x0F                               // j k l
    t[0x2D]=0x11; t[0x2E]=0x10                                             // n m
    // Numbers
    t[0x12]=0x1E; t[0x13]=0x1F; t[0x14]=0x20; t[0x15]=0x21               // 1 2 3 4
    t[0x17]=0x22; t[0x16]=0x23                                             // 5 6
    t[0x1A]=0x24; t[0x1C]=0x25; t[0x19]=0x26; t[0x1D]=0x27               // 7 8 9 0
    // Punctuation
    t[0x1B]=0x2D; t[0x18]=0x2E                                             // - =
    t[0x21]=0x2F; t[0x1E]=0x30; t[0x2A]=0x31                               // [ ] backslash
    t[0x29]=0x33; t[0x27]=0x34; t[0x32]=0x35                               // ; ' `
    t[0x2B]=0x36; t[0x2F]=0x37; t[0x2C]=0x38                               // , . /
    // Special keys
    t[0x24]=0x28; t[0x30]=0x2B; t[0x31]=0x2C; t[0x33]=0x2A               // Return Tab Space Backspace
    t[0x35]=0x29; t[0x39]=0x39                                             // Escape CapsLock
    // Modifiers
    t[0x37]=0xE3; t[0x36]=0xE7; t[0x38]=0xE1; t[0x3C]=0xE5               // LCmd RCmd LShift RShift
    t[0x3A]=0xE2; t[0x3D]=0xE6; t[0x3B]=0xE0; t[0x3E]=0xE4               // LOpt ROpt LCtrl RCtrl
    // Function keys
    t[0x7A]=0x3A; t[0x78]=0x3B; t[0x63]=0x3C; t[0x76]=0x3D               // F1-F4
    t[0x60]=0x3E; t[0x61]=0x3F; t[0x62]=0x40; t[0x64]=0x41               // F5-F8
    t[0x65]=0x42; t[0x6D]=0x43; t[0x67]=0x44; t[0x6F]=0x45               // F9-F12
    // Navigation
    t[0x72]=0x49; t[0x73]=0x4A; t[0x74]=0x4B; t[0x75]=0x4C               // Insert Home PgUp FwdDel
    t[0x77]=0x4D; t[0x79]=0x4E                                             // End PgDn
    // Arrow keys
    t[0x7B]=0x50; t[0x7C]=0x4F; t[0x7D]=0x51; t[0x7E]=0x52               // ← → ↓ ↑
    // Keypad
    t[0x52]=0x62; t[0x53]=0x59; t[0x54]=0x5A; t[0x55]=0x5B               // KP 0 1 2 3
    t[0x56]=0x5C; t[0x57]=0x5D; t[0x58]=0x5E; t[0x59]=0x5F               // KP 4 5 6 7
    t[0x5B]=0x60; t[0x5C]=0x61; t[0x41]=0x63                               // KP 8 9 .
    t[0x4B]=0x54; t[0x43]=0x55; t[0x4E]=0x56; t[0x45]=0x57               // KP / * - +
    t[0x4C]=0x58; t[0x51]=0x67                                             // KP Enter KP =
    return t
}()

func hidForKey(_ keyCode: UInt16) -> UInt8? {
    let k = Int(keyCode)
    guard k < macToHID.count else { return nil }
    let h = macToHID[k]
    return h != 0 ? h : nil
}

// ASCII character → (HID keycode, needsShift) for paste-as-typing
let asciiToHID: [Character: (UInt8, Bool)] = [
    "a":(0x04,false), "b":(0x05,false), "c":(0x06,false), "d":(0x07,false),
    "e":(0x08,false), "f":(0x09,false), "g":(0x0A,false), "h":(0x0B,false),
    "i":(0x0C,false), "j":(0x0D,false), "k":(0x0E,false), "l":(0x0F,false),
    "m":(0x10,false), "n":(0x11,false), "o":(0x12,false), "p":(0x13,false),
    "q":(0x14,false), "r":(0x15,false), "s":(0x16,false), "t":(0x17,false),
    "u":(0x18,false), "v":(0x19,false), "w":(0x1A,false), "x":(0x1B,false),
    "y":(0x1C,false), "z":(0x1D,false),
    "A":(0x04,true), "B":(0x05,true), "C":(0x06,true), "D":(0x07,true),
    "E":(0x08,true), "F":(0x09,true), "G":(0x0A,true), "H":(0x0B,true),
    "I":(0x0C,true), "J":(0x0D,true), "K":(0x0E,true), "L":(0x0F,true),
    "M":(0x10,true), "N":(0x11,true), "O":(0x12,true), "P":(0x13,true),
    "Q":(0x14,true), "R":(0x15,true), "S":(0x16,true), "T":(0x17,true),
    "U":(0x18,true), "V":(0x19,true), "W":(0x1A,true), "X":(0x1B,true),
    "Y":(0x1C,true), "Z":(0x1D,true),
    "1":(0x1E,false), "2":(0x1F,false), "3":(0x20,false), "4":(0x21,false),
    "5":(0x22,false), "6":(0x23,false), "7":(0x24,false), "8":(0x25,false),
    "9":(0x26,false), "0":(0x27,false),
    "!":(0x1E,true), "@":(0x1F,true), "#":(0x20,true), "$":(0x21,true),
    "%":(0x22,true), "^":(0x23,true), "&":(0x24,true), "*":(0x25,true),
    "(":(0x26,true), ")":(0x27,true),
    " ":(0x2C,false),
    "-":(0x2D,false), "=":(0x2E,false), "[":(0x2F,false), "]":(0x30,false),
    "\\":(0x31,false), ";":(0x33,false), "'":(0x34,false), "`":(0x35,false),
    ",":(0x36,false), ".":(0x37,false), "/":(0x38,false),
    "_":(0x2D,true), "+":(0x2E,true), "{":(0x2F,true), "}":(0x30,true),
    "|":(0x31,true), ":":(0x33,true), "\"":(0x34,true), "~":(0x35,true),
    "<":(0x36,true), ">":(0x37,true), "?":(0x38,true),
]

// MARK: - Toolbar

extension NSToolbarItem.Identifier {
    static let video    = NSToolbarItem.Identifier("video")
    static let audio    = NSToolbarItem.Identifier("audio")
    static let serial   = NSToolbarItem.Identifier("serial")
    static let keyboard = NSToolbarItem.Identifier("keyboard")
    static let mouse    = NSToolbarItem.Identifier("mouse")
    static let record   = NSToolbarItem.Identifier("record")
}

// MARK: - Helper Functions

func findSerialPorts() -> [String] {
    let fm = FileManager.default
    guard let devs = try? fm.contentsOfDirectory(atPath: "/dev") else { return [] }
    var seen = Set<String>()
    var ports = [String]()
    for prefix in ["cu.usbmodem", "cu.usbserial", "cu.usb"] {
        for d in devs where d.hasPrefix(prefix) {
            let path = "/dev/" + d
            if seen.insert(path).inserted { ports.append(path) }
        }
    }
    return ports
}

func findCaptureDevices() -> [AVCaptureDevice] {
    var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera]
    if #available(macOS 14.0, *) { types.insert(.external, at: 0) }
    else { types.insert(.externalUnknown, at: 0) }
    return AVCaptureDevice.DiscoverySession(
        deviceTypes: types, mediaType: .video, position: .unspecified).devices
}

func findAudioCaptureDevices() -> [AVCaptureDevice] {
    var types: [AVCaptureDevice.DeviceType]
    if #available(macOS 14.0, *) { types = [.external, .microphone] }
    else { types = [.externalUnknown, .builtInMicrophone] }
    return AVCaptureDevice.DiscoverySession(
        deviceTypes: types, mediaType: .audio, position: .unspecified).devices
        .filter { !$0.uniqueID.contains("CADefaultDeviceAggregate") }
}

func findMatchingAudioDevice(for videoDevice: AVCaptureDevice) -> AVCaptureDevice? {
    let audioDevices = findAudioCaptureDevices()
    guard !audioDevices.isEmpty else { return nil }
    let vTransport = videoDevice.transportType
    let sameTransport = audioDevices.filter { $0.transportType == vTransport }
    if sameTransport.count == 1 { return sameTransport[0] }
    if sameTransport.count > 1 {
        let vName = videoDevice.localizedName.lowercased()
        let vMfr = videoDevice.manufacturer.lowercased()
        for dev in sameTransport {
            let aName = dev.localizedName.lowercased()
            let aMfr = dev.manufacturer.lowercased()
            if !vMfr.isEmpty && !aMfr.isEmpty && vMfr == aMfr { return dev }
            if vName.split(separator: " ").first == aName.split(separator: " ").first { return dev }
        }
        return sameTransport[0]
    }
    return nil
}

func audioDeviceID(for device: AVCaptureDevice) -> AudioDeviceID? {
    let uid = device.uniqueID as CFString
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyTranslateUIDToDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var deviceID: AudioDeviceID = 0
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    var qualifier = uid
    let err = withUnsafePointer(to: &qualifier) { ptr in
        AudioObjectGetPropertyData(
            AudioObjectID(kAudioObjectSystemObject), &addr,
            UInt32(MemoryLayout<CFString>.size), ptr,
            &size, &deviceID)
    }
    return err == noErr ? deviceID : nil
}

// Called by USB hardware when new input samples are available
func audioInputCallback(
    _ inRefCon: UnsafeMutableRawPointer,
    _ ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
    _ inTimeStamp: UnsafePointer<AudioTimeStamp>,
    _ inBusNumber: UInt32,
    _ inNumberFrames: UInt32,
    _ ioData: UnsafeMutablePointer<AudioBufferList>?
) -> OSStatus {
    let app = Unmanaged<AppDelegate>.fromOpaque(inRefCon).takeUnretainedValue()
    guard let inputUnit = app.audioInputUnit, let ring = app.audioRingBuffer,
          let ptr = app.audioRenderBuf else { return noErr }
    let samples = Int(inNumberFrames) * 2
    var abl = AudioBufferList(
        mNumberBuffers: 1,
        mBuffers: AudioBuffer(mNumberChannels: 2,
                              mDataByteSize: UInt32(samples * 4),
                              mData: UnsafeMutableRawPointer(ptr)))
    let err = AudioUnitRender(inputUnit, ioActionFlags, inTimeStamp, inBusNumber, inNumberFrames, &abl)
    if err == noErr {
        ring.write(ptr, count: samples)
        // Peak detection for audio-triggered background refresh
        if app.refreshTimer != nil {
            var peak = false
            for i in 0..<samples {
                if fabsf(ptr[i]) > 0.01 { peak = true; break }
            }
            if peak {
                DispatchQueue.main.async { app.audioTriggeredRefresh() }
            }
        }
    }
    return noErr
}

// Called by speakers when they need more samples
func audioOutputCallback(
    _ inRefCon: UnsafeMutableRawPointer,
    _ ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
    _ inTimeStamp: UnsafePointer<AudioTimeStamp>,
    _ inBusNumber: UInt32,
    _ inNumberFrames: UInt32,
    _ ioData: UnsafeMutablePointer<AudioBufferList>?
) -> OSStatus {
    let app = Unmanaged<AppDelegate>.fromOpaque(inRefCon).takeUnretainedValue()
    guard let ring = app.audioRingBuffer, let abl = ioData else { return noErr }
    let ptr = abl.pointee.mBuffers.mData!.assumingMemoryBound(to: Float32.self)
    let samples = Int(inNumberFrames) * 2
    ring.read(ptr, count: samples)
    if app.audioMuted { memset(ptr, 0, samples * 4) }
    return noErr
}

func fourCC(_ format: AVCaptureDevice.Format) -> String {
    let sub = CMFormatDescriptionGetMediaSubType(format.formatDescription)
    let chars = [sub >> 24, sub >> 16, sub >> 8, sub].map { Character(UnicodeScalar(UInt8($0 & 0xFF))) }
    return String(chars)
}

func calcRenderRect(vw: Int, vh: Int, ww: CGFloat, wh: CGFloat) -> NSRect {
    guard vw > 0, vh > 0, ww > 0, wh > 0 else { return NSMakeRect(0,0,ww,wh) }
    let vr = CGFloat(vw)/CGFloat(vh), wr = ww/wh
    if vr > wr { let rh = ww/vr; return NSMakeRect(0, (wh-rh)/2, ww, rh) }
    else { let rw = wh*vr; return NSMakeRect((ww-rw)/2, 0, rw, wh) }
}

func pixelToNorm(_ px: CGFloat, _ py: CGFloat, _ r: NSRect, _ invW: CGFloat, _ invH: CGFloat) -> (Double,Double)? {
    let lx = px - r.origin.x, ly = py - r.origin.y
    guard lx >= 0, ly >= 0, lx < r.width, ly < r.height else { return nil }
    return (lx * invW, ly * invH)
}

class VideoView: NSView {
    weak var app: AppDelegate?

    override init(frame: NSRect) {
        super.init(frame: frame); wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
    }
    required init?(coder: NSCoder) { nil }
    override func updateTrackingAreas() {
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: bounds,
            options: [.activeInActiveApp, .mouseMoved, .inVisibleRect],
            owner: self, userInfo: nil))
        super.updateTrackingAreas()
    }
    override var acceptsFirstResponder: Bool { true }

    // MARK: - Keyboard

    override func keyDown(with event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        if event.modifierFlags.contains(.command) { return }
        if let h = hidForKey(event.keyCode) { app.serial.sendKeyboard(app.kb.keyDown(h)) }
    }

    override func keyUp(with event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        if let h = hidForKey(event.keyCode) { app.serial.sendKeyboard(app.kb.keyUp(h)) }
    }

    override func flagsChanged(with event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        if event.keyCode == 0x37 || event.keyCode == 0x36 { return }
        if let h = hidForKey(event.keyCode) {
            let raw = event.modifierFlags.rawValue
            let isDown: Bool
            switch event.keyCode {
            case 0x38: isDown = raw & 0x00000002 != 0  // Left Shift
            case 0x3C: isDown = raw & 0x00000004 != 0  // Right Shift
            case 0x3B: isDown = raw & 0x00000001 != 0  // Left Control
            case 0x3E: isDown = raw & 0x00002000 != 0  // Right Control
            case 0x3A: isDown = raw & 0x00000020 != 0  // Left Option
            case 0x3D: isDown = raw & 0x00000040 != 0  // Right Option
            case 0x39: isDown = event.modifierFlags.contains(.capsLock)
            default: isDown = false
            }
            app.serial.sendKeyboard(isDown ? app.kb.keyDown(h) : app.kb.keyUp(h))
        }
    }

    // MARK: - Mouse move / drag

    private func handleMove(_ event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        let viewLoc = convert(event.locationInWindow, from: nil)
        guard bounds.contains(viewLoc) else { return }
        if Config.mouseAbsolute {
            if let pos = pixelToNorm(viewLoc.x, bounds.height - viewLoc.y, app.rRect, app.rRectInvW, app.rRectInvH) {
                app.lastPos = pos; app.pendingMove = pos
            }
        } else {
            let dx = Int(event.deltaX), dy = Int(event.deltaY)
            if dx != 0 || dy != 0 {
                app.pendingRelDx += dx; app.pendingRelDy += dy
            }
        }
    }

    override func mouseMoved(with event: NSEvent) { handleMove(event) }
    override func mouseDragged(with event: NSEvent) { handleMove(event) }
    override func rightMouseDragged(with event: NSEvent) { handleMove(event) }
    override func otherMouseDragged(with event: NSEvent) { handleMove(event) }

    // MARK: - Mouse down / up

    private func handleDown(_ event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        let viewLoc = convert(event.locationInWindow, from: nil)
        guard bounds.contains(viewLoc) else { return }
        app.mouse.buttonDown(event.buttonNumber)
        if Config.mouseAbsolute {
            if let pos = pixelToNorm(viewLoc.x, bounds.height - viewLoc.y, app.rRect, app.rRectInvW, app.rRectInvH) {
                app.lastPos = pos; app.pendingMove = pos
            }
        } else {
            app.pendingButtonChange = true
        }
    }

    private func handleUp(_ event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        let viewLoc = convert(event.locationInWindow, from: nil)
        guard bounds.contains(viewLoc) else { return }
        app.mouse.buttonUp(event.buttonNumber)
        if Config.mouseAbsolute {
            app.pendingMove = app.lastPos
        } else {
            app.pendingButtonChange = true
        }
    }

    override func mouseDown(with event: NSEvent) { handleDown(event) }
    override func rightMouseDown(with event: NSEvent) { handleDown(event) }
    override func otherMouseDown(with event: NSEvent) { handleDown(event) }
    override func mouseUp(with event: NSEvent) { handleUp(event) }
    override func rightMouseUp(with event: NSEvent) { handleUp(event) }
    override func otherMouseUp(with event: NSEvent) { handleUp(event) }

    // MARK: - Scroll

    override func scrollWheel(with event: NSEvent) {
        guard let app = app, app.serial.isOpen, !app.isResizing else { return }
        app.scrollAccum += event.scrollingDeltaY * Config.scrollSpeed * Double(Config.scrollDirection)
        let s = Int(app.scrollAccum)
        guard s != 0 else { return }
        app.scrollAccum -= Double(s)
        let clamped = max(-127, min(127, s))
        if Config.mouseAbsolute {
            app.serial.sendMouseAbsolute(app.mouse.build(nx: app.lastPos.0, ny: app.lastPos.1, scroll: clamped))
        } else {
            app.serial.sendMouseRelative(app.mouse.buildRelative(dx: 0, dy: 0, scroll: clamped))
        }
    }
}

// MARK: - AppDelegate

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate,
                   NSToolbarDelegate, NSMenuDelegate,
                   AVCaptureVideoDataOutputSampleBufferDelegate,
                   AVCaptureFileOutputRecordingDelegate {
    let serial = SerialPort()
    var session: AVCaptureSession?
    var previewLayer: AVCaptureVideoPreviewLayer?
    var window: NSWindow!
    var videoView: VideoView!
    let kb = KeyboardHID()
    let mouse = MouseHID()
    var lastPos = (0.5, 0.5)
    var pendingMove: (Double, Double)?
    var pendingRelDx = 0, pendingRelDy = 0
    var pendingButtonChange = false
    var scrollAccum: Double = 0
    var videoW = 1920, videoH = 1080
    var rRect = NSRect.zero
    var rRectInvW: CGFloat = 0
    var rRectInvH: CGFloat = 0

    // Capture device tracking
    var currentDevice: AVCaptureDevice?
    var currentInput: AVCaptureDeviceInput?

    // Serial tracking
    var currentSerialPath: String?

    // Screenshot
    enum ScreenshotFormat: String { case png, jpeg, heic }
    var screenshotFormat: ScreenshotFormat = .png
    var screenshotQuality: Double = 0.85

    // Recording
    var isRecording = false
    var recordingCodec: AVVideoCodecType = .hevc
    var movieFileOutput: AVCaptureMovieFileOutput?

    // Audio
    var audioDevice: AVCaptureDevice?
    var audioInput: AVCaptureDeviceInput?
    var audioInputUnit: AudioUnit?
    var audioOutputUnit: AudioUnit?
    var audioRingBuffer: AudioRingBuffer?
    var audioMuted = false
    var audioRenderBuf: UnsafeMutablePointer<Float32>?
    var lastAudioRefreshTime: CFAbsoluteTime = 0

    // Mouse flush timer
    var mouseFlushTimer: Timer?

    // Mouse jiggler
    var jigglerTimer: Timer?
    var isJiggling = false

    // Paste state
    var isPasting = false

    // Background refresh
    var frozenLayer: CALayer?
    var refreshTimer: Timer?
    var isBackgroundRefresh = false
    var backgroundRefreshInterval: TimeInterval = 5.0  // 0 = live (no pause)
    var sessionWatchdog: DispatchWorkItem?
    var frameOutput: AVCaptureVideoDataOutput?
    let frameQueue = DispatchQueue(label: "com.nanokvm.frame", qos: .userInitiated)
    let sessionQueue = DispatchQueue(label: "com.nanokvm.session", qos: .userInitiated)
    var latestPixelBuffer: CVPixelBuffer?
    // Resize tracking
    var isResizing = false

    // MARK: - Lifecycle

    func applicationDidFinishLaunching(_ n: Notification) {
        let saved = UserDefaults.standard.integer(forKey: "backgroundRefresh")
        if saved > 0 { backgroundRefreshInterval = TimeInterval(saved) }
        if let codecStr = UserDefaults.standard.string(forKey: "recordingCodec") {
            recordingCodec = AVVideoCodecType(rawValue: codecStr)
        }
        if let fmtStr = UserDefaults.standard.string(forKey: "screenshotFormat"),
           let fmt = ScreenshotFormat(rawValue: fmtStr) {
            screenshotFormat = fmt
        }
        let savedQuality = UserDefaults.standard.integer(forKey: "screenshotQuality")
        if savedQuality > 0 { screenshotQuality = Double(savedQuality) / 100.0 }
        setupSerial(); setupCapture(); setupWindow()
        if serial.isOpen { startMouseFlush() }
    }

    func startMouseFlush() {
        guard mouseFlushTimer == nil else { return }
        let t = Timer(timeInterval: Config.flushInterval, repeats: true) {
            [weak self] _ in self?.flushMouse()
        }
        RunLoop.main.add(t, forMode: .common)
        mouseFlushTimer = t
    }

    func stopMouseFlush() {
        mouseFlushTimer?.invalidate()
        mouseFlushTimer = nil
    }

    func setupSerial() {
        guard let port = findSerialPorts().first else { print("No serial port. Video only."); return }
        print("Serial: " + port)
        if serial.open(path: port) {
            currentSerialPath = port
            serial.getInfo { info in
                if let info = info {
                    print("NanoKVM: " + info.map { String(format:"%02X",$0) }.joined(separator:" "))
                }
            }
        } else { print("Failed to open " + port) }
    }

    func formatScore(_ format: AVCaptureDevice.Format) -> Int {
        let sub = CMFormatDescriptionGetMediaSubType(format.formatDescription)
        switch sub {
        case 0x34323076: return 4                                      // 420v (NV12) — raw, zero decode
        case 0x6A706567, 0x646D6231, 0x61766331, 0x68766331: return 3 // jpeg, dmb1, avc1, hvc1
        case 0x79757673: return 2                                      // yuvs (YUV422)
        default: return 0
        }
    }

    func applyFormat(_ format: AVCaptureDevice.Format, to device: AVCaptureDevice, save: Bool = true) {
        if isRecording { stopRecording() }
        let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        do {
            try device.lockForConfiguration()
            device.activeFormat = format
            device.unlockForConfiguration()
        } catch { print("Failed to set format: \(error)"); return }
        videoW = Int(dims.width); videoH = Int(dims.height)
        if save {
            UserDefaults.standard.set(videoW, forKey: "videoW")
            UserDefaults.standard.set(videoH, forKey: "videoH")
        }
        window?.contentAspectRatio = NSSize(width: videoW, height: videoH)
        let fps = Int(format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0)
        print("Active: \(videoW)x\(videoH) [\(fourCC(format))] \(fps)fps")
    }

    func selectInitialFormat(for device: AVCaptureDevice) {
        let savedW = UserDefaults.standard.integer(forKey: "videoW")
        let savedH = UserDefaults.standard.integer(forKey: "videoH")

        // Try to restore saved resolution
        if savedW > 0 && savedH > 0 {
            var bestMatch: AVCaptureDevice.Format?
            var bestScore = -1
            for format in device.formats {
                let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
                let maxFPS = format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0
                guard maxFPS >= 5, Int(dims.width) == savedW, Int(dims.height) == savedH else { continue }
                let score = formatScore(format)
                if score > bestScore { bestScore = score; bestMatch = format }
            }
            if let match = bestMatch {
                applyFormat(match, to: device, save: false)
                return
            }
        }

        // Fallback: highest resolution with best pixel format
        var bestFormat: AVCaptureDevice.Format?
        var bestPixels: Int32 = 0
        var bestScore = -1
        for format in device.formats {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let maxFPS = format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0
            guard maxFPS >= 5 else { continue }
            let pixels = dims.width * dims.height
            let score = formatScore(format)
            if score > bestScore || (score == bestScore && pixels > bestPixels) {
                bestPixels = pixels; bestFormat = format; bestScore = score
            }
        }
        guard let chosen = bestFormat else { return }
        applyFormat(chosen, to: device)
    }

    func setupCapture() {
        let devices = findCaptureDevices()
        guard let dev = devices.first(where: {
            let n = $0.localizedName.lowercased()
            return !n.contains("facetime") && !n.contains("iphone")
        }) ?? devices.first else { print("No capture device."); return }
        print("Camera: " + dev.localizedName)
        // Log available formats per resolution
        var fmtsByRes: [String: (fmts: [String], maxFPS: Int)] = [:]
        for format in dev.formats {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let fps = Int(format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0)
            let key = "\(dims.width)x\(dims.height)"
            let cc = fourCC(format)
            var entry = fmtsByRes[key] ?? (fmts: [], maxFPS: 0)
            if !entry.fmts.contains(cc) { entry.fmts.append(cc) }
            entry.maxFPS = max(entry.maxFPS, fps)
            fmtsByRes[key] = entry
        }
        for (res, entry) in fmtsByRes.sorted(by: { $0.key > $1.key }) {
            print("  \(res) \(entry.maxFPS)fps: \(entry.fmts.joined(separator: ", "))")
        }
        guard let input = try? AVCaptureDeviceInput(device: dev) else { return }
        let sess = AVCaptureSession()
        sess.sessionPreset = .high
        if sess.canAddInput(input) { sess.addInput(input) }
        selectInitialFormat(for: dev)
        let fOutput = AVCaptureVideoDataOutput()
        fOutput.alwaysDiscardsLateVideoFrames = true
        fOutput.setSampleBufferDelegate(self, queue: frameQueue)
        if sess.canAddOutput(fOutput) { sess.addOutput(fOutput) }
        frameOutput = fOutput
        session = sess; currentDevice = dev; currentInput = input

        // Audio setup
        if let audioDev = findMatchingAudioDevice(for: dev) {
            setupAudioDevice(audioDev, in: sess)
        }

        sessionQueue.async { sess.startRunning() }
    }

    func setupAudioDevice(_ device: AVCaptureDevice, in sess: AVCaptureSession) {
        // Add input to capture session (needed for recording via AVCaptureAudioDataOutput)
        guard let input = try? AVCaptureDeviceInput(device: device) else { return }
        sess.beginConfiguration()
        if sess.canAddInput(input) { sess.addInput(input) }
        else { sess.commitConfiguration(); return }
        sess.commitConfiguration()
        audioDevice = device
        audioInput = input

        // CoreAudio pass-through: HAL input (USB) → ring buffer → default output
        guard let devID = audioDeviceID(for: device) else {
            print("Audio: could not resolve CoreAudio device"); return
        }

        // Canonical format: 48kHz stereo interleaved Float32
        var fmt = AudioStreamBasicDescription(
            mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM,
            mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked,
            mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8,
            mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
        let fmtSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)

        // Input unit (HAL, input-only from USB device)
        var inDesc = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_HALOutput,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0, componentFlagsMask: 0)
        guard let inComp = AudioComponentFindNext(nil, &inDesc) else { return }
        var inUnit: AudioUnit?
        guard AudioComponentInstanceNew(inComp, &inUnit) == noErr, let inUnit else { return }
        var one: UInt32 = 1, zero: UInt32 = 0
        AudioUnitSetProperty(inUnit, kAudioOutputUnitProperty_EnableIO,
                             kAudioUnitScope_Input, 1, &one, 4)
        AudioUnitSetProperty(inUnit, kAudioOutputUnitProperty_EnableIO,
                             kAudioUnitScope_Output, 0, &zero, 4)
        var dID = devID
        AudioUnitSetProperty(inUnit, kAudioOutputUnitProperty_CurrentDevice,
                             kAudioUnitScope_Global, 0, &dID,
                             UInt32(MemoryLayout<AudioDeviceID>.size))
        // Set client-side format on input unit (bus 1, output scope)
        AudioUnitSetProperty(inUnit, kAudioUnitProperty_StreamFormat,
                             kAudioUnitScope_Output, 1, &fmt, fmtSize)

        // Output unit (DefaultOutput to speakers)
        var outDesc = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_DefaultOutput,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0, componentFlagsMask: 0)
        guard let outComp = AudioComponentFindNext(nil, &outDesc) else {
            AudioComponentInstanceDispose(inUnit); return
        }
        var outUnit: AudioUnit?
        guard AudioComponentInstanceNew(outComp, &outUnit) == noErr, let outUnit else {
            AudioComponentInstanceDispose(inUnit); return
        }
        // Set client-side format on output unit (bus 0, input scope)
        AudioUnitSetProperty(outUnit, kAudioUnitProperty_StreamFormat,
                             kAudioUnitScope_Input, 0, &fmt, fmtSize)

        // Ring buffer: 4096 frames * 2 channels
        audioRingBuffer = AudioRingBuffer(capacity: 4096 * 2)
        audioRenderBuf = .allocate(capacity: 4096 * 2)
        audioInputUnit = inUnit

        // Input callback — called when USB device has new data, pushes to ring buffer
        let refCon = Unmanaged.passUnretained(self).toOpaque()
        var inCb = AURenderCallbackStruct(inputProc: audioInputCallback, inputProcRefCon: refCon)
        AudioUnitSetProperty(inUnit, kAudioOutputUnitProperty_SetInputCallback,
                             kAudioUnitScope_Global, 0, &inCb,
                             UInt32(MemoryLayout<AURenderCallbackStruct>.size))

        // Output callback — called when speakers need data, pulls from ring buffer
        var outCb = AURenderCallbackStruct(inputProc: audioOutputCallback, inputProcRefCon: refCon)
        AudioUnitSetProperty(outUnit, kAudioUnitProperty_SetRenderCallback,
                             kAudioUnitScope_Input, 0, &outCb,
                             UInt32(MemoryLayout<AURenderCallbackStruct>.size))

        AudioUnitInitialize(inUnit)
        AudioUnitInitialize(outUnit)
        AudioOutputUnitStart(inUnit)
        AudioOutputUnitStart(outUnit)
        audioOutputUnit = outUnit
        print("Audio: \(device.localizedName)")
    }

    func removeAudioFromSession() {
        if let out = audioOutputUnit { AudioOutputUnitStop(out); AudioComponentInstanceDispose(out) }
        audioOutputUnit = nil
        if let inp = audioInputUnit { AudioOutputUnitStop(inp); AudioComponentInstanceDispose(inp) }
        audioInputUnit = nil
        audioRingBuffer = nil
        audioRenderBuf?.deallocate()
        audioRenderBuf = nil
        guard let sess = session else { return }
        sess.beginConfiguration()
        if let input = audioInput { sess.removeInput(input) }
        sess.commitConfiguration()
        audioDevice = nil
        audioInput = nil
    }

    func switchAudioDevice(_ device: AVCaptureDevice) {
        guard let sess = session else { return }
        removeAudioFromSession()
        setupAudioDevice(device, in: sess)
        updateAudioToolbarIcon()
    }

    func setupWindow() {
        let f = NSMakeRect(100, 100, Config.windowWidth, Config.windowHeight)
        window = NSWindow(contentRect: f,
            styleMask: [.titled,.closable,.resizable,.miniaturizable],
            backing: .buffered, defer: false)
        window.title = "NanoKVM"
        window.collectionBehavior = .fullScreenPrimary
        window.delegate = self; window.acceptsMouseMovedEvents = true
        window.backgroundColor = .black
        window.contentMinSize = NSSize(width: 480, height: 270)
        window.toolbar = makeToolbar()
        window.toolbarStyle = .unified
        window.contentAspectRatio = NSSize(width: Config.windowWidth, height: Config.windowHeight)
        window.setContentSize(NSSize(width: Config.windowWidth, height: Config.windowHeight))
        videoView = VideoView(frame: f)
        videoView.app = self
        if let sess = session {
            previewLayer = AVCaptureVideoPreviewLayer(session: sess)
            previewLayer!.videoGravity = .resizeAspect
            previewLayer!.frame = videoView.bounds
            previewLayer!.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
            previewLayer!.contentsScale = window.backingScaleFactor
            videoView.layer!.addSublayer(previewLayer!)
        }
        window.isOpaque = true
        videoView.layer!.isOpaque = true
        previewLayer?.isOpaque = true
        window.contentView = videoView
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(videoView)
        recalcRect()
    }

    func flushMouse() {
        guard serial.isOpen else { return }
        if Config.mouseAbsolute {
            guard let pos = pendingMove else { return }
            serial.sendMouseAbsolute(mouse.build(nx: pos.0, ny: pos.1))
            pendingMove = nil
        } else {
            if pendingRelDx != 0 || pendingRelDy != 0 || pendingButtonChange {
                let dx = max(-127, min(127, pendingRelDx))
                let dy = max(-127, min(127, pendingRelDy))
                serial.sendMouseRelative(mouse.buildRelative(dx: dx, dy: dy))
                pendingRelDx = 0; pendingRelDy = 0
                pendingButtonChange = false
            }
        }
    }

    func releaseAll() {
        isPasting = false
        guard serial.isOpen else { return }
        serial.sendKeyboard(kb.releaseAll())
        serial.sendMouseAbsolute(mouse.reset())
    }

    func recalcRect() {
        guard let cv = window.contentView else { return }
        rRect = calcRenderRect(vw: videoW, vh: videoH, ww: cv.bounds.width, wh: cv.bounds.height)
        rRectInvW = rRect.width > 0 ? 1.0 / rRect.width : 0
        rRectInvH = rRect.height > 0 ? 1.0 / rRect.height : 0
    }

    // MARK: - Window Delegate

    func windowWillStartLiveResize(_ n: Notification) {
        isResizing = true
        releaseAll()
    }
    func windowDidEndLiveResize(_ n: Notification) {
        isResizing = false
    }
    func windowDidResize(_ n: Notification) { recalcRect() }
    func window(_ window: NSWindow, willUseFullScreenPresentationOptions proposed: NSApplication.PresentationOptions) -> NSApplication.PresentationOptions {
        return [.fullScreen, .autoHideMenuBar, .autoHideToolbar]
    }
    func windowDidEnterFullScreen(_ n: Notification) { recalcRect() }
    func windowDidExitFullScreen(_ n: Notification) { recalcRect() }
    func windowDidChangeBackingProperties(_ n: Notification) {
        previewLayer?.contentsScale = window.backingScaleFactor
        recalcRect()
    }
    func windowDidResignKey(_ n: Notification) {
        if Config.cursorHidden { NSCursor.unhide() }
        stopMouseFlush()
        releaseAll()
        if let out = audioOutputUnit { AudioOutputUnitStop(out) }
        sessionWatchdog?.cancel()
        sessionWatchdog = nil
        if !isRecording && backgroundRefreshInterval > 0 {
            freezeFrame()
            sessionQueue.async { [weak self] in self?.session?.stopRunning() }
            let t = Timer(timeInterval: backgroundRefreshInterval, repeats: true) {
                [weak self] _ in self?.backgroundRefresh()
            }
            RunLoop.main.add(t, forMode: .common)
            refreshTimer = t
        }
    }

    func windowDidBecomeKey(_ n: Notification) {
        if Config.cursorHidden { NSCursor.hide() }
        if serial.isOpen { startMouseFlush() }
        audioRingBuffer?.drain()
        if let out = audioOutputUnit { AudioOutputUnitStart(out) }
        refreshTimer?.invalidate()
        refreshTimer = nil
        isBackgroundRefresh = false
        lastAudioRefreshTime = 0
        sessionQueue.async { [weak self] in
            self?.session?.startRunning()
        }
        enableFrameOutput()
        sessionWatchdog?.cancel()
        let wd = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.sessionWatchdog = nil
            self.enableFrameOutput()
            self.sessionQueue.async {
                self.session?.stopRunning()
                self.session?.startRunning()
            }
        }
        sessionWatchdog = wd
        DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: wd)
        if frozenLayer != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.unfreezeFrame()
            }
        }
    }

    func backgroundRefresh() {
        guard !isBackgroundRefresh else { return }
        isBackgroundRefresh = true
        enableFrameOutput()
        sessionQueue.async { [weak self] in self?.session?.startRunning() }
    }

    func audioTriggeredRefresh() {
        let now = CFAbsoluteTimeGetCurrent()
        guard now - lastAudioRefreshTime >= 2.0 else { return }
        guard refreshTimer != nil, !isBackgroundRefresh else { return }
        lastAudioRefreshTime = now
        backgroundRefresh()
        // Reset the periodic timer so next tick is a full interval away
        refreshTimer?.invalidate()
        let t = Timer(timeInterval: backgroundRefreshInterval, repeats: true) {
            [weak self] _ in self?.backgroundRefresh()
        }
        RunLoop.main.add(t, forMode: .common)
        refreshTimer = t
    }

    func freezeFrame() {
        guard let layer = videoView.layer else { return }
        let frozen = CALayer()
        frozen.frame = layer.bounds
        frozen.contentsScale = window.backingScaleFactor
        frozen.contentsGravity = .resizeAspect
        frozen.backgroundColor = CGColor.black
        frozen.contents = cgImageFromLatestBuffer()
        frozen.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]
        layer.addSublayer(frozen)
        frozenLayer = frozen
    }

    func unfreezeFrame() {
        guard let frozen = frozenLayer else { return }
        frozenLayer = nil
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.15)
        CATransaction.setCompletionBlock {
            frozen.removeFromSuperlayer()
        }
        frozen.opacity = 0
        CATransaction.commit()
    }

    func enableFrameOutput() {
        frameOutput?.connection(with: .video)?.isEnabled = true
    }
    func disableFrameOutput() {
        frameOutput?.connection(with: .video)?.isEnabled = false
    }

    func cgImageFromLatestBuffer() -> CGImage? {
        guard let pb = latestPixelBuffer else { return nil }
        var cgImage: CGImage?
        VTCreateCGImageFromCVPixelBuffer(pb, options: nil, imageOut: &cgImage)
        return cgImage
    }

    func windowWillClose(_ n: Notification) {
        if Config.cursorHidden { NSCursor.unhide(); Config.cursorHidden = false }
        stopMouseFlush()
        releaseAll(); serial.close()
        if isRecording {
            movieFileOutput?.stopRecording()
            // fileOutput delegate will be called, but we're closing — just wait briefly
            Thread.sleep(forTimeInterval: 0.5)
        }
        session?.stopRunning()
        NSApp.terminate(nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ a: NSApplication) -> Bool { true }

    // MARK: - Toolbar Setup

    func makeToolbar() -> NSToolbar {
        let tb = NSToolbar(identifier: "MainToolbar")
        tb.delegate = self
        tb.displayMode = .iconOnly
        return tb
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.video, .audio, .serial, .flexibleSpace, .keyboard, .mouse, .flexibleSpace, .record]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.video, .audio, .serial, .keyboard, .mouse, .record, .flexibleSpace]
    }

    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSMenuToolbarItem(itemIdentifier: id)
        let menu = NSMenu()
        menu.delegate = self

        switch id {
        case .video:
            item.image = NSImage(systemSymbolName: "video", accessibilityDescription: "Video")
            item.label = "Video"; menu.title = "Video"
            populateVideoMenu(menu)
        case .audio:
            let iconName = (audioDevice != nil && !audioMuted) ? "speaker.wave.2" : "speaker.slash"
            item.image = NSImage(systemSymbolName: iconName, accessibilityDescription: "Audio")
            item.label = "Audio"; menu.title = "Audio"
            populateAudioMenu(menu)
        case .serial:
            item.image = NSImage(systemSymbolName: "link", accessibilityDescription: "Serial")
            item.label = "Serial"; menu.title = "Serial"
            populateSerialMenu(menu)
        case .keyboard:
            item.image = NSImage(systemSymbolName: "keyboard", accessibilityDescription: "Keyboard")
            item.label = "Keyboard"; menu.title = "Keyboard"
            populateKeyboardMenu(menu)
        case .mouse:
            item.image = NSImage(systemSymbolName: "cursorarrow", accessibilityDescription: "Mouse")
            item.label = "Mouse"; menu.title = "Mouse"
            populateMouseMenu(menu)
        case .record:
            item.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: "Record")
            item.label = "Record"; menu.title = "Record"
            populateRecordMenu(menu)
        default: return nil
        }

        item.menu = menu
        return item
    }

    // MARK: - Menu Delegate

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        switch menu.title {
        case "Video":    populateVideoMenu(menu)
        case "Audio":    populateAudioMenu(menu)
        case "Serial":   populateSerialMenu(menu)
        case "Keyboard": populateKeyboardMenu(menu)
        case "Mouse":    populateMouseMenu(menu)
        case "Record":   populateRecordMenu(menu)
        default: break
        }
    }

    func addMenuGuard(_ menu: NSMenu) {
        let dummy = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        dummy.isHidden = true
        menu.addItem(dummy)
    }

    @discardableResult
    func menuItem(_ menu: NSMenu, _ title: String, _ action: Selector,
                  checked: Bool = false, enabled: Bool = true,
                  icon: String? = nil, obj: Any? = nil, tag: Int = 0) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        if let obj { item.representedObject = obj }
        if checked { item.state = .on }
        item.isEnabled = enabled
        if tag != 0 { item.tag = tag }
        if let icon { item.image = NSImage(systemSymbolName: icon, accessibilityDescription: nil) }
        menu.addItem(item)
        return item
    }

    func submenu(_ menu: NSMenu, _ title: String, icon: String? = nil, _ build: (NSMenu) -> Void) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        if let icon { item.image = NSImage(systemSymbolName: icon, accessibilityDescription: nil) }
        let sub = NSMenu()
        build(sub)
        item.submenu = sub
        menu.addItem(item)
    }

    func populateVideoMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        let devices = findCaptureDevices()
        for dev in devices {
            menuItem(menu, dev.localizedName, #selector(videoDeviceSelected(_:)),
                     checked: dev.uniqueID == currentDevice?.uniqueID, obj: dev)
        }
        guard let device = currentDevice else { return }
        menu.addItem(.separator())
        var bestForRes: [String: AVCaptureDevice.Format] = [:]
        for format in device.formats {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let key = "\(dims.width)x\(dims.height)"
            let has5fps = format.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 5 }
            guard has5fps else { continue }
            if let existing = bestForRes[key] {
                if formatScore(format) > formatScore(existing) { bestForRes[key] = format }
            } else { bestForRes[key] = format }
        }
        var entries: [(w: Int32, h: Int32, format: AVCaptureDevice.Format)] = []
        for (_, format) in bestForRes {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            entries.append((dims.width, dims.height, format))
        }
        entries.sort { ($0.w * $0.h) > ($1.w * $1.h) }
        let activeDims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        for entry in entries {
            let maxFPS = Int(entry.format.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0)
            menuItem(menu, "\(entry.w)\u{00D7}\(entry.h)  \(maxFPS)fps", #selector(formatSelected(_:)),
                     checked: entry.w == activeDims.width && entry.h == activeDims.height, obj: entry.format)
        }
        menu.addItem(.separator())
        submenu(menu, "Background refresh") { sub in
            for (title, interval) in [("Live", 0.0), ("1 second", 1.0), ("5 seconds", 5.0),
                                       ("10 seconds", 10.0), ("30 seconds", 30.0),
                                       ("60 seconds", 60.0), ("120 seconds", 120.0),
                                       ("5 minutes", 300.0)] {
                menuItem(sub, title, #selector(setBackgroundRefresh(_:)),
                         checked: interval == backgroundRefreshInterval, tag: Int(interval))
            }
        }
    }

    func populateSerialMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        let ports = findSerialPorts()
        for port in ports {
            menuItem(menu, port, #selector(serialPortSelected(_:)),
                     checked: port == currentSerialPath, obj: port)
        }
        if ports.isEmpty {
            let item = NSMenuItem(title: "No USB serial devices", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        }
        menu.addItem(.separator())
        menuItem(menu, "Disconnect", #selector(disconnectSerial(_:)), enabled: serial.isOpen)
    }

    func populateKeyboardMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        menuItem(menu, "Paste", #selector(pasteClipboard(_:)), icon: "doc.on.clipboard")
        submenu(menu, "Keyboard", icon: "keyboard") { sub in
            for (title, sel) in [
                ("Ctrl+Alt+Del", #selector(sendCtrlAltDel(_:))),
                ("Win+Tab",      #selector(sendWinTab(_:))),
                ("Alt+F4",       #selector(sendAltF4(_:))),
                ("Ctrl+Esc",     #selector(sendCtrlEsc(_:))),
            ] as [(String, Selector)] {
                menuItem(sub, title, sel)
            }
            sub.addItem(.separator())
            menuItem(sub, "Release All Keys", #selector(sendReleaseAll(_:)))
        }
        submenu(menu, "Shortcuts", icon: "command") { sub in
            for title in ["Cmd+F  Fullscreen", "Cmd+Q  Quit"] {
                let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
                item.isEnabled = false
                sub.addItem(item)
            }
        }
    }

    func populateMouseMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        submenu(menu, "Cursor", icon: "cursorarrow") { sub in
            menuItem(sub, "Show Cursor", #selector(showCursor(_:)), checked: !Config.cursorHidden)
            menuItem(sub, "Hide Cursor", #selector(hideCursor(_:)), checked: Config.cursorHidden)
        }
        submenu(menu, "Mouse mode", icon: "cursorarrow.motionlines") { sub in
            menuItem(sub, "Absolute", #selector(setMouseAbsolute(_:)), checked: Config.mouseAbsolute)
            menuItem(sub, "Relative", #selector(setMouseRelative(_:)), checked: !Config.mouseAbsolute)
        }
        submenu(menu, "Wheel direction", icon: "arrow.up.arrow.down") { sub in
            menuItem(sub, "Natural", #selector(setScrollNatural(_:)), checked: Config.scrollDirection == -1)
            menuItem(sub, "Inverted", #selector(setScrollInverted(_:)), checked: Config.scrollDirection == 1)
        }
        submenu(menu, "Wheel speed", icon: "speedometer") { sub in
            for (title, val) in [("Slow", 0.003), ("Normal", 0.01), ("Fast", 0.025), ("Very Fast", 0.05)] as [(String, Double)] {
                menuItem(sub, title, #selector(setScrollSpeed(_:)),
                         checked: Config.scrollSpeed == val, tag: Int(val * 10000))
            }
        }
        menu.addItem(.separator())
        menuItem(menu, "Mouse Jiggler", #selector(toggleJiggler(_:)),
                 checked: isJiggling, enabled: serial.isOpen, icon: "sparkle")
    }

    func populateRecordMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        menuItem(menu, "Screenshot", #selector(takeScreenshot(_:)),
                 enabled: latestPixelBuffer != nil || session != nil, icon: "camera")
        submenu(menu, "Screenshot format", icon: "photo") { sub in
            for (title, fmt) in [("PNG", ScreenshotFormat.png), ("JPEG", .jpeg), ("HEIC", .heic)] as [(String, ScreenshotFormat)] {
                menuItem(sub, title, #selector(setScreenshotFormat(_:)),
                         checked: screenshotFormat == fmt, obj: fmt.rawValue)
            }
        }
        if screenshotFormat != .png {
            submenu(menu, "Screenshot quality", icon: "slider.horizontal.3") { sub in
                for (title, val) in [("Low (50%)", 0.5), ("Medium (70%)", 0.7), ("High (85%)", 0.85),
                                      ("Very High (95%)", 0.95), ("Maximum (100%)", 1.0)] as [(String, Double)] {
                    menuItem(sub, title, #selector(setScreenshotQuality(_:)),
                             checked: Int(screenshotQuality * 100) == Int(val * 100), tag: Int(val * 100))
                }
            }
        }
        menu.addItem(.separator())
        menuItem(menu, isRecording ? "Stop Recording" : "Start Recording",
                 #selector(toggleRecording(_:)),
                 icon: isRecording ? "stop.circle" : "record.circle")
        submenu(menu, "Recording codec", icon: "film") { sub in
            for (title, codec) in [("H.264", AVVideoCodecType.h264), ("H.265 (HEVC)", .hevc)] as [(String, AVVideoCodecType)] {
                menuItem(sub, title, #selector(setRecordingCodec(_:)),
                         checked: recordingCodec == codec, enabled: !isRecording, obj: codec.rawValue)
            }
        }
    }

    func populateAudioMenu(_ menu: NSMenu) {
        addMenuGuard(menu)
        menuItem(menu, audioMuted ? "Unmute" : "Mute", #selector(toggleAudioMute(_:)),
                 enabled: audioDevice != nil,
                 icon: audioMuted ? "speaker.slash" : "speaker.wave.2")
        menu.addItem(.separator())
        let audioDevices = findAudioCaptureDevices()
        if audioDevices.isEmpty {
            let item = NSMenuItem(title: "No audio input devices", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
        } else {
            for dev in audioDevices {
                menuItem(menu, dev.localizedName, #selector(audioDeviceSelected(_:)),
                         checked: dev.uniqueID == audioDevice?.uniqueID,
                         enabled: !isRecording, obj: dev)
            }
        }
        menu.addItem(.separator())
        menuItem(menu, "Disconnect Audio", #selector(disconnectAudio(_:)),
                 enabled: audioDevice != nil && !isRecording)
    }

    // MARK: - Audio Actions

    @objc func toggleAudioMute(_ sender: Any?) {
        audioMuted.toggle()
        updateAudioToolbarIcon()
    }

    @objc func audioDeviceSelected(_ sender: NSMenuItem) {
        guard let dev = sender.representedObject as? AVCaptureDevice else { return }
        switchAudioDevice(dev)
    }

    @objc func disconnectAudio(_ sender: Any?) {
        removeAudioFromSession()
        updateAudioToolbarIcon()
        print("Audio disconnected")
    }

    func updateAudioToolbarIcon() {
        guard let items = window?.toolbar?.items else { return }
        for item in items where item.itemIdentifier == .audio {
            let iconName = (audioDevice != nil && !audioMuted) ? "speaker.wave.2" : "speaker.slash"
            item.image = NSImage(systemSymbolName: iconName, accessibilityDescription: "Audio")
        }
    }

    // MARK: - Video Actions

    @objc func videoDeviceSelected(_ sender: NSMenuItem) {
        guard let dev = sender.representedObject as? AVCaptureDevice else { return }
        switchCaptureDevice(dev)
    }

    func switchCaptureDevice(_ device: AVCaptureDevice) {
        guard let sess = session, let oldInput = currentInput else { return }
        guard let newInput = try? AVCaptureDeviceInput(device: device) else { return }
        sess.beginConfiguration()
        sess.removeInput(oldInput)
        if sess.canAddInput(newInput) { sess.addInput(newInput) }
        sess.commitConfiguration()
        currentDevice = device; currentInput = newInput
        selectInitialFormat(for: device)
        recalcRect()
        print("Switched to: \(device.localizedName) (\(videoW)x\(videoH))")

        // Auto-match audio device
        if let audioDev = findMatchingAudioDevice(for: device) {
            switchAudioDevice(audioDev)
        }
    }

    @objc func formatSelected(_ sender: NSMenuItem) {
        guard let format = sender.representedObject as? AVCaptureDevice.Format,
              let device = currentDevice else { return }
        applyFormat(format, to: device)
        recalcRect()
    }

    @objc func setBackgroundRefresh(_ sender: NSMenuItem) {
        backgroundRefreshInterval = TimeInterval(sender.tag)
        UserDefaults.standard.set(sender.tag, forKey: "backgroundRefresh")
    }

    // MARK: - Serial Actions

    @objc func serialPortSelected(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        stopMouseFlush()
        serial.close()
        if serial.open(path: path) {
            currentSerialPath = path
            startMouseFlush()
            print("Serial: " + path)
            serial.getInfo { info in
                if let info = info {
                    print("NanoKVM: " + info.map { String(format:"%02X",$0) }.joined(separator:" "))
                }
            }
        } else {
            currentSerialPath = nil
            print("Failed to open " + path)
        }
    }

    @objc func disconnectSerial(_ sender: Any?) {
        stopMouseFlush()
        serial.close()
        currentSerialPath = nil
        print("Serial disconnected")
    }

    // MARK: - Keyboard Actions

    @objc func pasteClipboard(_ sender: Any?) {
        guard serial.isOpen, !isPasting else { return }
        guard let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else { return }
        isPasting = true
        typeNextChar(Array(text), index: 0)
    }

    private func typeNextChar(_ chars: [Character], index: Int) {
        guard isPasting, index < chars.count else { isPasting = false; return }
        let ch = chars[index]
        if ch == "\n" || ch == "\r" {
            serial.sendKeyboard(kb.keyDown(0x28))
            serial.sendKeyboard(kb.keyUp(0x28))
        } else if ch == "\t" {
            serial.sendKeyboard(kb.keyDown(0x2B))
            serial.sendKeyboard(kb.keyUp(0x2B))
        } else if let (hid, shift) = asciiToHID[ch] {
            if shift { serial.sendKeyboard(kb.keyDown(0xE1)) }
            serial.sendKeyboard(kb.keyDown(hid))
            serial.sendKeyboard(kb.keyUp(hid))
            if shift { serial.sendKeyboard(kb.keyUp(0xE1)) }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.typeNextChar(chars, index: index + 1)
        }
    }

    private func sendShortcut(mods: [UInt8], key: UInt8) {
        guard serial.isOpen else { return }
        for m in mods { serial.sendKeyboard(kb.keyDown(m)) }
        serial.sendKeyboard(kb.keyDown(key))
        serial.sendKeyboard(kb.keyUp(key))
        for m in mods.reversed() { serial.sendKeyboard(kb.keyUp(m)) }
    }

    @objc func sendCtrlAltDel(_ sender: Any?) {
        sendShortcut(mods: [0xE0, 0xE2], key: 0x4C) // LCtrl+LAlt+Delete
    }

    @objc func sendWinTab(_ sender: Any?) {
        sendShortcut(mods: [0xE3], key: 0x2B) // LGUI+Tab
    }

    @objc func sendAltF4(_ sender: Any?) {
        sendShortcut(mods: [0xE2], key: 0x3D) // LAlt+F4
    }

    @objc func sendCtrlEsc(_ sender: Any?) {
        sendShortcut(mods: [0xE0], key: 0x29) // LCtrl+Escape
    }

    @objc func sendReleaseAll(_ sender: Any?) {
        releaseAll()
    }

    // MARK: - Mouse Actions

    @objc func showCursor(_ sender: Any?) {
        if Config.cursorHidden { NSCursor.unhide(); Config.cursorHidden = false }
    }

    @objc func hideCursor(_ sender: Any?) {
        if !Config.cursorHidden { NSCursor.hide(); Config.cursorHidden = true }
    }

    @objc func setMouseAbsolute(_ sender: Any?) {
        Config.mouseAbsolute = true
    }

    @objc func setMouseRelative(_ sender: Any?) {
        Config.mouseAbsolute = false
    }

    @objc func setScrollNatural(_ sender: Any?) {
        Config.scrollDirection = -1
    }

    @objc func setScrollInverted(_ sender: Any?) {
        Config.scrollDirection = 1
    }

    @objc func setScrollSpeed(_ sender: NSMenuItem) {
        Config.scrollSpeed = Double(sender.tag) / 10000.0
    }

    @objc func toggleJiggler(_ sender: Any?) {
        if isJiggling {
            jigglerTimer?.invalidate()
            jigglerTimer = nil
            isJiggling = false
            print("Jiggler stopped")
        } else {
            isJiggling = true
            let t = Timer(timeInterval: 30.0, repeats: true) {
                [weak self] _ in
                guard let self = self, self.serial.isOpen else { return }
                let nx = self.lastPos.0, ny = self.lastPos.1
                let jig = (nx > 0.5) ? -0.001 : 0.001
                self.serial.sendMouseAbsolute(self.mouse.build(nx: nx + jig, ny: ny))
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    self.serial.sendMouseAbsolute(self.mouse.build(nx: nx, ny: ny))
                }
            }
            RunLoop.main.add(t, forMode: .common)
            jigglerTimer = t
            print("Jiggler started (30s interval)")
        }
    }

    // MARK: - Screenshot Actions

    @objc func takeScreenshot(_ sender: Any?) {
        guard let cgImage = cgImageFromLatestBuffer() else { return }
        let ext: String
        let utType: UTType
        switch screenshotFormat {
        case .png:  ext = "png";  utType = .png
        case .jpeg: ext = "jpg";  utType = .jpeg
        case .heic: ext = "heic"; utType = .heic
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [utType]
        panel.nameFieldStringValue = "NanoKVM-Screenshot.\(ext)"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, utType.identifier as CFString, 1, nil) else {
            print("Failed to create image destination"); return
        }
        var options: [CFString: Any] = [:]
        if screenshotFormat != .png {
            options[kCGImageDestinationLossyCompressionQuality] = screenshotQuality
        }
        CGImageDestinationAddImage(dest, cgImage, options as CFDictionary)
        if CGImageDestinationFinalize(dest) {
            print("Screenshot saved: \(url.path)")
        } else {
            print("Failed to save screenshot")
        }
    }

    @objc func setScreenshotFormat(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let fmt = ScreenshotFormat(rawValue: rawValue) else { return }
        screenshotFormat = fmt
        UserDefaults.standard.set(rawValue, forKey: "screenshotFormat")
    }

    @objc func setScreenshotQuality(_ sender: NSMenuItem) {
        screenshotQuality = Double(sender.tag) / 100.0
        UserDefaults.standard.set(sender.tag, forKey: "screenshotQuality")
    }

    // MARK: - Recording Actions

    @objc func toggleRecording(_ sender: Any?) {
        if isRecording { stopRecording() } else { startRecording() }
    }

    @objc func setRecordingCodec(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String else { return }
        recordingCodec = AVVideoCodecType(rawValue: rawValue)
        UserDefaults.standard.set(rawValue, forKey: "recordingCodec")
    }

    func startRecording() {
        guard let sess = session, !isRecording else { return }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.movie]
        panel.nameFieldStringValue = "NanoKVM-Recording.mov"
        guard panel.runModal() == .OK, let url = panel.url else { return }

        // Remove existing file if overwriting
        try? FileManager.default.removeItem(at: url)

        let output = AVCaptureMovieFileOutput()
        let codec = recordingCodec
        isRecording = true
        updateRecordToolbarIcon()

        sessionQueue.async { [weak self] in
            guard let self else { return }
            sess.beginConfiguration()
            guard sess.canAddOutput(output) else {
                sess.commitConfiguration()
                DispatchQueue.main.async {
                    self.isRecording = false
                    self.updateRecordToolbarIcon()
                }
                print("Failed to add movie output"); return
            }
            sess.addOutput(output)
            sess.commitConfiguration()

            if let conn = output.connection(with: .video) {
                output.setOutputSettings([AVVideoCodecKey: codec], for: conn)
            }

            self.movieFileOutput = output
            output.startRecording(to: url, recordingDelegate: self)
            print("Recording started: \(url.path)")
        }
    }

    func stopRecording() {
        guard isRecording, let output = movieFileOutput else { return }
        output.stopRecording()
    }

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo url: URL,
                    from connections: [AVCaptureConnection], error: Error?) {
        let sess = session
        sessionQueue.async {
            if let sess {
                sess.beginConfiguration()
                sess.removeOutput(output)
                sess.commitConfiguration()
            }
        }
        isRecording = false
        movieFileOutput = nil
        DispatchQueue.main.async { [weak self] in
            self?.updateRecordToolbarIcon()
        }
        if let error {
            print("Recording failed: \(error.localizedDescription)")
        } else {
            print("Recording saved: \(url.path)")
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        if output === frameOutput {
            latestPixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
            // Detect actual resolution from incoming frames
            if let pb = latestPixelBuffer {
                let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
                if w != videoW || h != videoH {
                    videoW = w; videoH = h
                    DispatchQueue.main.async { [weak self] in
                        self?.window?.contentAspectRatio = NSSize(width: w, height: h)
                        self?.recalcRect()
                    }
                }
            }
            if isBackgroundRefresh {
                isBackgroundRefresh = false
                let img = cgImageFromLatestBuffer()
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.frozenLayer?.contents = img
                    guard self.refreshTimer != nil else { return }
                    self.sessionQueue.async { self.session?.stopRunning() }
                }
            }
            // Disable frame delivery in steady state — preview layer renders via GPU
            disableFrameOutput()
            // Cancel session watchdog — frame arrived, session is healthy
            DispatchQueue.main.async { [weak self] in
                self?.sessionWatchdog?.cancel()
                self?.sessionWatchdog = nil
            }
            return
        }
    }

    func updateRecordToolbarIcon() {
        guard let items = window?.toolbar?.items else { return }
        for item in items where item.itemIdentifier == .record {
            if isRecording {
                let config = NSImage.SymbolConfiguration(paletteColors: [.systemRed])
                item.image = NSImage(systemSymbolName: "record.circle.fill",
                                     accessibilityDescription: "Stop Recording")?
                    .withSymbolConfiguration(config)
            } else {
                item.image = NSImage(systemSymbolName: "circle.fill",
                                     accessibilityDescription: "Record")
            }
        }
    }
}

// MARK: - Bootstrap

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let mainMenu = NSMenu()
let appMenuItem = NSMenuItem()
mainMenu.addItem(appMenuItem)
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Toggle Fullscreen",
    action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
appMenu.addItem(withTitle: "Quit NanoKVM",
    action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appMenuItem.submenu = appMenu
app.mainMenu = mainMenu
let delegate = AppDelegate()
app.delegate = delegate
app.activate(ignoringOtherApps: true)
print("NanoKVM -- Cmd+F fullscreen, Cmd+Q quit")
app.run()
