// Notifications API client.
//
// Wraps `/api/v2/notifications` and `/api/v2/manage/notification-settings`.
// The bell store subscribes to the results; the profile / manage
// settings pages call the settings endpoints directly.

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type NotificationEventType =
	| 'mention'
	| 'task_assigned'
	| 'case_state_change'
	| 'case_assigned'
	| 'alert_assigned'
	| 'alert_escalated'
	| 'war_room_message'
	| 'war_room_thread_reply'
	| 'module_custom'
	| string; // custom modules can register their own — see backend service.py

export type NotificationChannel = 'in_app' | 'email';

export interface Notification {
	id: number;
	event_type: NotificationEventType;
	title: string;
	body: string | null;
	link: string | null;
	source_type: string | null;
	source_id: number | null;
	read_at: string | null;
	created_at: string | null;
}

export interface NotificationFeed {
	data: Notification[];
	unread_count: number;
}

export type NotificationSettingsGrid = Record<
	NotificationEventType,
	Record<NotificationChannel, boolean>
>;

export interface NotificationSettingsPayload {
	event_types: NotificationEventType[];
	channels: NotificationChannel[];
	settings: NotificationSettingsGrid;
}

export interface ListNotificationsParams {
	unread_only?: boolean;
	limit?: number;
	before_id?: number;
}

export class NotificationsService {
	static async list(
		params: ListNotificationsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<NotificationFeed>> {
		const path = ApiService.withQuery('/api/v2/notifications', params as Record<string, unknown>);
		return ApiService.get<NotificationFeed>(path, options);
	}

	static async unreadCount(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ unread_count: number }>> {
		return ApiService.get<{ unread_count: number }>('/api/v2/notifications/unread-count', options);
	}

	/**
	 * Mark specific notifications as read, or all with `{all: true}`.
	 * The server scopes on the session id so passing another user's
	 * ids is a no-op — but pass only your own for hygiene.
	 */
	static async markRead(
		body: { ids?: number[] } | { all: true },
		options: ApiOptions = {}
	): Promise<RequestResponse<{ affected: number; unread_count: number }>> {
		return ApiService.post<{ affected: number; unread_count: number }>(
			'/api/v2/notifications/mark-read',
			body,
			options
		);
	}

	/**
	 * Permanently delete notifications. Distinct from markRead — this
	 * removes the rows entirely so they no longer surface in the bell.
	 */
	static async clear(
		body: { ids?: number[] } | { all: true },
		options: ApiOptions = {}
	): Promise<RequestResponse<{ affected: number; unread_count: number }>> {
		return ApiService.post<{ affected: number; unread_count: number }>(
			'/api/v2/notifications/clear',
			body,
			options
		);
	}

	// --- Settings ------------------------------------------------------

	static async getSettings(
		options: ApiOptions = {}
	): Promise<RequestResponse<NotificationSettingsPayload>> {
		return ApiService.get<NotificationSettingsPayload>('/api/v2/notifications/settings', options);
	}

	static async putSettings(
		settings: NotificationSettingsGrid,
		options: ApiOptions = {}
	): Promise<RequestResponse<NotificationSettingsPayload>> {
		return ApiService.put<NotificationSettingsPayload>(
			'/api/v2/notifications/settings',
			{ settings },
			options
		);
	}

	// --- Admin defaults ------------------------------------------------

	static async getAdminSettings(
		options: ApiOptions = {}
	): Promise<RequestResponse<NotificationSettingsPayload>> {
		return ApiService.get<NotificationSettingsPayload>(
			'/api/v2/manage/notification-settings',
			options
		);
	}

	static async putAdminSettings(
		settings: NotificationSettingsGrid,
		options: ApiOptions = {}
	): Promise<RequestResponse<NotificationSettingsPayload>> {
		return ApiService.put<NotificationSettingsPayload>(
			'/api/v2/manage/notification-settings',
			{ settings },
			options
		);
	}
}
