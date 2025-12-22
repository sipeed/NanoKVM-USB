export interface KeyInfo {
  code: string;
  label: string;
  isModifier: boolean;
}

export interface Shortcut {
  keys: KeyInfo[];
}
