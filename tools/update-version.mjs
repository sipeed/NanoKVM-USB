import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

const targetVersion = process.argv[2]?.replace(/^v/, '')

if (!targetVersion) {
  console.error('Usage: node tools/update-version.mjs <version>')
  process.exit(1)
}

// Basic semver validation (e.g., 1.2.3, 1.2.3-beta.1)
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error(
    `Invalid version format: "${targetVersion}". Expected semver like "1.2.3" or "1.5.1-beta.1"`
  )
  process.exit(1)
}

const packagePaths = [
  'package.json',
  'apps/browser/package.json',
  'apps/desktop/package.json',
  'packages/core/package.json',
  'packages/ui/package.json',
  'tools/lint/package.json'
]

for (const relPath of packagePaths) {
  const fullPath = resolve(rootDir, relPath)
  try {
    const content = readFileSync(fullPath, 'utf-8')
    const json = JSON.parse(content)
    const oldVersion = json.version
    json.version = targetVersion
    writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n', 'utf-8')
    console.log(`Updated ${relPath}: ${oldVersion} -> ${targetVersion}`)
  } catch (err) {
    console.error(`Failed to update ${relPath}:`, err)
    process.exit(1)
  }
}

console.log(`Successfully updated all packages to ${targetVersion}`)
