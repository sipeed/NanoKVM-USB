import { setBit } from './utils'

export enum Mode {
  RELATIVE = 0x01,
  ABSOLUTE = 0x02
}

export class Key {
  left: boolean
  right: boolean
  mid: boolean

  constructor(left: boolean = false, right: boolean = false, mid: boolean = false) {
    this.left = left
    this.right = right
    this.mid = mid
  }

  public encode(): number {
    let b = 0x00
    b = setBit(b, 0, this.left)
    b = setBit(b, 1, this.right)
    b = setBit(b, 2, this.mid)
    return b
  }
}
