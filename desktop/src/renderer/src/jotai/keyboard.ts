import { atom } from 'jotai'

import { getCapsLockSync, getCommandToCtrl, getIgnoreCapsLock, getNumLock } from '@renderer/libs/storage'

export const isKeyboardEnableAtom = atom(true)

export const isKeyboardOpenAtom = atom(false)

export const numLockAtom = atom(getNumLock())

export const commandToCtrlAtom = atom(getCommandToCtrl())

export const ignoreCapsLockAtom = atom(getIgnoreCapsLock())

export const capsLockSyncAtom = atom(getCapsLockSync())
