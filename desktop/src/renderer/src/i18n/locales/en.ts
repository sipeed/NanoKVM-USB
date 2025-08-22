const en = {
  translation: {
    camera: {
      tip: 'Waiting for authorization...',
      denied: 'Authorization failed',
      authorize:
        'Remote desktop requires camera permission. Please grant camera permission in the settings.',
      failed: 'Failed to connect camera. Please try again.'
    },
    modal: {
      title: 'Select USB Device',
      selectVideo: 'Please select a video input device',
      selectSerial: 'Please select serial device',
      selectBaudRate: 'Please select baud rate'
    },
    menu: {
      serial: 'Serial',
      keyboard: 'Keyboard',
      mouse: 'Mouse',
      serialPort: {
        device: 'Serial Device',
        baudRate: 'Baud Rate',
        noDeviceFound: 'No serial devices found',
        clickToSelect: 'Click to select serial port'
      }
    },
    video: {
      resolution: 'Resolution',
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
      ctrlAltDel: 'Ctrl + Alt + Delete'
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
      requestPointer: 'Using relative mode. Please click desktop to get mouse pointer.'
    },
    settings: {
      title: 'Settings',
      appearance: {
        title: 'Appearance',
        language: 'Language',
        menu: 'Menu Bar',
        menuTips: 'Open menu bar when launch'
      },
      update: {
        title: 'Check for Updates',
        latest: 'You already have the latest version.',
        outdated: 'An update is available. Are you sure you want to update now?',
        downloading: 'Downloading...',
        installing: 'Installing...',
        failed: 'Update failed. Please retry.',
        confirm: 'Confirm',
        cancel: 'Cancel'
      },
      about: {
        title: 'About',
        version: 'Version',
        community: 'Community'
      },
      reset: {
        title: 'Reset Settings',
        description: 'Reset all application settings to default values',
        warning: 'Warning',
        warningDescription: 'This action cannot be undone. All your custom settings will be lost.',
        button: 'Reset All Settings',
        confirmTitle: 'Confirm Reset',
        confirmMessage: 'Are you sure you want to reset all settings? This action cannot be undone.',
        confirm: 'Reset',
        cancel: 'Cancel'
      }
    }
  }
}

export default en
