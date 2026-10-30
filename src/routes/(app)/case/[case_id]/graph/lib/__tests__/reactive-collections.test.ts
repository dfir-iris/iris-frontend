import { describe, expect, it } from 'vitest';
import { KeyMap, KeySet } from '../reactive-collections.svelte';

describe('KeySet', () => {
	it('behaves like a Set', () => {
		const s = new KeySet(['a', 'b']);
		expect(s).toBeInstanceOf(Set);
		expect(s.has('a')).toBe(true);
		s.add('c');
		s.add('c');
		s.delete('a');
		expect([...s]).toEqual(['b', 'c']);
		expect(s.size).toBe(2);
		s.clear();
		expect(s.size).toBe(0);
	});

	it('replaces its whole content in one go', () => {
		const s = new KeySet(['a', 'b']);
		s.replace(['x', 'y', 'x']);
		expect([...s.values()]).toEqual(['x', 'y']);
		s.replace([]);
		expect(s.size).toBe(0);
	});
});

describe('KeyMap', () => {
	it('behaves like a Map', () => {
		const m = new KeyMap<string, number>([['a', 1]]);
		expect(m).toBeInstanceOf(Map);
		m.set('b', 2);
		expect(m.get('b')).toBe(2);
		expect(m.has('b')).toBe(true);
		m.delete('b');
		expect(m.get('b')).toBeUndefined();
		expect([...m.entries()]).toEqual([['a', 1]]);
		expect(m.size).toBe(1);
		m.clear();
		expect(m.size).toBe(0);
	});
});
