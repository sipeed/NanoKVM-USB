#!/bin/bash
# Generate a PDF with Mermaid diagrams rendered as images
set -e

DOCS_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC="$DOCS_DIR/picoclaw-lock-login-spec.md"
TMPDIR="$(mktemp -d)"
RENDERED_MD="$TMPDIR/rendered.md"

echo "=== Extracting and rendering Mermaid diagrams ==="
COUNT=0
# Read the markdown and replace ```mermaid ... ``` blocks with image refs
awk -v tmpdir="$TMPDIR" '
BEGIN { in_mermaid=0; count=0; }
/^```mermaid/ { in_mermaid=1; count++; fname=tmpdir "/mermaid_" count ".mmd"; print "" > fname; next; }
/^```/ && in_mermaid { in_mermaid=0; print "![Diagram " count "](mermaid_" count ".png)"; next; }
in_mermaid { print >> fname; next; }
{ print; }
' "$SRC" > "$RENDERED_MD"

# Count how many mermaid files were created
MERMAID_COUNT=$(ls "$TMPDIR"/mermaid_*.mmd 2>/dev/null | wc -l | tr -d ' ')
echo "Found $MERMAID_COUNT Mermaid diagrams"

# Render each .mmd to .png
for mmd in "$TMPDIR"/mermaid_*.mmd; do
  [ -f "$mmd" ] || continue
  png="${mmd%.mmd}.png"
  base=$(basename "$png")
  echo "  Rendering $base ..."
  mmdc -i "$mmd" -o "$png" -b white -w 1200 2>&1 | grep -v "Generating single" || true
done

echo "=== Generating PDF ==="
cd "$TMPDIR"
md-to-pdf rendered.md --pdf-options '{"format": "A4", "margin": {"top": "15mm", "bottom": "15mm", "left": "15mm", "right": "15mm"}}' 2>&1

# Copy result
cp "$TMPDIR/rendered.pdf" "$DOCS_DIR/picoclaw-lock-login-spec-rendered.pdf"
echo "=== Done: picoclaw-lock-login-spec-rendered.pdf ==="

# Cleanup
rm -rf "$TMPDIR"
