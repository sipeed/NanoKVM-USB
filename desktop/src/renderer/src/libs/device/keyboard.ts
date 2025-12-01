import { setBit } from './utils';

export class Modifiers {
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
}
