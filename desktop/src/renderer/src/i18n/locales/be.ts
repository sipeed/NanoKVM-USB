const be = {
    translation: {
      camera: {
        tip: 'Wachten op toelating...',
        denied: 'Toelating geweigerd',
        authorize:
          'De externe desktop vereist cameratoegang. Geef toelating voor de camera in de browserinstellingen.',
        failed: 'Kan geen verbinding maken met de camera. Probeer opnieuw.'
      },
      modal: {
                title: 'Kies USB-apparaat',
                selectVideo: 'Selecteer een video-invoerapparaat',
                selectSerial: 'Kies serieel apparaat',
                selectBaudRate: 'Selecteer baudrate'
        },
      menu: {
                serial: 'Serieel',
                keyboard: 'Toetsenbord',
                mouse: 'Muis',
                serialPort: {
                        device: 'Serieel apparaat',
                        baudRate: 'Baudrate',
                        noDeviceFound: 'Geen seriële apparaten gevonden',
                        clickToSelect: 'Klik om seriële poort te selecteren'
                }
        },
      video: {
        resolution: 'Resolutie',
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
        ctrlAltDel: 'Ctrl + Alt + Delete'
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
        requestPointer: 'Gebruik relatieve modus. Klik op het bureaublad om de muisaanwijzer vast te nemen.'
      },
      settings: {
        title: 'Instellingen',
        appearance: {
          title: 'Weergave',
          language: 'Taal',
          menu: 'Menubalk',
          menuTips: 'Menubalk openen bij opstarten'
        },
        update: {
          title: 'Controleren op updates',
          latest: 'U hebt al de nieuwste versie.',
          outdated: 'Er is een update beschikbaar. Wilt u nu updaten?',
          downloading: 'Downloaden...',
          installing: 'Installeren...',
          failed: 'Update mislukt. Probeer opnieuw.',
          confirm: 'Bevestigen',
          cancel: 'Annuleren'
        },
        about: {
          title: 'Over',
          version: 'Versie',
          community: 'Community'
        },
        reset: {
          title: 'Instellingen resetten',
          description: 'Alle applicatie-instellingen resetten naar standaardwaarden',
          warning: 'Waarschuwing',
          warningDescription: 'Deze actie kan niet ongedaan worden gemaakt. Alle aangepaste instellingen gaan verloren.',
          button: 'Alle instellingen resetten',
          confirmTitle: 'Reset bevestigen',
          confirmMessage: 'Weet u zeker dat u alle instellingen wilt resetten? Deze actie kan niet ongedaan worden gemaakt.',
          confirm: 'Reset',
          cancel: 'Annuleren'
        }
      }
    }
  }
  
  export default be