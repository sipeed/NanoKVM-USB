# 工具链与规范统一方案（Tailwind v4 / pnpm / antd v6 / 全量最新稳定版）

> 配套文档：[重构/迁移总体计划](./refactor-plan.md)
> 版本核实时间：2026-11-19（数据源：registry.npmjs.org `dist-tags`）
> 结论：**可以一次性把目标栈定为"全最新稳定版"，但必须分 4 个批次落地，且 UI 运行时栈只能升一次（放在代码合并之后）。**

---

## 0. 结论摘要

| 项目 | 结论 |
| --- | --- |
| 目标技术栈 | pnpm 12.21.0 · Node 24 LTS · TS 7.0.2 · Vite 8.3.8 · Electron 45.4.1 · React 19.3.1 · antd 6.7.1 · Tailwind 4.3.5 · ESLint 10.15.0 |
| 落地方式 | **4 个批次**，每批一个可回滚 PR；批次之间必须能独立发布 |
| 工时 | **8–10.5 人日**（吸收原计划"阶段 0"的 3–5 人日，净增 5–6 人日）；与结构重构合计 **22–29 人日** |
| 最大的技术坑 | ① Tailwind v4 的 `@source` 扫不到共享包 → 类名被裁掉 ② pnpm 12 的 `overrides`/`onlyBuiltDependencies` 必须搬进 `pnpm-workspace.yaml` ③ TS 7 是原生编译器重写版，`tsc -b` 需设门槛 |
| 最省工的决定 | **UI 运行时栈（React 19 / antd 6 / jotai 3 / i18next / lucide）等代码合并后只升一次**，不要在两份代码上各升一遍（省 ~2 人日） |
| 明确不建议 | ① 一个 PR 里同时升 TS 7 + React 19 + antd 6 + Vite 8（出错无法归因）② 保留 `eslint-plugin-react`（版本停滞，与 ESLint 10 冲突）③ 保留 `@electron-toolkit/eslint-config-*`（妨碍统一配置） |

### 推荐执行顺序

```
P0  仓库结构 + pnpm + 统一配置文件（不动任何依赖版本）          2 人日
P1  构建链升级 + Tailwind v3→v4（两包各改一次配置，成本极低）    3–4 人日
P2  代码结构合并（原计划阶段 1–3）                              —
P3  UI 运行时栈一次升到位（只改一处）                            2–3 人日
P4  ESLint 10 + Prettier 全仓 format 收尾                        1–1.5 人日
```

为什么这样排：**构建链**和**仓库结构**与业务代码无关，早升早受益且编译期即可暴露问题；**UI 运行时栈**改变的是组件 API 和样式，如果先升就要在两份代码上各改一遍（antd 废弃 API 11 处 ×2），放 P3 只改一遍。

---

## 1. 目标版本矩阵

### 1.1 运行时依赖

| 包 | 当前（desktop / browser） | 目标 | 跨大版本 | 风险 |
| --- | --- | --- | --- | --- |
| `react` / `react-dom` | 18.3.1 / 18.3.1 | **19.3.1** | 1 | 低（见 §5） |
| `antd` | 5.29.3 / 5.29.3 | **6.7.1** | 1 | 中（见 §4） |
| `@ant-design/icons` | 5.6.1 / — | **6.3.4** | 1 | 低（必须与 antd 同步升） |
| `jotai` | 2.12.1 / 2.10.3 | **3.0.2** | 1 | 低 |
| `i18next` | 24.2.2 / 24.0.5 | **27.2.1** | 3 | 中（需跑一遍初始化） |
| `react-i18next` | 15.4.1 / 15.1.4 | **18.0.2** | 3 | 中 |
| `lucide-react` | 0.476.0 / 0.562.0 | **1.75.0** | 1 | 中（图标名需逐一核对） |
| `react-simple-keyboard` | 3.8.49 / 3.8.28 | **3.8.297** | 0 | 低 |
| `vaul` | 1.1.2 / 1.1.1 | **1.1.2** | 0 | 低 |
| `react-draggable` | 4.5.0 / 4.5.0 | **4.7.2** | 0 | 低 |
| `react-responsive` | 10.0.0 / 10.0.0 | **10.0.1** | 0 | 低 |
| `@radix-ui/react-scroll-area` | 1.2.10 / 1.2.10 | **1.4.0** | 0 | 低 |
| `@ant-design/cssinjs`（新增直接依赖） | — | **`~2.1.2`**（跟随 antd，勿用 2.2.0） | — | 中（版本不一致会导致双实例） |
| `clsx` | 2.1.1 / 2.1.1 | **2.1.1** | 0 | 无 |

### 1.2 桌面端专属

