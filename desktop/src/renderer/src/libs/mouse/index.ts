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

function setBit(number: number, bitPosition: number, value: boolean): number {
  if (value) {
    return number | (1 << bitPosition)
  } else {
    return number & ~(1 << bitPosition)
  }
}
