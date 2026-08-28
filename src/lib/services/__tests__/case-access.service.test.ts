import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseAccessService } from '../case-access.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type {
	UserCasesAccessBody,
	UserCasesAccessDeleteBody,
	GroupCasesAccessBody,
	GroupCasesAccessDeleteBody
} from '../case-access.service';

describe('CaseAccessService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('setUserCasesAccess() should POST to the v2 /manage/users/{id}/cases-access route', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: UserCasesAccessBody = {
			cases_list: [1, 2],
			access_level: 2
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.setUserCasesAccess(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/manage/users/7/cases-access',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	// Revoke is DELETE-with-body on the v2 surface, not a POST to a
	// `/delete` sub-path — and `ApiService.delete` takes (url, options, body),
	// so the body is the *third* argument, not the second.
	it('deleteUserCasesAccess() should DELETE the v2 /manage/users/{id}/cases-access route with a body', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: UserCasesAccessDeleteBody = {
			cases: [3]
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.deleteUserCasesAccess(7, body, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith(
			'/api/v2/manage/users/7/cases-access',
			options,
			body
		);
		expect(ApiService.post).not.toHaveBeenCalled();
		expect(res).toBe(mockResponse);
	});

	it('setGroupCasesAccess() should POST to the v2 /manage/groups/{id}/cases-access route', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: GroupCasesAccessBody = {
			cases_list: [1, 2],
			access_level: 4,
			auto_follow_cases: false
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.setGroupCasesAccess(2, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/manage/groups/2/cases-access',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('deleteGroupCasesAccess() should DELETE the v2 /manage/groups/{id}/cases-access route with a body', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: GroupCasesAccessDeleteBody = {
			cases: [1]
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.deleteGroupCasesAccess(2, body, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith(
			'/api/v2/manage/groups/2/cases-access',
			options,
			body
		);
		expect(ApiService.post).not.toHaveBeenCalled();
		expect(res).toBe(mockResponse);
	});
});
