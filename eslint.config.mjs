import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// ESLint / typescript-eslint 的编译器依赖是 TypeScript 5.x（typescript-eslint 仅支持 <6.1），
// 而仓库构建链使用 TypeScript 7（原生编译器，无 JS API）。因此 lint 工具链独立安装于
// tools/lint，这里通过该包的解析器加载，保证 parser 使用其自带的 TypeScript 5.9。
const requireFromLint = createRequire(new URL('./tools/lint/package.json', import.meta.url))

async function loadFromLint(name) {
  const resolved = requireFromLint.resolve(name)
  const mod = await import(pathToFileURL(resolved).href)
  return mod.default ?? mod
}

const js = await loadFromLint('@eslint/js')
const tseslint = await loadFromLint('typescript-eslint')
const globals = await loadFromLint('globals')
const reactHooks = await loadFromLint('eslint-plugin-react-hooks')
const reactRefresh = await loadFromLint('eslint-plugin-react-refresh')
const prettier = await loadFromLint('eslint-config-prettier')

// eslint-plugin-react-hooks@7 的 recommended 比 v5 严格得多（含 React Compiler 规则），
// 首次全仓运行时统一降为 warn，CI 只 fail error；后续单独 PR 收敛。
const reactHooksRules = Object.fromEntries(
  Object.entries(reactHooks.configs.recommended.rules).map(([rule]) => [rule, 'warn'])
)

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/release/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooksRules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  prettier
)
