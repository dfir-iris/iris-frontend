/**
 * URL and query shape for the vulnerabilities service.
 *
 * The backend reads the multi-value filters (severity, kind, status, …)
 * as one comma-separated parameter, not repeated keys, and booleans as
 * the literal strings `true` / `false`. Empty filters must be dropped
 * entirely: an empty `severity=` is a validation error server-side.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((url: string, params?: Record<string, unknown>) => {
			if (!params) return url;
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value == null) continue;
				if (Array.isArray(value)) {
					for (const item of value) if (item != null) search.append(key, String(item));
				} else {
					search.set(key, String(value));
				}
			}
			const query = search.toString();
			return query ? `${url}?${query}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	VulnerabilitiesService,
	findingStatusGroup,
	remediationNeedsReason
} from '../vulnerabilities.service';
import { ApiService } from '../api.service';

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const lastUrl = (fn: unknown) => {
	const calls = mocked(fn).mock.calls;
	return calls[calls.length - 1][0] as string;
};

const queryOf = (url: string) => new URL(url, 'http://x').searchParams;

beforeEach(() => {
	vi.clearAllMocks();
	mocked(ApiService.get).mockResolvedValue({ ok: true, data: null });
	mocked(ApiService.post).mockResolvedValue({ ok: true, data: null });
	mocked(ApiService.put).mockResolvedValue({ ok: true, data: null });
	mocked(ApiService.delete).mockResolvedValue({ ok: true, data: null });
});

describe('VulnerabilitiesService.search', () => {
	it('hits the bare catalogue URL without a query', async () => {
		await VulnerabilitiesService.search();
		expect(lastUrl(ApiService.get)).toBe('/manage/vulnerabilities');
	});

	it('serialises every filter', async () => {
		await VulnerabilitiesService.search({
			page: 2,
			per_page: 25,
			order_by: 'cvss_score',
			sort_dir: 'asc',
			search: '  log4j  ',
			severity: ['critical', 'high'],
			kind: ['cve', 'zero-day'],
			kev: true,
			private: false,
			affected: true
		});
		const url = lastUrl(ApiService.get);
		expect(url.startsWith('/manage/vulnerabilities?')).toBe(true);
		const q = queryOf(url);
		expect(q.get('page')).toBe('2');
		expect(q.get('per_page')).toBe('25');
		expect(q.get('order_by')).toBe('cvss_score');
		expect(q.get('sort_dir')).toBe('asc');
		expect(q.get('search')).toBe('log4j');
		expect(q.getAll('severity')).toEqual(['critical,high']);
		expect(q.get('kind')).toBe('cve,zero-day');
		expect(q.get('kev')).toBe('true');
		expect(q.get('private')).toBe('false');
		expect(q.get('affected')).toBe('true');
	});

	it('drops empty and unset filters', async () => {
		await VulnerabilitiesService.search({
			search: '   ',
			severity: [],
			kind: [],
			affected: false
		});
		expect(lastUrl(ApiService.get)).toBe('/manage/vulnerabilities');
	});
});

describe('VulnerabilitiesService catalogue entries', () => {
	it('builds the entry, exposure and lookup URLs', async () => {
		await VulnerabilitiesService.get(7);
		expect(lastUrl(ApiService.get)).toBe('/manage/vulnerabilities/7');
		await VulnerabilitiesService.exposure(7);
		expect(lastUrl(ApiService.get)).toBe('/manage/vulnerabilities/7/exposure');
		await VulnerabilitiesService.lookup('CVE-2024-3400');
		expect(lastUrl(ApiService.get)).toBe('/manage/vulnerabilities/lookup?identifier=CVE-2024-3400');
	});

	it('merges the source into the target by id', async () => {
		await VulnerabilitiesService.merge(3, 9);
		expect(mocked(ApiService.post)).toHaveBeenCalledWith(
			'/manage/vulnerabilities/3/merge',
			{ target_id: 9 },
			{}
		);
	});

	it('looks a CVE up on cve.org by identifier', async () => {
		await VulnerabilitiesService.cveLookup('CVE-2024-3400');
		expect(lastUrl(ApiService.get)).toBe(
			'/manage/vulnerabilities/cve-lookup?identifier=CVE-2024-3400'
		);
	});

	it('syncs an entry from cve.org, non-forced by default', async () => {
		await VulnerabilitiesService.sync(5);
		expect(mocked(ApiService.post)).toHaveBeenCalledWith(
			'/manage/vulnerabilities/5/sync',
			{ force: false },
			{}
		);
		await VulnerabilitiesService.sync(5, true);
		expect(mocked(ApiService.post)).toHaveBeenLastCalledWith(
			'/manage/vulnerabilities/5/sync',
			{ force: true },
			{}
		);
	});

	it('creates, updates and deletes', async () => {
		await VulnerabilitiesService.create({ is_private: true, title: 'x' });
		expect(mocked(ApiService.post)).toHaveBeenCalledWith(
			'/manage/vulnerabilities',
			{ is_private: true, title: 'x' },
			{}
		);
		await VulnerabilitiesService.update(4, { title: 'y' });
		expect(mocked(ApiService.put)).toHaveBeenCalledWith(
			'/manage/vulnerabilities/4',
			{ title: 'y' },
			{}
		);
		await VulnerabilitiesService.remove(4);
		expect(mocked(ApiService.delete)).toHaveBeenCalledWith('/manage/vulnerabilities/4', {});
	});
});

describe('VulnerabilitiesService.listCase', () => {
	it('lists a case without a query', async () => {
		await VulnerabilitiesService.listCase(12);
		expect(lastUrl(ApiService.get)).toBe('/cases/12/vulnerabilities');
	});

	it('serialises the findings filters', async () => {
		await VulnerabilitiesService.listCase(12, {
			asset_id: 5,
			vulnerability_id: 6,
			status: ['affected', 'mitigated'],
			status_group: 'open',
			exploitation: ['exploited', 'suspected'],
			severity: ['critical'],
			kev: false,
			overdue: true,
			search: ' ssh '
		});
		const url = lastUrl(ApiService.get);
		expect(url.startsWith('/cases/12/vulnerabilities?')).toBe(true);
		const q = queryOf(url);
		expect(q.get('asset_id')).toBe('5');
		expect(q.get('vulnerability_id')).toBe('6');
		expect(q.get('status')).toBe('affected,mitigated');
		expect(q.get('status_group')).toBe('open');
		expect(q.get('exploitation')).toBe('exploited,suspected');
		expect(q.get('severity')).toBe('critical');
		expect(q.get('kev')).toBe('false');
		expect(q.get('overdue')).toBe('true');
		expect(q.get('search')).toBe('ssh');
	});

	it('omits overdue=false and blank search', async () => {
		await VulnerabilitiesService.listCase(12, { overdue: false, search: '  ', status: [] });
		expect(lastUrl(ApiService.get)).toBe('/cases/12/vulnerabilities');
	});
});

describe('VulnerabilitiesService.listManaged', () => {
	it('lists a registry asset without a query', async () => {
		await VulnerabilitiesService.listManaged(33);
		expect(lastUrl(ApiService.get)).toBe('/manage/managed-assets/33/vulnerabilities');
	});

	it('shares the findings query builder', async () => {
		await VulnerabilitiesService.listManaged(33, { status_group: 'fixed', kev: true });
		const url = lastUrl(ApiService.get);
		expect(url.startsWith('/manage/managed-assets/33/vulnerabilities?')).toBe(true);
		const q = queryOf(url);
		expect(q.get('status_group')).toBe('fixed');
		expect(q.get('kev')).toBe('true');
	});

	it('builds the registry finding write URLs', async () => {
		await VulnerabilitiesService.updateManaged(33, 8, { notes: 'n' });
		expect(lastUrl(ApiService.put)).toBe('/manage/managed-assets/33/vulnerabilities/8');
		await VulnerabilitiesService.managedHistory(33, 8);
		expect(lastUrl(ApiService.get)).toBe('/manage/managed-assets/33/vulnerabilities/8/history');
	});
});

describe('VulnerabilitiesService.warRoomMatrix', () => {
	it('targets the war-room scope endpoint', async () => {
		await VulnerabilitiesService.warRoomMatrix(4);
		expect(lastUrl(ApiService.get)).toBe('/war-rooms/4/scope/vulnerabilities');
	});

	it('sends the page, the search and the case filter', async () => {
		await VulnerabilitiesService.warRoomMatrix(4, {
			page: 2,
			per_page: 50,
			search: '  log4j ',
			case_id: 7,
			tracked: true
		});
		const q = queryOf(lastUrl(ApiService.get));
		expect(q.get('page')).toBe('2');
		expect(q.get('per_page')).toBe('50');
		expect(q.get('search')).toBe('log4j');
		expect(q.get('case_id')).toBe('7');
		expect(q.get('tracked')).toBe('true');
	});

	it('omits the empty filters', async () => {
		await VulnerabilitiesService.warRoomMatrix(4, { search: '  ', case_id: null, tracked: false });
		const q = queryOf(lastUrl(ApiService.get));
		expect(q.has('search')).toBe(false);
		expect(q.has('case_id')).toBe(false);
		expect(q.has('tracked')).toBe(false);
	});
});

describe('status helpers', () => {
	it('groups remediation statuses', () => {
		expect(findingStatusGroup('affected')).toBe('open');
		expect(findingStatusGroup('verified')).toBe('fixed');
		expect(findingStatusGroup('false-positive')).toBe('dismissed');
		expect(findingStatusGroup('whatever')).toBe('open');
	});

	it('flags the statuses that need a reason', () => {
		expect(remediationNeedsReason('risk-accepted')).toBe(true);
		expect(remediationNeedsReason('false-positive')).toBe(true);
		expect(remediationNeedsReason('not-affected')).toBe(false);
	});
});
