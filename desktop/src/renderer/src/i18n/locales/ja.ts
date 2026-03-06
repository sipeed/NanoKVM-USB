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
      },
      picoclaw: {
        title: 'AI アシスタント',
        description: 'AI エージェントを設定して、自然言語でリモートコンピューターを制御できます',
        agentType: 'AI エージェント',
        agentTypePicoclaw: 'picoclaw (Go)',
        agentTypeZeroclaw: 'zeroclaw (Rust)',
        agentTypeHint: 'AIエージェントバックエンドを選択',
        agentSwitched: 'エージェントを {{agent}} に切り替えました',
        agentSwitchFailed: 'エージェント切り替えに失敗しました',
        provider: 'LLM プロバイダー',
        apiKey: 'API キー',
        apiKeyRequired: 'API キーを入力してください',
        apiKeyHint: 'コピーしたAPI キーを右のボタンから貼り付けできます',
        model: 'モデル',
        modelHint: '💨 軽量モデルを選択すると無料枠を節約できます',
        save: '保存',
        test: '接続テスト',
        testSuccess: 'AI エージェントとの通信に成功しました！',
        saved: '設定を保存しました',
        pasteTooltip: 'クリップボードから貼り付け',
        getKeyTooltip: 'API キー取得ページを開く',
        openedBrowser: 'ブラウザでAPI キー取得ページを開きました',
        clipboardEmpty: 'クリップボードが空です',
        invalidApiKey: 'API キーの形式が正しくありません',
        pastedFromClipboard: 'クリップボードから貼り付けました',
        clipboardError: 'クリップボードの読み取りに失敗しました',
        infoTitle: 'AI エージェントについて',
        info1: 'AI エージェントは自然言語コマンドでリモート PC を制御できます',
        info2: '例: "ログインしてください" で自動ログイン実行',
        info3: 'API キーは暗号化されて保存されます',
        vault: {
          title: 'ログイン認証情報',
          description: 'Windows のログイン PIN/パスワードを暗号化して安全に保存します。チャットに認証情報を入力する必要がなくなります。',
          status: 'ステータス',
          notConfigured: '未設定',
          locked: 'ロック中',
          unlocked: '解錠済み',
          setup: '初回セットアップ',
          pin: 'Windows PIN / パスワード',
          pinPlaceholder: '例: 1234',
          descriptionLabel: '説明（任意）',
          descriptionPlaceholder: '例: Windows PC (自宅)',
          masterPassword: 'マスターパスワード',
          masterPasswordPlaceholder: 'Vault 解錠用パスワード',
          masterPasswordConfirm: 'マスターパスワード（確認）',
          masterPasswordConfirmPlaceholder: '同じパスワードを再入力',
          setupButton: 'Vault をセットアップ',
          setupSuccess: 'Credential Vault を設定しました',
          unlockButton: '解錠',
          unlockSuccess: 'Vault を解錠しました',
          lockButton: 'ロック',
          lockSuccess: 'Vault をロックしました',
          save: '保存',
          saveSuccess: '認証情報を更新しました',
          savedCredential: '保存済みクレデンシャル',
          changePassword: 'マスターパスワード変更',
          newMasterPassword: '新しいマスターパスワード',
          newMasterPasswordConfirm: '新しいマスターパスワード（確認）',
          changePasswordButton: 'パスワード変更',
          changePasswordSuccess: 'マスターパスワードを変更しました',
          deleteButton: 'Vault を削除',
          deleteTitle: 'Vault を削除',
          deleteConfirm: '保存済みのログイン認証情報がすべて削除されます。この操作は元に戻せません。',
          deleteSuccess: 'Vault を削除しました',
          warningForget: 'マスターパスワードを忘れると保存済みの認証情報を復元できません。',
          errorMasterRequired: 'マスターパスワードを入力してください',
          errorMasterMismatch: 'マスターパスワードが一致しません',
          errorPinRequired: 'PINまたはパスワードを入力してください',
          errorIncorrect: 'マスターパスワードが正しくありません',
          promptTitle: 'Vault の解錠が必要です',
          promptDescription: 'AI エージェントがログインを要求しましたが、Vault がロック中です。マスターパスワードを入力して解錠してください。',
          promptUnlocking: '解錠中...',
          promptCancel: 'キャンセル',
          promptUnlock: '解錠'
        },
        modelUpdate: {
          title: 'モデルリスト自動更新',
          description: 'プロバイダのAPIを定期的にチェックし、モデルの提供状況の変更を検出します',
          enabled: '自動更新を有効化',
          frequency: '更新頻度',
          daily: '毎日',
          weekly: '毎週',
          monthly: '毎月',
          hour: '時刻（時）',
          dayOfWeek: '曜日',
          dayOfMonth: '日付',
          sunday: '日曜日',
          monday: '月曜日',
          tuesday: '火曜日',
          wednesday: '水曜日',
          thursday: '木曜日',
          friday: '金曜日',
          saturday: '土曜日',
          updateNow: '今すぐ更新',
          updating: '確認中...',
          lastChecked: '最終確認',
          nextCheck: '次回確認',
          never: '未実行',
          saved: 'スケジュールを保存しました',
          updateSuccess: 'モデルリストを更新しました',
          updateFailed: 'モデルリストの更新に失敗しました',
          modelsFound: '{{count}} モデルを検出',
          autoSwitched: 'モデルを自動切替しました',
          noChanges: '全モデルが引き続き利用可能です'
        }
      }
    },
    chat: {
      title: 'AI アシスタント',
      placeholder: 'メッセージを入力...',
      empty: 'AI アシスタントと会話を始めましょう。\n例: "Windowsにログインして"'
    }
  }
}

export default ja
