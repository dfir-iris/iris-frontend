/**
 * Workspace-level comments side panel. One instance per case layout: any
 * descendant component (timeline event card, asset detail view, IOC detail
 * view, etc.) can imperatively open the panel against an entity by calling
 * `commentsPanel.open({ type, id, label })`.
 *
 * The panel itself lives in the case layout, so opening it from a timeline
 * card doesn't tear down or rebuild any UI when the user navigates between
 * assets, IOCs, or events. The panel listens to its own `entity` and
 * re-fetches comments whenever it changes — callers don't have to do
 * anything to "clear" the previous view; just call `open()` for the new
 * entity or `close()` if there's no current selection.
 */

import type { CommentObjectType } from '$lib/services/comments.service';

export const COMMENTS_PANEL_CTX = Symbol('comments-panel');

export type CommentsPanelEntity = {
	type: CommentObjectType;
	id: number;
	label: string;
};

export const createCommentsPanelContext = () => {
	const state = $state<{
		open: boolean;
		entity: CommentsPanelEntity | null;
	}>({
		open: false,
		entity: null
	});

	const open = (entity: CommentsPanelEntity) => {
		state.entity = entity;
		state.open = true;
	};

	const close = () => {
		state.open = false;
	};

	// Clear the current entity without closing the panel — useful when the
	// surrounding view loses its selection (e.g. user switches to a list
	// page that has no detail open). Keeps the panel itself visible per
	// the "panel stays open on entity switch" UX decision.
	const clearEntity = () => {
		state.entity = null;
	};

	return {
		get state() {
			return state;
		},
		open,
		close,
		clearEntity
	};
};

export type CommentsPanelContext = ReturnType<typeof createCommentsPanelContext>;
