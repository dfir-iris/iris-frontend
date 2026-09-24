/**
 * Presentation helpers for the split triage cockpit.
 *
 * Everything the cockpit renders that is *derived* rather than looked up
 * lives here as a pure function, so the markup stays declarative and the
 * derivations are testable without mounting Svelte.
 *
 * Colours are returned as `var(--token)` strings rather than Tailwind
 * classes: the cockpit reproduces the mockup's own palette (declared on
 * `.iris-triage` in AlertsSplitView.svelte) so that severity / status /
 * age accents stay consistent between the queue rows, the detail header
 * and the sidebar without three separate class maps drifting apart.
 */

import type { Alert } from '$lib/types/resources/alert';
import type { Asset } from '$lib/types/resources/asset';
import type { Ioc } from '$lib/types/resources/ioc';

const norm = (value: string | null | undefined): string => (value ?? '').toLowerCase().trim();

/**
 * Severity accent, keyed by lower-cased severity name.
 *
 * The mockup only names four severities; IRIS seeds two more
 * (`informational`, `unspecified`) and deployments can add their own, so
 * anything unrecognised falls back to the muted `--t-9` the mockup uses
 * for `low`.
 */
export const SEVERITY_VAR: Readonly<Record<string, string>> = {
	critical: 'var(--crit)',
	high: 'var(--warn)',
	medium: 'var(--info)',
	low: 'var(--t-9)',
	informational: 'var(--t-10)',
	unspecified: 'var(--t-11)'
};

export const severityVar = (name: string | null | undefined): string =>
	SEVERITY_VAR[norm(name)] ?? 'var(--t-9)';

/**
 * Status accent. The mockup colours a status by what it asks of the
 * analyst: amber while it still needs a decision, teal once it has been
 * escalated, grey once it is finished, neutral while it is nobody's.
 */
export const STATUS_VAR: Readonly<Record<string, string>> = {
	'in progress': 'var(--warn)',
	assigned: 'var(--warn)',
	pending: 'var(--warn)',
	escalated: 'var(--acc)',
	closed: 'var(--t-9)',
	merged: 'var(--t-9)',
	dismissed: 'var(--t-9)',
	new: 'var(--t-7)',
	unspecified: 'var(--t-7)'
};

export const statusVar = (name: string | null | undefined): string =>
	STATUS_VAR[norm(name)] ?? 'var(--t-7)';

/** Statuses the mockup renders in its "spent" grey, title included. */
const SPENT_STATUSES = new Set(['closed', 'merged', 'dismissed']);

export const isSpentStatus = (name: string | null | undefined): boolean =>
	SPENT_STATUSES.has(norm(name));

/**
 * Queue-row title colour. The focused row gets the brightest ink, a
 * finished alert is dimmed to `--t-5` (the mockup does this to its
 * auto-closed row), everything else sits at `--t-1`.
 */
export const titleVar = (statusName: string | null | undefined, focused: boolean): string => {
	if (focused) return 'var(--t-max)';
	if (isSpentStatus(statusName)) return 'var(--t-5)';
	return 'var(--t-1)';
};

