/**
 * build-pdf.mjs
 * Mermaid ブロックを PNG に変換してから md-to-pdf で PDF を生成するスクリプト
 *
 * 使い方: node docs/build-pdf.mjs
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SPEC_MD = join(__dirname, 'picoclaw-lock-login-spec.md')
const WORK_DIR = join(__dirname, '_pdf_work')
const PROCESSED_MD = join(WORK_DIR, 'spec-processed.md')
const IMG_DIR = join(WORK_DIR, 'mermaid-images')
const OUTPUT_PDF = join(__dirname, 'picoclaw-lock-login-spec.pdf')
const CSS_FILE = join(WORK_DIR, 'pdf.css')

// ── 1. 作業ディレクトリ準備 ──────────────────────────────────────────────────
if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true })
if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true })

// 古い mermaid PNG を削除
if (existsSync(IMG_DIR)) {
  readdirSync(IMG_DIR).forEach(f => { if (f.endsWith('.png')) unlinkSync(join(IMG_DIR, f)) })
}

// ── 2. Mermaid ブロックを PNG に変換 ─────────────────────────────────────────
let markdown = readFileSync(SPEC_MD, 'utf8')

let idx = 0
const mermaidRe = /```mermaid\n([\s\S]*?)```/g

const processed = markdown.replace(mermaidRe, (_, code) => {
  const mmdFile = join(IMG_DIR, `diagram-${idx}.mmd`)
  const pngFile = join(IMG_DIR, `diagram-${idx}.png`)
  idx++

  writeFileSync(mmdFile, code, 'utf8')

  try {
    execSync(
      `mmdc -i "${mmdFile}" -o "${pngFile}" --theme default --backgroundColor white --width 1200 --height 800`,
      { stdio: 'pipe', timeout: 30000 }
    )
    console.log(`✅ Rendered: ${pngFile}`)
  } catch (e) {
    console.warn(`⚠️  mmdc failed for diagram-${idx - 1}: ${e.message}`)
    // 失敗時はコードブロックとして残す
    return '```\n' + code + '```'
  }

  // ページ内で図が切れないよう break-inside:avoid の div で囲む
  const relPath = `mermaid-images/diagram-${idx - 1}.png`
  return `<div class="figure-block">\n\n![diagram](${relPath})\n\n</div>`
})

writeFileSync(PROCESSED_MD, processed, 'utf8')
console.log(`✅ Wrote processed MD: ${PROCESSED_MD}`)

// ── 3. PDF 用 CSS ─────────────────────────────────────────────────────────────
const css = `
/* ===== ベースフォント ===== */
body {
  font-family: "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", "Yu Gothic", sans-serif;
  font-size: 10pt;
  line-height: 1.6;
  color: #1a1a1a;
}

h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4px; margin-top: 24pt; }
h2 { font-size: 15pt; border-bottom: 1px solid #888; padding-bottom: 2px; margin-top: 18pt; }
h3 { font-size: 12pt; margin-top: 12pt; }
h4 { font-size: 10.5pt; }

/* ===== コードブロック ===== */
pre, code {
  font-family: "Menlo", "Courier New", monospace;
  font-size: 8.5pt;
  background: #f6f8fa;
  border-radius: 4px;
}
pre {
  padding: 10px 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ===== テーブル ===== */
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 9pt;
  margin: 10px 0;
}
th {
  background: #f0f0f0;
  padding: 5px 8px;
  border: 1px solid #ccc;
}
td {
  padding: 4px 8px;
  border: 1px solid #ddd;
}

/* ===== Blockquote ===== */
blockquote {
  border-left: 3px solid #4a90d9;
  margin: 8px 0;
  padding: 4px 12px;
  background: #f0f7ff;
  font-size: 9pt;
  color: #333;
}

/* ===== 図が改ページで切れないようにする ===== */
.figure-block {
  break-inside: avoid;
  page-break-inside: avoid;
  text-align: center;
  margin: 12pt 0;
}
.figure-block img {
  max-width: 100%;
  height: auto;
}
img {
  max-width: 100%;
  height: auto;
}

/* テーブルも途中で切れないよう (大テーブルは例外的に切れることがある) */
table {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* pre/codeブロックも切れないよう */
pre {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* h2, h3 の直後で改ページしない */
h2, h3, h4 {
  break-after: avoid;
  page-break-after: avoid;
}

/* hr は通常の区切り線 */
hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 16pt 0;
}
`

writeFileSync(CSS_FILE, css, 'utf8')
console.log(`✅ Wrote CSS: ${CSS_FILE}`)

// ── 4. md-to-pdf で PDF 生成 ──────────────────────────────────────────────────
const pdfOptions = JSON.stringify({
  format: 'A4',
  margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
  printBackground: true,
})

const cmd = [
  'md-to-pdf',
  `"${PROCESSED_MD}"`,
  `--stylesheet "${CSS_FILE}"`,
  `--pdf-options '${pdfOptions}'`,
  `--basedir "${WORK_DIR}"`,
  `--document-title "picoclaw ロック・ログイン仕様書"`,
].join(' ')

console.log('\n🔄 Running md-to-pdf ...')
try {
  execSync(cmd, { stdio: 'inherit', timeout: 120000 })
  const generated = PROCESSED_MD.replace(/\.md$/, '.pdf')
  if (existsSync(generated) && generated !== OUTPUT_PDF) {
    execSync(`mv "${generated}" "${OUTPUT_PDF}"`)
  }
  console.log(`\n✅ PDF generated: ${OUTPUT_PDF}`)
} catch (e) {
  console.error('❌ md-to-pdf failed:', e.message)
  process.exit(1)
}