| 包 | 当前 | 目标 | 跨大版本 | 风险 |
| --- | --- | --- | --- | --- |
| `electron` | 35.7.5 | **45.4.1** | 10 | 中（见 §5.4） |
| `electron-vite` | 4.0.1 | **6.0.0** | 2 | 中（内部换成 rolldown） |
| `electron-builder` | 26.7.0 | **26.18.1** | 0 | 低 |
| `electron-updater` | 6.3.9 | **6.8.12** | 0 | 低（但关系到自动更新链路） |
| `electron-log` | 5.3.1 | **5.4.4** | 0 | 无 |
| `serialport` | 13.0.0 | **13.0.0** | 0 | 已是最新，不动 |
| `@electron-toolkit/preload` | 3.0.1 | **3.0.2** | 0 | 低 |
| `@electron-toolkit/utils` | 4.0.0 | **4.0.0** | 0 | 无 |
| `@electron-toolkit/tsconfig` | 1.0.1 | **2.0.0** | 1 | 低（需核对 moduleResolution 默认值） |

### 1.3 构建与工具链

| 包 | 当前 | 目标 | 跨大版本 | 风险 |
| --- | --- | --- | --- | --- |
| `vite` | 6.1.0 / 7.3.1 | **8.3.8** | 1–2 | 中 |
| `@vitejs/plugin-react` | 4.3.4 | **6.3.0** | 2 | 低 |
| `tailwindcss` | 4.0.6 / **3.4.18** | **4.3.5** | 0 / **1** | 中（browser 需迁移） |
| `@tailwindcss/vite` | 4.0.6 / — | **4.3.5** | 0 | 低 |
| `typescript` | 5.7.3 / 5.6.2 | **7.0.2** | 2 / **2** | **高（见 §5.5）** |
| `@types/react` / `@types/react-dom` | 18.3.18 / 18.3.5 | **19.3.0** | 1 | 低 |
| `@types/node` | 22.13.4 | **26.6.6** | 4 | 低 |
| `prettier` | 3.5.1 / 3.4.1 | **3.10.1** | 0 | 无 |
| `@ianvs/prettier-plugin-sort-imports` | 4.4.1 / 4.4.0 | **4.7.1** | 0 | 低 |
| `prettier-plugin-tailwindcss` | 0.6.11 / 0.6.9 | **0.8.1** | 0(小) | 中（v4 需 `tailwindStylesheet`） |
| `eslint` | 9.39.2 | **10.15.0** | 1 | 中（见 §6） |
| `@eslint/js` | — / 9.39.2 | **10.0.1** | 1 | 低 |
| `typescript-eslint` | — / 8.15.0 | **8.73.0** | 0 | 低 |
| `globals` | — / 15.12.0 | **17.14.0** | 2 | 低 |
| `eslint-config-prettier` | — / 9.1.2 | **10.1.8** | 1 | 低 |
| `eslint-plugin-react-hooks` | 5.2.0 | **7.1.1** | 2 | 中（规则集变严） |
| `eslint-plugin-react-refresh` | 0.4.26 | **0.5.8** | 0(小) | 低 |
| `eslint-plugin-react` | 7.37.5 | **弃用** | — | 见 §6.2 |
| `vite-tsconfig-paths` | — / 5.1.3 | **6.1.1** | 1 | 低（共享包后可能不再需要） |
| `postcss` / `autoprefixer` / `tailwind.config.js` | browser 有 | **删除** | — | v4 内置，无需二者 |

### 1.4 工具链基础设施

| 项 | 当前 | 目标 |
| --- | --- | --- |
| 包管理器 | npm（CI）/ pnpm-lock 未生效 | **pnpm 12.21.0**，单一根锁文件 |
| Node | CI `NODE_VERSION: 20` | **24 LTS**（electron-vite 6 要求 `^20.19 \|\| >=22.12`） |
| 锁文件 | `desktop/pnpm-lock.yaml`、`browser/pnpm-lock.yaml` | 根 `pnpm-lock.yaml` 一份 |
| workspace | 无 | 根 `pnpm-workspace.yaml`（同时承载 `overrides`/`onlyBuiltDependencies`） |
| 配置 | 每个包各一套 prettier/eslint/tsconfig | 根一套 + 包内薄扩展 |

---

## 2. 统一后的仓库骨架与配置（可直接落地）

### 2.1 目录

```
NanoKVM-USB/
├── package.json                 # 根：scripts、packageManager、engines、devDeps 汇总
├── pnpm-workspace.yaml          # packages + overrides + onlyBuiltDependencies(+ catalog)
├── pnpm-lock.yaml               # 唯一锁文件
├── .npmrc                       # hoist 策略
├── .nvmrc                       # 24
├── tsconfig.base.json           # 唯一 TS 基线
├── eslint.config.mjs            # 唯一 ESLint 扁平配置
├── .prettierrc.yaml             # 唯一格式化配置
├── packages/
│   ├── core/                    # 协议 + 平台接口（无 UI）
│   └── ui/                      # 共享 React 层（含 i18n、jotai、组件）
└── apps/
    ├── desktop/                 # electron-vite：main/preload + renderer 入口
    └── browser/                 # vite：SPA 入口
```

### 2.2 根 `package.json`