/** `09:12` — clock time only (used in cluster rows, timeline keys). */
export const clockTime = (iso: string | null | undefined): string => {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Relative date label for the queue row timestamp.
 * Returns "Today 09:12", "Yesterday 14:30", "2 days ago", "Apr 16 09:12", etc.
 * `now` is passed in (sampled on mount) so all rows stay consistent.
 */
export const relativeDate = (iso: string | null | undefined, now: number = Date.now()): string => {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
	const todayStart = new Date(now);
	todayStart.setHours(0, 0, 0, 0);
	const diffDays = Math.floor(
		(todayStart.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
			86_400_000
	);
	if (diffDays === 0) return `Today ${time}`;
	if (diffDays === 1) return `Yesterday ${time}`;
	if (diffDays <= 6) return `${diffDays} days ago`;
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time;
};

/** `4m` / `1h 12m` / `2d` — how long the alert has been waiting. */
export const ageLabel = (iso: string | null | undefined, now: number = Date.now()): string => {
	if (!iso) return '';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return '';
	const minutes = Math.max(0, Math.floor((now - t) / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d`;
};

/**
 * Age accent. The mockup burns the age red while the alert is still
 * inside its first quarter-hour, amber up to three-quarters of an hour,
 * then lets it go neutral — an at-a-glance "how late am I" signal.
 */
export const AGE_CRITICAL_MINUTES = 15;
export const AGE_WARNING_MINUTES = 45;

export const ageVar = (iso: string | null | undefined, now: number = Date.now()): string => {
	if (!iso) return 'var(--t-8)';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return 'var(--t-8)';
	const minutes = Math.max(0, Math.floor((now - t) / 60_000));
	if (minutes < AGE_CRITICAL_MINUTES) return 'var(--crit-t)';
	if (minutes < AGE_WARNING_MINUTES) return 'var(--warn)';
	return 'var(--t-8)';
};

/**
 * The mockup's asset chip collapses a fan-out to a count ("14 hosts")
 * rather than listing names it has no room for.
 */
export const assetLabel = (assets: Asset[] | null | undefined): string => {
	const names = (assets ?? []).map((a) => a?.asset_name).filter(Boolean) as string[];
	if (names.length === 0) return '';
	if (names.length === 1) return names[0];
	return `${names.length} hosts`;
};

/**
 * A single copyable value and what to call it.
 *
 * The detail pane puts a copy button on every field it prints, and the
 * label is what the button's tooltip and `aria-label` say — "Copy IP",
 * not "Copy". Built here rather than in the markup so the same field
 * carries the same name in the overview and in its own tab.
 */
export interface CopyField {
	label: string;
	value: string;
}

/**
 * An asset's meta line, kept as parts rather than pre-joined.
 *
 * Rendered it still reads `Server · 10.0.0.5 · corp.local`, but each part
 * is copied on its own: an analyst pasting into a search wants the
 * address, not the sentence it sat in.
 */
export const assetFields = (
	asset: Pick<Asset, 'asset_type' | 'asset_ip' | 'asset_domain'>
): CopyField[] =>
	[
		{ label: 'type', value: asset.asset_type?.asset_name ?? '' },
		{ label: 'IP', value: asset.asset_ip ?? '' },
		{ label: 'domain', value: asset.asset_domain ?? '' }
	].filter((field) => field.value.trim() !== '');

/** Same treatment for an observable's `type · TLP` line. */
export const iocFields = (ioc: Pick<Ioc, 'ioc_type' | 'tlp'>): CopyField[] =>
	[
		{ label: 'type', value: ioc.ioc_type?.type_name ?? '' },
		{ label: 'TLP', value: ioc.tlp?.tlp_name ?? '' }
	].filter((field) => field.value.trim() !== '');

/**
 * Anything an alert can carry, rendered as text you could paste.
 *
 * `alert_context` is a JSON column, so a value is whatever the ingesting
 * pipeline put there: a port number, an `enabled` boolean, a list of
 * hashes, a nested object. The detail pane used to assume every one of
 * them was a string and called `.trim()` on it, which threw
 * `value.trim is not a function` and took the whole alerts pane down —
 * one integer anywhere in the context was enough.
 *
 * Objects and arrays go through `JSON.stringify` rather than `String`,
 * which would paste the useless `[object Object]`.
 */
export const copyText = (value: unknown): string => {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}

	try {
		// `undefined` for a function or a symbol — nothing worth copying.
		return JSON.stringify(value) ?? '';
	} catch {
		// Circular, or a `toJSON` that throws. Copying nothing beats
		// breaking the pane the analyst is reading.
		return '';
	}
};

/**
 * The whole Context block as `key: value` lines — what the section's
 * "copy all" button puts on the clipboard, for the times the analyst
 * wants the lot in a ticket rather than one field at a time.
 */
export const contextLines = (context: Record<string, unknown> | null | undefined): string =>
	Object.entries(context ?? {})
		.map(([key, value]) => `${key}: ${copyText(value)}`)
		.join('\n');

const TECHNIQUE_RE = /^T\d{4}(?:\.\d{3})?$/i;

/**
 * MITRE technique chips.
 *
 * IRIS has no first-class technique field, so we read the ones analysts
 * already put in `alert_tags` (the convention across the seeded rulesets)
 * and fall back to the classification name — which is what the chip slot
 * is really for: "what kind of thing is this".
 */
export const techniqueLabels = (alert: Pick<Alert, 'alert_tags' | 'classification'>): string[] => {
	const tags = (alert.alert_tags ?? '')
		.split(',')
		.map((t) => t.trim())
		.filter((t) => TECHNIQUE_RE.test(t))
		.map((t) => t.toUpperCase());

	if (tags.length > 0) return [...new Set(tags)];

	const classification = alert.classification?.name?.trim();
	return classification ? [classification] : [];
};

/** Single chip for the queue row, which only has width for one. */
export const primaryTechnique = (alert: Pick<Alert, 'alert_tags' | 'classification'>): string => {
	const all = techniqueLabels(alert);
	if (all.length === 0) return '';
	return all.length > 1 ? `${all[0]} +${all.length - 1}` : all[0];
};

/**
 * Observable flag — the short verdict the mockup prints after each IOC
 * value. IRIS has no threat-intel verdict field, so the flag surfaces the
 * IOC's own tags (which is where enrichment writes) and otherwise names
 * the TLP, which is at least a real signal about handling.
 */
export interface ObservableFlag {
	text: string;
	color: string;
}

const HOSTILE_TAGS = ['c2', 'malicious', 'known bad', 'known-bad', 'blocklist', 'compromised'];
const NOTABLE_TAGS = ['suspicious', 'privileged', 'unsigned', 'anomalous', 'tier 0', 'tier0'];

export const observableFlag = (ioc: Pick<Ioc, 'ioc_tags' | 'tlp'>): ObservableFlag => {
	const tags = (ioc.ioc_tags ?? '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

	const hostile = tags.find((t) => HOSTILE_TAGS.includes(t.toLowerCase()));
	if (hostile) return { text: hostile, color: 'var(--crit-t)' };

	const notable = tags.find((t) => NOTABLE_TAGS.includes(t.toLowerCase()));
	if (notable) return { text: notable, color: 'var(--warn)' };

	if (tags.length > 0) return { text: tags[0], color: 'var(--t-9)' };

	const tlp = ioc.tlp?.tlp_name?.trim();
	return tlp
		? { text: `tlp:${tlp.toLowerCase()}`, color: 'var(--t-9)' }
		: { text: '', color: 'var(--t-9)' };
};

/**
 * Pretty-print `alert_source_content` for the Raw event block. The
 * mockup shows indented JSON; anything that will not serialise (cyclic
 * enrichment payloads have turned up in the wild) degrades to an empty
 * block rather than throwing during render.
 */
export const formatRawEvent = (content: unknown): string => {
	if (content === null || content === undefined) return '';
	if (typeof content === 'string') return content;
	try {
		return JSON.stringify(content, null, 2);
	} catch {
		return '';
	}
};

/** `1–80 of 241` — the queue footer's position readout. */
export const rangeLabel = (page: number, perPage: number, total: number): string => {
	if (total <= 0) return '0 of 0';
	const first = (page - 1) * perPage + 1;
	const last = Math.min(page * perPage, total);
	return `${first}–${last} of ${total}`;
};

/** `80 alerts · 23 clusters` — the queue header's census. */
export const censusLabel = (alertCount: number, clusterCount: number): string => {
	const alerts = `${alertCount} ${alertCount === 1 ? 'alert' : 'alerts'}`;
	if (clusterCount <= 0) return alerts;
	return `${alerts} · ${clusterCount} ${clusterCount === 1 ? 'cluster' : 'clusters'}`;
};

/** Two-letter avatar for the Activity / Notes lists. */
export const initials = (name: string | null | undefined): string => {
	const parts = (name ?? '')
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (parts.length === 0) return '??';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * `modification_history` is a dictionary keyed by unix timestamp (see
 * `add_obj_history_entry` on the backend). The Activity panel wants it
 * newest-first with the key turned back into a clock time.
 */
export interface FieldChange {
	field: string;
	from: string;
	to: string;
}

export interface ActivityEntry {
	at: number;
	time: string;
	/** Full raw action string from the API. */
	action: string;
	/** Human-readable verb, e.g. "Updated" or "Created". */
	verb: string;
	/** Parsed field changes when the action is an "updated alert: …" diff. */
	changes: FieldChange[];
	user: string;
}

/**
 * Parse the raw action string produced by the IRIS backend.
 *
 * Examples seen in the wild:
 *   "Alert created"
 *   "updated alert: \"alert_owner_id\" from \"None\" to \"82\",\"alert_context\" from \"None\" to \"{…}\""
 *
 * Returns a verb and a flat list of {field, from, to} triples.
 */
export const parseAction = (raw: string): { verb: string; changes: FieldChange[] } => {
	if (!raw) return { verb: '', changes: [] };

	const lower = raw.toLowerCase();

	// "Alert created" / "alert created"
	if (lower.startsWith('alert created') || lower === 'created') {
		return { verb: 'Created', changes: [] };
	}

	// "updated alert: ..." — the bulk of modification events
	const updatedPrefix = /^updated alert:\s*/i;
	if (updatedPrefix.test(raw)) {
		const payload = raw.replace(updatedPrefix, '');
		const changes: FieldChange[] = [];

		// The format is:  "field" from "old_val" to "new_val","next_field" from …
		// Values can themselves contain quotes (JSON blobs, URLs, etc).
		// Strategy: split on the field-name boundary pattern:
		//   ,"<identifier>" from  (comma + quoted snake_case key + " from ")
		// then parse each segment individually.
		const segments = payload.split(/(?:^|,)"([a-z_]+)"\s+from\s+/);
		// segments[0] is empty (before the first match), then alternating:
		// [fieldName, rest, fieldName, rest, …]
		for (let i = 1; i < segments.length - 1; i += 2) {
			const field = segments[i].replace(/_/g, ' ');
			const rest = segments[i + 1]; // looks like: "old_val" to "new_val"
			// Pull out from/to with a targeted pattern
			const m = rest.match(/^"([\s\S]*)"\s+to\s+"([\s\S]*)"\s*$/);
			if (!m) continue;
			const from = m[1] === 'None' ? '—' : m[1];
			const rawTo = m[2] === 'None' ? '—' : m[2];
			const to = rawTo.length > 120 ? rawTo.slice(0, 120) + '…' : rawTo;
			changes.push({ field, from, to });
		}

		// Fallback: if the split didn't find anything, try a simpler single-field match
		if (changes.length === 0) {
			const m = payload.match(/^"([^"]+)"\s+from\s+"([^"]*)"\s+to\s+"([^"]*)"/);
			if (m) {
				changes.push({
					field: m[1].replace(/_/g, ' '),
					from: m[2] === 'None' ? '—' : m[2],
					to: m[3] === 'None' ? '—' : m[3]
				});
			}
		}

		return { verb: 'Updated', changes };
	}

	// Fallback: use the raw string as the verb
	return { verb: raw, changes: [] };
};

export const activityEntries = (history: unknown, limit = 3): ActivityEntry[] => {
	if (!history || typeof history !== 'object') return [];
	return Object.entries(history as Record<string, { user?: string; action?: string }>)
		.map(([key, value]) => {
			const at = Number(key) * 1000;
			const raw = value?.action ?? '';
			const { verb, changes } = parseAction(raw);
			return {
				at,
				time: Number.isNaN(at) ? '' : clockTime(new Date(at).toISOString()),
				action: raw,
				verb,
				changes,
				user: value?.user ?? ''
			};
		})
		.filter((e) => !Number.isNaN(e.at))
		.sort((a, b) => b.at - a.at)
		.slice(0, limit);
};
