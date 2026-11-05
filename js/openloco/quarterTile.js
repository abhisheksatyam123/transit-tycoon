/**
 * Ported from OpenLoco (MIT), https://github.com/OpenLoco/OpenLoco
 * Source: include/OpenLoco/Map/QuarterTile.h
 * QuarterTile packs the tile quarters a piece occupies into the low nibble and
 * the z (height) quarters into the high nibble of one byte.
 */

/** Quarter flags, matching the C++ QuarterTile bit layout. */
export const QUARTER_TO_BIT = Object.freeze({ TOP_LEFT: 0b0001, TOP_RIGHT: 0b0010, BOTTOM_RIGHT: 0b0100, BOTTOM_LEFT: 0b1000 });

export class QuarterTile {
  /** @type {number} raw byte: low nibble = tile quarters occupied, high nibble = z quarters */
  #val;

  /**
   * @param {number} tileQuarter occupied tile quarters (0b0000..0b1111)
   * @param {number} [zQuarter] occupied z quarters (defaults 0)
   */
  constructor(tileQuarter, zQuarter = 0) {
    this.#val = (tileQuarter | (zQuarter << 4)) & 0xff;
  }

  /** Build from a raw packed byte. */
  static fromRaw(raw) {
    const q = new QuarterTile(raw & 0x0f, (raw >> 4) & 0x0f);
    return q;
  }

  /** Raw packed byte. */
  get value() {
    return this.#val;
  }

  /**
   * Rotate both fields by `amount` quarter turns (C++ QuarterTile::rotate).
   * Rotation is cyclic: rotate(1) x4 === identity.
   * @param {number} amount 0..3 (other values return a copy unchanged, like the C++ default case)
   * @returns {QuarterTile}
   */
  rotate(amount) {
    const v = this.#val;
    switch (amount) {
      case 1: {
        let r1 = v << 1;
        const r2 = r1 >> 4;
        r1 &= 0b11101110;
        return QuarterTile.fromRaw((r1 | (r2 & 0b00010001)) & 0xff);
      }
      case 2: {
        let r1 = v << 2;
        const r2 = r1 >> 4;
        r1 &= 0b11001100;
        return QuarterTile.fromRaw((r1 | (r2 & 0b00110011)) & 0xff);
      }
      case 3: {
        let r1 = v << 3;
        const r2 = r1 >> 4;
        r1 &= 0b10001000;
        return QuarterTile.fromRaw((r1 | (r2 & 0b01110111)) & 0xff);
      }
      default:
        return QuarterTile.fromRaw(v);
    }
  }

  /** Low nibble — which tile quarters are occupied. */
  getBaseQuarterOccupied() {
    return this.#val & 0x0f;
  }

  /** High nibble — which z quarters are occupied. */
  getZQuarterOccupied() {
    return (this.#val >> 4) & 0x0f;
  }
}
