import { atom } from 'jotai';

import * as storage from '@/libs/storage';

export const isKeyboardEnableAtom = atom(true);

export const isKeyboardOpenAtom = atom(false);

export const targetKeyboardLayoutAtom = atom(storage.getTargetKeyboardLayout());

export const pasteSpeedAtom = atom<number>(storage.getPasteSpeed());
