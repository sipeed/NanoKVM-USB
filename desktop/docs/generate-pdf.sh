#!/usr/bin/env bash
# Generate PDF from picoclaw-lock-login-spec.md with rendered Mermaid diagrams
# Prerequisites: mmdc (mermaid-cli), md-to-pdf
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$SCRIPT_DIR/picoclaw-lock-login-spec.md"
OUT="$SCRIPT_DIR/picoclaw-lock-login-spec.pdf"
WORK_DIR="$SCRIPT_DIR/.pdf-build"
MERMAID_CONFIG="$SCRIPT_DIR/mermaid-config.json"
MERMAID_CSS="$SCRIPT_DIR/mermaid.css"

echo "📄 Generating PDF from: $SRC"

# Clean & prepare work directory
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/images"

# Step 1: Extract and render Mermaid diagrams as SVG
echo "🔧 Extracting Mermaid diagrams..."
TEMP_MD="$WORK_DIR/spec-with-images.md"
cp "$SRC" "$TEMP_MD"

# Extract all mermaid code blocks, render each as SVG, and replace in markdown
DIAGRAM_NUM=0
while IFS= read -r -d '' block; do
  DIAGRAM_NUM=$((DIAGRAM_NUM + 1))
  SVG_FILE="images/diagram-${DIAGRAM_NUM}.svg"
  SVG_PATH="$WORK_DIR/$SVG_FILE"
  
  # Write mermaid code to temp file
  echo "$block" > "$WORK_DIR/temp-diagram.mmd"
  
  echo "  📊 Rendering diagram $DIAGRAM_NUM..."
  mmdc -i "$WORK_DIR/temp-diagram.mmd" \
       -o "$SVG_PATH" \
       -c "$MERMAID_CONFIG" \
       -C "$MERMAID_CSS" \
       --width 1200 \
       -b transparent 2>/dev/null || {
    echo "  ⚠️  Diagram $DIAGRAM_NUM failed to render, keeping as code block"
    continue
  }
done < <(
  # Extract mermaid blocks using perl for null-delimited output
  perl -0777 -ne 'while (/```mermaid\n(.*?)```/sg) { print "$1\0" }' "$SRC"
)

echo "  ✅ Rendered $DIAGRAM_NUM diagrams"

# Step 2: Replace mermaid code blocks with SVG images in the markdown
echo "🔄 Replacing mermaid blocks with image references..."
python3 -c "
import re, sys

with open('$SRC', 'r') as f:
    content = f.read()

n = [0]
def replace_mermaid(m):
    n[0] += 1
    svg = f'images/diagram-{n[0]}.svg'
    import os
    if os.path.isfile('$WORK_DIR/' + svg):
        return f'![図{n[0]}]({svg})'
    return m.group(0)

result = re.sub(r'\`\`\`mermaid\n.*?\`\`\`', replace_mermaid, content, flags=re.DOTALL)

with open('$TEMP_MD', 'w') as f:
    f.write(result)
"

# Step 3: Generate PDF using md-to-pdf
echo "📝 Generating PDF..."
cd "$WORK_DIR"

# Create md-to-pdf config at the top of the processed markdown
cat > "$WORK_DIR/spec-final.md" << 'FRONTMATTER'
---
pdf_options:
  format: A4
  margin: 20mm
  printBackground: true
  displayHeaderFooter: true
  headerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#999;">picoclaw リモート Windows ロック・ログイン機能仕様書 v2026.03.02</div>'
  footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#999;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
stylesheet:
  - https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css
body_class: markdown-body
css: |-
  body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; }
  .markdown-body { font-size: 11px; line-height: 1.6; }
  .markdown-body h1 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 8px; page-break-after: avoid; }
  .markdown-body h2 { font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 6px; page-break-after: avoid; margin-top: 24px; }
  .markdown-body h3 { font-size: 15px; page-break-after: avoid; }
  .markdown-body table { font-size: 10px; border-collapse: collapse; width: 100%; }
  .markdown-body table th, .markdown-body table td { border: 1px solid #ddd; padding: 4px 8px; }
  .markdown-body table th { background: #f6f8fa; }
  .markdown-body img { max-width: 100%; height: auto; display: block; margin: 12px auto; }
  .markdown-body pre { font-size: 10px; }
  .markdown-body code { font-size: 10px; }
  .markdown-body blockquote { font-size: 10px; border-left: 3px solid #ddd; padding-left: 12px; color: #555; }
  @media print { .markdown-body { max-width: none; } }
---
FRONTMATTER

cat "$TEMP_MD" >> "$WORK_DIR/spec-final.md"

md-to-pdf "$WORK_DIR/spec-final.md" 2>&1

# Move output to target location
if [[ -f "$WORK_DIR/spec-final.pdf" ]]; then
  mv "$WORK_DIR/spec-final.pdf" "$OUT"
fi

# Cleanup
rm -rf "$WORK_DIR"

if [[ -f "$OUT" ]]; then
  SIZE=$(du -h "$OUT" | cut -f1)
  echo ""
  echo "✅ PDF generated: $OUT ($SIZE)"
else
  echo "❌ PDF generation failed"
  exit 1
fi
