// mouse cursor style
import { atom } from 'jotai';

export const mouseStyleAtom = atom('cursor-default');

// mouse mode: absolute or relative
export const mouseModeAtom = atom('absolute');

// mouse scroll direction: 1 or -1
export const scrollDirectionAtom = atom(-1);

// mouse scroll interval (unit: ms)
// mouse scroll interval (unit: ms)
export const scrollIntervalAtom = atom(0);

// mouse jiggler mode: enable or disable
export const mouseJigglerModeAtom = atom<'enable' | 'disable'>('disable');
