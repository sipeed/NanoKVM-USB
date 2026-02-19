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
| 0 | `Escape` キー押下 | 前回のPINエラーダイアログが残っている場合に閉じる | 300ms |
| 1 | `Space` キー押下 | ロック画面からサインイン画面を呼び起こす | 500ms |
| 1b | `Space` キー再押下 | バックアップの起動操作 | - |
| 2 | 待機 | Windows がPIN入力欄を描画・フォーカスするのを待つ | 3,000ms |
| 3 | `Backspace` × 20回 | 入力欄の既存文字をクリア（Ctrl+A はPIN欄で無効のため） | 各30ms間隔 |
| 4 | PIN を1文字ずつ入力 | HID キーボードレポートで各文字を送信 | 各150ms間隔 |
| 5 | `Enter` キー押下 | PIN を送信してログイン | - |

#### ログインシーケンス（ユーザー名 + パスワード）

| ステップ | 操作 | 目的 | 待機時間 |
|----------|------|------|----------|
| 0 | `Escape` キー押下 | エラーダイアログを閉じる（前回失敗時の残り） | 300ms |
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
| 検証結果配信 | LLM応答に統合して返却 | 検証後に stdin 経由で追加送信 |

---

## 制約事項

- **同時押しキー数**: HID 仕様により最大6キー（修飾キーは別枠）
- **文字入力**: ASCII 英数字・基本記号のみ対応（日本語入力は非対応）
- **マウス移動**: 座標指定は未実装（クリックのみ対応）
- **ログイン待機**: PIN 入力欄の表示に約3秒の固定待機があるため、Windows の応答が遅い環境では失敗する可能性あり

---

## 画面検証機能（ロック・ログイン）

ロック（Win+L）およびログインコマンド実行後、NanoKVM-USB の HDMI キャプチャ映像をスクリーンキャプチャし、**専用の Vision LLM** で画面内容を解析して結果を自動判定します。

### 設計思想: チャット用 LLM と Vision LLM の分離

画面検証に使用する Vision LLM は、チャット用の LLM とは**別に設定**します。

```
┌─────────────────────────────────────────────┐
│  設定画面 (picoclaw.tsx)                     │
│                                              │
│  ── チャット LLM ──                          │
│  [Provider] OpenRouter                       │
│  [API Key]  sk-or-...                        │
│  [Model]    Llama 3.1 8B 💨                  │
│                                              │
│  ── 👁️ 画面検証 Vision LLM ──              │
│  [Provider] Groq (無料・クラウド・推奨)      │
│  [API Key]  gsk_...                          │
│  [Model]    Llama 3.2 11B Vision 👁️         │
└─────────────────────────────────────────────┘
```

**理由**: チャットには安価なテキストLLM、画面検証にはVision対応LLMという使い分けが必要。
例: チャット = Llama 3.1 8B (OpenRouter 無料枠) + Vision = Llama 3.2 11B Vision (Groq 無料)

### フロー

```
ロックコマンド (Win+L) / ログインコマンド実行要求
  ↓
━━━ 事前チェック（preCheckScreenState） ━━━
Vision LLM が設定されているか？
  ├─ NO → チェックをスキップし、そのままコマンドを実行
  └─ YES → 現在の画面をキャプチャして状態を判定
              ↓
         現在の画面状態は？
           │
           ├ 「ロックして」＋ すでにロック画面
           │   → 🔒 「すでにロック画面です。ロック操作は不要です。」
           │   → Win+L を送信しない（スキップ）
           │
           ├ 「ログインして」＋ すでにデスクトップ
           │   → ✅ 「すでにログインされています。ログイン操作は不要です。」
           │   → PIN 入力シーケンスを送信しない（スキップ）
           │
           └ それ以外 → コマンドを実行
  ↓
━━━ コマンド実行 ━━━
HID キー入力シーケンス
  ↓
━━━ 事後検証（scheduleScreenVerification） ━━━
遅延後に自動起動
  ├─ lock: 3秒後（Ollama: 5秒後）
  └─ login: 12秒後（Ollama: 15秒後）
  ↓
スクリーンキャプチャ取得
  ↓
<video> → <canvas>.drawImage() → base64 JPEG
  ↓
Vision LLM API 呼び出し（画面状態を判定）
  ↓
判定結果を LLM 応答テキストに統合
  ※ LLM応答の返却を遅延させ、検証結果を末尾に追記する
  ※ チャット UI（Agent モード）・Telegram（Gateway モード）の
    両方に自然に配信される（専用 IPC チャネル不要）

  【Agent モード（チャット UI）】
      LLM応答 + 検証結果 → resolve() → チャット吹き出しに表示
  
  【Gateway モード（Telegram）】
      LLM応答を先に出力 → 検証完了後に追加メッセージを
      picoclaw の stdin に書き込み → Telegram に転送

  【ロック検証の場合】
      ├─ 🔒 LOCK_SCREEN: 「ロック成功」
      └─ ⚠️ DESKTOP: 「まだデスクトップが表示されています」

  【ログイン検証の場合】
      ├─ ✅ LOGIN_SUCCESS: 「ログイン成功」
      ├─ ❌ LOGIN_FAILED: 「PINが正しくないようです」
      │     └─ 自動で Enter キーを送信し、エラーダイアログの OK ボタンを閉じる
      └─ ⚠️ LOCK_SCREEN: 「まだサインイン画面です」
```

