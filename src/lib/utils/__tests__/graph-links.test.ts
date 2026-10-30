import { describe, expect, it } from 'vitest';
import {
	graphUrl,
	highlightedEventIds,
	parseGraphLink,
	parseIdList,
	parseKeyList,
	resolveGraphLink,
	timelineEventsUrl
} from '../graph-links';

describe('graph links', () => {
	it('parses id and key lists defensively', () => {
		expect(parseIdList(null)).toEqual([]);
		expect(parseIdList('3, 1,x,3,0,-2,1.5,7')).toEqual([3, 1, 7]);
		expect(parseKeyList('asset:12, ioc:3,bogus,asset:12,ioc:x')).toEqual(['asset:12', 'ioc:3']);
	});

	it('merges sharedEventId and events for the timeline highlight', () => {
		expect(highlightedEventIds(new URLSearchParams('sharedEventId=4&events=4,9'))).toEqual([4, 9]);
		expect(highlightedEventIds(new URLSearchParams(''))).toEqual([]);
	});

	it('builds timeline and graph URLs', () => {
		expect(timelineEventsUrl(2, [5])).toBe('/case/2/timeline?sharedEventId=5');
		expect(timelineEventsUrl(2, [5, 6, 5])).toBe('/case/2/timeline?events=5,6');
		expect(timelineEventsUrl(2, [])).toBe('/case/2/timeline');
		expect(graphUrl(2)).toBe('/case/2/graph');
		expect(graphUrl(2, { events: [101, 108] })).toBe('/case/2/graph?events=101,108');
		expect(graphUrl(2, { focus: ['asset:12', 'ioc:3'], events: [1] })).toBe(
			'/case/2/graph?focus=asset:12,ioc:3&events=1'
		);
		expect(parseGraphLink(new URLSearchParams('focus=asset:12,ioc:3&events=101,108'))).toEqual({
			focus: ['asset:12', 'ioc:3'],
			events: [101, 108]
		});
	});

	it('resolves the nodes and edges a link points at', () => {
		const r = resolveGraphLink(
			{ focus: ['asset:9', 'ioc:404'], events: [101] },
			{
				nodeKeys: new Set(['asset:1', 'asset:2', 'ioc:1', 'asset:9', 'event:101']),
				edges: [
					{ key: 'd:a', source: 'asset:1', target: 'asset:2', event_ids: [101, 102] },
					{ key: 'd:b', source: 'asset:1', target: 'ioc:1', event_ids: [102] }
				],
				events: [
					{ event_id: 101, keys: ['asset:1', 'asset:2', 'ioc:unknown'] },
					{ event_id: 102, keys: ['ioc:1'] }
				]
			}
		);
		expect([...r.nodes].sort()).toEqual(['asset:1', 'asset:2', 'asset:9', 'event:101']);
		expect([...r.edges]).toEqual(['d:a']);
	});
});