```json
{
  "name": "nanokvm-usb",
  "private": true,
  "version": "1.2.0",
  "packageManager": "pnpm@12.21.0",
  "engines": { "node": ">=24.0.0", "pnpm": ">=12.0.0" },
  "scripts": {
    "dev:desktop": "pnpm --filter @nanokvm/desktop dev",
    "dev:browser": "pnpm --filter @nanokvm/browser dev",
    "build": "pnpm -r --filter './packages/*' build && pnpm -r --filter './apps/*' build",
    "build:desktop": "pnpm --filter @nanokvm/desktop build",
    "build:browser": "pnpm --filter @nanokvm/browser build",
    "typecheck": "tsc -b --pretty",
    "lint": "eslint --cache .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "pnpm -r exec rm -rf dist out node_modules/.cache"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@ianvs/prettier-plugin-sort-imports": "4.7.1",
    "@types/node": "26.6.6",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "eslint": "10.15.0",
    "eslint-config-prettier": "10.1.8",
    "eslint-plugin-react-hooks": "7.1.1",
    "eslint-plugin-react-refresh": "0.5.8",
    "globals": "17.14.0",
    "prettier": "3.10.1",
    "prettier-plugin-tailwindcss": "0.8.1",
    "typescript": "7.0.2",
    "typescript-eslint": "8.73.0"
  }
}
```

> 版本号建议**全部写死精确版本**（不用 `^`）。理由：这个项目的历史问题正是"两侧依赖小版本漂移 + 锁文件在 CI 不生效"；精确版本 + 单一锁文件能把这种漂移彻底关掉，升级只能通过显式 PR。

### 2.3 `pnpm-workspace.yaml`（关键：pnpm 10+ 的 `overrides` 搬到这里）

```yaml
packages:
  - 'packages/*'
  - 'apps/*'

# pnpm 10+ 起，overrides 不再从 package.json 的 pnpm 字段读取
overrides:
  '@babel/helpers@<7.26.10': '>=7.26.10'
  '@babel/runtime@<7.26.10': '>=7.26.10'
  '@eslint/plugin-kit@<0.3.4': '>=0.3.4'
  '@isaacs/brace-expansion@<=5.0.0': '>=5.0.1'
  ajv@<6.14.0: '>=6.14.0'
  brace-expansion@>=1.0.0 <=1.1.11: '>=1.1.12'
  brace-expansion@>=2.0.0 <=2.0.1: '>=2.0.2'
  esbuild@<=0.24.2: '>=0.25.0'
  form-data@>=4.0.0 <4.0.4: '>=4.0.4'
  lodash@<4.17.23: '>=4.17.23'
  minimatch@<9.0.6: '>=9.0.6'
  minimatch@>=10.0.0 <10.2.1: '>=10.2.1'
  tar@<7.5.8: '>=7.5.8'
  tmp@<=0.2.3: '>=0.2.4'

# pnpm 10+ 默认阻断构建脚本；electron / esbuild 必须显式放行
onlyBuiltDependencies:
  - electron
  - esbuild
```

> 原 `desktop/package.json` 里的 `pnpm.overrides` 与 `pnpm.onlyBuiltDependencies` 迁到此处后，`package.json` 里的 `pnpm` 字段整段删除。那十来条 `vite@...` 覆盖可以删掉——目标栈统一到 vite 8.3.8 后不再需要逐段打补丁。

### 2.4 `.npmrc`

```ini
# electron-builder 对 pnpm 符号链接敏感，先沿用现状的 flat 布局
shamefully-hoist=true
# 若要彻底解决 electron-builder 打包问题，改成下面这行（二选一，不要同时开，也不要和结构迁移同批）
# node-linker=hoisted
strict-peer-dependencies=false
```

> ⚠️ `shamefully-hoist` 目前是 desktop 能正常打包的前提（`desktop/.npmrc` 已有）。**在 P0 只把它上移到根目录，不要顺便改成 `node-linker=hoisted`**——否则问题会和结构迁移搅在一起，无法归因。

### 2.5 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "paths": {
      "@nanokvm/core": ["./packages/core/src/index.ts"],
      "@nanokvm/core/*": ["./packages/core/src/*"],
      "@nanokvm/ui": ["./packages/ui/src/index.ts"],
      "@nanokvm/ui/*": ["./packages/ui/src/*"]
    }
  }
}
```

> 统一为**一套更严格的规则**（`noUnusedLocals` 等采用 browser 侧原有设置），而不是迁就 desktop 的宽松配置——共享代码必须在最严格的一侧能过。
> `verbatimModuleSyntax` 会强制 `import type` 写法，一次性改完比长期两种风格并存更省事。

### 2.6 `eslint.config.mjs`（单一根配置，去掉 `@electron-toolkit/*`）

```js
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/release/**', '**/node_modules/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  { files: ['apps/desktop/**/*.ts'], languageOptions: { globals: globals.node } },
  prettier
)
```

关键决定：
1. **删掉 `@electron-toolkit/eslint-config-ts` 与 `-prettier`**（两个包是 `eslint 9` 时代的封装，会妨碍统一；直接组合 `typescript-eslint` 更可控）。
2. **删掉 `eslint-plugin-react`**（最新仍是 7.37.5，版本停滞、与 ESLint 10 的 peer 关系存疑；`jsx: react-jsx` 已不需要该插件的核心规则）。
3. 只保留 `react-hooks` 与 `react-refresh` 这两个 React 团队自己维护的插件。

### 2.7 `.prettierrc.yaml`（统一格式：采用 desktop 风格 + v4 适配）

```yaml
singleQuote: true
semi: false
printWidth: 100
tabWidth: 2
trailingComma: none
importOrder:
  - ^(react/(.*)$)|^(react$)
  - <THIRD_PARTY_MODULES>
  - ''
  - ^@nanokvm/(.*)$
  - ''
  - '^[./]'