### Vision LLM 未設定時の振る舞い

Vision LLM が設定されていない場合:
- **事前チェック**: スキップされ、コマンドは常に実行される
- **事後検証**: 設定案内メッセージが表示される（「設定 → picoclaw → 👁️ 画面検証 Vision LLM で設定してください」）

### Vision LLM 対応モデル一覧

設定画面の「画面検証 Vision LLM」で選択可能なプロバイダとモデル:

| プロバイダ | モデル | 料金 | 速度 | 備考 |
|-----------|--------|------|------|------|
| **Groq** | Llama 3.2 11B Vision | **無料** | 高速 | **推奨**: クレカ不要、14,400 req/日 |
| **Groq** | Llama 3.2 90B Vision | **無料** | 低速 | 高精度 |
| **Ollama** | Moondream2 (1.7B) | **無料** | ~60秒 | ローカル・CPU向き |
| **Ollama** | LLaVA (7B) | **無料** | ~3分 | ローカル・高精度 |
| OpenRouter | Gemini 2.0 Flash | 安価 | 高速 | API キー共有可 |
| OpenRouter | Claude 3.5 Sonnet | 高額 | 中速 | 高精度 |
| OpenAI | GPT-4o Mini | 安価 | 高速 | - |
| OpenAI | GPT-4o | 高額 | 中速 | 高精度 |
| Anthropic | Claude 3.5 Haiku | 安価 | 高速 | - |
| Anthropic | Claude 3.5 Sonnet | 高額 | 中速 | 高精度 |

### タイムアウト設定

プロバイダに応じてタイマーを自動調整:

| プロバイダ | キャプチャ遅延 (ロック) | キャプチャ遅延 (ログイン) | API タイムアウト |
|-----------|----------------------|------------------------|----------------|
| クラウド (Groq等) | 3秒 | 12秒 | 30秒 |
| Ollama (ローカル) | 5秒 | 15秒 | 120秒 |

### Config 構造

Vision LLM の設定は `~/.picoclaw/config.json` に保存:

```json
{
  "agents": {
    "defaults": {
      "provider": "openrouter",
      "model": "meta-llama/llama-3.1-8b-instruct",
      "vision_provider": "groq",
      "vision_model": "llama-3.2-11b-vision-preview"
    }
  },
  "providers": {
    "openrouter": { "api_key": "sk-or-..." },
    "groq": { "api_key": "gsk_..." }
  }
}
```

### API エンドポイント（追加分）

| メソッド | パス | パラメータ | 説明 |
|----------|------|-----------|------|
| GET | `/api/screen/capture` | なし | 現在の画面をキャプチャ（base64 JPEG） |
| POST | `/api/screen/verify-login` | なし | ログイン結果を Vision LLM で検証 |

### Vision LLM 未設定時の振る舞い（事後検証メッセージ）

Vision LLM が設定されていない場合、ロック・ログイン実行後に以下のメッセージが自動表示されます（事前チェックはスキップ）:

```
🔍 画面検証にはVision LLMの設定が必要です。

設定 → picoclaw → 「👁️ 画面検証 Vision LLM」で設定してください。

無料のおすすめ:
  • Groq + Llama 3.2 11B Vision（クラウド・無料・高速・クレカ不要）
  • Ollama + Moondream2（ローカル・無料・CPU向き）

設定後、ロック・ログイン操作の結果を自動判定します。
```
