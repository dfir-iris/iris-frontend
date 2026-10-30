import { describe, expect, it } from 'vitest';
import {
	eventFlow,
	eventLinkRoles,
	eventLinkRolesPayload,
	formatEventFlow,
	hasDirectedRoles
} from '../event-roles';

describe('eventLinkRoles', () => {
	it('reads the roles object with string keys', () => {
		expect(
			eventLinkRoles({ event_assets_roles: { '12': 'source', '13': 'involved' } }, 'asset')
		).toEqual({ 12: 'source', 13: 'involved' });
	});

	it('falls back on the role of the list rows and lets the roles object win', () => {
		const event = {
			assets: [
				{ id: 1, name: 'WS01', role: 'source' as const },
				{ id: 2, name: 'DC01', role: 'target' as const },
				{ name: 'unresolved', role: 'source' as const }
			],
			iocs: [{ id: 7, name: '1.2.3.4', role: 'target' as const }],
			event_assets_roles: { '2': 'involved' as const }
		};
		expect(eventLinkRoles(event, 'asset')).toEqual({ 1: 'source', 2: 'involved' });
		expect(eventLinkRoles(event, 'ioc')).toEqual({ 7: 'target' });
	});

	it('ignores bad keys and values, and a missing event', () => {
		expect(
			eventLinkRoles(
				{ event_iocs_roles: { x: 'source', '3': 'nope' as never, '4': 'target' } },
				'ioc'
			)
		).toEqual({ 4: 'target' });
		expect(eventLinkRoles(undefined, 'asset')).toEqual({});
	});
});

describe('eventLinkRolesPayload', () => {
	it('lists every linked id with a string key, involved by default, dropping unlinked ids', () => {
		expect(eventLinkRolesPayload([1, 2], { 1: 'source', 9: 'target' })).toEqual({
			'1': 'source',
			'2': 'involved'
		});
		expect(eventLinkRolesPayload([], { 1: 'source' })).toEqual({});
	});

	it('tells whether a linked object has a direction', () => {
		expect(hasDirectedRoles({ 1: 'involved', 2: 'target' }, [1, 2])).toBe(true);
		expect(hasDirectedRoles({ 1: 'involved', 2: 'target' }, [1])).toBe(false);
	});
});

describe('eventFlow', () => {
	it('is null without direction', () => {
		expect(eventFlow([{ name: 'A', role: 'involved' }], undefined)).toBeNull();
		expect(eventFlow(undefined, undefined)).toBeNull();
	});

	it('collects sources and targets, assets then IOCs, by display name', () => {
		const flow = eventFlow(
			[
				{ name: 'WS01 (Windows)', asset_name: 'WS01', role: 'source' },
				{ name: 'DC01 (Windows)', asset_name: 'DC01', role: 'target' }
			],
			[{ name: 'evil.com', ioc_value: 'evil.com', role: 'target' }]
		);
		expect(flow).toEqual({ sources: ['WS01'], targets: ['DC01', 'evil.com'] });
		expect(formatEventFlow(flow!)).toBe('WS01 → DC01, evil.com');
	});

	it('formats long and one-sided flows', () => {
		expect(formatEventFlow({ sources: ['A', 'B', 'C'], targets: ['D'] })).toBe('A, B +1 → D');
		expect(formatEventFlow({ sources: ['A'], targets: [] })).toBe('A → …');
		expect(formatEventFlow({ sources: [], targets: ['D'] }, 1)).toBe('… → D');
	});
});
