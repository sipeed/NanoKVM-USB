/**
 * build-multi-agent-pdf.mjs
 * multi-agent-spec.md の Mermaid ブロックを PNG に変換してから md-to-pdf で PDF を生成するスクリプト
 *
 * 使い方: node docs/build-multi-agent-pdf.mjs
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SPEC_MD = join(__dirname, 'multi-agent-spec.md')
const WORK_DIR = join(__dirname, '_pdf_work_multi_agent')
const PROCESSED_MD = join(WORK_DIR, 'spec-processed.md')
const IMG_DIR = join(WORK_DIR, 'mermaid-images')
const OUTPUT_PDF = join(__dirname, 'multi-agent-spec.pdf')
const CSS_FILE = join(WORK_DIR, 'pdf.css')
const MMDC_CONFIG_FILE = join(WORK_DIR, 'mmdc-config.json')

// ── 1. 作業ディレクトリ準備 ──────────────────────────────────────────────────
if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true })
if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true })

// 古い mermaid PNG を削除
if (existsSync(IMG_DIR)) {
  readdirSync(IMG_DIR).forEach(f => { if (f.endsWith('.png')) unlinkSync(join(IMG_DIR, f)) })
}

// mmdc 用の Mermaid テーマ設定を生成
const mmdcConfig = {
  theme: 'default',
  themeVariables: {
    fontFamily: '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "YuGothic", "Yu Gothic", Meiryo, "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
    fontSize: '14px'
  }
}
writeFileSync(MMDC_CONFIG_FILE, JSON.stringify(mmdcConfig, null, 2), 'utf8')
console.log(`✅ Wrote mmdc config: ${MMDC_CONFIG_FILE}`)

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
      `mmdc -i "${mmdFile}" -o "${pngFile}" --backgroundColor white --width 1100 --height 700 --scale 2 --configFile "${MMDC_CONFIG_FILE}"`,
      { stdio: 'pipe', timeout: 30000 }
    )
    console.log(`✅ Rendered: diagram-${idx - 1}.png`)
  } catch (e) {
    console.warn(`⚠️  mmdc failed for diagram-${idx - 1}: ${e.message}`)
    return '```\n' + code + '```'
  }

  const relPath = `mermaid-images/diagram-${idx - 1}.png`
  return `<div class="figure-block">\n\n![diagram](${relPath})\n\n</div>`
})

writeFileSync(PROCESSED_MD, processed, 'utf8')
console.log(`✅ Wrote processed MD: ${PROCESSED_MD}`)

// ── 3. PDF 用 CSS ─────────────────────────────────────────────────────────────
const css = `
/* ===== ベースフォント（日本語・絵文字対応） ===== */
body {
  font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "YuGothic", "Yu Gothic", "Meiryo", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
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
  font-size: 8pt;
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
  text-align: left;
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
  margin: 8pt 0;
}
.figure-block img {
  max-width: 100%;
  max-height: 210mm;
  width: auto;
  height: auto;
  object-fit: contain;
}
img {
  max-width: 100%;
  max-height: 210mm;
  width: auto;
  height: auto;
}

/* テーブルも途中で切れないよう */
table {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* pre/code ブロックも切れないよう */
pre {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* 見出しの直後で改ページしない */
h2, h3, h4 {
  break-after: avoid;
  page-break-after: avoid;
}

/* hr は区切り線 */
hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 16pt 0;
}

/* ASCII アート風ダイアグラム (pre で囲まれたテキスト図) */
pre {
  font-size: 7.5pt;
  line-height: 1.3;
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

const launchOptions = JSON.stringify({
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--font-render-hinting=none',
    '--disable-font-subpixel-positioning',
  ],
})

const cmd = [
  'md-to-pdf',
  `"${PROCESSED_MD}"`,
  `--stylesheet "${CSS_FILE}"`,
  `--pdf-options '${pdfOptions}'`,
  `--launch-options '${launchOptions}'`,
  `--page-media-type print`,
  `--basedir "${WORK_DIR}"`,
  `--document-title "マルチ AI エージェント対応仕様書"`,
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
