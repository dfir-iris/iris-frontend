import { describe, it, expect } from 'vitest';
import {
	defaultEventCategoryId,
	isTzOffset,
	nowUtcInput,
	relationTimelineAvailable,
	relationTimelineChoice,
	relationTimelineLinks,
	relationTimelineTitle,
	toEventDate,
	type RelationTimelineState
} from '../relation-timeline';

const categories = [
	{ id: 1, name: 'Unspecified' },
	{ id: 4, name: 'Lateral Movement' },
	{ id: 9, name: 'Command and Control' }
];

const state = (over: Partial<RelationTimelineState> = {}): RelationTimelineState => ({
	attach: [],
	create: true,
	title: '',
	date: '2026-10-30T14:05',
	tz: '+00:00',
	categoryId: 4,
	...over
});

describe('relation timeline', () => {
	it('is not offered when an endpoint is an event', () => {
		expect(relationTimelineAvailable('asset:1', 'ioc:2')).toBe(true);
		expect(relationTimelineAvailable('asset:1', 'event:2')).toBe(false);
		expect(relationTimelineAvailable('event:1', 'node:2')).toBe(false);
	});

	it('links assets and IOCs only', () => {
		expect(relationTimelineLinks('asset:1')).toBe(true);
		expect(relationTimelineLinks('ioc:1')).toBe(true);
		expect(relationTimelineLinks('node:1')).toBe(false);
	});

	it('picks the category matching the relation, else Unspecified, else the first', () => {
		expect(defaultEventCategoryId(categories, 'lateral_movement')).toBe(4);
		expect(defaultEventCategoryId(categories, 'beacons_to')).toBe(9);
		expect(defaultEventCategoryId(categories, 'connected_to')).toBe(1);
		expect(defaultEventCategoryId([{ id: 7, name: 'Other' }], 'connected_to')).toBe(7);
		expect(defaultEventCategoryId([], 'connected_to')).toBeNull();
	});

	it('formats the current UTC time for a datetime-local input', () => {
		expect(nowUtcInput(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05');
	});

	it('converts a datetime-local value to an event date', () => {
		expect(toEventDate('2026-10-30T14:05')).toBe('2026-10-30T14:05:00.000');
		expect(toEventDate('2026-10-30T14:05:09')).toBe('2026-10-30T14:05:09.000');
		expect(toEventDate('2026-10-30T14:05:09.5')).toBe('2026-10-30T14:05:09.500');
		expect(toEventDate('')).toBeNull();
		expect(toEventDate('30/10/2026')).toBeNull();
	});

	it('validates timezone offsets', () => {
		expect(isTzOffset('+02:00')).toBe(true);
		expect(isTzOffset('-05:30')).toBe(true);
		expect(isTzOffset('UTC')).toBe(false);
	});

	it('suggests a title from the endpoints and the relation', () => {
		expect(relationTimelineTitle('WKS-01', 'Lateral movement', 'SRV-02')).toBe(
			'WKS-01 lateral movement SRV-02'
		);
	});

	it('only attaches the ticked events when no event is created', () => {
		expect(relationTimelineChoice(state({ create: false, attach: [3, 5] }), 'A to B')).toEqual({
			event_ids: [3, 5]
		});
		expect(relationTimelineChoice(state({ create: false }), 'A to B')).toEqual({});
	});

	it('builds the new event, the suggested title by default', () => {
		expect(relationTimelineChoice(state({ attach: [3] }), 'A to B')).toEqual({
			event_ids: [3],
			timeline_event: {
				event_title: 'A to B',
				event_date: '2026-10-30T14:05:00.000',
				event_tz: '+00:00',
				event_category_id: 4
			}
		});
		expect(
			relationTimelineChoice(state({ title: '  RDP session ' }), 'A to B').timeline_event
				?.event_title
		).toBe('RDP session');
	});

	it('refuses an incomplete new event', () => {
		expect(() => relationTimelineChoice(state({ date: '' }), 'x')).toThrow(/date/);
		expect(() => relationTimelineChoice(state({ tz: 'CET' }), 'x')).toThrow(/timezone/);
		expect(() => relationTimelineChoice(state({ categoryId: null }), 'x')).toThrow(/category/);
	});
});
