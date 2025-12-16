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
    keyboard: {
      paste: 'Paste',
      virtualKeyboard: 'Keyboard',
      shortcut: {
        title: 'Shortcut',
        custom: 'Custom Shortcut',
        capture: 'Click here to capture shortcut',
        label: 'Label',
        cancel: 'Cancel',
        save: 'Save',
        ctrlAltDel: 'Ctrl + Alt + Delete',
        ctrlD: 'Ctrl + D',
        winTab: 'Win + Tab',
        enterFullScreen: 'Enter Full Screen',
        captureTips: 'Capturing the Meta key separately requires operation in full-screen mode.'
      },
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
