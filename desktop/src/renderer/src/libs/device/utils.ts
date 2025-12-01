export function setBit(number: number, bitPosition: number, value: boolean): number {
  if (value) {
    return number | (1 << bitPosition);
  } else {
    return number & ~(1 << bitPosition);
  }
}
