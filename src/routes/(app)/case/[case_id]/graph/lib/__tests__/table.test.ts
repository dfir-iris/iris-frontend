import { describe, expect, it } from 'vitest';
import {
	ariaSort,
	edgeMatchesSearch,
	edgeRow,
	filterRows,
	headerSelection,
	nextSort,
	nodeRow,
	pageOf,
	parseConfidence,
	sortRows,
	toCsv,
	toggleRowSelection
} from '../table';
import { edge, node } from './fixtures';

describe('graph table helpers', () => {
	it('builds node and edge rows', () => {
		const r = nodeRow(
			node('asset:1', {
				label: 'DC01',
				tags: ['ad', 'dc'],
				compromised: true,
				flags: [{ id: 1, name: 'Isolated', color: 'red', kind: 'status' }]
			}),
			3
		);
		expect(r).toMatchObject({
			kind: 'Asset',
			label: 'DC01',
			tags: 'ad, dc',
			flags: 'Isolated',
			compromised: true,
			degree: 3,
			events: 0
		});
		const e = edgeRow(edge('asset:1', 'ioc:2', { id: 5, confidence: 80 }), (k) => k.toUpperCase());
		expect(e).toMatchObject({
			key: 'e:5',
			stored: true,
			source: 'ASSET:1',
			target: 'IOC:2',
			relation: 'Connected to',
			confidence: 80
		});
		expect(edgeRow(edge('a:1', 'b:2'), (k) => k).stored).toBe(false);
	});

	it('keeps edges touching a search hit', () => {
		const e = edge('asset:1', 'ioc:2');
		expect(edgeMatchesSearch(e, null)).toBe(true);
		expect(edgeMatchesSearch(e, new Set(['ioc:2']))).toBe(true);
		expect(edgeMatchesSearch(e, new Set(['ioc:3']))).toBe(false);
	});

	it('sorts with empty values last and stable ties', () => {
		const rows = [
			{ key: 'c', v: 'b10' as string | null, n: 2 },
			{ key: 'a', v: null, n: 1 },
			{ key: 'b', v: 'b9', n: 2 },
			{ key: 'd', v: 'A1', n: 3 }
		];
		expect(sortRows(rows, { column: 'v', dir: 'asc' }).map((r) => r.key)).toEqual([
			'd',
			'b',
			'c',
			'a'
		]);
		expect(sortRows(rows, { column: 'v', dir: 'desc' }).map((r) => r.key)).toEqual([
			'c',
			'b',
			'd',
			'a'
		]);
		expect(sortRows(rows, { column: 'n', dir: 'desc' }).map((r) => r.key)).toEqual([
			'd',
			'b',
			'c',
			'a'
		]);
		expect(sortRows(rows, null)).toBe(rows);
	});

	it('cycles the sort and reports aria-sort', () => {
		const s1 = nextSort(null, 'label');
		expect(s1).toEqual({ column: 'label', dir: 'asc' });
		const s2 = nextSort(s1, 'label');
		expect(s2).toEqual({ column: 'label', dir: 'desc' });
		expect(nextSort(s2, 'label')).toBeNull();
		expect(nextSort(s2, 'kind')).toEqual({ column: 'kind', dir: 'asc' });
		expect(ariaSort(s2, 'label')).toBe('descending');
		expect(ariaSort(s2, 'kind')).toBe('none');
	});

	it('filters rows on every token', () => {
		const rows = [
			{ a: 'DC01', b: 'windows' },
			{ a: 'WS01', b: null },
			{ a: 'dc02', b: 'linux' }
		];
		expect(filterRows(rows, ' dc ', ['a'])).toHaveLength(2);
		expect(filterRows(rows, 'dc win', ['a', 'b'])).toEqual([rows[0]]);
		expect(filterRows(rows, '', ['a'])).toBe(rows);
	});

	it('toggles selections with shift ranges', () => {
		const ordered = ['a', 'b', 'c', 'd'];
		let s = toggleRowSelection(new Set(), 'b', { ordered });
		expect([...s]).toEqual(['b']);
		s = toggleRowSelection(s, 'd', { ordered, anchor: 'b', range: true });
		expect([...s].sort()).toEqual(['b', 'c', 'd']);
		s = toggleRowSelection(s, 'c', { ordered, anchor: 'd', range: true });
		expect([...s]).toEqual(['b']);
		s = toggleRowSelection(s, 'b', { ordered });
		expect(s.size).toBe(0);
		expect(headerSelection(new Set(['a']), ['a', 'b'])).toBe('some');
		expect(headerSelection(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
		expect(headerSelection(new Set(['a']), [])).toBe('none');
	});

	it('parses inline confidence', () => {
		expect(parseConfidence('')).toBeNull();
		expect(parseConfidence(' 80% ')).toBe(80);
		expect(parseConfidence('100')).toBe(100);
		expect(parseConfidence('101')).toBeUndefined();
		expect(parseConfidence('-1')).toBeUndefined();
		expect(parseConfidence('5.5')).toBeUndefined();
	});

	it('pages rows', () => {
		const rows = Array.from({ length: 25 }, (_, i) => i);
		expect(pageOf(rows, 3, 10)).toEqual({ rows: [20, 21, 22, 23, 24], page: 3, pages: 3 });
		expect(pageOf(rows, 9, 10).page).toBe(3);
		expect(pageOf([], 1, 10)).toEqual({ rows: [], page: 1, pages: 1 });
	});

	it('writes CSV safely', () => {
		expect(
			toCsv(
				['a', 'b'],
				[
					['x,y', '=cmd()'],
					[null, 'say "hi"']
				]
			)
		).toBe(`a,b\n"x,y",'=cmd()\n,"say ""hi"""`);
	});
});
