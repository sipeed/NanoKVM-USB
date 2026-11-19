# NanoKVM-USB 桌面端 / 浏览器端代码统一评估与重构迁移计划

> 评估对象：`desktop/`（Electron）与 `browser/`（Web）两个应用
> 评估基线：`main` @ `1d1dd5e`（159 commits，工作区干净）
> 结论日期：2026-11-19
> 目标技术栈（2026-11-19 决策）：pnpm 12 + Node 24 + Tailwind v4 + antd v6 + 全量最新稳定版，详见 [toolchain-migration.md](./toolchain-migration.md)

---

## 0. 结论摘要（TL;DR）

| 项目 | 结论 |
| --- | --- |
| 本质问题 | 不是"代码乱"，而是**同一份前端代码被复制成两份后各自演化**，格式规范与工具链又互不相同 |
| 重复度 | 渲染层去重后约 **7.4k 行**，实际聚合 **12.2k 行**，重复系数 ≈ **1.64×** |
| 真正的架构分歧 | 只有 1 处：**设备（串口/USB-HID）能力放在哪一层**。浏览器端在渲染层（Web Serial），桌面端在主进程（node-serialport + IPC） |
| 平台特有代码占比 | 两端各自独有文件合计约 **2.3k 行**，其中真正"必须不同"的不足 **600 行** |
| 推荐方案 | **方案 A：pnpm workspace + 共享渲染层包 + 平台适配器注入**（若只想 1 周止血，用方案 C 轻量变体） |
| 预计工作量 | **22–29 人日**（含目标栈升级；1 人 5–6 周 / 2 人 3 周）；只做 P0 + 阶段 1 止血约 **5–6 人日**；暂缓全量升级则 **17–24 人日** |
| 最大风险 | **零自动化测试** + 硬件依赖（串口、摄像头）导致回归验证只能靠手测；其次是 TS 7 原生编译器与 Tailwind v4 共享包扫描 |
| 不建议 | 方案 B（Electron 直接加载 Web 版走 Web Serial）：技术上可行且能 100% 统一，但会重写桌面端的自动重连/权限/枚举语义，在无测试兜底的情况下回归风险最高 |


---

## 1. 现状盘点

### 1.1 仓库与构建拓扑

```
NanoKVM-USB/
├── .github/workflows/{build,release}.yml   # 两个包各自 paths-filter 构建，release 用 desktop/package.json 的 version 打 tag
├── browser/                 # 纯 Vite SPA，Vercel/nginx/Docker 部署，Web Serial
│   ├── package.json (1.0.0) + pnpm-lock.yaml
│   └── src/{components,libs,i18n,jotai,assets}
├── desktop/                 # electron-vite，三进程 (main / preload / renderer)
│   ├── package.json (1.1.4) + pnpm-lock.yaml + electron-builder.yml
│   └── src/{main,preload,common,renderer/src}
├── Dockerfile / nginx.conf / docker-compose.yml  # 仅服务 browser 产物
└── README.md
```

关键事实：

- **根目录没有 workspace**。`browser/pnpm-workspace.yaml` 只是 `overrides` 片段，没有 `packages:` —— 两个包完全独立，各自锁一份依赖。
- **CI 用 `npm install`**，而两个目录里都只有 `pnpm-lock.yaml`。锁文件在 CI 中**不生效**，构建不可复现（`desktop/package.json` 里那一大堆 `pnpm.overrides` 安全覆盖同样不生效）。
- **版本号分裂**：desktop `1.1.4`、browser `1.0.0`；`release.yml` 从 `desktop/package.json` 读版本打 tag，browser 版本号实际从不递增。
- **零测试**：仓库内没有任何 `*.test.*` / `*.spec.*` / vitest / jest 配置，CI 只有 `build`。这是后续所有评估里风险权重最高的一项。

### 1.2 代码规模与文件对应关系

| 指标 | 数值 |
| --- | --- |
| desktop 渲染层 LOC（`src/renderer/src`） | 6,317 |
| desktop 主进程/预加载/公共 LOC | 630 |
| browser LOC（`src`） | 5,884 |
| 两侧**同名同路径**文件 | **57** 个（共 90 个文件参与比对） |
| 仅 desktop 有 | 18 个（1,159 行） |
| 仅 browser 有 | 15 个（1,124 行） |
| **其中"纯改名/纯拷贝"** | `virtual-keys.ts` ≡ `keys.ts`（200 行）、`keyboard.css` ≡ `assets/keyboard.css`（116 行），均 100% 相同 |
| 同名文件行数合计 | 5,158 行（这就是"每次改动要改两遍"的面积） |
| 去重后唯一代码量 | ≈ 7,441 行 |
| 聚合代码量 | ≈ 12,201 行 |
| **重复系数** | **≈ 1.64×** |

> 除 `src/` 之外，`desktop/` 还独有 `main/`、`preload/`、`common/`（630 行），这部分是**合理的平台层**，不是重复。

### 1.3 差异的真实构成：一半以上是格式噪声

初次按行比对时，57 个同名文件里 30 个相似度 < 40%，看起来"完全乱掉"。但在归一化（去掉行尾分号、统一引号、压缩空白）之后：

| 相似度区间 | 文件数 |
| --- | --- |
| ≥ 95%（可以直接共享） | **10** |
| 80–94%（小幅漂移） | 14 |
| 60–79%（已分叉） | 17 |
| 40–59%（明显分叉） | 11 |
| < 40%（各自实现） | 5 |
| **平均相似度** | **72.9%** |

完全一致（≥99%）的有 8 个，包括最容易写错的 `libs/keyboard/keymap.ts`（282 行）、`libs/keyboard/charCodes.ts`、`libs/mouse/index.ts`。

**结论：所谓"乱"，约一半来自两种互不兼容的格式规范（详见 1.4），剩下的才是真实功能漂移。**

