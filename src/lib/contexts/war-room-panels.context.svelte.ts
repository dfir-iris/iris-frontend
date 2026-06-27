/**
 * War-room-scoped panel toggle contexts.
 *
 * Datastore is the only side panel: case activity is surfaced inside
 * the Stream tab and doesn't need a parallel right-pane affordance.
 */

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

export const createWarRoomDatastorePanelContext = createTogglePanel;

export type WarRoomDatastorePanelContext = ReturnType<
	typeof createWarRoomDatastorePanelContext
>;
