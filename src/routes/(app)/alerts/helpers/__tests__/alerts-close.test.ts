import { describe, expect, it, vi } from 'vitest';
import { closeAlerts, resolveCloseTags } from '../alerts-close';
import type { AlertStatus } from '$lib/services/alert-status.service';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';

const statuses = [
	{ status_id: 1, status_name: 'New' },
	{ status_id: 9, status_name: 'Closed' }
] as AlertStatus[];

describe('resolveCloseTags', () => {
	describe('replace (a single alert, box seeded with its tags)', () => {
		it('sends what the box holds', () => {
			expect(resolveCloseTags('phishing,banking', 'phishing,banking,triaged', 'replace')).toBe(
				'phishing,banking,triaged'
			);
		});

		it('drops a tag the analyst removed from the box', () => {
			expect(resolveCloseTags('phishing,banking', 'phishing', 'replace')).toBe('phishing');
		});

		it('clears the tags when the analyst empties a seeded box', () => {
			expect(resolveCloseTags('phishing', '', 'replace')).toBe('');
		});

		it('omits the key when there were no tags and none were typed', () => {
			expect(resolveCloseTags('', '', 'replace')).toBeUndefined();
		});

		it('trims and ignores blank entries', () => {
			expect(resolveCloseTags('', ' phishing , , banking ', 'replace')).toBe('phishing,banking');
		});
	});

	describe('append (several alerts, box starts empty)', () => {
		it('omits the key when nothing was typed, so existing tags survive', () => {
			expect(resolveCloseTags('phishing,banking', '', 'append')).toBeUndefined();
		});

		it('adds the typed tags to what the alert already carries', () => {
			expect(resolveCloseTags('phishing', 'false-positive', 'append')).toBe(
				'phishing,false-positive'
			);
		});

		it('does not duplicate a tag the alert already has', () => {
			expect(resolveCloseTags('phishing,banking', 'phishing', 'append')).toBe('phishing,banking');
		});

		it('works on an alert with no tags at all', () => {
			expect(resolveCloseTags(null, 'false-positive', 'append')).toBe('false-positive');
		});
	});
});

describe('closeAlerts', () => {
	// Typed explicitly: an inferred `vi.fn(async () => null)` has a nullary
	// signature, so `mock.calls[n][1]` — the payload every assertion below
	// reads — would not typecheck.
	type UpdateAlert = (id: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;

	const deps = () => ({ updateAlert: vi.fn<UpdateAlert>(async () => null) });

	it('sets the closed status on every alert', async () => {
		const { updateAlert } = deps();

		await closeAlerts(
			{ updateAlert },
			[
				{ alert_id: 1, alert_tags: '' },
				{ alert_id: 2, alert_tags: '' }
			],
			statuses,
			{ alert_resolution_status_id: 3, alert_note: 'done' }
		);

		expect(updateAlert).toHaveBeenCalledTimes(2);
		for (const [, changes] of updateAlert.mock.calls) {
			expect(changes.alert_status_id).toBe(9);
		}
	});

	it('leaves alert_tags out entirely when closing several and nothing was typed', async () => {
		const { updateAlert } = deps();

		await closeAlerts(
			{ updateAlert },
			[
				{ alert_id: 1, alert_tags: 'phishing' },
				{ alert_id: 2, alert_tags: 'banking' }
			],
			statuses,
			{ alert_note: 'done', alert_tags: '' }
		);

		// The bug this whole helper exists for: present-but-empty overwrites
		// server-side, absent preserves. The key has to be gone, not blank.
		for (const [, changes] of updateAlert.mock.calls) {
			expect(changes).not.toHaveProperty('alert_tags');
		}
	});

	it('leaves alert_tags out when a single untagged alert is closed with an empty box', async () => {
		const { updateAlert } = deps();

		await closeAlerts({ updateAlert }, [{ alert_id: 1, alert_tags: '' }], statuses, {
			alert_note: 'done',
			alert_tags: ''
		});

		expect(updateAlert.mock.calls[0][1]).not.toHaveProperty('alert_tags');
	});

	it('clears the tags when a single tagged alert is closed with an emptied box', async () => {
		const { updateAlert } = deps();

		await closeAlerts({ updateAlert }, [{ alert_id: 1, alert_tags: 'phishing' }], statuses, {
			alert_note: 'done',
			alert_tags: ''
		});

		// Not the bug above: the box was seeded with `phishing`, so an empty
		// box here is the analyst having deleted it on purpose.
		expect(updateAlert.mock.calls[0][1].alert_tags).toBe('');
	});

	it('replaces the tags of a single alert with the seeded box', async () => {
		const { updateAlert } = deps();

		await closeAlerts({ updateAlert }, [{ alert_id: 1, alert_tags: 'phishing' }], statuses, {
			alert_tags: 'phishing,triaged'
		});

		expect(updateAlert.mock.calls[0][1].alert_tags).toBe('phishing,triaged');
	});

	it('appends to each alert separately when closing several', async () => {
		const { updateAlert } = deps();

		await closeAlerts(
			{ updateAlert },
			[
				{ alert_id: 1, alert_tags: 'phishing' },
				{ alert_id: 2, alert_tags: 'banking' }
			],
			statuses,
			{ alert_tags: 'false-positive' }
		);

		expect(updateAlert.mock.calls[0][1].alert_tags).toBe('phishing,false-positive');
		expect(updateAlert.mock.calls[1][1].alert_tags).toBe('banking,false-positive');
	});

	it('carries the resolution and note through', async () => {
		const { updateAlert } = deps();

		await closeAlerts({ updateAlert }, [{ alert_id: 1 }], statuses, {
			alert_resolution_status_id: 4,
			alert_note: 'benign'
		});

		expect(updateAlert.mock.calls[0][1]).toMatchObject({
			alert_resolution_status_id: 4,
			alert_note: 'benign'
		});
	});
});