### 1.4 工具链与规范差异（必须先解决的地基问题）

| 维度 | desktop | browser | 影响 |
| --- | --- | --- | --- |
| Prettier | `semi: false`，无分号 | `semi: true`（默认），有分号 | 每一行几乎都不同，diff 噪声最大来源 |
| Tailwind | **v4**（`@tailwindcss/vite`，`@import 'tailwindcss'`） | **v3**（postcss + `tailwind.config.js` + `@tailwind` 指令） | 无法共享 CSS；v4 已移除/重命名一批工具类 |
| 路径别名 | `@renderer/*`（89 处）、`@common/*`（15 处） | `@/*`（98 处） | 搬迁文件需要全量重写 import |
| ESLint | `@electron-toolkit/eslint-config-ts` + `explicit-function-return-type: warn` | `typescript-eslint` recommended + `globals.browser` | 规则集不同，一侧通过另一侧报错 |
| TS 配置 | 继承 `@electron-toolkit/tsconfig/tsconfig.web.json` | 自带 `strict: true` + `noUnusedLocals/Parameters` | 共享代码要在更严格的规则下编写 |
| 包管理器 CI | `npm install`（忽略 pnpm-lock） | 同左 | 构建不可复现 |
| 依赖版本 | antd 5.29 / react 18.3 / lucide 0.476 / i18next 24.2 | antd 5.29 / react 18.3 / lucide 0.562 / i18next 24.0 | 小版本漂移，各自锁两份 |

### 1.5 分层对比与数据流

**桌面端（当前）**

```
[Renderer]  React 组件
     │  window.electron.ipcRenderer.invoke(IpcEvents.SEND_KEYBOARD | SEND_MOUSE)
     │  ← 分散在 15 个文件、35 处调用点，无统一出口
     ▼
[Preload]   contextBridge 暴露 @electron-toolkit/preload 的 electronAPI（api = {} 空壳）
     ▼
[Main]      events/serial-port.ts ── device/index.ts (Device) ── device/proto.ts (CmdPacket 编解码)
                                                              └ device/serial-port.ts (node-serialport)
```

**浏览器端（当前）**

```
[Renderer]  React 组件
     │  device.sendKeyboardData(report) / device.sendMouseData(report)
     │  ← 统一门面，10 个调用点全部收口
     ▼
[libs/device] index.ts (Device) ── proto.ts (CmdPacket 编解码)
                                └ serial-port.ts (Web Serial: reader/writer + disconnect 事件)
```

**这是两端最本质、也是最值得注意的差异：**

1. **浏览器端已经是重构后的形态**——有 `libs/device` 门面，组件不关心传输方式；桌面端还停留在"组件直接调 IPC"的旧形态。
2. **协议编解码（`proto.ts`）位置不同**——桌面端在主进程，浏览器端在渲染层。`device/proto.ts` 与 `libs/device/proto.ts` 内容几乎完全一样（137 行），等于**同一份协议实现存在两处**。
3. **性能差异**：桌面端每次 `mousemove` 都触发一次 `ipcRenderer.invoke` 往返（`mouse/relative.tsx:137`、`mouse/absolute.tsx:93`，均无节流），浏览器端是直接写 `WritableStream`。

> 即：**统一的方向天然是"以浏览器端的架构为准"**，因为它是更干净的版本；桌面端需要补上这层门面，而不是反过来。

### 1.6 功能差异矩阵

| 能力 | desktop | browser | 说明 |
| --- | --- | --- | --- |
| 串口 | node-serialport（主进程） | Web Serial（渲染层） | 传输层不同，协议层相同 |
| 串口枚举 | ✅ 自动列出 + USB 设备优先排序 | ❌ 用户点击选择（`requestPort` 必须手势） | 体验差异的真实来源 |
| 串口自动重连 | ✅ 记住上次端口自动打开 | ❌ | 依赖"能枚举端口"，Web Serial 受限 |
| 波特率可配置 | ✅ | ❌ | 桌面独有 |
| 串口能力检测 | — （必然支持） | ✅ `'serial' in navigator` → notSupported 提示 | 浏览器必需 |
| 设备面板形态 | 独立 Connect/Disconnect 按钮 + 下拉 | Modal 弹窗 | 产品形态差异 |
| 视频旋转 | ❌ | ✅ 0/90/180/270 | **未回灌** |
| 全屏菜单项 | ❌（用系统标题栏） | ✅ | 平台合理差异 |
| 自动更新 | ✅ electron-updater | ❌ | 平台特有 |
| 设置子应用（关于/更新/外观/重置） | ✅（102 行） | ❌（44 行，只有语言） | 桌面独有 |
| 媒体权限 | ✅ macOS 走主进程原生 API | ❌ 只有 `navigator.permissions` | 平台特有 |
| 语言 | 11 种（含 `ja`） | 10 种（无 `ja`） | 差异 |
| i18n key | 78 个叶子 key | 57 个 | 交集 48，见附录 |
| 快捷键 / 鼠标 / 键盘逻辑 | ✅ | ✅ | **两份**，已漂移 |

### 1.7 已经可见的"分叉债务"（这是推动统一的最硬证据）

**A. 同一个改动做两遍**：159 个 commit 中，122 个触及这两个包，其中 **26 个 commit 在同一次提交里同时修改了两侧的源码**。典型例子：

| 时间 | 提交 |
| --- | --- |
| 2026-01-13 | `c10b5b4 refactor(desktop): refactor keyboard and menu bar`（66 个源文件） |
| 2026-01-19 | `287cbb5 refactor(desktop): refactor mouse module, add touchscreen support`（14 个源文件） |
| 2025-12-04 | `69d7e3f feat: add custom shortcut`（32 个源文件） |
| 2025-12-01 | `8fa817a feat(desktop): support simultaneous multi-key presses` |

