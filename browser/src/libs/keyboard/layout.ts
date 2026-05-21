import { getModifierBit } from './keymap';

export type KeyboardLayout = 'us' | 'de';

export interface KeyboardStroke {
  modifier: number;
  code: number;
}

export const DEFAULT_KEYBOARD_LAYOUT: KeyboardLayout = 'us';
export const KEYBOARD_LAYOUTS: KeyboardLayout[] = ['us', 'de'];

const SHIFT = getModifierBit('ShiftLeft');
const ALT_GR = getModifierBit('AltRight');
const RELEASE_REPORT = [0, 0, 0, 0, 0, 0, 0, 0];
const SPACE_STROKE: KeyboardStroke = { modifier: 0, code: 0x2c };
const GERMAN_DEAD_KEYS = new Set(['^', '~']);

const LETTER_CODES: Record<string, number> = {
  a: 0x04,
  b: 0x05,
  c: 0x06,
  d: 0x07,
  e: 0x08,
  f: 0x09,
  g: 0x0a,
  h: 0x0b,
  i: 0x0c,
  j: 0x0d,
  k: 0x0e,
  l: 0x0f,
  m: 0x10,
  n: 0x11,
  o: 0x12,
  p: 0x13,
  q: 0x14,
  r: 0x15,
  s: 0x16,
  t: 0x17,
  u: 0x18,
  v: 0x19,
  w: 0x1a,
  x: 0x1b,
  y: 0x1c,
  z: 0x1d
};

function addStroke(
  map: Record<string, KeyboardStroke>,
  char: string,
  code: number,
  modifier = 0
): void {
  map[char] = { modifier, code };
}

function addLetters(map: Record<string, KeyboardStroke>, codes = LETTER_CODES): void {
  for (const [letter, code] of Object.entries(codes)) {
    addStroke(map, letter, code);
    addStroke(map, letter.toUpperCase(), code, SHIFT);
  }
}

function createUsLayout(): Record<string, KeyboardStroke> {
  const map: Record<string, KeyboardStroke> = {};

  addLetters(map);

  for (const [digit, code] of Object.entries({
    '1': 0x1e,
    '2': 0x1f,
    '3': 0x20,
    '4': 0x21,
    '5': 0x22,
    '6': 0x23,
    '7': 0x24,
    '8': 0x25,
    '9': 0x26,
    '0': 0x27
  })) {
    addStroke(map, digit, code);
  }

  for (const [char, stroke] of Object.entries({
    ' ': SPACE_STROKE,
    '\t': { modifier: 0, code: 0x2b },
    '\n': { modifier: 0, code: 0x28 },
    '!': { modifier: SHIFT, code: 0x1e },
    '@': { modifier: SHIFT, code: 0x1f },
    '#': { modifier: SHIFT, code: 0x20 },
    $: { modifier: SHIFT, code: 0x21 },
    '%': { modifier: SHIFT, code: 0x22 },
    '^': { modifier: SHIFT, code: 0x23 },
    '&': { modifier: SHIFT, code: 0x24 },
    '*': { modifier: SHIFT, code: 0x25 },
    '(': { modifier: SHIFT, code: 0x26 },
    ')': { modifier: SHIFT, code: 0x27 },
    '-': { modifier: 0, code: 0x2d },
    _: { modifier: SHIFT, code: 0x2d },
    '=': { modifier: 0, code: 0x2e },
    '+': { modifier: SHIFT, code: 0x2e },
    '[': { modifier: 0, code: 0x2f },
    '{': { modifier: SHIFT, code: 0x2f },
    ']': { modifier: 0, code: 0x30 },
    '}': { modifier: SHIFT, code: 0x30 },
    '\\': { modifier: 0, code: 0x31 },
    '|': { modifier: SHIFT, code: 0x31 },
    ';': { modifier: 0, code: 0x33 },
    ':': { modifier: SHIFT, code: 0x33 },
    "'": { modifier: 0, code: 0x34 },
    '"': { modifier: SHIFT, code: 0x34 },
    '`': { modifier: 0, code: 0x35 },
    '~': { modifier: SHIFT, code: 0x35 },
    ',': { modifier: 0, code: 0x36 },
    '<': { modifier: SHIFT, code: 0x36 },
    '.': { modifier: 0, code: 0x37 },
    '>': { modifier: SHIFT, code: 0x37 },
    '/': { modifier: 0, code: 0x38 },
    '?': { modifier: SHIFT, code: 0x38 }
  })) {
    map[char] = stroke;
  }

  return map;
}

