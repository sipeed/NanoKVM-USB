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
      auto: 'Auto',
      resolution: 'Resolution',
      scale: 'Scale',
      customResolution: 'Custom',
      device: 'Device',
      maxResolution: {
        title: 'Max Resolution',
        mode1440p30: '2560x1440@30fps',
        mode1080p60: '1920x1080@60fps'
      },
      custom: {
        title: 'Custom Resolution',
        width: 'Width',
        height: 'Height',
        confirm: 'Ok',
        cancel: 'Cancel'
      },
      info: {
        title: 'Display Info',
        capturedResolution: 'Captured',
        displayResolution: 'Display',
        displayScale: 'Scale'
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
      numLock: 'NumLock',
      capsLockSync: 'CapsLock Sync',
      commandToCtrl: 'Map Cmd to Ctrl',
      ignoreCapsLock: 'Ignore CapsLock (for IME)',
      shortcut: {
        title: 'Shortcuts',
        custom: 'Custom',
        capture: 'Click here to capture shortcut',
        clear: 'Clear',
        save: 'Save'
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
      },
      autoClicker: {
        title: 'Auto Clicker',
        enable: 'Enable (5 min interval)',
        disable: 'Disable'
      }
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
        confirmMessage:
          'Are you sure you want to reset all settings? This action cannot be undone.',
        confirm: 'Reset',
        cancel: 'Cancel'
      },
      picoclaw: {
        title: 'AI Assistant (Picoclaw)',
        description: 'Configure AI agent to control your remote computer with natural language',
        provider: 'LLM Provider',
        apiKey: 'API Key',
        apiKeyRequired: 'Please enter API key',
        apiKeyHint: 'Use the buttons on the right to paste from clipboard or get a new key',
        model: 'Model',
        modelHint: '💨 Choose lightweight models to save your free tier tokens',
        save: 'Save',
        test: 'Test Connection',
        testSuccess: 'Successfully connected to AI agent!',
        saved: 'Settings saved',
        pasteTooltip: 'Paste from clipboard',
        getKeyTooltip: 'Open API key page',
        openedBrowser: 'Opened API key page in browser',
        clipboardEmpty: 'Clipboard is empty',
        invalidApiKey: 'Invalid API key format',
        pastedFromClipboard: 'Pasted from clipboard',
        clipboardError: 'Failed to read clipboard',
        infoTitle: 'About Picoclaw',
        info1: 'AI agent can control remote PC with natural language commands',
        info2: 'Example: "Please login" to execute auto-login sequence',
        info3: 'API keys are stored encrypted',
        modelUpdate: {
          title: 'Model List Auto-Update',
          description: 'Periodically check provider APIs for model availability changes',
          enabled: 'Enable auto-update',
          frequency: 'Frequency',
          daily: 'Daily',
          weekly: 'Weekly',
          monthly: 'Monthly',
          hour: 'Time (hour)',
          dayOfWeek: 'Day of week',
          dayOfMonth: 'Day of month',
          sunday: 'Sunday',
          monday: 'Monday',
          tuesday: 'Tuesday',
          wednesday: 'Wednesday',
          thursday: 'Thursday',
          friday: 'Friday',
          saturday: 'Saturday',
          updateNow: 'Update Now',
          updating: 'Checking...',
          lastChecked: 'Last checked',
          nextCheck: 'Next check',
          never: 'Never',
          saved: 'Schedule saved',
          updateSuccess: 'Model list updated successfully',
          updateFailed: 'Model list update failed',
          modelsFound: '{{count}} models found',
          autoSwitched: 'Model auto-switched',
          noChanges: 'All models are still available'
        }
      }
    },
    chat: {
      title: 'AI Assistant',
      placeholder: 'Type a message...',
      empty: 'Start a conversation with AI assistant.\nExample: "Login to Windows"'
    }
  }
}

export default en
