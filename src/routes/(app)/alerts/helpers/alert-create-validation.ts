/**
 * Which answers a hand-raised alert cannot be created without.
 *
 * Lives outside the dialog so the rule itself is testable — there is no
 * Svelte component test setup in this repo, and the rule is the part
 * worth pinning down; the markup around it is not.
 *
 * The ids are the raw `SearchSelect` values, so "unanswered" is the
 * empty string rather than `null`/`undefined`.
 */
export type AlertCreateDraft = {
	title: string;
	customerId: string;
	severityId: string;
	statusId: string;
	classificationId: string;
};

export const canCreateAlert = (draft: AlertCreateDraft): boolean =>
	draft.title.trim().length > 0 &&
	draft.customerId !== '' &&
	draft.severityId !== '' &&
	draft.statusId !== '' &&
	draft.classificationId !== '';
