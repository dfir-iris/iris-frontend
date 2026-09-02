import { describe, it, expect } from 'vitest';
import type { Alert } from '$lib/types/resources/alert';
import type { Asset } from '$lib/types/resources/asset';
import type { Ioc } from '$lib/types/resources/ioc';
import {
	activityEntries,
	ageLabel,
	ageVar,
	assetLabel,
	censusLabel,
	clockTime,
	formatRawEvent,
	initials,
	isSpentStatus,
	observableFlag,
	primaryTechnique,
	rangeLabel,
	severityVar,
	statusVar,
	techniqueLabels,
	titleVar
} from '../triage-format';

const asset = (name: string): Asset => ({ asset_name: name }) as unknown as Asset;

const ioc = (tags: string | null, tlp?: string): Ioc =>
	({ ioc_tags: tags, tlp: tlp ? { tlp_name: tlp } : undefined }) as unknown as Ioc;

const alert = (
	tags: string,
	classification?: string
): Pick<Alert, 'alert_tags' | 'classification'> =>
	({
		alert_tags: tags,
		classification: classification ? { name: classification } : undefined
	}) as unknown as Pick<Alert, 'alert_tags' | 'classification'>;

describe('severityVar', () => {
	it('maps the mockup severities onto its own accents', () => {
		expect(severityVar('Critical')).toBe('var(--crit)');
		expect(severityVar('high')).toBe('var(--warn)');
		expect(severityVar('MEDIUM')).toBe('var(--info)');
		expect(severityVar('low')).toBe('var(--t-9)');
	});

	it('keeps IRIS-only severities distinct from unknown ones', () => {
		expect(severityVar('Informational')).toBe('var(--t-10)');
		expect(severityVar('Unspecified')).toBe('var(--t-11)');
	});

	it('falls back to muted for a deployment-defined severity', () => {
		expect(severityVar('Catastrophic')).toBe('var(--t-9)');
		expect(severityVar(null)).toBe('var(--t-9)');
	});
});

describe('statusVar', () => {
	it('burns amber while the alert still needs a decision', () => {
		expect(statusVar('In progress')).toBe('var(--warn)');
		expect(statusVar('Assigned')).toBe('var(--warn)');
		expect(statusVar('Pending')).toBe('var(--warn)');
	});

	it('goes accent once escalated and grey once finished', () => {
		expect(statusVar('Escalated')).toBe('var(--acc)');
		expect(statusVar('Closed')).toBe('var(--t-9)');
		expect(statusVar('Merged')).toBe('var(--t-9)');
	});

	it('leaves new / unknown statuses neutral', () => {
		expect(statusVar('New')).toBe('var(--t-7)');
		expect(statusVar('Awaiting client')).toBe('var(--t-7)');
		expect(statusVar(undefined)).toBe('var(--t-7)');
	});
});

describe('isSpentStatus / titleVar', () => {
	it('treats closed, merged and dismissed as spent', () => {
		expect(isSpentStatus('Closed')).toBe(true);
		expect(isSpentStatus('  merged ')).toBe(true);
		expect(isSpentStatus('Dismissed')).toBe(true);
		expect(isSpentStatus('Escalated')).toBe(false);
	});

	it('brightens the focused row above everything else', () => {
		expect(titleVar('New', true)).toBe('var(--t-max)');
		// Focus wins even over a spent alert.
		expect(titleVar('Closed', true)).toBe('var(--t-max)');
	});

	it('dims a spent alert and leaves the rest at normal ink', () => {
		expect(titleVar('Closed', false)).toBe('var(--t-5)');
		expect(titleVar('New', false)).toBe('var(--t-1)');
	});
});

describe('clockTime', () => {
	it('renders zero-padded local hours and minutes', () => {
		const d = new Date(2026, 7, 31, 9, 4);
		expect(clockTime(d.toISOString())).toBe('09:04');
	});

	it('is empty for missing or unparseable input', () => {
		expect(clockTime(null)).toBe('');
		expect(clockTime('')).toBe('');
		expect(clockTime('not a date')).toBe('');
	});
});

