declare module 'gifenc' {
  export interface GIFEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: Record<string, unknown>): void
    finish(): void
    bytes(): Uint8Array
    reset(): void
  }

  export function GIFEncoder(): GIFEncoder

  export function quantize(
    rgba: Uint8ClampedArray,
    maxColors: number,
    options?: { format?: string },
  ): Uint8Array

  export function applyPalette(
    rgba: Uint8ClampedArray,
    palette: Uint8Array,
    options?: { format?: string },
  ): Uint8Array
}