function createGermanLayout(): Record<string, KeyboardStroke> {
  const map: Record<string, KeyboardStroke> = {};

  addLetters(map, { ...LETTER_CODES, y: 0x1d, z: 0x1c });

  for (const [digit, code] of Object.entries({
    '1': 0x1e,
    '2': 0x1f,
    '3': 0x20,
    '4': 0x21,
    '5': 0x22,
    '6': 0x23,
    '7': 0x24,
    '8': 0x25,
    '9': 0x26,
    '0': 0x27
  })) {
    addStroke(map, digit, code);
  }

  for (const [char, stroke] of Object.entries({
    ' ': SPACE_STROKE,
    '\t': { modifier: 0, code: 0x2b },
    '\n': { modifier: 0, code: 0x28 },
    ä: { modifier: 0, code: 0x34 },
    Ä: { modifier: SHIFT, code: 0x34 },
    ö: { modifier: 0, code: 0x33 },
    Ö: { modifier: SHIFT, code: 0x33 },
    ü: { modifier: 0, code: 0x2f },
    Ü: { modifier: SHIFT, code: 0x2f },
    ß: { modifier: 0, code: 0x2d },
    '!': { modifier: SHIFT, code: 0x1e },
    '"': { modifier: SHIFT, code: 0x1f },
    '§': { modifier: SHIFT, code: 0x20 },
    $: { modifier: SHIFT, code: 0x21 },
    '%': { modifier: SHIFT, code: 0x22 },
    '&': { modifier: SHIFT, code: 0x23 },
    '/': { modifier: SHIFT, code: 0x24 },
    '(': { modifier: SHIFT, code: 0x25 },
    ')': { modifier: SHIFT, code: 0x26 },
    '=': { modifier: SHIFT, code: 0x27 },
    '?': { modifier: SHIFT, code: 0x2d },
    '\\': { modifier: ALT_GR, code: 0x2d },
    '+': { modifier: 0, code: 0x30 },
    '*': { modifier: SHIFT, code: 0x30 },
    '~': { modifier: ALT_GR, code: 0x30 },
    '#': { modifier: 0, code: 0x31 },
    "'": { modifier: SHIFT, code: 0x31 },
    ',': { modifier: 0, code: 0x36 },
    ';': { modifier: SHIFT, code: 0x36 },
    '.': { modifier: 0, code: 0x37 },
    ':': { modifier: SHIFT, code: 0x37 },
    '-': { modifier: 0, code: 0x38 },
    _: { modifier: SHIFT, code: 0x38 },
    '<': { modifier: 0, code: 0x64 },
    '>': { modifier: SHIFT, code: 0x64 },
    '|': { modifier: ALT_GR, code: 0x64 },
    '^': { modifier: 0, code: 0x35 },
    '°': { modifier: SHIFT, code: 0x35 },
    '@': { modifier: ALT_GR, code: 0x14 },
    '€': { modifier: ALT_GR, code: 0x08 },
    '{': { modifier: ALT_GR, code: 0x24 },
    '[': { modifier: ALT_GR, code: 0x25 },
    ']': { modifier: ALT_GR, code: 0x26 },
    '}': { modifier: ALT_GR, code: 0x27 }
  })) {
    map[char] = stroke;
  }

  return map;
}

const LAYOUT_MAPS: Record<KeyboardLayout, Record<string, KeyboardStroke>> = {
  us: createUsLayout(),
  de: createGermanLayout()
};

export function normalizeKeyboardLayout(value: string | null | undefined): KeyboardLayout {
  return value === 'de' ? 'de' : DEFAULT_KEYBOARD_LAYOUT;
}

export function getKeyboardStroke(
  char: string,
  layout: KeyboardLayout = DEFAULT_KEYBOARD_LAYOUT
): KeyboardStroke | undefined {
  const normalizedChar = char === '\r' ? '\n' : char;
  const stroke = LAYOUT_MAPS[layout][normalizedChar];
  return stroke ? { ...stroke } : undefined;
}

export async function sendTextAsKeyboardReports(
  text: string,
  layout: KeyboardLayout,
  sendReport: (report: number[]) => Promise<void>,
  delayMs: number
): Promise<void> {
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (const char of Array.from(normalizedText)) {
    const stroke = getKeyboardStroke(char, layout);
    if (!stroke) {
      console.warn(`Skipping unsupported keyboard character: ${char}`);
      continue;
    }

    await sendStroke(stroke, sendReport, delayMs);

    if (layout === 'de' && GERMAN_DEAD_KEYS.has(char)) {
      await sendStroke(SPACE_STROKE, sendReport, delayMs);
    }
  }
}

async function sendStroke(
  stroke: KeyboardStroke,
  sendReport: (report: number[]) => Promise<void>,
  delayMs: number
): Promise<void> {
  await sendReport(buildReport(stroke));

  if (delayMs > 0) {
    await sleep(delayMs);
  }

  await sendReport([...RELEASE_REPORT]);
}

function buildReport(stroke: KeyboardStroke): number[] {
  return [stroke.modifier, 0, stroke.code, 0, 0, 0, 0, 0];
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
