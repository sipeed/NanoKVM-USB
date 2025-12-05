import { setBit } from './utils.ts';

interface ShortcutProps {
  label: string;
  modifiers: Partial<Modifiers>;
  keyCode: string;
}

const modifierKeys = new Set(['Control', 'Shift', 'Alt', 'Meta']);

class Modifiers {
  public rightWindows: boolean = false;
  public rightAlt: boolean = false;
  public rightShift: boolean = false;
  public rightCtrl: boolean = false;
  public leftWindows: boolean = false;
  public leftAlt: boolean = false;
  public leftShift: boolean = false;
  public leftCtrl: boolean = false;

  public encode(): number {
    let b = 0x00;
    b = setBit(b, 0, this.leftCtrl);
    b = setBit(b, 1, this.leftShift);
    b = setBit(b, 2, this.leftAlt);
    b = setBit(b, 3, this.leftWindows);
    b = setBit(b, 4, this.rightCtrl);
    b = setBit(b, 5, this.rightShift);
    b = setBit(b, 6, this.rightAlt);
    b = setBit(b, 7, this.rightWindows);
    return b;
  }

  public static getModifiers(event: KeyboardEvent, pressedModifiers: Set<string>) {
    const modifiers = new Modifiers();

    if (event.ctrlKey) {
      modifiers.leftCtrl = pressedModifiers.has('ControlLeft');
      modifiers.rightCtrl = pressedModifiers.has('ControlRight');
    }
    if (event.shiftKey) {
      modifiers.leftShift = pressedModifiers.has('ShiftLeft');
      modifiers.rightShift = pressedModifiers.has('ShiftRight');
    }
    if (event.altKey) {
      modifiers.leftAlt = pressedModifiers.has('AltLeft');
      modifiers.rightAlt = pressedModifiers.has('AltRight');
    }
    if (event.metaKey) {
      modifiers.leftWindows = pressedModifiers.has('MetaLeft');
      modifiers.rightWindows = pressedModifiers.has('MetaRight');
    }
    if (event.getModifierState('AltGraph')) {
      modifiers.leftCtrl = true;
      modifiers.rightAlt = true;
    }
    return modifiers;
  }
}

export { type ShortcutProps, Modifiers, modifierKeys };
