/** Pure helpers for the SitRep cadence control. */
import { parseServerDate } from '$lib/utils/time-formatter';

/** Backend bounds for `cadence_minutes` (PUT /sitreps/cadence). */
export const CADENCE_MIN_MINUTES = 15;
export const CADENCE_MAX_MINUTES = 10080;

/** Preset cadences offered in the select; anything else is "custom". */
export const CADENCE_PRESETS: { minutes: number; label: string }[] = [
	{ minutes: 30, label: 'Every 30 min' },
	{ minutes: 60, label: 'Every hour' },
	{ minutes: 120, label: 'Every 2 h' },
	{ minutes: 240, label: 'Every 4 h' },
	{ minutes: 480, label: 'Every 8 h' },
	{ minutes: 1440, label: 'Every 24 h' }
];

/** Reminder lead times (minutes before due). Filtered against the cadence. */
export const REMINDER_PRESETS: number[] = [5, 15, 30, 60, 120];

/** Select value for a cadence: 'none', a preset as string, or 'custom'. */
export function cadenceSelectValue(minutes: number | null | undefined): string {
	if (minutes == null) return 'none';
	return CADENCE_PRESETS.some((p) => p.minutes === minutes) ? String(minutes) : 'custom';
}

/** Validate a cadence typed by the user. Returns an error message or null. */
export function validateCadenceMinutes(value: number): string | null {
	if (!Number.isInteger(value)) return 'Enter a whole number of minutes';
	if (value < CADENCE_MIN_MINUTES || value > CADENCE_MAX_MINUTES) {
		return `Between ${CADENCE_MIN_MINUTES} and ${CADENCE_MAX_MINUTES} minutes`;
	}
	return null;
}

/** Reminder values that are valid for a cadence (0..cadence). */
export function reminderOptions(cadence: number | null): number[] {
	if (cadence == null) return [];
	return REMINDER_PRESETS.filter((m) => m <= cadence);
}

/** Compact duration: "45 min", "3 h", "2 h 15 min", "2 d 4 h". */
export function formatDurationShort(ms: number): string {
	const totalMin = Math.max(0, Math.round(Math.abs(ms) / 60000));
	if (totalMin < 60) return `${totalMin} min`;
	const days = Math.floor(totalMin / 1440);
	const hours = Math.floor((totalMin % 1440) / 60);
	const mins = totalMin % 60;
	if (days > 0) return hours ? `${days} d ${hours} h` : `${days} d`;
	return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

/** Human cadence label, e.g. "Every 4 h" / "Every 90 min". */
export function formatCadence(minutes: number): string {
	const preset = CADENCE_PRESETS.find((p) => p.minutes === minutes);
	if (preset) return preset.label;
	return `Every ${formatDurationShort(minutes * 60000)}`;
}

export type CadenceDue = { overdue: boolean; label: string };

/**
 * "Next SitRep due in …" / "Overdue by …" from the server's `next_due_at`
 * (naive UTC). `null` when there is no cadence / no due date.
 */
export function describeDue(nextDueAt: string | null | undefined, now: number): CadenceDue | null {
	const due = parseServerDate(nextDueAt ?? null);
	if (!due) return null;
	const delta = due.getTime() - now;
	if (delta < 0) return { overdue: true, label: `Overdue by ${formatDurationShort(delta)}` };
	return { overdue: false, label: `Next SitRep due in ${formatDurationShort(delta)}` };
}