**B. 补丁克隆（同一 bug 修两次）**：

- `43fca48 fix(desktop): handle serial port device disconnection event` ↔ `752941c fix: handle serial port device disconnection event`
- `5d32386 refactor(desktop): split camera and microphone permissions` ↔ `6f62d23 refactor: split camera and microphone permissions`

**C. 修复只落在一侧（已产生的功能缺口）**：

- `cb7c647 fix(browser): the Right Shift key was not being recognized on Windows system` —— **只修了 browser**。桌面端仍是旧逻辑（`keyboard/index.tsx:50-53` 用 `event.key === 'Shift'` 兜底），而浏览器端已是完整的 `normalizeKeyCode()`（结合 `event.location` + OS 判断）。桌面端 Windows 用户至今受影响。
- `8b09b29 fix: video frame rate not set when used for the first time`、`4eebba0 fix: menu bar position calculation incorrect` —— 均先在 browser 落地。

**D. 两边不一致的具体 bug（已存在，非假设）**：

1. **`storage` key 拼写不一致**：desktop 用 `nanokvm-usb-keyboard-shortcuts`，browser 用 `nanokvm-usb-keyboard-shortcut`。合并时若不处理，用户快捷键配置会丢失。
2. **桌面端菜单折叠状态不持久化**：`menu/index.tsx:toggleMenu()` 只 `setIsMenuOpen(!isMenuOpen)`，从未调用同包里已写好的 `storage.setIsMenuOpen()`；浏览器端有持久化。**桌面端每次重启菜单都会重新展开。**
3. **`preload` 的 `api` 是空壳**（`const api = {}`），渲染层全靠 `window.electron`（`@electron-toolkit/preload` 通用 API），没有经过类型收敛的 IPC 契约——`ipc-events.ts` 里枚举有 22 个事件，但没有任何编译期约束保证收发双方一致。

---

## 2. 根因分析

| 层级 | 问题 | 是否必须通过重构解决 |
| --- | --- | --- |
| 组织 | 复制出的第二个应用没有共享边界，任何改动默认"抄一遍" | ✅ 是（核心） |
| 架构 | 设备能力没有抽象成接口，桌面端靠散落的 IPC 调用表达平台差异 | ✅ 是（核心） |
| 协议 | 协议编解码与传输耦合，导致同一份 `proto.ts` 存在两处 | ✅ 是 |
| 工具链 | 两份 prettier/eslint/tsconfig/tailwind，且版本不同 | ✅ 是（前置于一切） |
| 流程 | CI 用 npm 但提交 pnpm-lock；无测试；版本号只认 desktop | ✅ 是（低成本） |
| 产品 | 设备面板形态、设置子应用、旋转/全屏确实属于平台差异 | ❌ 否（保留差异，靠接口隔离） |

---

## 3. 统一方案评估

### 3.1 候选方案

**方案 A：pnpm workspace + 共享包 + 平台适配器（推荐）**

```
NanoKVM-USB/
├── pnpm-workspace.yaml
├── package.json                     # 统一依赖版本、统一脚本、统一 lint
├── packages/
│   ├── core/                        # 无 UI 的纯逻辑
│   │   ├── device/{proto,Device,transport}.ts   # 协议 + Device，只依赖 Transport 接口
│   │   └── platform.ts                          # PlatformAdapter 接口定义
│   ├── ui/                          # 共享 React 层
│   │   ├── components/{keyboard,mouse,menu,virtual-keyboard,ui}
│   │   ├── libs/{keyboard,mouse,mouse-jiggler,media,storage}
│   │   ├── jotai/ , i18n/ , types.ts
│   └── ...
└── apps/
    ├── desktop/   # electron-vite 壳：main/preload + PlatformAdapter(IPC) + 桌面独有 UI
    └── browser/   # vite 壳 + PlatformAdapter(Web Serial) + 浏览器独有 UI
```

- 统一度：~95%（仅设备面板/设置子应用/更新面板保留差异）
- 构建复杂度：中（需引入 workspace + pnpm，CI 改 `pnpm/action-setup` + `--filter`）
- 长期演进：最好（新增宿主只需实现 `PlatformAdapter`）

**方案 B：Electron 壳直接加载 Web 版，两端统一走 Web Serial**

