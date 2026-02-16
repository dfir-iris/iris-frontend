
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

	it('setUserCasesAccess() should call ApiService.post with /manage/users/{id}/cases-access/update, body, options', async () => {
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
			'/manage/users/7/cases-access/update',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('deleteUserCasesAccess() should call ApiService.post with /manage/users/{id}/cases-access/delete, body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: UserCasesAccessDeleteBody = {
			cases_list: [3]
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.deleteUserCasesAccess(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/users/7/cases-access/delete',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('setGroupCasesAccess() should call ApiService.post with /manage/groups/{id}/cases-access/update, body, options', async () => {
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
			'/manage/groups/2/cases-access/update',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('deleteGroupCasesAccess() should call ApiService.post with /manage/groups/{id}/cases-access/delete, body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const body: GroupCasesAccessDeleteBody = {
			cases_list: [1]
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { status: 'success' }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAccessService.deleteGroupCasesAccess(2, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/groups/2/cases-access/delete',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});
});