importOrderSeparation: false
importOrderSortSpecifiers: true
importOrderBuiltinModulesToTop: true
importOrderParserPlugins: [typescript, jsx, tsx]
importOrderMergeDuplicateImports: true
importOrderCombineTypeAndValueImports: true
plugins:
  - '@ianvs/prettier-plugin-sort-imports'
  - prettier-plugin-tailwindcss
tailwindStylesheet: ./packages/ui/src/styles/index.css   # v4 必须显式指定入口，否则类名排序失效
```

> `semi: false` 与 desktop 现有风格一致（改动更少）；**一次性 `prettier --write` 全仓**放在 P4，作为独立 commit，避免污染前面几批的 diff。

---

## 3. Tailwind v4 统一方案（含共享包扫描坑）

### 3.1 迁移步骤（browser v3 → v4）

| 步骤 | 动作 |
| --- | --- |
| 1 | 删除 `browser/postcss.config.js`、`browser/tailwind.config.js`、`autoprefixer`/`postcss` 依赖 |
| 2 | `browser/vite.config.ts` 加 `@tailwindcss/vite` 插件（desktop 已有，两端配置归一） |
| 3 | `src/assets/index.css` 的 `@tailwind base/components/utilities` → `@import 'tailwindcss';` |
| 4 | 用 `@source` 显式声明共享包路径（**关键**） |
| 5 | 逐页核对 v4 重命名的工具类（见 §3.3） |

### 3.2 入口 CSS（统一版，含 antd 6 与共享包）

```css
/* packages/ui/src/styles/index.css */
@import 'tailwindcss';

/* ⚠️ 关键：Tailwind v4 自动内容检测只会扫当前项目根，
   共享包与另一 app 的源码必须显式 @source，否则这些文件里的类名会被裁掉 */
@source '../../../packages/ui/src';
@source '../../../packages/core/src';
@source '../../../apps/desktop/src';
@source '../../../apps/browser/src';

/* 让 antd 的 CSS-in-JS 样式处于可被 utility 覆盖的层序中 */
@layer theme, base, components, antd, utilities;

html,
body {
  padding: 0;
  margin: 0;
  background: #000;
}
```

配套在 `main.tsx` 用 `@ant-design/cssinjs` 的 `StyleProvider layer` 把 antd 样式塞进 `antd` 层：

```tsx
import { StyleProvider } from '@ant-design/cssinjs'

<StyleProvider layer>
  <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    <App />
  </ConfigProvider>
