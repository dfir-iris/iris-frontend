import { describe, expect, it } from 'vitest';
import { isEmptyQuery, parseQuery, queryBool } from '../query';
import { paletteHex, tlpHex } from '../palette';
import { applyAssetImageTheme, lucideIcon, svgToDataUrl, withStroke } from '../icons';
import { minimapTransform } from '../minimap';

const KEYS = ['kind', 'type', 'tag', 'compromised', 'flag'];

describe('parseQuery', () => {
	it('splits key:value terms from free text', () => {
		expect(
			parseQuery('kind:ioc type:ip tag:c2 compromised:true flag:isolated evil corp', KEYS)
		).toEqual({
			terms: [
				{ key: 'kind', value: 'ioc', negated: false },
				{ key: 'type', value: 'ip', negated: false },
				{ key: 'tag', value: 'c2', negated: false },
				{ key: 'compromised', value: 'true', negated: false },
				{ key: 'flag', value: 'isolated', negated: false }
			],
			text: ['evil', 'corp']
		});
	});

	it('supports negation, quotes and case-insensitive keys', () => {
		expect(parseQuery('-TAG:"red team" "hello world"', KEYS)).toEqual({
			terms: [{ key: 'tag', value: 'red team', negated: true }],
			text: ['hello world']
		});
	});

	it('treats unknown prefixes and empty values as text', () => {
		expect(parseQuery('http://x.y foo: type:', KEYS)).toEqual({
			terms: [],
			text: ['http://x.y', 'foo:', 'type:']
		});
	});

	it('handles empty input', () => {
		const q = parseQuery('   ', KEYS);
		expect(isEmptyQuery(q)).toBe(true);
	});

	it('parses booleans', () => {
		expect(queryBool('yes')).toBe(true);
		expect(queryBool('False')).toBe(false);
		expect(queryBool('maybe')).toBeNull();
	});
});

describe('palette', () => {
	it('maps names to light / dark hex', () => {
		expect(paletteHex('red', false)).toBe('#dc2626');
		expect(paletteHex('red', true)).toBe('#f87171');
		expect(paletteHex(' Sky ', false)).toBe('#0284c7');
	});

	it('passes hex through and falls back for unknown names', () => {
		expect(paletteHex('#ABCDEF', false)).toBe('#abcdef');
		expect(paletteHex('nope', false)).toBe('#475569');
		expect(paletteHex(null, true, 'amber')).toBe('#fbbf24');
	});

	it('resolves TLP names', () => {
		expect(tlpHex('TLP:RED', false)).toBe('#dc2626');
		expect(tlpHex('amber+strict', true)).toBe('#fbbf24');
		expect(tlpHex('clear', false)).toBe('#94a3b8');
		expect(tlpHex('', false)).toBeNull();
		expect(tlpHex('weird', false)).toBeNull();
	});
});

describe('icons', () => {
	it('recolours lucide svgs and encodes them', () => {
		const svg = '<svg width="24" stroke="currentColor"><path/></svg>';
		expect(withStroke(svg, '#fff')).toBe('<svg fill="none" width="24" stroke="#fff"><path/></svg>');
		expect(svgToDataUrl('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');
		expect(lucideIcon(svg, '#000').startsWith('data:image/svg+xml')).toBe(true);
	});

	it('adds the theme to asset images', () => {
		expect(applyAssetImageTheme('/static/a.png', true)).toBe('/static/a.png?theme=dark');
		expect(applyAssetImageTheme('/i?x=1', false)).toBe('/i?x=1&theme=light');
	});
});

describe('minimapTransform', () => {
	it('round-trips and fits the union of graph and viewport', () => {
		const t = minimapTransform(
			{ x1: 0, y1: 0, x2: 100, y2: 50 },
			{ x1: 50, y1: 0, x2: 200, y2: 50 },
			100,
			100,
			0
		);
		expect(t.scale).toBeCloseTo(0.5);
		const p = t.toMini({ x: 0, y: 0 });
		expect(p.x).toBeCloseTo(0);
		const back = t.toModel(t.toMini({ x: 123, y: 45 }));
		expect(back.x).toBeCloseTo(123);
		expect(back.y).toBeCloseTo(45);
	});
});
