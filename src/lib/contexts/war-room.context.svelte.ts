/**
 * Shared state for a single war-room workspace.
 *
 * The layout owns one of these per route — every sub-tab (chat, graph,
 * timelines, tasks, …) reads the loaded `room` from here so they
 * don't each re-fetch the same row. Sub-tabs that mutate the war room
 * itself (rename, state flip) call `setRoom` to broadcast the new
 * value back to the layout.
 */
import { getContext } from 'svelte';
import type { WarRoom } from '$lib/services/war-rooms.service';

export const WAR_ROOM_CTX = Symbol('war-room-ctx');

export interface WarRoomContext {
	readonly idGetter: () => number;
	readonly room: WarRoom | null;
	setRoom(room: WarRoom): void;
	clear(): void;
}

export function createWarRoomContext(idGetter: () => number): WarRoomContext {
	let room = $state<WarRoom | null>(null);

	return {
		idGetter,
		get room() {
			return room;
		},
		setRoom(next: WarRoom) {
			room = next;
		},
		clear() {
			room = null;
		}
	};
}

export function useWarRoom(): WarRoomContext {
	const ctx = getContext<WarRoomContext>(WAR_ROOM_CTX);
	if (!ctx) {
		throw new Error('useWarRoom must be called inside a war-room layout');
	}
	return ctx;
}