</StyleProvider>
```

> ⚠️ **必须把 `@ant-design/cssinjs` 写成与 antd 相同的版本范围**（antd 6.7.1 声明的是 `~2.1.2`）。若写成最新 `2.2.0`，pnpm 会装出**两份 cssinjs 实例**，而 `StyleProvider` 只会影响它自己那一份，antd 的样式依然在层外——表现为"层序配置看起来生效了但样式没变"。加依赖后请用 `pnpm why @ant-design/cssinjs` 确认只有一个版本。
> 若 `ConfigProvider` 在 6.x 已提供等价的 `layer` 配置，优先用它，可以省掉这个直接依赖（升级时核对一次类型定义）。

> 现状 desktop 用的是 `@layer tailwind-base, antd; @layer tailwind-base { @tailwind base; } @import 'tailwindcss';` —— 这是 v4 下的临时拼法，`@tailwind base` 在 v4 里并未删除但语义已变。**必须替换**，否则 v4.3 + antd 6 的层序不可控。
> 判定方法：看弹窗遮罩、下拉菜单、分割线、按钮 hover 四处的样式优先级是否符合预期（antd 样式不应压过 `className` 上的 utility）。

### 3.3 v4 重命名/移除清单（需全仓 grep 核对）

| v3 写法 | v4 写法 | 备注 |
| --- | --- | --- |
| `shadow-sm` / `shadow` | `shadow-xs` / `shadow-sm` | 整体下移一档 |
| `outline-none` | `outline-hidden` | 语义变化 |
| `bg-opacity-*` / `text-opacity-*` | `bg-black/50` 斜杠语法 | 旧写法移除 |
| `flex-shrink-0` / `flex-grow` | `shrink-0` / `grow` | 旧名保留但建议统一 |
| `decoration-slice` 等 | 移除 | — |
| `@tailwind` 指令 | `@import 'tailwindcss'` | — |
| `theme()` 函数 / `tailwind.config.js` | `@theme` / CSS 变量 | 本项目未自定义主题，改动量≈0 |

本项目实际使用的类名以间距/尺寸/圆角/透明度为主，命中重命名的面很小——但 `min-h-[360px]`、`size-[26px]`、`bg-neutral-800/70` 这类**任意值与斜杠语法**在 v4 下完全兼容，可以直接沿用。

### 3.4 全局 CSS 归一

`keyboard.css`（两端 100% 相同，116 行）与 `base.css`（7 行）合并进 `packages/ui/src/styles/`，由共享入口 `@import` 引入，两个 app 不再各自持有。

---

## 4. antd v5 → v6 迁移清单

### 4.1 环境前提

- React ≥ 18（本方案直接上 19，满足）
- `@ant-design/icons` **必须一起升到 6.x**（6 与 antd 5 不兼容，5 与 antd 6 不兼容）
- v6 默认启用 **CSS 变量**，不再支持 IE；只支持现代浏览器（Chrome 已经是唯一目标，无影响）
- 若曾用 `@ant-design/v5-patch-for-react-19`，需移除（本项目未使用）

### 4.2 本仓库实际的废弃 API（已全量扫描，共 11 处）

| 文件 | 行 | 现状 | 改为 |
| --- | --- | --- | --- |
| `desktop/.../components/menu/index.tsx` | 82 | `<Divider type="vertical" />` | `<Divider orientation="vertical" />` |
| 同上 | 87 | `<Divider type="vertical" className="px-0.5" />` | `orientation="vertical"` |
| 同上 | 93 | 同上 | 同上 |
| 同上 | 112 | `<Divider type="vertical" style={...} />` | `orientation="vertical"` |
| `browser/src/components/menu/index.tsx` | 88 / 97 / 106 / 126 | 同上 4 处 | 同上 |
| `desktop/.../App.tsx` | 71 | `<Spin ... tip={t('camera.tip')} fullscreen />` | `description={t('camera.tip')}` |
| `browser/src/App.tsx` | 116 | `<Spin ... tip={...} fullscreen />` | `description={...}` |
| `browser/src/App.tsx` | 138 | `<Alert message={...} type="warning" banner closable />` | `title={...}` |

> 合并成一份代码后，这 11 处会变成 **7 处**（menu 4 + App 3）。

### 4.3 已确认**不需要**改的部分

| 项 | 结论 |
| --- | --- |
| `<Modal destroyOnHidden>` | browser 已在用 v6 的新名，无需改；desktop `connect.tsx` 也已用 `destroyOnHidden` |
| `Spin size="large"` / `fullscreen` | 未废弃 |
| `Select options` / `fieldNames` / `status` | 未废弃 |
| `Slider vertical` / `marks` / `range` | 未废弃 |
| `Popover content` / `trigger` / `placement` / `arrow` / `align` | 未列入废弃清单，但 `align` 属 rc 层旧属性，升级后需看控制台告警 |
| `ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}` | v6 仍支持（且默认可切 CSS 变量） |
| `message.useMessage()` | 未废弃 |
| `Progress` / `InputNumber` / `Input` | 本仓库未使用已废弃的 `strokeWidth`/`addonAfter`/`bordered` |
| Overlay 模糊 | v6.3 起默认**关闭**，与当前观感一致，无需配置 |

### 4.4 建议用 antd 官方 CLI 兜底

antd 6 提供 `@ant-design/cli` 做废弃 API 扫描（迁移文档推荐），在升级前对一个包先跑一遍，比对人工清单，避免漏项。

### 4.5 视觉回归重点

v6 重写了大量组件的内部 DOM 结构。本项目对组件内部结构有依赖的地方主要是：

- `menu/index.tsx` 用 `Divider type="vertical"` 的 `className="px-0.5"` 调间距 —— 换成 `orientation` 后需目视确认宽度
- `mouse/relative.tsx` 用 `message.useMessage()` 的 `contextHolder` 渲染提示 —— 确认弹层位置
- `device-modal` / `connect.tsx` 的 `Modal` 内部布局 —— 确认 padding 与高度

---

## 5. 其余大版本升级的影响面（已扫描本仓库）

### 5.1 React 19：几乎零改动

扫描结果：`JSX.Element` 0 处、`React.FC`/`FunctionComponent` 0 处、`defaultProps` 0 处、`ReactDOM.render` 0 处、无参 `useRef()` 0 处、`forwardRef` 0 处。仅 9 处 `React.ComponentProps<...>` / `React.MouseEvent<...>`，在 React 19 类型下均有效。

→ **本仓库几乎没有 React 19 的迁移工作**，唯一要做的是装 `@types/react@19` 后跑 `tsc` 看一眼。

### 5.2 jotai 2 → 3

只用 `atom` / `useAtom` / `useAtomValue` / `useSetAtom`，全部保留。风险仅在于 `atom` 的泛型推断细节变化 → 预计 0–2 处修补。

### 5.3 i18next 27 / react-i18next 18

跨 3 个大版本，需核对的点：

- `i18next.init({ ... })` 现有选项（`resources`、`lng`、`fallbackLng`、`interpolation`）在新版本是否仍默认；
- `initReactI18next` 用法不变；
- `t()` 返回类型（`returnNull` / `keySeparator` 默认值历史上有变动）。

→ 工作量约 0.5 人日，重点是把 `i18n/index.ts` 与语言切换跑通。

### 5.4 Electron 35 → 45（跨 10 个大版本）

本仓库主进程只用：`BrowserWindow`、`session.setPermissionRequestHandler`、`ipcMain.handle/on`、`shell.openExternal`、`app.*`、`electron-updater`。这些都稳定。

必须核对：
1. `webPreferences.sandbox: false` + `contextIsolation` 默认值是否仍在（当前 preload 依赖 contextBridge）；
2. `session.setPermissionRequestHandler` 的 permission 名称集合（`media` / `clipboard-read` / `pointerLock`）是否仍被接受；
3. macOS 权限相关 API（`systemPreferences.askForMediaAccess`）签名；
4. `electron-updater` 与 Electron 45 的兼容（升到 6.8.12）；
5. CI 三平台构建环境（Linux 仍需 `libudev-dev`，macOS 仍需签名/公证 secrets）。

→ 工作量 1 人日 + 一次三平台产物验证。

### 5.5 TypeScript 5.x → 7.0.2（**唯一需要设门槛的升级**）

TS 7 是编译器原生（Go）重写版。对本项目的实际影响点：

| 风险 | 判定门槛 |
| --- | --- |
| `tsc -b`（项目引用/复合构建）—— desktop 现在用 `tsc --noEmit -p tsconfig.node.json --composite false` | 必须验证 `tsc -b` 在 monorepo 上可用；不可用则退回 `tsc -p` 逐个构建 |
| `paths` 映射 + `moduleResolution: bundler` | 必须验证 |
| 编辑器/`eslint` 的 `parserOptions.projectService` | typescript-eslint 8.73 对 TS 7 的支持需验证 |
| 三方类型包（`@types/react` 19.3.0 已带 `ts7.0` 标签） | 已支持 |

**门槛策略**：P3 升级时先只做 `tsc --noEmit`；若 `tsc -b` 报错且无法规避，**降级到 TS 5.9.x**（`@types/react`/`@types/react-dom` 的 `ts5.9` 标签同为 19.3.0，完全兼容），把 TS 7 记为"待社区修复的观察项"，不阻塞整条迁移。

> 这条是"全部升到最新"里唯一建议保留回退选项的例外——它能挡住整条流水线。

### 5.6 lucide-react 0.x → 1.75.0

本仓库导入 39 个图标，全部使用 `*Icon` 后缀新名（`XIcon`、`GripVerticalIcon`、`Trash2Icon`、`Loader2Icon`、`BadgeInfoIcon`、`CircleArrowUpIcon` 等）。lucide 1.x 移除了部分历史别名，**漏网的名字会在 `tsc` 阶段直接报错**，属于"编译即发现"的低风险项。

→ 动作：升级后跑 `tsc`，按报错逐个替换；预计 0–5 处。

### 5.7 Vite 8 / @vitejs/plugin-react 6 / electron-vite 6

- `electron-vite@6` peer 为 `vite ^6 || ^7 || ^8`，**支持 Vite 8**；
- `electron-vite@6` 内部改用 **rolldown**（`rolldown ~1.2.10`）——这是构建器层面的变化，需核对 `externalizeDepsPlugin` 与 `?asset` 导入（`main/index.ts` 用 `import icon from '../../resources/icon.png?asset'` 依赖这个能力）；
- `engines.node` 要求 `^20.19 || >=22.12` → CI 必须升 Node。

→ 工作量 1–1.5 人日，其中一半是验证 `?asset` 与 native 模块外部化。

---

## 6. ESLint 10 与格式收尾

### 6.1 迁移要点

- ESLint 10 只支持扁平配置（`eslint.config.mjs`），`.eslintrc` 已彻底移除（本项目已是扁平配置）。
- Node 引擎要求提高 → 与 Node 24 一起满足。
- `@eslint/js@10` 提供 `js.configs.recommended`。
- `typescript-eslint@8.73` + `projectService: true` 替代原来手写的 `parserOptions.project`。

### 6.2 必须做的三个"减法"

| 减法 | 原因 |
| --- | --- |
| 删 `eslint-plugin-react` | 最新版仍是 7.37.5（停滞），与 ESLint 10 的 peer 关系不确定；本项目的 JSX 正确性由 `tsc` + react-hooks 覆盖 |
| 删 `@electron-toolkit/eslint-config-ts` / `-prettier` | 封装了旧版规则集，会与统一配置打架；直接组合 `typescript-eslint` |
| 删 `eslint-config-prettier`？ | **保留**（`10.1.8` 支持 ESLint 10），但改成根依赖 |

### 6.3 规则收敛的预期摩擦

`eslint-plugin-react-hooks@7` 的 `recommended` 比 v5 严格得多（含 React Compiler 相关规则），首次运行预计在 hooks 依赖项、条件调用上产生数十条告警。处理策略：

1. 先全部当 `warn`，让 CI 只 fail `error`；
2. 单独一个 PR 修 `exhaustive-deps`（预计集中在那几个 `useEffect(..., [])` 的组件）；
3. 不为了"零告警"去加 `eslint-disable`。

---

## 7. pnpm 迁移的 6 个具体动作

| # | 动作 | 说明 |
| --- | --- | --- |
| 1 | 删除 `browser/pnpm-lock.yaml`、`desktop/pnpm-lock.yaml` | 统一为根 `pnpm-lock.yaml` |
| 2 | 新建根 `pnpm-workspace.yaml` + `packageManager` 字段 | 见 §2.3 |
| 3 | `pnpm.overrides` / `pnpm.onlyBuiltDependencies` 迁入 `pnpm-workspace.yaml` | pnpm 10+ 必须 |
| 4 | `.npmrc` 上移到根，`shamefully-hoist=true` 保持不变 | 见 §2.4 |
| 5 | CI 改 `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile` | 这是修掉"锁文件不生效"的关键一步 |
| 6 | `Dockerfile` 的 `yarn install` → `corepack enable && pnpm install --frozen-lockfile --filter @nanokvm/browser...` | 注意 `COPY` 需要带上根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` |

