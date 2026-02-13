const ja = {
  translation: {
    camera: {
      tip: '認証を待っています...',
      denied: '認証に失敗しました',
      authorize:
        'リモートデスクトップにはカメラの許可が必要です。設定でカメラの許可を与えてください。',
      failed: 'カメラへの接続に失敗しました。もう一度お試しください。'
    },
    modal: {
      title: 'USBデバイスを選択',
      selectVideo: 'ビデオ入力デバイスを選択してください',
      selectSerial: 'シリアルデバイスを選択してください',
      selectBaudRate: 'ボーレートを選択してください'
    },
    menu: {
      serial: 'シリアル',
      keyboard: 'キーボード',
      mouse: 'マウス',
      serialPort: {
        device: 'シリアルデバイス',
        baudRate: 'ボーレート',
        noDeviceFound: 'シリアルデバイスが見つかりません',
        clickToSelect: 'クリックしてシリアルポートを選択'
      }
    },
    video: {
      auto: 'Auto',
      resolution: '解像度',
      scale: '拡大縮小',
      customResolution: 'カスタム',
      device: 'デバイス',
      maxResolution: {
        title: '最大解像度',
        mode1440p30: '2560x1440@30fps',
        mode1080p60: '1920x1080@60fps'
      },
      custom: {
        title: 'カスタム解像度',
        width: '幅',
        height: '高さ',
        confirm: 'OK',
        cancel: 'キャンセル'
      },
      info: {
        title: '画面表示情報',
        capturedResolution: '取得解像度',
        displayResolution: '表示解像度',
        displayScale: '表示倍率'
      }
    },
    keyboard: {
      paste: '貼り付け',
      virtualKeyboard: 'キーボード',
      numLock: 'NumLock',
      capsLockSync: 'CapsLock同期',
      commandToCtrl: 'Cmd→Ctrl変換',
      ignoreCapsLock: 'CapsLockキーを無視（IME用）',
      shortcut: {
        title: 'ショートカット',
        custom: 'カスタム',
        capture: 'ここをクリックしてショートカットをキャプチャ',
        clear: 'クリア',
        save: '保存'
      }
    },
    mouse: {
      cursor: {
        title: 'カーソル',
        pointer: 'ポインター',
        grab: 'グラブ',
        cell: 'セル',
        hide: '非表示'
      },
      mode: 'マウスモード',
      absolute: '絶対モード',
      relative: '相対モード',
      direction: 'ホイール方向',
      scrollUp: '上にスクロール',
      scrollDown: '下にスクロール',
      speed: 'ホイール速度',
      fast: '速い',
      slow: '遅い',
      requestPointer:
        '相対モードを使用中です。マウスポインターを取得するにはデスクトップをクリックしてください。',
      jiggler: {
        title: 'マウスジグラー',
        enable: '有効',
        disable: '無効'
      },
      autoClicker: {
        title: '自動クリック',
        enable: '有効（5分間隔）',
        disable: '無効'
      }
    },
    settings: {
      title: '設定',
      appearance: {
        title: '外観',
        language: '言語',
        menu: 'メニューバー',
        menuTips: '起動時にメニューバーを開く'
      },
      update: {
        title: '更新を確認',
        latest: '最新バージョンを使用しています。',
        outdated: '更新が利用可能です。今すぐ更新しますか？',
        downloading: 'ダウンロード中...',
        installing: 'インストール中...',
        failed: '更新に失敗しました。もう一度お試しください。',
        confirm: '確認',
        cancel: 'キャンセル'
      },
      about: {
        title: 'バージョン情報',
        version: 'バージョン',
        community: 'コミュニティ'
      },
      reset: {
        title: '設定をリセット',
        description: 'すべてのアプリケーション設定をデフォルト値にリセットします',
        warning: '警告',
        warningDescription: 'この操作は元に戻せません。すべてのカスタム設定が失われます。',
        button: 'すべての設定をリセット',
        confirmTitle: 'リセットの確認',
        confirmMessage: 'すべての設定をリセットしてもよろしいですか？この操作は元に戻せません。',
        confirm: 'リセット',
        cancel: 'キャンセル'
      }
    }
  }
}

export default ja