Electron 确实支持 Web Serial（`session` 的 `select-serial-port` 事件 + `setDevicePermissionHandler`，且可用 `serial-port-added` / `serial-port-removed` 做枚举，见 [Electron 官方 Device Access 文档](https://www.electronjs.org/docs/latest/tutorial/devices#web-serial-api)）。技术上完全可行，甚至可以保留"自动选择设备 + 免手势打开"：

```
apps/desktop/main.ts  →  session.defaultSession.on('select-serial-port', …自动/弹窗选择…)
                      →  setDevicePermissionHandler(→ true, 并持久化已授权 port)
                      →  BrowserWindow.loadURL(同一份 web 构建产物)
```

- 统一度：**100%**（渲染层只有一份，无平台差异）
- 附加收益：删掉 native `serialport` 依赖（安装包更小、无 NAPI 版本风险）、去掉每次 mousemove 的 IPC 往返
- 主要风险：桌面端现有的「枚举端口 → USB 优先排序 → 自动重连 → 波特率下拉」全部要按 Web Serial 语义重做；`requestPort()` 需要用户手势，自动重连必须改走 `getPorts()` + 持久化授权；Electron 大版本升级可能带来 Web Serial 行为变化。**在零测试兜底下，这是回归风险最高的一条路。**
- 建议：作为**方案 A 完成后的可选项**（A 把协议层抽到 `core` 后，B 就退化成"换一个 Transport 实现"，成本极低）。不要在现阶段直接做。

**方案 C：单包双 target（A 的轻量变体，不引入 workspace）**

一个 `package.json`、一份 `src/`，用 `vite.config.web.ts` / `vite.config.electron.ts` 两份构建配置 + alias 切换平台层（`src/platform/electron` ↔ `src/platform/web`）。

- 统一度：~90%（与 A 相同效果，只是包边界靠目录约定而非依赖声明）
- 工作量：比 A 少 **3–5 人日**（省掉 workspace 迁移、包版本管理、构建顺序）
- 缺点：electron 与 web 依赖混在一个 `dependencies` 里；平台边界靠人工纪律维持，长期仍有重新长歪的可能
- 适合：**想在一周内拿到 70% 收益**的场景

**方案 D：只做规范归一 + 关键修复双向回灌（不做结构合并）**

- 统一度：~30%，但 3–5 人日即可消除最大的噪声（格式、Tailwind 版本、CI 锁文件、Right Shift 修复、storage key）
- 定位：**任何方案都必须先做的第 0 阶段**，本身不足以作为终局

### 3.2 评分矩阵

| 维度（权重） | A 共享包 | B 纯 Web Serial | C 单包双 target | D 仅归一 |
| --- | --- | --- | --- | --- |
| 代码统一度（25%） | 95% | **100%** | 90% | 30% |
| 工作量（20%，越少越好） | 14–19 人日（限结构部分） | 12–18 + 8–10 验证 | 11–14 人日（限结构部分） | 3–5 人日 |
| 回归风险（25%，越低越好） | 中 | **高** | 中低 | 低 |
| 构建/CI 复杂度（10%） | 中 | **低** | 中低 | 低 |
| 长期可维护性（15%） | **高** | **最高** | 中高 | 低 |
| 输入延迟（5%） | 现状 | **改善** | 现状 | 现状 |
| **加权结论** | **首选** | 后续演进 | 轻量备选 | 必做前置 |

### 3.3 推荐路线

```
阶段 0（D：归一与止血，3–5 人日）
   └→ 阶段 1（引入 PlatformAdapter，桌面端收口 IPC，3–4 人日）
        └→ 阶段 2（建立共享层骨架，搬入"低风险文件"，3–4 人日）
             └→ 阶段 3（逐模块收敛差异，6–8 人日）
                  └→ 阶段 4（CI/发布统一 + 文档，2–3 人日）
                       └→ 可选：方案 B，用 Web Serial 替换桌面传输层（4–6 人日）
```

理由：
1. **阶段 0 不做，后面全是白工**——格式规范不统一时，任何"两边合并"的 diff 都不可读，评审成本会吞掉所有收益。
2. **阶段 1 让桌面端先具备和浏览器端一样的门面**，此时两端已经在架构上同构，合并只是物理搬家。同时它顺手修掉"组件直连 IPC"和"每次 mousemove 一次 IPC"的问题。
3. **阶段 2 先搬 100%/≥95% 的 10 个文件**（keymap、charCodes、mouse 协议、types、i18n zh_tw…），风险接近零，可以先跑通整套构建管线再谈复杂文件。
4. **阶段 3 按模块切 PR**（mouse → keyboard → menu → video → storage/i18n），每个 PR 都可独立回滚。
5. 方案 B 留到最后，因为它在 A 完成后成本骤降，且必须先有 A 的 `Transport` 抽象才安全。

---

## 4. 目标架构

### 4.1 分层

```
┌──────────────────────────────────────────────────────────┐
│ packages/ui   React 组件（键盘/鼠标/菜单/虚拟键盘/UI 基件）  │
│               jotai atoms · i18n · storage(走 StorageBackend)│
└───────────────▲──────────────────────────────────────────┘
                │ 只依赖接口，不认识 Electron / Web Serial
┌───────────────┴──────────────────────────────────────────┐
│ packages/core                                            │
│   device/Device.ts   ← 业务动作（getInfo/sendKeyboard…）     │
│   device/proto.ts    ← CmdPacket/InfoPacket 编解码（唯一一份）│
│   device/Transport   ← 接口：open/close/read/write/onDisconnect│
│   platform.ts        ← PlatformAdapter 接口                 │
└───────────────▲──────────────────────────────────────────┘
                │ 注入
   ┌────────────┴─────────────┐
   │                          │
apps/desktop              apps/browser
  transports/ipc.ts         transports/web-serial.ts
  (主进程 node-serialport)   (navigator.serial)
  platform.ts (IPC + updater) platform.ts (浏览器 API)
  UI: 设备下拉/设置/更新面板    UI: DeviceModal/旋转/全屏
```

**关键决定：把 `proto.ts` + `Device` 上移到 `core`，让传输层退化成"裸字节通道"。**
现在桌面端主进程里有完整协议栈，浏览器端渲染层里也有——这是同一份逻辑的两份拷贝。上移后主进程只剩 `SerialPort` 字节收发，两端共用同一份协议实现，也顺手让阶段 5 的 Web Serial 迁移变成"换个 Transport"。

### 4.2 适配器接口（建议的具体形态）

```ts
// packages/core/src/platform.ts
export type OsName = 'win32' | 'darwin' | 'linux' | 'web'

export interface PortInfo { path: string; label: string }

/** 传输层：只负责字节进出，不含协议 */
export interface Transport {
  readonly kind: 'ipc' | 'web-serial'
  isSupported(): boolean
  list(): Promise<PortInfo[]>
  /** 浏览器：需用户手势；桌面：可直接返回 */
  request(): Promise<PortInfo | null>
  open(path: string, baudRate: number): Promise<void>
  close(): Promise<void>
  read(minSize: number, timeoutMs?: number): Promise<number[]>
  write(data: number[]): Promise<void>
  onDisconnect(cb: () => void): () => void
}

export interface PlatformAdapter {
  os(): Promise<OsName>
  transport: Transport
  openExternal(url: string): void
  getVersion(): Promise<string>
  checkMediaPermission(kind: 'camera' | 'microphone'): Promise<boolean>
  requestMediaPermission(kind: 'camera' | 'microphone'): Promise<boolean>
  setFullScreen?(flag: boolean): void          // 桌面不需要
  updater?: UpdaterAdapter                     // 仅桌面
}

export interface UpdaterAdapter {
  check(): Promise<{ version: string } | null>
  download(): void
  onProgress(cb: (percent: number) => void): () => void
  onDownloaded(cb: () => void): () => void
}
```

配套改动：
- `IpcEvents` 收敛为一组 `Transport`/`System` 通道，并给 `preload` 写**真正的类型契约**（`api: TransportBridge`），替代现在的 `api: unknown`。
- `storage` 抽出 `StorageBackend`（Electron 用 `localStorage` 即可，无需改；但保留 `clearAll`/`expiry` 的统一实现）。
- 组件内所有 `window.electron.*` 调用清零，改为 `usePlatform()`。

### 4.3 目标目录（方案 A 版）

```
packages/core/src/
  device/{proto.ts, Device.ts}
  platform.ts
packages/ui/src/
  components/{keyboard,mouse,menu,virtual-keyboard,ui}/
  libs/{keyboard,mouse,mouse-jiggler,media,storage}/
  jotai/  i18n/{index.ts,languages.ts,locales/*}
  types.ts
apps/desktop/src/
  main/{index.ts, events/*}
  preload/index.ts
  platform/{transport.ipc.ts, platform.electron.ts}
  ui/{DevicePanel,SettingsApp,UpdatePanel}
apps/browser/src/
  platform/{transport.web-serial.ts, platform.web.ts}
  ui/{DeviceModal,Rotation,Fullscreen}
```

---

## 5. 迁移计划（分阶段）

> 通用约束：**每个阶段单独出 PR、PR 内不做"格式 + 逻辑"混合改动、阶段末打 tag 可回滚、两端产物都必须能构建并跑冒烟清单**（附录 C）。

### 阶段 0：仓库/工具链统一与止血（**已确定目标栈，详见 [toolchain-migration.md](./toolchain-migration.md)**）

> 2026-11-19 决策：目标栈定为 **pnpm 12 + Node 24 + Tailwind v4 + antd v6 + 全量最新稳定版**。
> 因此原"3–5 人日"的规范归一被拆成 **P0 + P1 + P4**（6–7.5 人日），并新增 **P3 UI 栈升级**（2–3 人日）。执行顺序与详细清单以 `toolchain-migration.md` 为准。

| 项 | 动作 | 验证 |
| --- | --- | --- |
| 仓库/包管理（P0） | workspace 骨架、单一 `pnpm-lock.yaml`、`overrides`/`onlyBuiltDependencies` 迁入 `pnpm-workspace.yaml`、CI 换 pnpm + Node 24 | 干净克隆 `pnpm install --frozen-lockfile` 通过 |
| 构建链（P1） | vite 8.3.8 / electron-vite 6 / electron 45 / electron-builder 26.18 / Tailwind **v4** | 两端构建 + 三平台产物启动 |
| UI 栈（P3，须在合并后一次性升） | React 19.3.1 / antd 6.7.1 / icons 6.3.4 / jotai 3 / i18next 27 / lucide 1.75 / TS 7（带回退） | 11 处 antd 废弃 API 修完 + 全量冒烟 |
| Lint/格式（P4） | ESLint 10 + typescript-eslint 8.73，删 `eslint-plugin-react` 与 `@electron-toolkit/eslint-config-*`，`prettier --write` 独立 commit | `lint` + `typecheck` 全绿 |
| 止血修复 | ① desktop 补 `normalizeKeyCode`（Right Shift）② `KEYBOARD_SHORTCUT_KEY` 兼容读写 ③ desktop 菜单折叠持久化 | 手工复现清单 |

> 阶段 0 结束时两端仍是两份代码，但依赖、格式、构建管线已完全一致，diff 可读。

### 阶段 1：桌面端引入 `Device` 门面（3–4 人日）

| 项 | 动作 |
| --- | --- |
| 新增 | `renderer/src/libs/device/`（`Device` + 协议调用），内部实现走 IPC |
| 收口 | 把 15 个文件里 35 处 `window.electron.*` 调用（其中 `menu/settings/update.tsx` 独占 8 处、`libs/media/permission.ts` 6 处）统一收敛到 `device` / `platform` 门面 |
| 协议上移 | 把 `main/device/proto.ts` 复制为共享单元，主进程 `events/serial-port.ts` 退化为"透传字节"接口（`TRANSPORT_WRITE` / `TRANSPORT_READ`） |
| 性能（可选） | 鼠标 `mousemove` 增加 8–16ms 合并发送，减少 IPC 往返 |
| 验证 | 键鼠/快捷键/粘贴/虚拟键盘全部回归 |

> 阶段 1 结束时，两端渲染层的设备调用形态**已经一致**，后续合并就是纯物理搬迁。

### 阶段 2：共享层骨架 + 低风险文件搬迁（3–4 人日）

| 项 | 动作 |
| --- | --- |
| 骨架 | 建 `pnpm-workspace.yaml` + `packages/{core,ui}` + `apps/{desktop,browser}`；CI 改为 `--filter` 矩阵 |
| 搬迁 A 组（10 个 ≥95% 文件） | `libs/keyboard/{keymap,charCodes,keyboard}.ts`、`libs/mouse/index.ts`、`components/mouse/touchpad.ts`、`jotai/keyboard.ts`、`components/mouse/types.ts`、`menu/keyboard/shortcuts/types.ts`、`i18n/index.ts`、`i18n/locales/zh_tw.ts` |
| 搬迁 B 组（7 个 90–94% 文件） | `ui/{kbd,scroll-area}.tsx`、`jotai/mouse.ts`、`types.ts`、`libs/media/camera.ts`、`menu/recorder/index.tsx`、`i18n/languages.ts` |
| 顺便合并 | `virtual-keys.ts` ≡ `keys.ts`、`keyboard.css`（纯拷贝，零风险） |
| 验证 | 两端 `build` 通过 + 冒烟清单全绿（此时功能无变化，风险≈0） |

> 17 个文件约占同名文件的 30%，但都是"逻辑本来就一样"的部分——用它验证整套 workspace 构建管线是否可靠，比一开始就动 `App.tsx` 安全得多。

### 阶段 3：逐模块收敛（6–8 人日，分 6 个 PR）

按相似度从高到低推进，每个 PR 独立可回滚：

| PR | 范围 | 相似度 | 主要工作 |
| --- | --- | --- | --- |
| 3.1 | mouse（`absolute`/`relative`/`index`） | 87% / 31% | 去掉 `window.electron` / `device.` 直调，统一走 `Transport` |
| 3.2 | keyboard（`keyboard/index`、`virtual-keyboard`、`shortcuts/*`） | 70% / 81% / 68–86% | 合并为一份，采纳 browser 的 `normalizeKeyCode` |
| 3.3 | menu（`menu/index`、`mouse/*`、`audio`、`video/*`） | 41–83% | 统一菜单容器；`Fullscreen` 作为可选能力注入 |
| 3.4 | `App.tsx` + 设备面板 | 28% | **需产品决策**（见附录 B），建议统一为 DeviceModal 形态 + 桌面端保留自动重连 |
| 3.5 | `storage` / `permission` / `jotai/device` | 21–59% | 抽 `StorageBackend`；`storage` key 兼容迁移；权限走 `PlatformAdapter` |
| 3.6 | i18n 合并 | 53–70% | 取并集（78 ∪ 57 ≈ 87 key）；key 命名统一；补 11 种语言缺译（见附录 A.2） |

### 阶段 4：CI / 发布 / 文档（2–3 人日）

| 项 | 动作 | 风险点 |
| --- | --- | --- |
| 版本 | 单一 `version` 来源（根 `package.json` 或 `packages/app`），`release.yml` 改读它 | 必须保证 tag 与 3 个平台的产物名兼容 |
| 自动更新 | 保持 `electron-builder.yml` 的 `publish` 配置与 `latest*.yml` 产物名不变 | **否则存量桌面用户会断更**（这是本阶段唯一的硬风险） |
| 产物 | browser zip / desktop exe·AppImage·deb·rpm·dmg 命名保持现状 | 与 README、wiki 链接、Docker 镜像一致 |
| 文档 | 补 `docs/development.md`（pnpm、目录约定、如何加平台能力） | — |

### 阶段 5（可选，4–6 人日）：用 Web Serial 替换桌面传输层

前置条件：阶段 1–4 已完成、`Transport` 抽象稳定、自动重连与枚举语义有手测用例。
收益：删除 native `serialport`、彻底单一实现、去掉 IPC 往返。
风险：见 3.1 方案 B。

---

## 6. 工作量与排期

| 阶段 | 内容 | 人日（1 人） | 可并行 |
| --- | --- | --- | --- |
| 0 | 仓库/工具链统一（P0+P1+P4）+ 止血修复 | 6–7.5 | 是（拆给 2 人） |
| — | **UI 栈升级（P3，依赖代码合并后执行）** | **2–3** | 否 |
| 1 | 桌面端 Device 门面 + 协议上移 | 3–4 | 否（依赖 0） |
| 2 | workspace 骨架 + 18 个低风险文件 | 3–4 | 是（骨架与搬运可并行） |
| 3 | 6 个收敛 PR | 6–8 | 是（3.1–3.3 可并行，3.4 需决策） |
| 4 | CI/发布/文档 | 2–3 | 否 |
| — | **小计（方案 A 主体 + 目标栈）** | **22–29** | |
| 5 | Web Serial 替换（可选） | 4–6 | 否 |

排期建议（按已确定的目标栈）：
- **1 人**：约 5–6 周（含回归与 review 缓冲）。
- **2 人**：约 3 周（P0/P1/P4 与阶段 1/2/3 可交错并行，P3 与阶段 4 串行）。
- **只止血**（P0 + 阶段 1）：**5–6 人日**，1 人 1 周多，即可消除"改两遍"的最大痛苦与已存在的一侧 bug。
- **不含目标栈升级**（若暂缓全量升级，只做结构重构）：阶段 0 按原 3–5 人日计，总计 **17–24 人日**。
- **方案 C 变体**（单包双 target，不拆 workspace）：可省掉阶段 2 的 workspace 迁移，但 P0 的 pnpm 单一锁文件仍需做，总约 **18–23 人日**。

---

## 7. 风险登记册

| # | 风险 | 影响 | 概率 | 缓解 |
| --- | --- | --- | --- | --- |
| R1 | **零自动化测试**，硬件回归只能手测 | 高：静默回归可能带进发布 | 高 | 阶段 0 先固化冒烟清单（附录 C）；对 `core/device`（协议编解码）先补 10–20 个单测（纯函数，成本极低、收益最高） |
| R2 | **自动更新断更** | 高：存量用户不再收到更新 | 中 | 阶段 4 严格保持 `latest.yml` 产物名与 `publish` 配置；用一份旧版本手动验证"旧版→新版"升级链路 |
| R3 | **尾风 v3→v4 视觉回归** | 中：UI 走样 | 中 | 逐页截图对比；v4 重命名类名全量 grep；保留一次回滚 commit |
| R4 | **user localStorage 设置丢失** | 中：用户需重设 | 中 | 保留所有 `nanokvm-usb-*` key；对 `-shortcut/-shortcuts` 双读兼容；不清理旧 key，只做读取回退 |
| R5 | **串口自动重连/枚举在方案 B 下退化** | 高：桌面核心体验变差 | 中（仅方案 B） | 方案 B 放最后；用 `getPorts()` + `setDevicePermissionHandler` 持久化授权复现"免手势自动连接"；准备功能开关回退到方案 A 传输层 |
| R6 | **Tailwind/antd layer 顺序** | 中：样式优先级错乱 | 中 | 现有 `@layer tailwind-base, antd` 的 hack 需在合并后重新验证（弹窗/下拉尤其） |
| R7 | **迁移期间双线发布阻塞** | 中：发不出版本 | 中 | 每个阶段末可独立发布；不把"跨阶段重构"和"功能开发"放进同一条 release 分支 |
| R8 | **CI 从 npm 换 pnpm** | 低：构建脚本差异 | 中 | 一次性切换；`--frozen-lockfile` 必须先在本地产出可用锁文件 |
| R9 | **i18n 翻译缺口** | 低：部分语言出现英文原文 | 高 | 社区翻译 PR 分批补；文案缺失时回退 `en`（现有 `i18next` 已支持） |
| R10 | **三平台构建环境**（Linux 需 `libudev-dev`，macOS 需签名公证） | 低 | 中 | 阶段 4 只在 CI 上验证；不要在本机模拟 |

---

## 附录 A：57 个同名文件相似度与处置建议

相似度为"归一化格式后"的按行重合率（越高越接近）。

### A.1 处置建议分组

| 组 | 相似度 | 文件数 | 处置 |
| --- | --- | --- | --- |
| 直接共享 | ≥ 95% | 10 | 阶段 2 搬迁，无需逻辑改动 |
| 微调共享 | 80–94% | 14 | 阶段 2/3 搬迁，改动限于 import 别名与个别常量 |
| 注入适配器 | 60–79% | 17 | 阶段 3，把 `window.electron.*` / `device.*` 换成 `usePlatform()` |
| 需产品决策 | 40–59% | 11 | 附录 B，涉及面板形态与功能取舍 |
| 保留差异或重写 | < 40% | 5 | 桌面/浏览器各自保留，仅统一接口 |

### A.2 全量清单

| 文件（相对 `browser/src`） | 相似度 | 行数（max） | 处置 |
| --- | ---: | ---: | --- |
| `libs/mouse/index.ts` | 100% | 116 | 直接共享 |
| `libs/keyboard/keymap.ts` | 100% | 253 | 直接共享（最易错，优先） |
| `libs/keyboard/keyboard.ts` | 100% | 52 | 直接共享 |
| `libs/keyboard/charCodes.ts` | 100% | 122 | 直接共享 |
| `jotai/keyboard.ts` | 100% | 3 | 直接共享 |
| `i18n/locales/zh_tw.ts` | 100% | 70 | 直接共享 |
| `components/mouse/types.ts` | 100% | 27 | 直接共享 |
| `components/menu/keyboard/shortcuts/types.ts` | 100% | 7 | 直接共享 |
| `components/mouse/touchpad.ts` | 98% | 167 | 直接共享 |
| `i18n/index.ts` | 95% | 41 | 直接共享 |
| `components/menu/recorder/index.tsx` | 94% | 110 | 微调共享 |
| `i18n/languages.ts` | 93% | 15 | 微调（合并 `ja`） |
| `components/ui/kbd.tsx` | 92% | 25 | 微调 |
| `jotai/mouse.ts` | 92% | 12 | 微调 |
| `components/ui/scroll-area.tsx` | 92% | 50 | 微调 |
| `types.ts` | 91% | 11 | 微调（`Rotation` 上移） |
| `libs/media/camera.ts` | 90% | 59 | 微调 |
| `components/mouse/absolute.tsx` | 87% | 148 | 注入适配器 |
| `components/mouse/relative.tsx` | 87% | 130 | 注入适配器（+ 节流） |
| `components/menu/keyboard/shortcuts/index.tsx` | 86% | 95 | 注入适配器 |
| `.../shortcuts/recorder.tsx` | 84% | 223 | 注入适配器 |
| `components/menu/mouse/speed.tsx` | 83% | 55 | 注入适配器 |
| `components/menu/audio/index.tsx` | 82% | 66 | 注入适配器 |
| `components/virtual-keyboard/index.tsx` | 81% | 127 | 注入适配器 |
| `libs/mouse-jiggler/index.ts` | 79% | 47 | 注入适配器 |
| `components/menu/video/resolution.tsx` | 79% | 176 | 注入适配器 |
| `components/menu/video/scale.tsx` | 76% | 57 | 注入适配器 |
| `components/menu/mouse/direction.tsx` | 76% | 45 | 注入适配器 |
| `components/menu/mouse/jiggler.tsx` | 75% | 48 | 注入适配器 |
| `components/menu/mouse/style.tsx` | 74% | 51 | 注入适配器 |
| `components/menu/mouse/mode.tsx` | 74% | 44 | 注入适配器 |
| `components/menu/keyboard/paste.tsx` | 71% | 47 | 注入适配器 |
| `i18n/locales/pl.ts` | 70% | 87 | 合并 + 补译 |
| `components/keyboard/index.tsx` | 70% | 163 | 合并（采纳 browser 的 key 归一化） |
| `components/menu/index.tsx` | 69% | 116 | 需产品决策（菜单项集合） |
| `components/menu/video/device.tsx` | 68% | 91 | 需产品决策（自动打开策略） |
| `i18n/locales/pt_br.ts` | 68% | 87 | 合并 + 补译 |
| `.../shortcuts/shortcut.tsx` | 68% | 46 | 注入适配器 |
| `i18n/locales/ko.ts` | 67% | 86 | 合并 + 补译 |
| `components/menu/keyboard/index.tsx` | 67% | 30 | 需产品决策（快捷功能项） |
| `components/menu/mouse/index.tsx` | 63% | 74 | 注入适配器 |
| `jotai/device.ts` | 59% | 14 | 合并（`Rotation` + `baudRate`） |
| `i18n/locales/{zh,nl,de,en}.ts` | 56% | 117 | 合并 + 补译 |
| `libs/media/permission.ts` | 56% | 67 | 注入适配器（桌面走原生权限） |
| `libs/storage/index.ts` | 55% | 158 | 合并（key 兼容迁移） |
| `i18n/locales/{ru,be}.ts` | 53–54% | 109 | 合并 + 补译 |
| `components/menu/keyboard/virtual-keyboard.tsx` | 52% | 20 | 合并 |
| `components/menu/video/index.tsx` | 50% | 23 | 合并（`rotation` 注入） |
| `main.tsx` | 36% | 15 | 各自保留（入口不同） |
| `components/mouse/index.tsx` | 31% | 9 | 各自保留 |
| `App.tsx` | 28% | 143 | **需产品决策**（设备面板形态） |
| `components/menu/settings/index.tsx` | 12% | 102 | 桌面独有 + 语言项共享 |
| `components/menu/serial-port/index.tsx` | 5% | 125 | 各自保留（枚举 vs 手势选择） |

### A.3 仅一端存在的文件

**仅 desktop（1,159 行）**：`components/device/{index,connect,disconnect,video,serial-port}.tsx`、`components/menu/settings/{about,appearance,reset,update}.tsx`、`components/menu/language/index.tsx`、`components/virtual-keyboard/virtual-keys.ts`、`libs/storage/expiry.ts`、`i18n/locales/ja.ts`、`assets/styles/*`
→ 其中 `virtual-keys.ts`（200 行，与 browser 的 `keys.ts` **逐行 100% 相同**，仅文件名不同）与 `assets/styles/keyboard.css`（116 行，与 browser 的 `assets/keyboard.css` **100% 相同**）属于**纯改名/纯拷贝**，可立即合并。

**仅 browser（1,124 行）**：`libs/device/*`（4 个文件，即传输+协议）、`libs/browser/index.ts`、`components/device-modal/*`、`components/menu/{fullscreen,rotation}/*`、`components/menu/settings/language.tsx`、`i18n/locales/ja` 缺失

---

## 附录 B：需要产品决策的 6 项

| # | 问题 | 选项 | 建议 |
| --- | --- | --- | --- |
| B1 | 设备连接面板形态 | ① 桌面 Connect/Disconnect + 下拉 ② 浏览器 Modal ③ 统一为 Modal | 统一为 **②/③**，桌面端额外提供"自动重连"开关 |
| B2 | 桌面是否保留原生串口枚举 | ① 保留（方案 A）② 改 Web Serial 手势选择（方案 B） | 保留，直到方案 B 的自动重连被验证可行 |
| B3 | 视频旋转是否进桌面端 | 是 / 否 | 是（成本低，提升一致性） |
| B4 | 波特率是否进浏览器端 | 是 / 否 | 否（Web Serial 用户多数用默认 57600），但 storage/UI 预留 |
| B5 | `ja` 语言是否进浏览器端 | 是 / 否 | 是（仅需补 57→87 key 的翻译） |
| B6 | 功能开关策略（如录音、全屏、更新） | 能力注入 / 编译期裁剪 | 用 `PlatformAdapter` 的可选成员表达，不在 UI 里写 `isElectron` 判断 |

---

## 附录 C：冒烟清单（每个阶段必须全绿）

| # | 场景 | 桌面 | 浏览器 |
| --- | --- | --- | --- |
| 1 | 冷启动 → 摄像头授权 → 设备面板出现 | ☐ | ☐ |
| 2 | 选择 HDMI 采集设备 → 画面出现、无花屏 | ☐ | ☐ |
| 3 | 串口连接（桌面：下拉/自动重连；浏览器：点击选择） | ☐ | ☐ |
| 4 | 键盘输入（含**右 Shift**、AltGr、多键同时按、日文 IME 组合） | ☐ | ☐ |
| 5 | 鼠标绝对/相对/触摸板三种模式 + 滚轮方向 + 滚动速度 | ☐ | ☐ |
| 6 | 快捷键录制与回放、Ctrl+Alt+Del | ☐ | ☐ |
| 7 | 剪贴板粘贴（`paste.tsx`） | ☐ | ☐ |
| 8 | 虚拟键盘（大小屏两种形态） | ☐ | ☐ |
| 9 | 菜单拖动/折叠/重启后状态保持 | ☐ | ☐ |
| 10 | 分辨率切换（含 4K、自定义、Auto 缩放） | ☐ | ☐ |
| 11 | 旋转 0/90/180/270 | — | ☐ |
| 12 | 音频回放 + 录音 | ☐ | ☐ |
| 13 | 拔插 USB 线：断连提示 + 恢复 | ☐ | ☐ |
| 14 | 全屏切换 | ☐（系统） | ☐ |
| 15 | 语言切换 + 设置持久化 + 重置设置 | ☐ | 部分 |
| 16 | 自动更新：旧版 → 新版 | ☐ | — |

---

## 附录 D：立即可做的三件低成本高收益事项

1. **补 `core/device` 的协议单测**（`CmdPacket.encode/decode`、`InfoPacket` 解析、校验和、`findHead` 边界）。纯函数、无硬件依赖，20 个用例约 0.5 人日，是后续所有重构唯一的安全网。
2. **修掉 1.7-D 的三个已存在 bug**（Right Shift、storage key、菜单持久化）——它们是"分叉已经造成实际损害"的证据，修完即可验证两侧行为对齐流程是否可用。
3. **CI 改 `pnpm install --frozen-lockfile`**——半小时的工作，换掉"每次构建依赖版本随机"的隐患。
