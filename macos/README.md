# NanoKVM USB — Native macOS Client

Native macOS application for NanoKVM-USB that replaces the browser-based workflow with a standalone `.app` bundle. Single Swift file, no Xcode project, no dependencies — compiles from the command line with `swiftc`.

## Why

The Chrome-based solution (WebSerial + getUserMedia) works but uses significant CPU and RAM on macOS due to JavaScript video processing. This native app uses `AVCaptureVideoPreviewLayer` which renders USB capture card frames directly on the GPU, using a fraction of the CPU and RAM compared to Chrome.

## Features

- **GPU-accelerated video** — zero-copy rendering via AVCaptureVideoPreviewLayer, with device/resolution switching and fullscreen (`Cmd+F`)
- **Full HID forwarding** — keyboard and absolute/relative mouse over CH552 serial protocol
- **Toolbar UI** — Video (device/resolution switching), Audio (device selection, mute), Serial (port selection), Keyboard (paste, key combos, shortcuts), Mouse (cursor, mode, wheel, jiggler), Record (screenshots, recording)
- **Audio pass-through** — auto-detects matching USB audio device, CoreAudio HAL playback with lock-free ring buffer, mute and device selection controls. Audio output automatically stops when the window loses focus and resumes on refocus.
- **Screen recording** — H.264 or H.265 (HEVC) codec selectable from the Record toolbar menu, saved as .mov. Default is H.265 for smaller files. Selection persists across launches.
- **Screenshots** — PNG, JPEG, or HEIC format with quality control (50–100%) for lossy formats. Format and quality persist across launches.
- **Resolution persistence** — remembers selected resolution between launches
- **Paste to remote** — types clipboard contents as HID keystrokes with correct shift handling
- **Mouse jiggler** — prevents remote machine from sleeping (30-second micro-movements)
- **Background refresh** — pauses the capture session when the window loses focus, dropping UVCAssistant CPU to near zero. A frozen frame overlay keeps the last image visible, and a configurable timer (Live / 1s / 5s / 10s / 30s / 60s / 120s / 5min) periodically grabs a fresh frame so remote screen changes are still visible. Audio activity on the remote also triggers an immediate refresh.
- **Session watchdog** — if the capture session fails to produce a frame within 3 seconds of refocusing (e.g. after long idle), it is automatically force-restarted
- **Minimal footprint** — single file, builds in seconds

## Build

```bash
cd macos
bash build.command
open NanoKVM.app
```

Requires macOS 12+ and Xcode command line tools (`xcode-select --install`).

## Files

| File | Description |
|------|-------------|
| `NanoKVM.swift` | All application code |
| `Info.plist` | Bundle metadata + camera/microphone permissions |
| `build.command` | Compile + create .app bundle |
| `AppIcon.icns` | App icon |

## Permissions

On first launch macOS will prompt for Camera (to access the USB HDMI capture device video feed) and Microphone (to capture audio from the USB HDMI capture device). The app filters for external USB capture devices and does not access your Mac's built-in camera or microphone.

## Protocol Compatibility

Uses the same CH552 serial protocol (57600 baud, `[0x57][0xAB]` framing) with commands:
- `0x01` GET_INFO
- `0x02` SEND_KB_GENERAL (8-byte HID keyboard reports)
- `0x04` SEND_MS_ABS (7-byte absolute mouse, 12-bit coordinates)
- `0x05` SEND_MS_REL (5-byte relative mouse)

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Fullscreen | `Cmd+F` |
| Quit | `Cmd+Q` |

Additional key combos available from the **Keyboard** toolbar menu: Ctrl+Alt+Del, Win+Tab, Alt+F4, Ctrl+Esc, Paste, Release All Keys.