describe('ageLabel', () => {
	const now = new Date('2026-08-31T10:00:00Z').getTime();

	it('shows bare minutes below an hour', () => {
		expect(ageLabel('2026-08-31T09:45:00Z', now)).toBe('15m');
		expect(ageLabel('2026-08-31T10:00:00Z', now)).toBe('0m');
	});

	it('shows hours and minutes below a day', () => {
		expect(ageLabel('2026-08-31T07:30:00Z', now)).toBe('2h 30m');
	});

	it('collapses to whole days beyond 24h', () => {
		expect(ageLabel('2026-08-29T10:00:00Z', now)).toBe('2d');
	});

	it('clamps a future timestamp to 0m rather than going negative', () => {
		expect(ageLabel('2026-08-31T10:30:00Z', now)).toBe('0m');
	});

	it('is empty for missing input', () => {
		expect(ageLabel(null, now)).toBe('');
	});
});

describe('ageVar', () => {
	const now = new Date('2026-08-31T10:00:00Z').getTime();

	it('is red inside the first quarter-hour', () => {
		expect(ageVar('2026-08-31T09:56:00Z', now)).toBe('var(--crit-t)');
	});

	it('is amber up to three-quarters of an hour', () => {
		expect(ageVar('2026-08-31T09:45:00Z', now)).toBe('var(--warn)');
		expect(ageVar('2026-08-31T09:25:00Z', now)).toBe('var(--warn)');
	});

	it('goes neutral past the warning window', () => {
		expect(ageVar('2026-08-31T09:04:00Z', now)).toBe('var(--t-8)');
		expect(ageVar('2026-08-31T08:48:00Z', now)).toBe('var(--t-8)');
	});

	it('is neutral when there is no timestamp to judge', () => {
		expect(ageVar(null, now)).toBe('var(--t-8)');
		expect(ageVar('nonsense', now)).toBe('var(--t-8)');
	});
});

describe('assetLabel', () => {
	it('names a single asset', () => {
		expect(assetLabel([asset('DC-02')])).toBe('DC-02');
	});

	it('collapses a fan-out to a count', () => {
		expect(assetLabel([asset('a'), asset('b'), asset('c')])).toBe('3 hosts');
	});

	it('is empty when there is nothing to show', () => {
		expect(assetLabel([])).toBe('');
		expect(assetLabel(null)).toBe('');
	});
});

describe('techniqueLabels / primaryTechnique', () => {
	it('picks MITRE ids out of the tag string', () => {
		expect(techniqueLabels(alert('lateral,T1003.001,noise,T1047'))).toEqual(['T1003.001', 'T1047']);
	});

	it('upper-cases and de-duplicates', () => {
		expect(techniqueLabels(alert('t1047, T1047'))).toEqual(['T1047']);
	});

	it('ignores tags that only look like techniques', () => {
		expect(techniqueLabels(alert('T123,T10475,TA0002'))).toEqual([]);
	});

	it('falls back to the classification when no technique is tagged', () => {
		expect(techniqueLabels(alert('noise', 'Credential Access'))).toEqual(['Credential Access']);
	});

	it('returns nothing when there is neither', () => {
		expect(techniqueLabels(alert(''))).toEqual([]);
	});

	it('summarises overflow for the one-chip queue row', () => {
		expect(primaryTechnique(alert('T1003.001,T1047,T1021.002'))).toBe('T1003.001 +2');
		expect(primaryTechnique(alert('T1047'))).toBe('T1047');
		expect(primaryTechnique(alert(''))).toBe('');
	});
});

describe('observableFlag', () => {
	it('flags hostile tags in red, whatever their position', () => {
		expect(observableFlag(ioc('internal,Known Bad'))).toEqual({
			text: 'Known Bad',
			color: 'var(--crit-t)'
		});
	});

	it('prefers a hostile tag over a merely notable one', () => {
		expect(observableFlag(ioc('privileged,c2')).color).toBe('var(--crit-t)');
	});

	it('flags notable tags in amber', () => {
		expect(observableFlag(ioc('unsigned'))).toEqual({ text: 'unsigned', color: 'var(--warn)' });
	});

	it('shows the first tag neutrally when nothing stands out', () => {
		expect(observableFlag(ioc('internal,corp'))).toEqual({
			text: 'internal',
			color: 'var(--t-9)'
		});
	});

	it('falls back to the TLP when the IOC is untagged', () => {
		expect(observableFlag(ioc(null, 'Amber'))).toEqual({
			text: 'tlp:amber',
			color: 'var(--t-9)'
		});
	});

	it('shows nothing when there is neither tag nor TLP', () => {
		expect(observableFlag(ioc(null)).text).toBe('');
	});
});

