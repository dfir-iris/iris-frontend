import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { WarRoomTimelinesService } from '../war-room-timelines.service';
import { ApiService } from '../api.service';

describe('WarRoomTimelinesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// Timelines CRUD
	// -----------------------------------------------------------------------

	describe('list()', () => {
		it('calls GET /war-rooms/{id}/timelines with options', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.list(5, { skipTokenRefresh: true });

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/timelines', {
				skipTokenRefresh: true
			});
			expect(res).toBe(mock);
		});

		it('uses default empty options when none supplied', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.list(7);

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/timelines', {});
		});
	});

	describe('create()', () => {
		it('calls POST /war-rooms/{id}/timelines with body and options', async () => {
			const body = { name: 'Alpha', description: 'first', color: '#ff0000' };
			const mock = {
				ok: true,
				status: 201,
				data: {
					timeline_id: 1,
					war_room_id: 5,
					...body,
					is_default: false,
					created_at: null,
					created_by_id: null
				}
			};
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.create(5, body, { skipTokenRefresh: true });

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/timelines', body, {
				skipTokenRefresh: true
			});
			expect(res).toBe(mock);
		});

		it('passes null description and color', async () => {
			const body = { name: 'Beta', description: null, color: null };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: {}
			});

			await WarRoomTimelinesService.create(3, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/3/timelines', body, {});
		});
	});

	describe('update()', () => {
		it('calls PATCH /war-rooms/{warRoomId}/timelines/{timelineId} with body', async () => {
			const body = { name: 'Renamed', color: '#00ff00' };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.update(5, 12, body);

			expect(ApiService.patch).toHaveBeenCalledOnce();
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/5/timelines/12', body, {});
			expect(res).toBe(mock);
		});
	});

	describe('remove()', () => {
		it('calls DELETE /war-rooms/{warRoomId}/timelines/{timelineId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.remove(5, 12, { skipTokenRefresh: true });

			expect(ApiService.delete).toHaveBeenCalledOnce();
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/timelines/12', {
				skipTokenRefresh: true
			});
			expect(res).toBe(mock);
		});
	});

	// -----------------------------------------------------------------------
	// listEvents — query-string construction
	// -----------------------------------------------------------------------

	describe('listEvents()', () => {
		it('omits query string when timelineIds is empty', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			await WarRoomTimelinesService.listEvents(5);

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/timelines/events');
		});

		it('omits query string when timelineIds is explicitly []', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listEvents(5, { timelineIds: [] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/timelines/events');
		});

		it('appends ?timeline_ids=<comma-joined> for a single id', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listEvents(5, { timelineIds: [3] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/timelines/events?timeline_ids=3');
		});

		it('joins multiple timelineIds with commas', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listEvents(5, { timelineIds: [1, 2, 3] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/timelines/events?timeline_ids=1%2C2%2C3');
		});

		it('forwards options to ApiService.get', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listEvents(5, {}, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// addEvent / updateEvent / removeEvent
	// -----------------------------------------------------------------------

	describe('addEvent()', () => {
		it('calls POST /war-rooms/{warRoomId}/timelines/{timelineId}/events', async () => {
			const body = { title: 'Recon', event_date: '2024-01-01T00:00:00Z' };
			const mock = { ok: true, status: 201, data: { id: 99 } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.addEvent(5, 12, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/timelines/12/events', body, {});
			expect(res).toBe(mock);
		});
	});

	describe('updateEvent()', () => {
		it('calls PATCH /war-rooms/{warRoomId}/timelines/events/{eventId}', async () => {
			const body = { title: 'Updated', is_flagged: true };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.updateEvent(5, 99, body);

			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/5/timelines/events/99', body, {});
			expect(res).toBe(mock);
		});
	});

	describe('removeEvent()', () => {
		it('calls DELETE /war-rooms/{warRoomId}/timelines/events/{eventId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.removeEvent(5, 99);

			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/timelines/events/99', {});
			expect(res).toBe(mock);
		});
	});

	// -----------------------------------------------------------------------
	// toggleEventFlag
	// -----------------------------------------------------------------------

	describe('toggleEventFlag()', () => {
		it('calls POST /war-rooms/{warRoomId}/timelines/events/{eventId}/flag with empty body', async () => {
			const mock = { ok: true, status: 200, data: { id: 99, is_flagged: true } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.toggleEventFlag(5, 99);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/timelines/events/99/flag', {}, {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomTimelinesService.toggleEventFlag(5, 99, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// duplicateEvent
	// -----------------------------------------------------------------------

	describe('duplicateEvent()', () => {
		it('calls POST /war-rooms/{warRoomId}/timelines/events/{eventId}/duplicate with empty body', async () => {
			const mock = { ok: true, status: 201, data: { id: 100 } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.duplicateEvent(5, 99);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/5/timelines/events/99/duplicate',
				{},
				{}
			);
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: {}
			});

			await WarRoomTimelinesService.duplicateEvent(5, 99, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// setEventAssets
	// -----------------------------------------------------------------------

	describe('setEventAssets()', () => {
		it('calls PUT /war-rooms/{warRoomId}/timelines/events/{eventId}/assets with asset_ids', async () => {
			const mock = { ok: true, status: 200, data: { asset_ids: [1, 2, 3] } };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.setEventAssets(5, 99, [1, 2, 3]);

			expect(ApiService.put).toHaveBeenCalledOnce();
			expect(ApiService.put).toHaveBeenCalledWith(
				'/war-rooms/5/timelines/events/99/assets',
				{ asset_ids: [1, 2, 3] },
				{}
			);
			expect(res).toBe(mock);
		});

		it('passes an empty array to detach all assets', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: { asset_ids: [] }
			});

			await WarRoomTimelinesService.setEventAssets(5, 99, []);

			expect(ApiService.put).toHaveBeenCalledWith(
				'/war-rooms/5/timelines/events/99/assets',
				{ asset_ids: [] },
				{}
			);
		});

		it('forwards options', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomTimelinesService.setEventAssets(5, 99, [7], { skipTokenRefresh: true });

			const [, , opts] = (ApiService.put as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// setEventIocs
	// -----------------------------------------------------------------------

	describe('setEventIocs()', () => {
		it('calls PUT /war-rooms/{warRoomId}/timelines/events/{eventId}/iocs with ioc_ids', async () => {
			const mock = { ok: true, status: 200, data: { ioc_ids: [10, 20] } };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.setEventIocs(5, 99, [10, 20]);

			expect(ApiService.put).toHaveBeenCalledOnce();
			expect(ApiService.put).toHaveBeenCalledWith(
				'/war-rooms/5/timelines/events/99/iocs',
				{ ioc_ids: [10, 20] },
				{}
			);
			expect(res).toBe(mock);
		});

		it('passes an empty array to detach all IOCs', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: { ioc_ids: [] }
			});

			await WarRoomTimelinesService.setEventIocs(5, 99, []);

			expect(ApiService.put).toHaveBeenCalledWith(
				'/war-rooms/5/timelines/events/99/iocs',
				{ ioc_ids: [] },
				{}
			);
		});

		it('forwards options', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomTimelinesService.setEventIocs(5, 99, [7], { skipTokenRefresh: true });

			const [, , opts] = (ApiService.put as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// Linked case timelines
	// -----------------------------------------------------------------------

	describe('listLinkedCaseTimelines()', () => {
		it('calls GET /war-rooms/{warRoomId}/linked-case-timelines', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTimelinesService.listLinkedCaseTimelines(5);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/linked-case-timelines', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseTimelines(5, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// listLinkedCaseEvents — query-string construction
	// -----------------------------------------------------------------------

	describe('listLinkedCaseEvents()', () => {
		it('omits query string when caseTimelineIds is absent', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseEvents(5);

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/linked-case-timelines/events');
		});

		it('omits query string when caseTimelineIds is []', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseEvents(5, { caseTimelineIds: [] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/linked-case-timelines/events');
		});

		it('appends ?case_timeline_ids=<id> for a single id', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseEvents(5, { caseTimelineIds: [7] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/linked-case-timelines/events?case_timeline_ids=7');
		});

		it('joins multiple caseTimelineIds with commas', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseEvents(5, { caseTimelineIds: [7, 8, 9] });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/5/linked-case-timelines/events?case_timeline_ids=7%2C8%2C9');
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomTimelinesService.listLinkedCaseEvents(5, {}, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});
});
