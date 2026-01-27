import { atom } from 'jotai'

import { getCommandToCtrl, getNumLock } from '@renderer/libs/storage'

export const isKeyboardEnableAtom = atom(true)

export const isKeyboardOpenAtom = atom(false)

export const numLockAtom = atom(getNumLock())

export const commandToCtrlAtom = atom(getCommandToCtrl())
