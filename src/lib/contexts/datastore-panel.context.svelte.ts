/**
 * Workspace-level DataStore side panel. One instance per case layout: the
 * topbar's DataStore button toggles it open/closed. Like the activity
 * panel, it lives in the case workspace so toggling never tears down the
 * UI, and the user can grab files from the tree while editing any case
 * sub-page (notes, tasks, etc).
 */

export const DATASTORE_PANEL_CTX = Symbol('datastore-panel');

export const createDatastorePanelContext = () => {
	const state = $state<{ open: boolean }>({ open: false });

	const open = () => {
		state.open = true;
	};

	const close = () => {
		state.open = false;
	};

	const toggle = () => {
		state.open = !state.open;
	};

	return {
		get state() {
			return state;
		},
		open,
		close,
		toggle
	};
};

export type DatastorePanelContext = ReturnType<typeof createDatastorePanelContext>;
