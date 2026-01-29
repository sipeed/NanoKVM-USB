# NanoKVM-USB Desktop Development Guide

## Project Architecture

This is an Electron application for controlling NanoKVM-USB hardware via serial port communication.

### Technology Stack
- **Electron**: v34.2.0 (Main process, Preload, Renderer)
- **React**: v18.3.1 with TypeScript v5.7.3
- **Build Tool**: electron-vite v4.0.1
- **UI Framework**: Ant Design v5.24.1, Tailwind CSS v4.0.6, Lucide React icons
- **State Management**: Jotai v2.12.1 atoms
- **i18n**: i18next v24.2.2 with react-i18next v15.4.1
- **Hardware Communication**: serialport v13.0.0

### Directory Structure
- `src/main/`: Electron main process (Node.js backend)
  - `device/`: Serial port communication and HID protocol encoding
  - `events/`: IPC event handlers for serial port and app lifecycle
- `src/preload/`: Electron preload script (contextBridge)
- `src/renderer/src/`: React UI (web frontend)
  - `components/`: UI components (keyboard, mouse, menu, device-modal)
  - `libs/`: Shared libraries (keyboard codes, mouse utilities, camera API)
  - `jotai/`: State management atoms
  - `i18n/`: Internationalization with auto-loading locales via glob

### Path Aliases
- `@common` → `src/common` (shared types/events)
- `@renderer` → `src/renderer/src` (renderer code)

## Critical Conventions

### Keyboard Input Handling
- **Limit**: Maximum 4 concurrent non-modifier keys (hardware constraint)
- **HID Report**: 8-byte structure: `[modifiers, reserved, key1, key2, key3, key4, key5, key6]`
- **Modifier Encoding**: Bitwise flags (Ctrl=0x01, Shift=0x02, Alt=0x04, GUI=0x08, RightCtrl=0x10, etc.)
- **Key Codes**: USB HID usage codes (e.g., 'KeyA' → 0x04)
- **Release**: Send zero-filled report to release all keys

### Mouse Input Handling
- **Relative Mode**: HID report with delta X/Y and button states
- **Absolute Mode**: Normalized coordinates (0.0-1.0) converted to device-specific range
- **Button Encoding**: Bitwise flags (Left=0x01, Right=0x02, Middle=0x04)

### Serial Port Communication
- **Lifecycle**: Open → Send Commands → Close on disconnect
- **Protocol**: Custom binary packet format with headers and CRC
- **IPC Events**: Defined in `@common/ipc-events.ts` enum
  - `GET_SERIAL_PORTS`: List available ports
  - `OPEN_SERIAL_PORT`: Connect to device
  - `CLOSE_SERIAL_PORT`: Disconnect
  - `SEND_KEYBOARD`: Send keyboard HID report
  - `SEND_MOUSE`: Send mouse HID report

## Development Workflow

### Commands
```bash
pnpm dev          # Start dev server with hot reload
pnpm build:mac    # Build macOS app (dist/mac/)
pnpm build:win    # Build Windows app
pnpm build:linux  # Build Linux app
```

### IPC Communication Pattern
1. Renderer calls `window.electron.ipcRenderer.invoke(IpcEvents.COMMAND, ...args)`
2. Main process handles via `ipcMain.handle(IpcEvents.COMMAND, handler)`
3. Handler interacts with device/serial port
4. Returns result to renderer

### Adding New Features
1. Define IPC event in `src/common/ipc-events.ts`
2. Add handler in `src/main/events/`
3. Add Jotai atom in `src/renderer/src/jotai/` if state needed
4. Create UI component in `src/renderer/src/components/`
5. Use `window.electron.ipcRenderer.invoke()` to call backend

## Important Notes

- **NumLock State**: macOS doesn't support NumLock hardware state; UI provides virtual toggle
- **High-DPI Support**: `zoomFactor: 1.0` + CSS filters for sharp video rendering
- **Camera API**: WebRTC via `navigator.mediaDevices.getUserMedia()` with 30fps ideal
- **i18n Loading**: Locales auto-loaded from `src/renderer/src/i18n/locales/*.ts` via Vite glob
