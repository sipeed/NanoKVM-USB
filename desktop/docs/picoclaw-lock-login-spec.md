# picoclaw によるリモート Windows ロック・ログイン機能仕様書

## 概要

NanoKVM-USB デスクトップアプリに組み込まれた AI エージェント「picoclaw」を通じて、自然言語の指示でリモート接続された Windows PC のロック・ログイン操作を行う機能です。

**入力経路**: チャット UI（アプリ内）または Telegram ボット

**出力先**: NanoKVM-USB ハードウェア経由で Windows PC に HID キーボード入力を送信

---

## システム構成

```
ユーザー入力
  ├─ チャット UI（アプリ内）
  └─ Telegram ボット
       ↓
picoclaw (AI エージェント / Go バイナリ)
  ├─ Agent モード（チャット UI 用）
  └─ Gateway モード（Telegram 用）
       ↓
LLM (llama-3.1-8b-instruct via OpenRouter)
       ↓
テキスト出力 → インターセプター（manager.ts）
  LLMの出力テキストをHTTPリクエストへ変換（例: ロックの場合 Win+L）
       ↓
HTTP API サーバー (127.0.0.1:18792)
  キー名配列 ["Win","L"] をIPC経由でレンダラーへ中継
       ↓
IPC → レンダラープロセス（api-handler.ts）
  キー名をHIDコードに変換し8バイトHIDレポートに組み立て
  組み立てたレポートをIPC経由でメインプロセスに返す
       ↓
HID キーボードレポート → シリアルポート → NanoKVM-USB → Windows PC
```

---

## 対応コマンド

### 1. ロック（画面ロック）

| 項目 | 内容 |
|------|------|
| **操作内容** | Windows のショートカット `Win + L` を送信 |
| **対応フレーズ例** | 「Windowsをロックして」「PCをロックしてください」「ロック画面にして」「lock the screen」 |
| **内部動作** | `Win` キー押下 → `L` キー押下 → 100ms 保持 → 逆順にリリース |

### 2. ログイン（PIN / パスワード入力）

| 項目 | 内容 |
|------|------|
| **操作内容** | ロック画面を解除し、PIN コードまたはパスワードを入力してログイン |
| **対応フレーズ例** | 「PINコード 123qweasd でログインして」「パスワード mypass123 でログインしてください」「login with PIN 1234」 |

#### ログインシーケンス（PIN のみ）

| ステップ | 操作 | 目的 | 待機時間 |
|----------|------|------|----------|
| 1 | `Space` キー押下 | ロック画面からサインイン画面を呼び起こす | 500ms |
| 1b | `Space` キー再押下 | バックアップの起動操作 | - |
| 2 | 待機 | Windows がPIN入力欄を描画・フォーカスするのを待つ | 3,000ms |
| 3 | `Backspace` × 20回 | 入力欄の既存文字をクリア（Ctrl+A はPIN欄で無効のため） | 各30ms間隔 |
| 4 | PIN を1文字ずつ入力 | HID キーボードレポートで各文字を送信 | 各150ms間隔 |
| 5 | `Enter` キー押下 | PIN を送信してログイン | - |

#### ログインシーケンス（ユーザー名 + パスワード）

| ステップ | 操作 | 目的 | 待機時間 |
|----------|------|------|----------|
| 1〜3 | 上記と同じ | 画面起動・フィールドクリア | 同上 |
| 4 | ユーザー名を入力 | ユーザー名欄にテキスト入力 | 300ms |
| 5 | `Tab` キー押下 | パスワード欄に移動 | 300ms |
| 6 | パスワードを入力 | パスワード欄にテキスト入力 | 300ms |
| 7 | `Enter` キー押下 | ログイン実行 | - |

---

## LLM 出力フォーマットとインターセプター

LLM（llama-3.1-8b）はモードや文脈により異なるフォーマットでツール呼び出しを出力します。
インターセプター（`manager.ts`）は以下の3形式すべてを検出し、**同一の実行パス**で処理します。

### 検出フォーマット（優先順）

