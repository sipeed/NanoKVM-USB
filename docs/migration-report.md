# 双端统一迁移报告

> 执行日期：2026-11-19
> 基线：`main` @ `1d1dd5e`（迁移前）+ `docs/` 两份方案
> 结果：方案 A 落地完成，按 P0 → P1 → P2 → P3 → P4 五个批次提交（另附协议单测与依赖精确化两个补充提交）

## 1. 决策记录

| 项 | 决策 |
| --- | --- |
| 结构方案 | 方案 A：pnpm workspace + `packages/core` + `packages/ui` + `apps/*` |
| 设备面板 | 统一为 Modal；桌面端额外保留"自动重连"开关 |
| 桌面串口 | 保留 node-serialport 原生枚举 + 自动重连（不切 Web Serial） |
| 功能回灌 | 视频旋转 / 全屏菜单项 / 菜单折叠持久化 → 桌面端；自动重连 / 波特率设置 / 日语 → 浏览器端 |
| TS 7 | 先升 7.0.2；`tsc/typecheck` 全部通过，未触发回退 5.9 |
| 版本号 | 根 `package.json` 单一来源 `1.2.0`，`release.yml` 改读根版本 |
| 依赖版本 | 全部精确版本；目标栈 = 迁移文档所列"最新稳定版"（实际以 registry 为准，如 electron-builder 26.18.0 / electron-updater 6.8.11） |

## 2. 提交批次

| 提交 | 内容 |
| --- | --- |
| `docs:` | 提交两份迁移方案（基线文档） |
| `chore(repo): … (P0)` | `apps/*` 布局、pnpm 12 workspace + 单一 lockfile、根配置、CI/Docker、版本 1.2.0 |
| `refactor: unify … (P2)` | `packages/core`（协议 + Device + 接口）、`packages/ui`（全部共享渲染层）、桌面主进程退化为字节 Transport、typed preload、设备面板/设置/菜单统一、功能回灌与 bug 修复 |
| `chore(deps): … (P3)` | React 19 / antd 6 / jotai 3 / i18next 27 / lucide 1.75 / TS 7 + antd6 废弃 API 修复 |
| `chore(lint): … (P4)` | ESLint 10 统一配置（tools/lint 独立 TS 5.9 供 parser）、Prettier 全仓格式化、CI 增加 quality job |

## 3. 验证结果（本机 Windows / Node 26.13.1 / pnpm 12.21.0）

| 项 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --lockfile-only` | ✅ lockfile 与 manifest 一致 |
| `pnpm typecheck`（TS 7.0.2） | ✅ core / ui / browser / desktop(node+web) 全绿 |
| `pnpm lint`（ESLint 10.15.0） | ✅ 0 error，23 warning（react-hooks v7 新规则，按方案先降为 warn） |
| pnpm format:check | ✅ All matched files use Prettier code style |
| pnpm test | ✅ packages/core 协议单测 16 例通过（CmdPacket/InfoPacket/Device） |
| `pnpm build:browser` | ✅ Vite 8.3.8 产物 `apps/browser/dist` |
| `pnpm build:desktop` | ✅ electron-vite 6 产物 `apps/desktop/out` |
| `pnpm --filter @nanokvm/desktop build:unpack` | ✅ electron-builder 26.18.0 → `dist/win-unpacked`，serialport native 已 unpack |
| Tailwind v4 跨包扫描 | ✅ 检查构建 CSS 含 `packages/ui` 中使用的类名与 `keyboard.css` |
| 浏览器产物 | ✅ `vite preview` 返回 index.html，JS/CSS 资源引用正确 |

## 4. 尚未自动验证（需人工/流水线确认）

## 4. 尚未自动验证（需人工/流水线确认）

1. **GUI + 硬件冒烟**：已在开发模式下用 CDP 验证渲染层可启动（窗口渲染、i18n 中文、统一设备面板含波特率/自动重连、`window.api` 存在、0 console error），但摄像头/串口/键鼠等硬件交互仍需按 [refactor-plan.md 附录 C](./refactor-plan.md) 的 16 项手工验证：摄像头出图、串口自动重连、右 Shift/AltGr、鼠标三模式、快捷键、粘贴、虚拟键盘、菜单持久化、分辨率/旋转/缩放、音频、拔插断连、语言切换、自动更新检查。
2. **antd 6 视觉回归**：Divider / Modal / Popover / message / Progress 的内部 DOM 在 v6 有变化，需要截图对比弹窗、下拉、分割线、消息提示。
3. **三平台产物**：macOS（签名/公证）与 Linux（libudev/rpm）只能在 CI 验证；本次仅在 Windows 本机打包。
4. **自动更新"旧 → 新"链路**：需用旧版本安装包实测；产物命名与 `publish` 配置未改。
5. **Docker 镜像构建**：本机未构建镜像；Dockerfile 已改为 pnpm + workspace 拷贝。

## 5. 已知限制与后续建议

- **typescript-eslint 与 TS 7**：typescript-eslint 8.73 的 peer 为 `typescript <6.1`，且 TS 7 原生包不再提供 JS 编译器 API，因此 lint 工具链单独放在 `tools/lint`（自带 TypeScript 5.9.3），根 `typescript` 仍是 7.0.2。等 typescript-eslint 支持 TS 7 后可合并为一套。
- **react-hooks v7 告警**：23 条全部来自新规则（`react-hooks/immutability`、`set-state-in-effect`、`exhaustive-deps`），建议按模块单独 PR 收敛，不要用 disable 掩盖。
- **pnpm 12 `minimumReleaseAgeExclude`**：pnpm 12 默认对"过新"版本做供应链门禁，`pnpm-workspace.yaml` 中已记录 electron / i18next / lucide 的放行项；升级依赖时 pnpm 会自动追加，需一并提交。
- **electron postinstall**：本机曾出现 `pnpm install` 未自动下载 electron 二进制的情况（手动 `node install.js` 后可恢复）；CI 若出现桌面打包缺 electron，可显式 `pnpm rebuild electron` 或检查 `allowBuilds`。
- **i18n 源数据笔误**：桌面端旧 `zh.ts`/`ko.ts` 存在 `kkeyboard`/`kekeyboard` 笔误 key，合并时原样保留（无代码引用），可在后续翻译清理中删除。

## 6. 本机环境注意：ReFS / Dev Drive 与 Electron 沙箱

本仓库位于 ReFS 卷（`F:`，Windows Dev Drive 类文件系统）时，**Electron 沙箱初始化会失败**：`electron-vite dev` 在 "starting electron app..." 后立即崩溃（exit `-2147483645` / `0xc0000005`），`electron.exe --version` 也会崩；把同一份 `electron.exe` 复制到 NTFS（`%LOCALAPPDATA%\Temp`）即可正常运行，与 Electron/应用版本无关（Electron 35 / 45 均可复现）。

本机开发用 `pnpm dev:desktop:nosandbox`（= `electron-vite dev --noSandbox`，仅开发期禁用沙箱）即可正常启动。发布产物安装到 NTFS 用户目录，不受影响；彻底解决方式是把仓库移到 NTFS 卷。详情见 [docs/development.md](./development.md)。