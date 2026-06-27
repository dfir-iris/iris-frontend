/**
 * War-room-scoped panel toggle contexts.
 *
 * Parallels the per-case `activity-panel` and `datastore-panel`
 * contexts but lives in its own symbols so the case and war-room
 * layouts don't collide if one is somehow rendered inside the other
 * during a navigation transition.
 */

export const WAR_ROOM_ACTIVITY_PANEL_CTX = Symbol('war-room-activity-panel');
export const WAR_ROOM_DATASTORE_PANEL_CTX = Symbol('war-room-datastore-panel');

const createTogglePanel = () => {
	const state = $state<{ open: boolean }>({ open: false });

	return {
		get state() {
			return state;
		},
		open() {
			state.open = true;
		},
		close() {
			state.open = false;
		},
		toggle() {
			state.open = !state.open;
		}
	};
};

export const createWarRoomActivityPanelContext = createTogglePanel;
export const createWarRoomDatastorePanelContext = createTogglePanel;

export type WarRoomActivityPanelContext = ReturnType<
	typeof createWarRoomActivityPanelContext
>;
export type WarRoomDatastorePanelContext = ReturnType<
	typeof createWarRoomDatastorePanelContext
>;
