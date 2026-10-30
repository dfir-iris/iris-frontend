import { describe, expect, it } from 'vitest';
import {
	addChange,
	batchTouchesGraph,
	batchTouchesViews,
	describeUpdate,
	initials,
	parseGraphChange,
	parseGraphPresence,
	peerColor,
	peerName,
	presenceApply,
	presenceByKey,
	presenceExpire,
	presenceKeyOf,
	presenceList,
	type ChangeBatch
} from '../realtime';

const change = (over: Record<string, unknown> = {}) =>
	parseGraphChange({ case_id: 3, entity: 'edge', action: 'created', by_user_id: 2, ...over }, 3)!;

const presence = (id: number, name: string | null, key: string | null, caseId = 3) => ({
	case_id: caseId,
	user: { id, name, login: `u${id}` },
	selected_key: key
});

describe('live graph helpers', () => {
	it('parses changes of this case only', () => {
		expect(change({ key: 'e:4' })).toEqual({
			case_id: 3,
			entity: 'edge',
			action: 'created',
			key: 'e:4',
			by_user_id: 2
		});
		expect(change({ by_user_id: null }).by_user_id).toBeNull();
		expect(parseGraphChange({ case_id: 4, entity: 'edge' }, 3)).toBeNull();
		expect(parseGraphChange({ case_id: '3', entity: 'edge' }, 3)).toBeNull();
		expect(parseGraphChange(null, 3)).toBeNull();
	});

	it('parses presences from other users', () => {
		expect(parseGraphPresence(presence(2, 'Bob', 'asset:1'), 3, 1)).toEqual(
			presence(2, 'Bob', 'asset:1')
		);
		expect(parseGraphPresence(presence(1, 'Me', null), 3, 1)).toBeNull();
		expect(parseGraphPresence(presence(2, 'Bob', null, 4), 3, 1)).toBeNull();
		expect(parseGraphPresence({ case_id: 3, user: { id: 'x' } }, 3, 1)).toBeNull();
	});

	it('batches changes', () => {
		let b: ChangeBatch | null = null;
		b = addChange(b, change());
		b = addChange(b, change({ entity: 'view' }));
		b = addChange(b, change({ by_user_id: 5 }));
		expect(b).toEqual({ count: 3, users: [2, 5], entities: ['edge', 'view'] });
		expect(batchTouchesGraph(b)).toBe(true);
		expect(batchTouchesViews(b)).toBe(true);
		const views = addChange(null, change({ entity: 'view' }));
		expect(batchTouchesGraph(views)).toBe(false);
	});

	it('describes who updated the graph', () => {
		const names: Record<number, string> = { 2: 'Alice', 5: 'Bob', 6: 'Carol' };
		const nameOf = (id: number) => names[id] ?? null;
		const batch = (users: (number | null)[]): ChangeBatch => ({
			count: users.length,
			users,
			entities: ['edge']
		});
		expect(describeUpdate(batch([1]), 1, nameOf)).toBeNull();
		expect(describeUpdate(batch([1, 2]), 1, nameOf)).toBe('Updated by Alice');
		expect(describeUpdate(batch([2, 5]), 1, nameOf)).toBe('Updated by Alice and Bob');
		expect(describeUpdate(batch([2, 5, 6]), 1, nameOf)).toBe('Updated by Alice and 2 others');
		expect(describeUpdate(batch([2, 9]), 1, nameOf)).toBe('Updated by Alice and 1 other');
		expect(describeUpdate(batch([9]), 1, nameOf)).toBe('Updated by another analyst');
		expect(describeUpdate(batch([null, 9]), 1, nameOf)).toBe('Updated by other analysts');
	});

	it('tracks, lists and expires the presence', () => {
		let peers = presenceApply({}, presence(5, 'Bob', 'asset:1'), 1000);
		peers = presenceApply(peers, presence(2, 'Alice', 'asset:1'), 2000);
		peers = presenceApply(peers, presence(6, null, null), 3000);
		expect(presenceList(peers).map((p) => p.user.id)).toEqual([2, 5, 6]);
		expect(
			presenceByKey(peers)
				.get('asset:1')
				?.map((p) => p.user.id)
		).toEqual([2, 5]);
		expect(presenceByKey(peers).size).toBe(1);
		peers = presenceApply(peers, presence(5, 'Bob', 'ioc:3'), 4000);
		expect(presenceByKey(peers).get('ioc:3')?.[0].user.id).toBe(5);
		expect(presenceExpire(peers, 4000, 5000)).toBe(peers);
		expect(Object.keys(presenceExpire(peers, 7500, 5000))).toEqual(['5', '6']);
	});

	it('names, initials and colours peers', () => {
		expect(peerName({ id: 3, name: ' Alice Martin ', login: 'am' })).toBe('Alice Martin');
		expect(peerName({ id: 3, name: null, login: 'am' })).toBe('am');
		expect(peerName({ id: 3, name: '', login: null })).toBe('User #3');
		expect(initials('Alice Martin')).toBe('AM');
		expect(initials('alice')).toBe('AL');
		expect(initials('jean-paul.sartre')).toBe('JS');
		expect(initials('  ')).toBe('?');
		expect(peerColor(1)).toMatch(/^#[0-9a-f]{6}$/);
		expect(peerColor(1)).toBe(peerColor(9));
		expect(peerColor(-1)).toMatch(/^#/);
	});

	it('picks the announced key', () => {
		const isNode = (id: string) => id.startsWith('asset:');
		const isEdge = (id: string) => id.startsWith('e:');
		expect(presenceKeyOf(['fan:1', 'e:2', 'asset:3'], isNode, isEdge)).toBe('asset:3');
		expect(presenceKeyOf(['e:2'], isNode, isEdge)).toBe('e:2');
		expect(presenceKeyOf(['fan:1'], isNode, isEdge)).toBeNull();
		expect(presenceKeyOf([`asset:${'x'.repeat(300)}`], isNode, isEdge)).toBeNull();
	});
});