describe('formatRawEvent', () => {
	it('pretty-prints an object', () => {
		expect(formatRawEvent({ a: 1 })).toBe('{\n  "a": 1\n}');
	});

	it('passes a string payload through untouched', () => {
		expect(formatRawEvent('raw line')).toBe('raw line');
	});

	it('is empty for no payload', () => {
		expect(formatRawEvent(null)).toBe('');
		expect(formatRawEvent(undefined)).toBe('');
	});

	it('degrades to empty rather than throwing on a cyclic payload', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(formatRawEvent(cyclic)).toBe('');
	});
});

describe('rangeLabel', () => {
	it('reads out the current window', () => {
		expect(rangeLabel(1, 80, 241)).toBe('1–80 of 241');
		expect(rangeLabel(2, 80, 241)).toBe('81–160 of 241');
	});

	it('clamps the last page to the total', () => {
		expect(rangeLabel(4, 80, 241)).toBe('241–241 of 241');
	});

	it('handles an empty result set', () => {
		expect(rangeLabel(1, 80, 0)).toBe('0 of 0');
	});
});

describe('censusLabel', () => {
	it('counts alerts and clusters', () => {
		expect(censusLabel(80, 23)).toBe('80 alerts · 23 clusters');
	});

	it('singularises both halves', () => {
		expect(censusLabel(1, 1)).toBe('1 alert · 1 cluster');
	});

	it('drops the cluster half when nothing is clustered', () => {
		expect(censusLabel(12, 0)).toBe('12 alerts');
	});
});

describe('initials', () => {
	it('takes first and last initials', () => {
		expect(initials('Manpreet Kaur')).toBe('MK');
		expect(initials('l.osei')).toBe('LO');
	});

	it('doubles up on a single name', () => {
		expect(initials('root')).toBe('RO');
	});

	it('has a placeholder for nothing', () => {
		expect(initials('')).toBe('??');
		expect(initials(null)).toBe('??');
	});
});

describe('activityEntries', () => {
	// Keys are unix seconds, as written by `add_obj_history_entry`.
	const history = {
		'1756633920': { user: 'M. Kaur', action: 'Assigned to M. Kaur' },
		'1756633860': { user: 'system', action: 'Clustered with 5 alerts' },
		'1756633800': { user: 'system', action: 'Ingested from Falcon' },
		'1756633740': { user: 'system', action: 'Created' }
	};

	it('returns newest first', () => {
		const entries = activityEntries(history, 3);
		expect(entries.map((e) => e.action)).toEqual([
			'Assigned to M. Kaur',
			'Clustered with 5 alerts',
			'Ingested from Falcon'
		]);
	});

	it('honours the limit', () => {
		expect(activityEntries(history, 1)).toHaveLength(1);
		expect(activityEntries(history, 100)).toHaveLength(4);
	});

	it('converts the unix-second key into a clock time', () => {
		const [newest] = activityEntries(history, 1);
		expect(newest.time).toBe(clockTime(new Date(1756633920 * 1000).toISOString()));
	});

	it('is empty for a missing or non-object history', () => {
		expect(activityEntries(null)).toEqual([]);
		expect(activityEntries(undefined)).toEqual([]);
		expect(activityEntries('nope')).toEqual([]);
	});

	it('tolerates entries with missing fields', () => {
		expect(activityEntries({ '1756633920': {} }, 1)).toEqual([
			{
				at: 1756633920000,
				time: clockTime(new Date(1756633920 * 1000).toISOString()),
				action: '',
				verb: '',
				changes: [],
				user: ''
			}
		]);
	});
});
