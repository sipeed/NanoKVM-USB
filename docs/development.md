# 开发指南（双端统一后的仓库结构）

本仓库包含 NanoKVM-USB 的两个应用：浏览器版与 Electron 桌面版。两者共享同一套渲染层代码，平台差异通过适配器注入。

## 环境要求

- Node.js **24 LTS**（`.nvmrc` 已固定）
- pnpm **12**（`packageManager` 字段已固定，建议 `corepack enable` 后使用）

## 目录结构

```
NanoKVM-USB/
├── apps/
│   ├── browser/                 # Vite SPA：入口 + Web Serial / 浏览器平台适配器
│   └── desktop/                 # electron-vite：main / preload + IPC 平台适配器
├── packages/
│   ├── core/                    # 无 UI：设备协议（proto）、Device 门面、Transport/PlatformAdapter 接口
│   └── ui/                      # 共享 React 渲染层：组件、jotai、i18n、storage、样式
├── pnpm-workspace.yaml          # workspace + overrides + allowBuilds
└── pnpm-lock.yaml               # 唯一锁文件
```

依赖版本统一在根 `package.json`（构建/工具链）与各包 `package.json`（运行时依赖）中管理，**全部使用精确版本**，升级必须走显式 PR。

## 常用命令

```bash
pnpm install --frozen-lockfile   # 安装（CI 同款）
pnpm dev:browser                 # 浏览器版开发服务器（:3001）
pnpm dev:desktop                 # 桌面版开发（electron-vite dev）
pnpm build:browser               # 浏览器版构建 → apps/browser/dist
pnpm build:desktop               # 桌面版构建 → apps/desktop/out
pnpm --filter @nanokvm/desktop build:unpack  # 桌面端免安装产物（验证打包）
pnpm typecheck                   # 所有包的类型检查
pnpm lint                        # ESLint
pnpm format                      # Prettier 全仓格式化
```

## 分层与边界

```
apps/*            ← 只能提供平台能力与入口，不写业务 UI
  platform/       ← PlatformAdapter / SerialTransport 实现
packages/ui       ← 全部 React UI、jotai atoms、i18n、localStorage 封装
packages/core     ← 协议编解码、Device 门面、接口定义（不依赖 DOM/Electron）
```

**规则：**

1. `packages/ui` 与 `packages/core` 中**禁止**出现 `window.electron`、`navigator.serial`、`node:*`、`electron` 等平台 API。
2. 组件需要平台能力时使用 `getPlatform()` / `getDevice()`（见 `packages/ui/src/services.ts`），平台能力通过 `PlatformAdapter` 暴露。
3. 需要区分平台能力时，判断**能力**（如 `transport.supportsEnumeration()`、`platform.updater`），不要判断"是不是 Electron"。
4. 新增平台能力：先在 `packages/core/src/platform.ts` 扩展接口，再在两个 app 的适配器里实现。

## 串口传输层

- 浏览器：`apps/browser/src/platform/web-serial.ts`（Web Serial，需用户手势选择端口）
- 桌面：`apps/desktop/src/renderer/src/platform/ipc-transport.ts` → preload `window.api.serial.*` → 主进程 `node-serialport`（只收发原始字节）
- 协议与 `Device` 门面只在 `packages/core` 维护一份。

## i18n / storage

- 语言文件：`packages/ui/src/i18n/locales/*.ts`，新增 key 时至少补 `en.ts`（其余语言缺 key 时自动回退英文）。
- localStorage key 统一以 `nanokvm-usb-` 前缀；桌面端历史 key `nanokvm-usb-keyboard-shortcuts`（复数）在读取时兼容，写入统一为单数形式。

## 代码检查与格式化

- **ESLint 10 + typescript-eslint**：配置在根 `eslint.config.mjs`，工具链独立安装在 `tools/lint`（因为 typescript-eslint 目前只支持 TypeScript < 6.1，而构建链已用 TypeScript 7 原生编译器；`tools/lint` 自带 TypeScript 5.9 供 parser 使用）。
- **Prettier**：根 `.prettierrc.yaml`（`semi: false`、单引号、import 排序、Tailwind v4 类名排序），全仓统一，不再保留各 app 的独立配置。
- 提交前：`pnpm lint && pnpm format:check && pnpm typecheck`。

## 构建各平台安装包

产物目录统一为 `apps/desktop/dist/`（已 gitignore）。

