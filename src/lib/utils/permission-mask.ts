/**
 * Bitmask helpers for permission masks.
 *
 * JavaScript's `&`, `|`, `~` and `^` coerce their operands to 32-bit
 * signed integers. Permission bits now reach 0x100000000
 * (`ai_workflows_write`), and 0x80000000 already flips the sign bit,
 * so plain bitwise operators silently drop or corrupt those bits. These
 * helpers do the math on BigInt and convert back to `number`. Masks
 * stay below 2^53, so the Number round-trip is exact.
 */

// `BigInt(0)` rather than `0n`: the tsconfig target is ES2019, which
// rejects BigInt literals.
const ZERO = BigInt(0);

const toBig = (value: number | null | undefined): bigint => {
	if (value == null || !Number.isFinite(value) || value <= 0) return ZERO;
	return BigInt(Math.trunc(value));
};

/** True when every bit of `bits` is set in `mask`. */
export function maskHas(mask: number | null | undefined, bits: number): boolean {
	const b = toBig(bits);
	if (b === ZERO) return false;
	return (toBig(mask) & b) === b;
}

/** `mask` with every bit of `bits` set. */
export function maskAdd(mask: number | null | undefined, bits: number): number {
	return Number(toBig(mask) | toBig(bits));
}

/** `mask` with every bit of `bits` cleared. */
export function maskRemove(mask: number | null | undefined, bits: number): number {
	return Number(toBig(mask) & ~toBig(bits));
}

/** Clears `bits` when all of them are set, sets them otherwise. */
export function maskToggle(mask: number | null | undefined, bits: number): number {
	return maskHas(mask, bits) ? maskRemove(mask, bits) : maskAdd(mask, bits);
}

/** OR of several bits. */
export function maskCombine(bits: number[]): number {
	return bits.reduce((acc, b) => maskAdd(acc, b), 0);
}
