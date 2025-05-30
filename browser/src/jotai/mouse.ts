// mouse cursor style
import { atom } from 'jotai';

export const mouseStyleAtom = atom('cursor-default');

// mouse mode: absolute or relative
export const mouseModeAtom = atom('absolute');

// mouse scroll direction: 1 or -1
export const scrollDirectionAtom = atom(1);

// mouse scroll interval (unit: ms)
export const scrollIntervalAtom = atom(0);

// mouse jiggler mode: enable or disable
export const mouseJigglerModeAtom = atom('disable');

// mouse jiggler timer id
export const mouseJigglerTimerAtom = atom<number | null>(null);

// mouse jiggler interval (unit: ms)
export const mouseJigglerIntervalAtom = atom(15_000);

// mouse jiggler last move time
export const mouseLastMoveTimeAtom = atom(0);
