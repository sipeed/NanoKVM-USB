export const KeyboardCodes: Map<string, number> = new Map([
  // Letters
  ['KeyA', 4],
  ['KeyB', 5],
  ['KeyC', 6],
  ['KeyD', 7],
  ['KeyE', 8],
  ['KeyF', 9],
  ['KeyG', 10],
  ['KeyH', 11],
  ['KeyI', 12],
  ['KeyJ', 13],
  ['KeyK', 14],
  ['KeyL', 15],
  ['KeyM', 16],
  ['KeyN', 17],
  ['KeyO', 18],
  ['KeyP', 19],
  ['KeyQ', 20],
  ['KeyR', 21],
  ['KeyS', 22],
  ['KeyT', 23],
  ['KeyU', 24],
  ['KeyV', 25],
  ['KeyW', 26],
  ['KeyX', 27],
  ['KeyY', 28],
  ['KeyZ', 29],

  // Numbers
  ['Digit1', 30],
  ['Digit2', 31],
  ['Digit3', 32],
  ['Digit4', 33],
  ['Digit5', 34],
  ['Digit6', 35],
  ['Digit7', 36],
  ['Digit8', 37],
  ['Digit9', 38],
  ['Digit0', 39],

  // Special keys
  ['Enter', 40],
  ['Escape', 41],
  ['Backspace', 42],
  ['Tab', 43],
  ['Space', 44],
  ['Minus', 45],
  ['Equal', 46],
  ['BracketLeft', 47],
  ['BracketRight', 48],
  ['Backslash', 49],
  ['Semicolon', 51],
  ['Quote', 52],
  ['Backquote', 53],
  ['Comma', 54],
  ['Period', 55],
  ['Slash', 56],
  ['CapsLock', 57],

  // ISO keyboard specific
  ['IntlHash', 50],

  // Function keys
  ['F1', 58],
  ['F2', 59],
  ['F3', 60],
  ['F4', 61],
  ['F5', 62],
  ['F6', 63],
  ['F7', 64],
  ['F8', 65],
  ['F9', 66],
  ['F10', 67],
  ['F11', 68],
  ['F12', 69],

  // Control keys
  ['PrintScreen', 70],
  ['ScrollLock', 71],
  ['Pause', 72],
  ['Insert', 73],
  ['Home', 74],
  ['PageUp', 75],
  ['Delete', 76],
  ['End', 77],
  ['PageDown', 78],

  // Arrow keys
  ['ArrowRight', 79],
  ['ArrowLeft', 80],
  ['ArrowDown', 81],
  ['ArrowUp', 82],

  // Numpad
  ['NumLock', 83],
  ['NumpadDivide', 84],
  ['NumpadMultiply', 85],
  ['NumpadSubtract', 86],
  ['NumpadAdd', 87],
  ['NumpadEnter', 88],
  ['Numpad1', 89],
  ['Numpad2', 90],
  ['Numpad3', 91],
  ['Numpad4', 92],
  ['Numpad5', 93],
  ['Numpad6', 94],
  ['Numpad7', 95],
  ['Numpad8', 96],
  ['Numpad9', 97],
  ['Numpad0', 98],
  ['NumpadDecimal', 99],

  // International / Non-US keyboard keys
  ['IntlBackslash', 100],
  ['ContextMenu', 101],
  ['Power', 102],
  ['NumpadEqual', 103],

  // Extended function keys
  ['F13', 104],
  ['F14', 105],
  ['F15', 106],
  ['F16', 107],
  ['F17', 108],
  ['F18', 109],
  ['F19', 110],
  ['F20', 111],
  ['F21', 112],
  ['F22', 113],
  ['F23', 114],
  ['F24', 115],

  // System / Edit keys
  ['Execute', 116],
  ['Help', 117],
  ['Props', 118],
  ['Select', 119],
  ['Stop', 120],
  ['Again', 121],
  ['Undo', 122],
  ['Cut', 123],
  ['Copy', 124],
  ['Paste', 125],
  ['Find', 126],

  // Media / Volume keys
  ['AudioVolumeMute', 127],
  ['AudioVolumeUp', 128],
  ['AudioVolumeDown', 129],
  ['VolumeMute', 127],
  ['VolumeUp', 128],
  ['VolumeDown', 129],

  // Locking keys (for keyboards with physical lock keys)
  ['LockingCapsLock', 130],
  ['LockingNumLock', 131],
  ['LockingScrollLock', 132],

  // Numpad additional
  ['NumpadComma', 133],
  ['NumpadEqual2', 134],

  // International keys - Japanese
  ['IntlRo', 135],
  ['KanaMode', 136],
  ['IntlYen', 137],
  ['Convert', 138],
  ['NonConvert', 139],

  // International keys - Additional Japanese
  ['International6', 140],
  ['International7', 141],
  ['International8', 142],
  ['International9', 143],

  // Language keys - Korean/Japanese/Chinese
  ['Lang1', 144],
  ['Lang2', 145],
  ['Lang3', 146],
  ['Lang4', 147],
  ['Lang5', 148],
  ['Lang6', 149],
  ['Lang7', 150],
  ['Lang8', 151],
  ['Lang9', 152],

  // Numpad extended
  ['NumpadParenLeft', 182],
  ['NumpadParenRight', 183],
  ['NumpadBackspace', 187],
  ['NumpadMemoryStore', 208],
  ['NumpadMemoryRecall', 209],
  ['NumpadMemoryClear', 210],
  ['NumpadMemoryAdd', 211],
  ['NumpadMemorySubtract', 212],
  ['NumpadClear', 216],
  ['NumpadClearEntry', 217],

  // Modifier keys
  ['ControlLeft', 224],
  ['ShiftLeft', 225],
  ['AltLeft', 226],
  ['MetaLeft', 227],
  ['WinLeft', 227],
  ['ControlRight', 228],
  ['ShiftRight', 229],
  ['AltRight', 230],
  ['MetaRight', 231],
  ['WinRight', 231],

  // Media keys
  ['MediaPlayPause', 232],
  ['MediaStop', 233],
  ['MediaTrackPrevious', 234],
  ['MediaTrackNext', 235],
  ['Eject', 236],
  ['MediaSelect', 237],

  // Application launch keys
  ['LaunchMail', 238],
  ['LaunchApp1', 239],
  ['LaunchApp2', 240],

  // Additional browser/system keys
  ['BrowserSearch', 240],
  ['BrowserHome', 241],
  ['BrowserBack', 242],
  ['BrowserForward', 243],
  ['BrowserStop', 244],
  ['BrowserRefresh', 245],
  ['BrowserFavorites', 246],

  // Sleep/Wake keys
  ['Sleep', 248],
  ['Wake', 249],

  // Accessibility keys
  ['MediaRewind', 250],
  ['MediaFastForward', 251]
]);
