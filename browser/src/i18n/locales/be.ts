const be = {
  translation: {
    serial: {
      notSupported:
        'Seriële poort wordt niet ondersteund. Gebruik de desktop Chrome-browser om muis en klavier te gebruiken.',
      failed: 'Verbinding met seriële poort mislukt. Probeer opnieuw'
    },
    camera: {
      tip: 'Wachten op toelating...',
      denied: 'Toelating geweigerd',
      authorize:
        'De externe desktop vereist cameratoegang. Geef toelating voor de camera in de browserinstellingen.',
      failed: 'Kan geen verbinding maken met de camera. Probeer opnieuw.'
    },
    modal: {
      title: 'Kies USB-apparaat',
      selectVideo: 'Kies een video-invoerapparaat',
      selectSerial: 'Kies serieel apparaat'
    },
    menu: {
      serial: 'Serieel',
      keyboard: 'Klavier',
      mouse: 'Muis'
    },
    video: {
      resolution: 'Resolutie',
      scale: 'Schaal',
      customResolution: 'Aangepast',
      device: 'Toestel',
      custom: {
        title: 'Aangepaste resolutie',
        width: 'Breedte',
        height: 'Hoogte',
        confirm: 'OK',
        cancel: 'Annuleren'
      }
    },
    keyboard: {
      paste: 'Plakken',
      virtualKeyboard: 'Virtueel klavier',
      shortcut: {
        title: 'Sneltoetsen',
        ctrlAltDel: 'Ctrl + Alt + Delete',
        ctrlD: 'Ctrl + D',
        winTab: 'Win + Tab'
      }
    },
    mouse: {
      cursor: {
        title: 'Muisaanwijzer',
        pointer: 'Wijzer',
        grab: 'Hand',
        cell: 'Kruis',
        hide: 'Verborgen'
      },
      mode: 'Muismodus',
      absolute: 'Absolute modus',
      relative: 'Relatieve modus',
      direction: 'Scrollrichting',
      scrollUp: 'Omhoog scrollen',
      scrollDown: 'Omlaag scrollen',
      requestPointer:
        'Gebruik relatieve modus. Klik op het bureaublad om de muisaanwijzer vast te nemen.'
    },
    settings: {
      language: 'Taal',
      document: 'Document',
      download: 'Download'
    }
  }
};

export default be;
