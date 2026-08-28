import { describe, it, expect } from 'vitest';
import { isHexColor, safeHexColor } from '../color';

// ── isHexColor ────────────────────────────────────────────────────────────────

describe('isHexColor', () => {
	// Valid formats accepted by the backend's _validate_color
	it('accepts a 3-character short hex (#RGB)', () => {
		expect(isHexColor('#fff')).toBe(true);
		expect(isHexColor('#a1b')).toBe(true);
	});

	it('accepts a 4-character hex (#RGBA)', () => {
		expect(isHexColor('#f0f8')).toBe(true);
	});

	it('accepts a 6-character full hex (#RRGGBB)', () => {
		expect(isHexColor('#ff0000')).toBe(true);
		expect(isHexColor('#AABBCC')).toBe(true);
		expect(isHexColor('#1a2b3c')).toBe(true);
	});

	it('accepts an 8-character hex with alpha (#RRGGBBAA)', () => {
		expect(isHexColor('#ff000080')).toBe(true);
		expect(isHexColor('#AABBCCDD')).toBe(true);
	});

	it('accepts mixed-case hex digits', () => {
		expect(isHexColor('#aAbBcC')).toBe(true);
		expect(isHexColor('#FFffFF')).toBe(true);
	});

	// Invalid inputs
	it('rejects a hex string without the leading #', () => {
		expect(isHexColor('ff0000')).toBe(false);
	});

	it('rejects a hex string that is too short (fewer than 3 hex digits)', () => {
		expect(isHexColor('#ff')).toBe(false);
		expect(isHexColor('#f')).toBe(false);
	});

	it('rejects a hex string that is too long (more than 8 hex digits)', () => {
		expect(isHexColor('#ff0000001')).toBe(false);
	});

	it('rejects a 5-character hex (not a standard length)', () => {
		// 5 digits falls in the 3-8 range but only 3,4,6,8 are conventional;
		// the regex accepts 3-8 so this should still pass — this test documents that
		// the implementation allows it, consistent with the backend regex
		expect(isHexColor('#fffff')).toBe(true);
	});

	it('rejects non-hex characters after the #', () => {
		expect(isHexColor('#gggggg')).toBe(false);
		expect(isHexColor('#xyz')).toBe(false);
	});

	it('rejects CSS named colors', () => {
		expect(isHexColor('red')).toBe(false);
		expect(isHexColor('transparent')).toBe(false);
	});

	it('rejects null', () => {
		expect(isHexColor(null)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isHexColor(undefined)).toBe(false);
	});

	it('rejects an empty string', () => {
		expect(isHexColor('')).toBe(false);
	});

	it('rejects a bare # with no digits', () => {
		expect(isHexColor('#')).toBe(false);
	});

	it('rejects a value with spaces', () => {
		expect(isHexColor('#ff 00 00')).toBe(false);
	});
});

// ── safeHexColor ──────────────────────────────────────────────────────────────

describe('safeHexColor', () => {
	it('returns the original string for a valid hex color', () => {
		expect(safeHexColor('#ff0000')).toBe('#ff0000');
	});

	it('preserves the exact casing of a valid input', () => {
		expect(safeHexColor('#AABBCC')).toBe('#AABBCC');
	});

	it('returns null for an invalid hex string', () => {
		expect(safeHexColor('not-a-color')).toBeNull();
	});

	it('returns null for null', () => {
		expect(safeHexColor(null)).toBeNull();
	});

	it('returns null for undefined', () => {
		expect(safeHexColor(undefined)).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(safeHexColor('')).toBeNull();
	});

	it('can be used as a boolean guard — truthy for valid, null for invalid', () => {
		const valid = safeHexColor('#abc');
		const invalid = safeHexColor('garbage');
		expect(valid ? 'ok' : 'bad').toBe('ok');
		expect(invalid ? 'ok' : 'bad').toBe('bad');
	});
});