CI 片段示例：

```yaml
env:
  NODE_VERSION: '24'
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
    with: { version: 12.21.0 }
  - uses: actions/setup-node@v4
    with: { node-version: '${{ env.NODE_VERSION }}', cache: pnpm }
  - run: pnpm install --frozen-lockfile
  - run: pnpm --filter @nanokvm/desktop build
  # browser 任务同样处理；paths-filter 从 'browser/**' 改为 'apps/browser/**' + 'packages/**'
```

> ⚠️ `paths-filter` 必须同时包含 `packages/**`：改了共享包要触发**两个**构建，否则会出现"桌面端用旧共享代码"的静默问题。

---

## 8. 分批执行计划

### P0 仓库结构 + pnpm + 统一配置（2 人日，不改任何依赖版本）

| 步骤 | 动作 | 验证 |
| --- | --- | --- |
| 1 | 建 workspace 骨架；`apps/*`、`packages/*` 目录就位（此步可先只移动 `browser`/`desktop` 到 `apps/`） | `pnpm -r exec pwd` |
| 2 | 生成根 `pnpm-lock.yaml`（保留现有版本，仅换包管理器） | `pnpm install --frozen-lockfile` 在干净克隆上通过 |
| 3 | `.prettierrc.yaml` / `tsconfig.base.json` / `eslint.config.mjs` 上移，包内改为薄扩展 | `pnpm lint`、`pnpm typecheck` |
| 4 | CI 换 pnpm + Node 24 + `paths-filter` 加 `packages/**` | 两个 job 都绿 |
| 5 | `Dockerfile` 换 pnpm | `docker build` 成功，产物能启动 |
| 回滚 | 单 commit 回退（不动代码，纯配置） | — |

