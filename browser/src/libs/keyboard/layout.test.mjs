/* eslint-disable @typescript-eslint/explicit-function-return-type */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadTsModule(filePath, dependencies = {}) {
  const source = readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;

  const module = { exports: {} };
  const require = (specifier) => {
    if (specifier in dependencies) {
      return dependencies[specifier];
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  };

  Function('exports', 'module', 'require', output)(module.exports, module, require);
  return module.exports;
}

const keymap = loadTsModule(path.join(__dirname, 'keymap.ts'));
const layout = loadTsModule(path.join(__dirname, 'layout.ts'), {
  './keymap': keymap
});

const SHIFT = 1 << 1;
const ALT_GR = 1 << 6;

function stroke(char, keyboardLayout = 'de') {
  return layout.getKeyboardStroke(char, keyboardLayout);
}

test('German layout maps swapped y/z and umlauts to German HID positions', () => {
  assert.deepEqual(stroke('y'), { modifier: 0, code: 0x1d });
  assert.deepEqual(stroke('z'), { modifier: 0, code: 0x1c });
  assert.deepEqual(stroke('Z'), { modifier: SHIFT, code: 0x1c });
  assert.deepEqual(stroke('ä'), { modifier: 0, code: 0x34 });
  assert.deepEqual(stroke('ö'), { modifier: 0, code: 0x33 });
  assert.deepEqual(stroke('ü'), { modifier: 0, code: 0x2f });
  assert.deepEqual(stroke('Ä'), { modifier: SHIFT, code: 0x34 });
  assert.deepEqual(stroke('Ö'), { modifier: SHIFT, code: 0x33 });
  assert.deepEqual(stroke('Ü'), { modifier: SHIFT, code: 0x2f });
  assert.deepEqual(stroke('ß'), { modifier: 0, code: 0x2d });
});

test('German layout maps punctuation and AltGr characters', () => {
  assert.deepEqual(stroke('@'), { modifier: ALT_GR, code: 0x14 });
  assert.deepEqual(stroke('€'), { modifier: ALT_GR, code: 0x08 });
  assert.deepEqual(stroke('\\'), { modifier: ALT_GR, code: 0x2d });
  assert.deepEqual(stroke('{'), { modifier: ALT_GR, code: 0x24 });
  assert.deepEqual(stroke('['), { modifier: ALT_GR, code: 0x25 });
  assert.deepEqual(stroke(']'), { modifier: ALT_GR, code: 0x26 });
  assert.deepEqual(stroke('}'), { modifier: ALT_GR, code: 0x27 });
  assert.deepEqual(stroke('~'), { modifier: ALT_GR, code: 0x30 });
  assert.deepEqual(stroke('|'), { modifier: ALT_GR, code: 0x64 });
  assert.deepEqual(stroke('/'), { modifier: SHIFT, code: 0x24 });
  assert.deepEqual(stroke('"'), { modifier: SHIFT, code: 0x1f });
  assert.deepEqual(stroke("'"), { modifier: SHIFT, code: 0x31 });
  assert.deepEqual(stroke('?'), { modifier: SHIFT, code: 0x2d });
  assert.deepEqual(stroke('='), { modifier: SHIFT, code: 0x27 });
  assert.deepEqual(stroke('+'), { modifier: 0, code: 0x30 });
  assert.deepEqual(stroke('-'), { modifier: 0, code: 0x38 });
  assert.deepEqual(stroke('_'), { modifier: SHIFT, code: 0x38 });
  assert.deepEqual(stroke(':'), { modifier: SHIFT, code: 0x37 });
  assert.deepEqual(stroke(';'), { modifier: SHIFT, code: 0x36 });
  assert.deepEqual(stroke('#'), { modifier: 0, code: 0x31 });
  assert.deepEqual(stroke('^'), { modifier: 0, code: 0x35 });
  assert.deepEqual(stroke('°'), { modifier: SHIFT, code: 0x35 });
});

test('US layout keeps the existing ASCII behavior', () => {
  assert.deepEqual(stroke('@', 'us'), { modifier: SHIFT, code: 0x1f });
  assert.deepEqual(stroke('A', 'us'), { modifier: SHIFT, code: 0x04 });
  assert.deepEqual(stroke('z', 'us'), { modifier: 0, code: 0x1d });
});

test('sendTextAsKeyboardReports normalizes line endings and releases every stroke', async () => {
  const reports = [];

  await layout.sendTextAsKeyboardReports('A\r\n\t', 'de', async (report) => {
    reports.push(report);
  }, 0);

  assert.deepEqual(reports, [
    [SHIFT, 0, 0x04, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0x28, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0x2b, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ]);
});

test('sendTextAsKeyboardReports terminates German dead keys with space', async () => {
  const reports = [];

  await layout.sendTextAsKeyboardReports('^~', 'de', async (report) => {
    reports.push(report);
  }, 0);

  assert.deepEqual(reports, [
    [0, 0, 0x35, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0x2c, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [ALT_GR, 0, 0x30, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0x2c, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ]);
});
