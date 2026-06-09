import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseTimelineService } from '../case-timeline.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type {
	CaseTimelineEvent,
	CreateCaseTimelineEventBody,
	UpdateCaseTimelineEventBody
} from '../case-timeline.service';

describe('CaseTimelineService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('getEvent() should call ApiService.get with /api/v2/cases/{caseId}/events/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				event_id: 11,
				event_title: 'An event',
				event_category_id: 5,
				event_date: '2023-03-08T03:02:00.000',
				event_tz: '+00:00',
				event_assets: [45],
				event_iocs: [33]
			} as CaseTimelineEvent
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelineService.getEvent(73, 11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/events/11', options);
		expect(res).toBe(mockResponse);
	});

	it('createEvent() should call ApiService.post with /api/v2/cases/{caseId}/events, body, options', async () => {
		const body: CreateCaseTimelineEventBody = {
			event_title: 'An event',
			event_category_id: 5,
			event_date: '2023-03-08T03:02:00.000',
			event_tz: '+00:00',
			event_assets: [45],
			event_iocs: [33],
			event_raw: 'Raw event log',
			event_source: 'MySource',
			event_in_summary: true,
			event_in_graph: true,
			event_color: '#1572E899',
			event_sync_iocs_assets: true,
			event_tags: 'tag',
			event_content: 'My description',
			parent_event_id: 11,
			custom_attributes: {}
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				event_id: 11,
				...body
			} as CaseTimelineEvent
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelineService.createEvent(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/73/events', body, options);
		expect(res).toBe(mockResponse);
	});

	it('updateEvent() should call ApiService.put with /api/v2/cases/{caseId}/events/{id}, body, options', async () => {
		const body: UpdateCaseTimelineEventBody = {
			event_title: 'Updated event',
			event_category_id: 6,
			event_date: '2023-03-09T03:02:00.000',
			event_tz: '+00:00',
			event_assets: [46],
			event_iocs: [34],
			event_raw: 'Updated raw event log',
			event_source: 'UpdatedSource',
			event_in_summary: false,
			event_in_graph: true,
			event_color: '#48ABF799',
			event_sync_iocs_assets: false,
			event_tags: 'updated',
			event_content: 'Updated description',
			parent_event_id: null,
			custom_attributes: {}
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				event_id: 11,
				...body
			} as CaseTimelineEvent
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelineService.updateEvent(73, 11, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73/events/11', body, options);
		expect(res).toBe(mockResponse);
	});

	it('removeEvent() should call ApiService.delete with /api/v2/cases/{caseId}/events/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelineService.removeEvent(73, 11, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/events/11', options);
		expect(res).toBe(mockResponse);
	});
});