> **P0 不做 `prettier --write`**，也不动依赖版本——这一步的唯一目标是"用 pnpm 稳定构建出两个产物"。

### P1 构建链升级 + Tailwind v4（3–4 人日）

| 步骤 | 动作 | 风险点 |
| --- | --- | --- |
| 1 | vite 8.3.8 / @vitejs/plugin-react 6.3.0 / electron-vite 6.0.0 | `?asset`、`externalizeDepsPlugin` |
| 2 | electron 45.4.1 / electron-builder 26.18.1 / electron-updater 6.8.12 | 三平台产物、自动更新链路 |
| 3 | Tailwind v4.3.5（browser 迁移 + 两包配置归一） | 层序、`@source`、类名重命名 |
| 4 | `@electron-toolkit/tsconfig` 2.0.0、`@types/node` 26.6.6 | moduleResolution 默认值 |

验证：两端 `dev` 能起、`build` 通过、冒烟清单（见总体计划附录 C）第 1–3、10、14 项。

### P2 代码结构合并（原计划阶段 1–3，见总体计划）

### P3 UI 运行时栈一次升到位（2–3 人日，**只改一处**）

| 步骤 | 动作 |
| --- | --- |
| 1 | React 19.3.1 + `@types/react`/`@types/react-dom` 19.3.0 |
| 2 | antd 6.7.1 + `@ant-design/icons` 6.3.4 + 修 7 处废弃 API |
| 3 | jotai 3.0.2 |
| 4 | i18next 27.2.1 + react-i18next 18.0.2（跑通 11 种语言切换） |
| 5 | lucide-react 1.75.0（按 `tsc` 报错逐个改名） |
| 6 | TypeScript 7.0.2 + `tsc -b` 门槛验证（失败则回退 5.9.x） |

验证：全量冒烟清单 + 弹窗/下拉/分割线/消息提示的视觉对比截图。

### P4 ESLint 10 + 全仓 format（1–1.5 人日）

