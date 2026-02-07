const en = {
  translation: {
    serial: {
      notSupported:
        'Serial not supported. Please use the desktop Chrome browser to enable mouse and keyboard.',
      failed: 'Failed to connect serial. Please try again'
    },
    camera: {
      tip: 'Waiting for authorization...',
      denied: 'Permission Denied',
      authorize:
        'Remote desktop requires camera permission. Please authorize camera in browser settings.',
      failed: 'Failed to connect camera. Please try again.'
    },
    modal: {
      title: 'Select USB Device',
      selectVideo: 'Please select a video input device',
      selectSerial: 'Select serial device'
    },
    menu: {
      serial: 'Serial',
      keyboard: 'Keyboard',
      mouse: 'Mouse'
    },
    video: {
      resolution: 'Resolution',
      scale: 'Scale',
      auto: "Auto",
      rotation: 'Rotation',
      customResolution: 'Custom',
      device: 'Device',
      custom: {
        title: 'Custom Resolution',
        width: 'Width',
        height: 'Height',
        confirm: 'Ok',
        cancel: 'Cancel'
      }
    },
    audio: {
      tip: 'Tip',
      permission:
        'Microphone access is required to connect your USB audio device. The operating system classifies USB inputs as microphones, so this permission is necessary.\n\nThis action is solely for device connectivity and does not enable audio recording.',
      viewDoc: 'View document.',
      ok: 'Ok'
    },
    keyboard: {
      paste: 'Paste',
      virtualKeyboard: 'Keyboard',
      shortcut: {
        title: 'Shortcuts',
        custom: 'Custom',
        capture: 'Click here to capture shortcut',
        clear: 'Clear',
        save: 'Save',
        captureTips:
          'Capturing system-level keys (such as the Windows key) requires full-screen permission.',
        enterFullScreen: 'Toggle full-screen mode.'
      }
    },
    mouse: {
      cursor: {
        title: 'Cursor',
        pointer: 'Pointer',
        grab: 'Grab',
        cell: 'Cell',
        hide: 'Hide'
      },
      mode: 'Mouse mode',
      absolute: 'Absolute mode',
      relative: 'Relative mode',
      direction: 'Wheel direction',
      scrollUp: 'Scroll up',
      scrollDown: 'Scroll down',
      speed: 'Wheel speed',
      fast: 'Fast',
      slow: 'Slow',
      requestPointer: 'Using relative mode. Please click desktop to get mouse pointer.',
      jiggler: {
        title: 'Mouse Jiggler',
        enable: 'Enable',
        disable: 'Disable'
      }
    },
    settings: {
      language: 'Language',
      document: 'Document',
      download: 'Download'
    }
  }
};

export default en;