| 平台 | 命令 | 产物 |
| --- | --- | --- |
| Windows x64 | `pnpm --filter @nanokvm/desktop run build:win` | `NanoKVM-USB-<ver>-win-x64-setup.exe` |
| Windows x64+arm64 | `pnpm --filter @nanokvm/desktop run build:win-full` | `NanoKVM-USB-<ver>-win-setup.exe`（含两个架构的 payload）+ 各架构独立安装包 |
| Linux x64 / arm64 | 在 Linux 上 `pnpm --filter @nanokvm/desktop run build:linux`（或 `build:linux-full`） | AppImage / deb / rpm |
| macOS x64 / arm64 | 在 macOS 上 `pnpm --filter @nanokvm/desktop run build:mac`（或 `build:mac-full`） | dmg / zip |

注意事项：

- **macOS 安装包只能在 macOS 上构建**（electron-builder 明确拒绝其他平台）；签名/公证需要 `APPLE_CERTIFICATE`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`，未配置时 `notarize.js` 会跳过公证（产物未公证，Gatekeeper 会提示）。
- **Linux 包建议在 Linux 上构建**（或 WSL）；`rpm` 目标需要 `rpmbuild`（CI 中已 `apt-get install rpm`），deb 需要 GTK/NSS 等运行库由目标系统安装。
- Windows 安装包未配置代码签名证书，SmartScreen 会提示"未知发布者"；正式发布需配置证书。
- GitHub Actions 的 `release.yml` 已支持三平台矩阵构建（Windows/Linux/macOS，`build:*-full`），并生成 `latest*.yml` 自动更新元数据。

## CI（GitHub Actions）

- **`.github/workflows/build.yml`**（push main / PR / 手动触发）：
  - `quality`：lint + format:check + typecheck + 单测；
  - `detect-changes`：按 `apps/browser` / `apps/desktop` / `packages` 过滤，只构建受影响的一端（`packages/**` 变化会同时触发两端）；
  - `build-browser` / `build-desktop`（linux、windows x64）：上传安装包；手动 dispatch 时总是全量构建；同一分支的旧任务会被自动取消。
- **`.github/workflows/release.yml`**（手动触发 `workflow_dispatch`）：
  1. 从根 `package.json` 读取版本号，创建/复用 `v<version>` tag 并推送；
  2. 构建浏览器 zip + 三平台桌面产物（Windows / Linux / macOS，x64 + arm64）；
  3. 创建 GitHub Release 并附上全部产物（安装包脚本统一带 `--publish never`，发布只由 release job 完成，避免重复/竞态）。
  - 可选 secrets：`APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD`（macOS 签名）、`APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`（macOS 公证）、`WINDOWS_CERTIFICATE` + `WINDOWS_CERTIFICATE_PASSWORD`（Windows 签名）。未配置时产物为未签名版本。
  - 前置条件：先把新版本号提交到 `main`（tag 与产物版本都来自根 `package.json`）。

## 常见问题

### 在 ReFS / Dev Drive 上 `pnpm dev:desktop` 启动即崩溃（exit code -2147483645 / 0xc0000005）

现象：`electron-vite dev` 打印 "starting electron app..." 后立刻退出，Windows 事件日志显示 `electron.exe` 异常代码 `0xc0000005`，甚至 `electron.exe --version` 也会崩。

原因：仓库所在卷是 **ReFS（如 Windows Dev Drive）** 时，Chromium/Electron 的沙箱初始化会失败；把同一份 `electron.exe` 放到 NTFS 卷（如 `%LOCALAPPDATA%\Temp`）就能正常运行。与 Electron/应用代码版本无关。

临时方案（仅本机开发）：

```powershell
pnpm dev:desktop:nosandbox     # = electron-vite dev --noSandbox，仅开发期禁用沙箱
# 或者：$env:ELECTRON_DISABLE_SANDBOX=1; pnpm dev:desktop
```

- `--no-sandbox` **只用于本机开发**，不要用于发布；安装包默认安装到 NTFS 的用户目录，不受此问题影响。
- 彻底解决：把仓库移到 NTFS 卷。

## 验证清单

仓库目前没有自动化 UI 测试，重构/升级后至少运行：

1. `pnpm install --frozen-lockfile`（干净克隆）
2. `pnpm typecheck`、`pnpm lint`
3. `pnpm build:browser`、`pnpm build:desktop`；桌面端再跑一次 `build:unpack`
4. 手工冒烟：摄像头出图、串口连接/自动重连、键盘（含右 Shift/AltGr）、鼠标三种模式、快捷键、粘贴、虚拟键盘、菜单折叠持久化、分辨率/旋转/缩放、音频、拔插断连、语言切换、桌面端自动更新检查。

> 冒烟清单的完整 16 项见 [docs/refactor-plan.md 附录 C](./refactor-plan.md)。