| 步骤 | 动作 |
| --- | --- |
| 1 | eslint 10.15.0 + typescript-eslint 8.73.0 + globals 17 + react-hooks 7，删三个旧封装 |
| 2 | `prettier --write .` 独立 commit（纯格式） |
| 3 | 修 `exhaustive-deps` 等告警（独立 PR） |

---

## 9. 风险登记册

| # | 风险 | 影响 | 概率 | 缓解 |
| --- | --- | --- | --- | --- |
| T1 | **TS 7 原生编译器**在 `tsc -b` / 项目引用上有缺口 | 高（阻塞 CI） | 中 | 设门槛：无法通过则回退 5.9.x，`@types/*` 的 `ts5.9` 标签同为 19.3.0 |
| T2 | **Tailwind v4 `@source` 漏配**，共享包类名被裁 | 高（样式静默丢失） | 中高 | 入口 CSS 显式 `@source` 所有源码目录；CI 加一条"构建后 CSS 体积不得低于阈值"的断言 |
| T3 | **antd 6 内部 DOM 重写**导致自定样式失效 | 中 | 中 | 重点核对菜单分割线、Modal 内边距、message 定位；准备视觉对比截图 |
| T4 | **electron-builder + pnpm 符号链接**打包失败 | 高 | 中 | P0 先只搬 `.npmrc` 不改策略；失败再单独切 `node-linker=hoisted`（独立 commit） |
| T5 | **electron-vite 6 换 rolldown** 导致 `?asset`/native 外部化异常 | 中 | 中 | P1 第一件事就是构建一次 unpack 产物并启动 |
| T6 | **自动更新断更**（electron-updater 6.8 + 产物名/`latest.yml`） | 高 | 中 | 用旧版本安装包实测"旧→新"升级；产物命名保持不变 |
| T7 | `eslint-plugin-react-hooks@7` 告警洪水 | 低（阻塞 CI 则中） | 高 | 先 `warn`，单独 PR 修，不用 `disable` 掩盖 |
| T8 | 一次性升级无法归因 | 高 | 中 | 强制 4 批 + 每批独立 tag；禁止在升级 PR 里夹带功能改动 |
| T9 | Node 24 + electron 45 三平台构建环境差异 | 中 | 中 | 只在 CI 验证；Linux 依赖 `libudev-dev` 已在 |

---

## 10. 验证清单（每批结束必跑）

| # | 项 | P0 | P1 | P3 | P4 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pnpm install --frozen-lockfile`（干净克隆） | ☐ | ☐ | ☐ | ☐ |
| 2 | `pnpm typecheck` / `pnpm lint` | ☐ | ☐ | ☐ | ☐ |
| 3 | desktop `build:unpack` 产物能启动 | ☐ | ☐ | ☐ | — |
| 4 | browser `build` 产物能 `preview` 打开 | ☐ | ☐ | ☐ | — |
| 5 | 冒烟清单（总体计划附录 C）1–3、10、14 项 | ☐ | ☐ | ☐ | — |
| 6 | 全量冒烟清单（16 项） | — | — | ☐ | — |
| 7 | Docker 镜像构建 + 页面可访问 | ☐ | — | — | — |
| 8 | 自动更新"旧→新"实测 | — | ☐ | — | — |
| 9 | 弹窗/下拉/分割线视觉对比 | — | — | ☐ | — |
| 10 | `prettier --check` 全绿 | — | — | — | ☐ |

---

## 11. 明确不建议做的事

1. **不要一个大 PR 全升**。TS 7 + React 19 + antd 6 + Vite 8 + ESLint 10 同时跳，一旦构建挂掉，无法判断是编译器、构建器还是组件库。
2. **不要在 P0 期间执行 `prettier --write`**。格式 diff 会淹没配置文件迁移的评审。
3. **不要保留 `eslint-plugin-react`**。它停滞在 7.37.5，是 ESLint 10 下最可能先炸的一环，且本项目并不需要它。
4. **不要把 `shamefully-hoist` 和 `node-linker=hoisted` 一起改**，不要和结构迁移同批。
5. **不要为了"全部最新"而强上 TS 7**。它是本方案里唯一保留回退选项的依赖——因为它是唯一能整条流水线一起挂掉的东西。
6. **不要在 P3 之前升 antd**。两份代码各改一遍废弃 API 是纯浪费。
7. **不要用 `^` 版本范围**。这个项目的病根之一就是版本漂移，精确版本 + 单一锁文件是对症的。

---

## 附：与总体计划的关系

| 原计划阶段 | 本方案 | 说明 |
| --- | --- | --- |
| 阶段 0 规范归一（3–5 人日） | **P0 + P1 + P4**（6–7.5 人日） | 因"全部升最新"，成本上升 |
| 阶段 1–3 结构合并 | **P2**（不变，结构部分共 14–19 人日） | 本方案不改变结构方案 |
| 阶段 4 CI/发布/文档 | 归入 **P0 + P4** | 顺带完成 |
| 额外交付 | **P3 UI 栈升级**（2–3 人日） | 原计划未包含 |
| **总计** | **约 22–29 人日** | 结构 14–19 + 工具链 8–10.5 |
