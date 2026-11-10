import { describe, expect, it } from 'vitest';
import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
import type { CaseTimeline } from '$lib/services/case-timelines.service';
import {
	approximateMeasure,
	buildTimelineSvg,
	ellipsize,
	escapeXml,
	eventsOnTimelines,
	pngScale,
	wrapText,
	type TimelineImageOptions
} from './image-export';

// 10px per character, whatever the font.
const measure = (text: string) => text.length * 10;

const event = (id: number, extra: Partial<CaseTimelineEvent> = {}): CaseTimelineEvent => ({
	event_id: id,
	event_title: `Event ${id}`,
	event_date: '2024-06-15T10:00:00',
	event_tz: '+00:00',
	...extra
});

const timeline = (id: number, name: string, color: string | null = null): CaseTimeline => ({
	timeline_id: id,
	case_id: 1,
	name,
	description: null,
	color,
	is_default: false,
	created_at: null,
	created_by_id: null
});

const OPTIONS: TimelineImageOptions = {
	layout: 'list',
	theme: 'light',
	descriptions: true,
	links: true,
	tags: true
};

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('eventsOnTimelines', () => {
	const events = [
		event(1, { timeline_ids: [1] }),
		event(2, { timeline_ids: [2] }),
		event(3, { timeline_ids: [1, 3] }),
		event(4)
	];

	it('keeps every event when no timeline is given', () => {
		expect(eventsOnTimelines(events, [])).toHaveLength(4);
	});

	it('keeps the events on any of the timelines', () => {
		expect(eventsOnTimelines(events, [1, 2]).map((e) => e.event_id)).toEqual([1, 2, 3]);
	});
});

describe('escapeXml', () => {
	it('escapes markup and drops characters XML refuses', () => {
		expect(escapeXml(`<a href="x">'&'</a>${String.fromCharCode(1)}`)).toBe(
			'&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;'
		);
	});
});

describe('wrapText', () => {
	it('breaks between words', () => {
		expect(wrapText('aaa bbb ccc', '', 70, 5, measure)).toEqual(['aaa bbb', 'ccc']);
	});

	it('breaks a word longer than a line', () => {
		expect(wrapText('abcdefghij', '', 40, 5, measure)).toEqual(['abcd', 'efgh', 'ij']);
	});

	it('ends the last line with an ellipsis past the line limit', () => {
		const lines = wrapText('aaa bbb ccc ddd', '', 70, 1, measure);
		expect(lines).toHaveLength(1);
		expect(lines[0].endsWith('…')).toBe(true);
		expect(measure(lines[0])).toBeLessThanOrEqual(70);
	});

	it('gives no line for blank text', () => {
		expect(wrapText('   ', '', 70, 3, measure)).toEqual([]);
	});
});

describe('ellipsize', () => {
	it('keeps text that fits', () => {
		expect(ellipsize('abc', '', 30, measure)).toBe('abc');
	});

	it('cuts text that does not', () => {
		expect(ellipsize('abcdef', '', 40, measure)).toBe('abc…');
	});
});

describe('pngScale', () => {
	it('doubles the resolution of a small picture', () => {
		expect(pngScale(960, 2000)).toBe(2);
	});

	it('shrinks a tall picture to fit the canvas limits', () => {
		const scale = pngScale(960, 40_000);
		expect(scale).not.toBeNull();
		expect(40_000 * (scale ?? 0)).toBeLessThanOrEqual(32_000);
	});

	it('refuses a picture too large to read', () => {
		expect(pngScale(960, 200_000)).toBeNull();
	});
});

describe('buildTimelineSvg', () => {
	const build = (
		events: CaseTimelineEvent[],
		extra: Partial<Parameters<typeof buildTimelineSvg>[0]> = {}
	) =>
		buildTimelineSvg({
			title: 'Case #1 — Timeline',
			subtitle: '2 events',
			events,
			timelines: [],
			options: OPTIONS,
			measure: approximateMeasure,
			...extra
		});

	it('is well-formed SVG holding the events', () => {
		const image = build([
			event(1, {
				event_title: 'Logon <admin> & "co"',
				event_content: '**Bold** text',
				category_name: 'Lateral movement',
				event_source: 'EDR',
				event_is_flagged: true,
				event_tags: 'apt, lateral',
				assets: [{ id: 1, name: 'WS01', asset_name: 'WS01', role: 'source' }],
				iocs: [{ id: 2, name: '1.2.3.4', ioc_value: '1.2.3.4', role: 'target' }]
			} as Partial<CaseTimelineEvent>),
			event(2, { event_date: '2024-06-16T10:00:00' })
		]);
		const doc = parse(image.svg);
		expect(doc.querySelector('parsererror')).toBeNull();
		const content = doc.documentElement.textContent ?? '';
		expect(content).toContain('Logon <admin> & "co"');
		expect(content).toContain('Bold text');
		expect(content).toContain('#apt');
		expect(content).toContain('WS01 → 1.2.3.4');
		expect(content).toContain('Event 2');
		expect(image.width).toBe(960);
		expect(doc.documentElement.getAttribute('height')).toBe(String(image.height));
	});

	it('leaves out what the options turn off', () => {
		const image = build([event(1, { event_content: 'secret detail', event_tags: 'apt' })], {
			options: { ...OPTIONS, descriptions: false, tags: false }
		});
		expect(image.svg).not.toContain('secret detail');
		expect(image.svg).not.toContain('#apt');
	});

	it('draws children after their parent', () => {
		const image = build([
			event(1, { event_title: 'Parent' }),
			event(2, { event_title: 'Child', parent_event_id: 1 })
		]);
		expect(image.svg.indexOf('Parent')).toBeLessThan(image.svg.indexOf('Child'));
	});

	it('names the timelines of each card when several are pictured', () => {
		const image = build([event(1, { timeline_ids: [2] })], {
			timelines: [timeline(1, 'Initial access', '#ff0000'), timeline(2, 'Exfiltration')]
		});
		const content = parse(image.svg).documentElement.textContent ?? '';
		// In the legend, and on the card for the timeline it is on.
		expect(content.match(/Exfiltration/g)).toHaveLength(2);
		expect(content.match(/Initial access/g)).toHaveLength(1);
	});

	it('lays the tree out wider than the list', () => {
		const events = [event(1), event(2), event(3, { parent_event_id: 2 })];
		const tree = build(events, { options: { ...OPTIONS, layout: 'tree' } });
		expect(parse(tree.svg).querySelector('parsererror')).toBeNull();
		expect(tree.width).toBeGreaterThan(build(events).width);
	});

	it('says so when there is no event', () => {
		expect(build([]).svg).toContain('No timeline events.');
	});
});
