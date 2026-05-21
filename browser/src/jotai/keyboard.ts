import { atom } from 'jotai';

import type { KeyboardLayout } from '@/libs/keyboard/layout';
import { getKeyboardLayout } from '@/libs/storage';

export const isKeyboardEnableAtom = atom(true);

export const isKeyboardOpenAtom = atom(false);

export const keyboardLayoutAtom = atom<KeyboardLayout>(getKeyboardLayout());
