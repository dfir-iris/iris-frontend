import { describe, expect, it, vi } from 'vitest';
import {
	groupOf,
	hostOf,
	ipv4Subnet,
	ipv6Subnet,
	nodeDomain,
	nodeSubnet,
	registrableDomain
} from '../grouping';
import { OperationHistory } from '../history';
import {
	clearLocalViewState,
	emptyViewState,
	loadLocalViewState,
	localStateKey,
	parseViewState,
	saveLocalViewState
} from '../view-state';
import { node } from './fixtures';

describe('grouping', () => {
	it('computes IPv4 /24 and IPv6 /64 subnets', () => {
		expect(ipv4Subnet('10.1.2.3')).toBe('10.1.2.0/24');
		expect(ipv6Subnet('2001:db8::1')).toBe('2001:db8:0:0::/64');
		expect(ipv6Subnet('2001:0db8:0001:0002:0003:0004:0005:0006')).toBe('2001:db8:1:2::/64');
		expect(ipv6Subnet('1::2::3')).toBeNull();
		expect(ipv6Subnet('1:2:3')).toBeNull();
	});

	it('takes the subnet from the asset IP or the IOC value', () => {
		expect(nodeSubnet(node('asset:1', { label: 'DC01', subtitle: '192.168.1.20' }))).toBe(
			'192.168.1.0/24'
		);
		expect(nodeSubnet(node('ioc:1', { label: 'fe80::1' }))).toBe('fe80:0:0:0::/64');
		expect(nodeSubnet(node('asset:2', { label: 'WKS' }))).toBeNull();
	});

	it('derives registrable domains from hosts, URLs and emails', () => {
		expect(registrableDomain('a.b.example.com')).toBe('example.com');
		expect(registrableDomain('mail.corp.co.uk')).toBe('corp.co.uk');
		expect(registrableDomain('10.0.0.1')).toBeNull();
		expect(hostOf('https://user@cdn.evil.net:8443/x?y')).toBe('cdn.evil.net');
		expect(hostOf('bob@phish.org')).toBe('phish.org');
		expect(hostOf('evil[.]example[.]com')).toBe('evil.example.com');
		expect(hostOf('not a host')).toBeNull();
		expect(nodeDomain(node('asset:1', { label: 'dc01.corp.local' }))).toBe('corp.local');
		expect(nodeDomain(node('event:1', { label: 'x.example.com' }))).toBeNull();
	});

	it('groups by type, compromise, subnet and domain', () => {
		const a = node('asset:1', {
			label: 'dc01.corp.local',
			type: 'Windows - DC',
			compromised: true
		});
		expect(groupOf(a, 'type')).toBe('Asset · Windows - DC');
		expect(groupOf(a, 'compromise')).toBe('Compromised');
		expect(groupOf(node('asset:2', { compromised: false }), 'compromise')).toBe('Not compromised');
		expect(groupOf(node('asset:3'), 'compromise')).toBe('Compromise unknown');
		expect(groupOf(node('ioc:3'), 'compromise')).toBe('IOC');
		expect(groupOf(a, 'subnet')).toBe('No IP');
		expect(groupOf(a, 'domain')).toBe('corp.local');
		expect(groupOf(node('ioc:4', { label: '1.2.3.4' }), 'domain')).toBe('No domain');
	});
});

describe('OperationHistory', () => {
	const entry = (log: string[], label: string, fail = { undo: false }) => ({
		label,
		undo: async () => {
			if (fail.undo) throw new Error('boom');
			log.push(`undo ${label}`);
		},
		redo: async () => {
			log.push(`redo ${label}`);
		}
	});

	it('undoes and redoes in order and clears the future on push', async () => {
		const log: string[] = [];
		const onChange = vi.fn();
		const h = new OperationHistory(10, onChange);
		h.push(entry(log, 'a'));
		h.push(entry(log, 'b'));
		expect(h.undoLabel).toBe('b');
		await h.undo();
		await h.undo();
		expect(h.canUndo).toBe(false);
		expect(h.redoLabel).toBe('a');
		await h.redo();
		expect(log).toEqual(['undo b', 'undo a', 'redo a']);
		h.push(entry(log, 'c'));
		expect(h.canRedo).toBe(false);
		expect(onChange).toHaveBeenCalled();
	});

	it('keeps a failing step in place and rethrows', async () => {
		const flags = { undo: true };
		const h = new OperationHistory();
		h.push(entry([], 'x', flags));
		await expect(h.undo()).rejects.toThrow('boom');
		expect(h.canUndo).toBe(true);
		expect(h.busy).toBe(false);
		flags.undo = false;
		await h.undo();
		expect(h.canRedo).toBe(true);
	});

	it('runs one step at a time and caps its size', async () => {
		const h = new OperationHistory(2);
		let release: () => void = () => {};
		h.push({
			label: 'slow',
			undo: () => new Promise<void>((r) => (release = r)),
			redo: async () => {}
		});
		const first = h.undo();
		expect(h.busy).toBe(true);
		expect(await h.undo()).toBeNull();
		release();
		await first;
		for (const l of ['1', '2', '3'])
			h.push({ label: l, undo: async () => {}, redo: async () => {} });
		await h.undo();
		await h.undo();
		expect(h.canUndo).toBe(false);
	});
});

describe('view state', () => {
	it('validates known keys and keeps foreign ones', () => {
		const s = parseViewState({
			layout: 'dagre',
			positions: { 'asset:1': { x: 1, y: 2 }, bad: { x: 'a' } },
			pinned: ['asset:1', 'asset:1', 3],
			hidden: 'nope',
			viewport: { zoom: 2, pan: { x: 1, y: 1 } },
			include: ['events', 'bogus'],
			time: { from: '2024-01-01', to: 5 },
			extra_nodes: ['ioc:3'],
			saved_by_other_feature: { a: 1 }
		});
		expect(s.positions).toEqual({ 'asset:1': { x: 1, y: 2 } });
		expect(s.pinned).toEqual(['asset:1']);
		expect(s.hidden).toEqual([]);
		expect(s.include).toEqual(['events']);
		expect(s.time).toEqual({ from: '2024-01-01', to: null });
		expect(s.extra_nodes).toEqual(['ioc:3']);
		expect(s.saved_by_other_feature).toEqual({ a: 1 });
		expect(parseViewState(null)).toEqual(emptyViewState());
		expect(parseViewState({ viewport: { zoom: 0, pan: { x: 0, y: 0 } } }).viewport).toBeNull();
	});

	it('round-trips through storage with rounded positions', () => {
		const data = new Map<string, string>();
		const storage = {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v),
			removeItem: (k: string) => void data.delete(k)
		};
		const state = { ...emptyViewState(), positions: { 'asset:1': { x: 1.234, y: -5.678 } } };
		expect(saveLocalViewState(7, state, storage)).toBe(true);
		expect(data.has(localStateKey(7))).toBe(true);
		expect(loadLocalViewState(7, storage)?.positions).toEqual({ 'asset:1': { x: 1.2, y: -5.7 } });
		data.set(localStateKey(8), '{not json');
		expect(loadLocalViewState(8, storage)).toBeNull();
		clearLocalViewState(7, storage);
		expect(loadLocalViewState(7, storage)).toBeNull();
	});

	it('reports failed writes', () => {
		const storage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {}
		};
		expect(saveLocalViewState(1, emptyViewState(), storage)).toBe(false);
		expect(saveLocalViewState(1, emptyViewState(), null)).toBe(false);
	});
});
