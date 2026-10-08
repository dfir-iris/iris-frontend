import { describe, it, expect } from 'vitest';
import { maskAdd, maskCombine, maskHas, maskRemove, maskToggle } from '$lib/utils/permission-mask';

const AI_READ = 0x80000000;
const AI_WRITE = 0x100000000;

describe('permission-mask', () => {
	it('shows why plain bitwise ops are not enough', () => {
		// The bug the helpers exist for: 32-bit signed coercion.
		expect((AI_READ & AI_READ) === AI_READ).toBe(false);
		expect((AI_WRITE & AI_WRITE) === AI_WRITE).toBe(false);
	});

	it('tests the 0x80000000 bit', () => {
		expect(maskHas(AI_READ, AI_READ)).toBe(true);
		expect(maskHas(AI_READ | 0, AI_READ)).toBe(false); // negative after coercion
		expect(maskHas(0x7fffffff, AI_READ)).toBe(false);
		expect(maskHas(AI_READ + 0x1, 0x1)).toBe(true);
	});

	it('tests the 0x100000000 bit', () => {
		expect(maskHas(AI_WRITE, AI_WRITE)).toBe(true);
		expect(maskHas(AI_WRITE + 0x2, 0x2)).toBe(true);
		expect(maskHas(0xffffffff, AI_WRITE)).toBe(false);
		expect(maskHas(AI_WRITE, AI_READ)).toBe(false);
	});

	it('needs every bit of a multi-bit flag', () => {
		expect(maskHas(AI_READ + AI_WRITE, AI_READ + AI_WRITE)).toBe(true);
		expect(maskHas(AI_WRITE, AI_READ + AI_WRITE)).toBe(false);
	});

	it('never matches an empty flag or empty mask', () => {
		expect(maskHas(0xff, 0)).toBe(false);
		expect(maskHas(0, 0x1)).toBe(false);
		expect(maskHas(null, 0x1)).toBe(false);
		expect(maskHas(undefined, AI_WRITE)).toBe(false);
	});

	it('adds high bits as exact positive numbers', () => {
		const m = maskAdd(maskAdd(0x1, AI_READ), AI_WRITE);
		expect(m).toBe(0x180000001);
		expect(maskAdd(m, AI_READ)).toBe(m);
		expect(maskAdd(null, AI_WRITE)).toBe(AI_WRITE);
	});

	it('removes high bits without touching the others', () => {
		const m = 0x180000003;
		expect(maskRemove(m, AI_READ)).toBe(0x100000003);
		expect(maskRemove(m, AI_WRITE)).toBe(0x80000003);
		expect(maskRemove(m, 0x2)).toBe(0x180000001);
		expect(maskRemove(0x1, AI_WRITE)).toBe(0x1);
	});

	it('toggles high bits back and forth', () => {
		let m = 0x1;
		m = maskToggle(m, AI_WRITE);
		expect(m).toBe(0x100000001);
		m = maskToggle(m, AI_READ);
		expect(m).toBe(0x180000001);
		m = maskToggle(m, AI_WRITE);
		expect(m).toBe(0x80000001);
		m = maskToggle(m, AI_READ);
		expect(m).toBe(0x1);
	});

	it('combines a list of bits', () => {
		expect(maskCombine([0x1, AI_READ, AI_WRITE])).toBe(0x180000001);
		expect(maskCombine([])).toBe(0);
	});

	it('round-trips a full mask exactly', () => {
		const all = 0x1ffffffff;
		expect(maskRemove(maskAdd(all, AI_WRITE), 0)).toBe(all);
		expect(Number.isSafeInteger(maskAdd(all, AI_WRITE))).toBe(true);
	});
});
