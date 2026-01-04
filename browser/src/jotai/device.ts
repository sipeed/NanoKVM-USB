import { atom } from 'jotai';

import type { Resolution, Rotation } from '@/types.ts';

type VideoState = 'disconnected' | 'connecting' | 'connected';
type SerialState = 'notSupported' | 'disconnected' | 'connecting' | 'connected';

export const resolutionAtom = atom<Resolution>({
  width: 1920,
  height: 1080
});

export const videoScaleAtom = atom<number>(1.0);

export const videoRotationAtom = atom<Rotation>(0);

export const videoDeviceIdAtom = atom('');
export const videoStateAtom = atom<VideoState>('disconnected');

export const serialStateAtom = atom<SerialState>('disconnected');