| 優先度 | フォーマット | 例 |
|--------|-------------|-----|
| 1 | アクションタグ | `<<nanokvm:login:123qweasd>>` |
| 2 | JSON オブジェクト | `{"type":"function","name":"nanokvm_login","parameters":{"password":"123qweasd"}}` |
| 3 | Python 関数呼び出し | `nanokvm_login(password='123qweasd')` |

### 処理フロー

```
LLM テキスト出力
  ↓
  ├─ Format 1: アクションタグ検出 → parseActionTagParams() → パラメータ正規化
  ├─ Format 2: JSON 構造パース（extractJsonObjects） → キー順序に非依存
  └─ Format 3: Python 関数引数パース（parseFunctionArgs）
       ↓
  すべて {toolName, params} に正規化
       ↓
  executeToolCall() ← 唯一の実行関数
       ↓
  callApi() → HTTP POST → API サーバー
```

### 重複実行防止

- 同一エンドポイント + 同一パラメータのリクエストは **15秒間の重複排除**（debounce）が適用されます
- Agent モード（チャット UI）では、picoclaw がネイティブにツール実行した場合とインターセプターの二重実行を防止するためのものです

---

## レスポンスメッセージ

ユーザーに表示するメッセージは、LLM 出力からツール呼び出し構文を除去（`stripActionTags`）して生成されます。

### 除去対象

- `<<nanokvm:...>>` アクションタグ
- `nanokvm_` を含む JSON オブジェクト
- `nanokvm_xxx(...)` 関数呼び出し構文
- LLM プリアンブル文（例: "The function call that best answers the prompt is:"）

### フォールバック

除去後にテキストが空になった場合、「コマンドを実行しました」がデフォルトメッセージとして表示されます。

---

## 対応キー名

ショートカットで使用できるキー名はLLMの出力する一般的な名前から自動変換されます。

| 入力名 | 変換先（HID コード） |
|--------|---------------------|
| Win, Windows, Meta, Cmd | MetaLeft |
| Ctrl, Control | ControlLeft |
| Alt, Option | AltLeft |
| Shift | ShiftLeft |
| Del | Delete |
| Esc | Escape |
| Return | Enter |
| A〜Z（単一文字） | KeyA〜KeyZ |
| 0〜9（単一数字） | Digit0〜Digit9 |
| F1〜F24 | F1〜F24 |

---

## API エンドポイント一覧

HTTP API サーバー（`127.0.0.1:18792`）が提供するエンドポイント:

| メソッド | パス | パラメータ | 説明 |
|----------|------|-----------|------|
| POST | `/api/keyboard/shortcut` | `{"keys": ["Win", "L"]}` | キーボードショートカット送信 |
| POST | `/api/keyboard/login` | `{"password": "123", "username?": "user"}` | Windows ログイン実行 |
| POST | `/api/keyboard/type` | `{"text": "Hello"}` | テキスト入力 |
| POST | `/api/mouse/click` | `{"button": "left"}` | マウスクリック |

---

## 入力経路別の挙動

| 項目 | チャット UI（Agent モード） | Telegram（Gateway モード） |
|------|---------------------------|---------------------------|
| picoclaw動作モード | Agent（ツール実行能力あり） | Gateway（テキスト中継のみ） |
| LLM出力傾向 | JSON / Python関数形式が多い | アクションタグ形式が多い |
| インターセプター | 3形式すべて対応 | 3形式すべて対応 |
| レスポンス表示 | チャット吹き出し | Telegram メッセージ |
| 実行結果 | 同一（executeToolCall経由） | 同一（executeToolCall経由） |

---

## 制約事項

- **同時押しキー数**: HID 仕様により最大6キー（修飾キーは別枠）
- **文字入力**: ASCII 英数字・基本記号のみ対応（日本語入力は非対応）
- **マウス移動**: 座標指定は未実装（クリックのみ対応）
- **ログイン待機**: PIN 入力欄の表示に約3秒の固定待機があるため、Windows の応答が遅い環境では失敗する可能性あり
