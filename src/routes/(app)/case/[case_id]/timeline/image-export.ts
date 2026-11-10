/**
 * Picture of the timeline cards, as SVG or PNG.
 *
 * The SVG is drawn from the events rather than captured from the page:
 * it holds every event — not only the ones scrolled past — opens in any
 * viewer or report editor, and stays sharp when scaled. The PNG is that
 * same SVG drawn on a canvas.
 *
 * Plain SVG has no text flow, so every line is wrapped here with a
 * `TextMeasure`; the browser's canvas measures with the very font stack
 * the SVG names.
 */
import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
import type { CaseTimeline } from '$lib/services/case-timelines.service';
import { dayKey, formatDate, formatTime } from '$lib/utils/time-formatter';
import { toPlainSnippet } from '$lib/utils/text';
import { eventFlow, formatEventFlow } from '$lib/utils/event-roles';
import { eventAccentColor } from './event-color';

export type TimelineImageLayout = 'list' | 'tree';
export type TimelineImageTheme = 'light' | 'dark';
export type TimelineImageFormat = 'svg' | 'png';

export type TimelineImageOptions = {
	layout: TimelineImageLayout;
	theme: TimelineImageTheme;
	descriptions: boolean;
	/** Linked assets and IOCs, and the direction their roles give. */
	links: boolean;
	tags: boolean;
};

/** Width in pixels of `text` drawn in the CSS `font`. */
export type TextMeasure = (text: string, font: string) => number;

export type TimelineImageInput = {
	title: string;
	subtitle: string;
	/** Chronological, as the cards show them. */
	events: CaseTimelineEvent[];
	/**
	 * The timelines pictured, listed under the title. With more than one,
	 * each card also names those of them it is on.
	 */
	timelines: CaseTimeline[];
	options: TimelineImageOptions;
	measure?: TextMeasure;
};

export type TimelineImage = {
	svg: string;
	width: number;
	height: number;
};

const SANS =
	"ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const font = (size: number, weight = 400, family = SANS) => `${weight} ${size}px ${family}`;

const THEMES = {
	light: {
		background: '#f8fafc',
		card: '#ffffff',
		border: '#e4e4e7',
		text: '#09090b',
		body: '#3f3f46',
		muted: '#71717a',
		faint: '#a1a1aa',
		rail: '#d4d4d8',
		pill: '#f4f4f5',
		asset: '#b45309',
		ioc: '#b91c1c',
		flow: '#f97316'
	},
	dark: {
		background: '#020617',
		card: '#0f172a',
		border: '#1e293b',
		text: '#f1f5f9',
		body: '#cbd5e1',
		muted: '#94a3b8',
		faint: '#64748b',
		rail: '#334155',
		pill: '#1e293b',
		asset: '#fcd34d',
		ioc: '#fca5a5',
		flow: '#fb923c'
	}
} as const;

type Theme = (typeof THEMES)[TimelineImageTheme];

/** Timelines without a colour of their own. */
const NEUTRAL_TIMELINE_COLOR = '#94a3b8';

const PAD = 32;
const LIST_WIDTH = 960;
const TREE_WIDTH = 1280;

const CARD_PAD_X = 16;
const CARD_PAD_Y = 12;
const TITLE_LINES = 3;
const DESCRIPTION_LINES = 6;
const CHIP_HEIGHT = 18;
const CHIP_GAP = 4;

// Past a few lines' worth, more text only costs measuring.
const MAX_TEXT_CHARS = 2000;

/** The events on any of the timelines; all of them when none is given. */
export const eventsOnTimelines = (
	events: CaseTimelineEvent[],
	timelineIds: number[]
): CaseTimelineEvent[] => {
	if (!timelineIds.length) return events;
	const ids = new Set(timelineIds);
	return events.filter((e) => (e.timeline_ids ?? []).some((id) => ids.has(id)));
};

// Characters XML 1.0 refuses, even escaped.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

export const escapeXml = (value: string): string =>
	value
		.replace(INVALID_XML, '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');

/** Rough widths for when no canvas is at hand. */
export const approximateMeasure: TextMeasure = (text, cssFont) => {
	const size = Number(/(\d+(?:\.\d+)?)px/.exec(cssFont)?.[1] ?? 12);
	return text.length * size * (cssFont.includes('monospace') ? 0.6 : 0.55);
};

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Widths from a canvas, falling back to `approximateMeasure`. */
export const canvasMeasure: TextMeasure = (text, cssFont) => {
	if (measureContext === undefined) {
		measureContext =
			typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
	}
	if (!measureContext) return approximateMeasure(text, cssFont);
	measureContext.font = cssFont;
	return measureContext.measureText(text).width;
};

/** Longest prefix of `text` within `maxWidth`, at least one character. */
const fittingLength = (text: string, cssFont: string, maxWidth: number, measure: TextMeasure) => {
	let low = 1;
	let high = text.length;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (measure(text.slice(0, mid), cssFont) <= maxWidth) low = mid;
		else high = mid - 1;
	}
	return low;
};

export const ellipsize = (
	text: string,
	cssFont: string,
	maxWidth: number,
	measure: TextMeasure
): string => {
	if (measure(text, cssFont) <= maxWidth) return text;
	const ellipsisWidth = measure('…', cssFont);
	const kept = text.slice(0, fittingLength(text, cssFont, maxWidth - ellipsisWidth, measure));
	return `${kept.trimEnd()}…`;
};

/**
 * `text` in lines of at most `maxWidth`, broken between words, and
 * inside a word longer than a line (hashes, paths). Past `maxLines`
 * the last line ends with an ellipsis.
 */
export const wrapText = (
	text: string,
	cssFont: string,
	maxWidth: number,
	maxLines: number,
	measure: TextMeasure
): string[] => {
	const words = text.slice(0, MAX_TEXT_CHARS).split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	let truncated = text.length > MAX_TEXT_CHARS;

	for (let i = 0; i < words.length; i++) {
		if (lines.length >= maxLines) {
			truncated = true;
			break;
		}
		const candidate = line ? `${line} ${words[i]}` : words[i];
		if (measure(candidate, cssFont) <= maxWidth) {
			line = candidate;
			continue;
		}
		if (line) {
			lines.push(line);
			line = '';
		}
		let rest = words[i];
		while (measure(rest, cssFont) > maxWidth && lines.length < maxLines) {
			const n = fittingLength(rest, cssFont, maxWidth, measure);
			lines.push(rest.slice(0, n));
			rest = rest.slice(n);
		}
		line = rest;
	}
	if (line) {
		if (lines.length < maxLines) lines.push(line);
		else truncated = true;
	}
	if (truncated && lines.length) {
		const last = lines.length - 1;
		lines[last] = ellipsize(`${lines[last]}…`, cssFont, maxWidth, measure);
	}
	return lines;
};

type Chip = {
	label: string;
	color: string;
	/** Background tint; the pill colour when unset. */
	tint?: string;
	/** Coloured dot before the label (timelines). */
	dot?: string;
	size: number;
};

type Drawn = {
	height: number;
	draw: (x: number, y: number) => string;
};

type Context = {
	theme: Theme;
	options: TimelineImageOptions;
	timelines: CaseTimeline[];
	measure: TextMeasure;
	/** Ids for the cards' clip paths. */
	nextId: () => number;
};

const text = (
	x: number,
	y: number,
	value: string,
	attrs: { size: number; fill: string; weight?: number; family?: string; anchor?: string }
) =>
	`<text x="${x}" y="${y}" font-family="${escapeXml(attrs.family ?? SANS)}" font-size="${attrs.size}"${
		attrs.weight ? ` font-weight="${attrs.weight}"` : ''
	}${attrs.anchor ? ` text-anchor="${attrs.anchor}"` : ''} fill="${escapeXml(attrs.fill)}">${escapeXml(value)}</text>`;

const line = (x1: number, y1: number, x2: number, y2: number, stroke: string) =>
	`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(stroke)}" stroke-width="1"/>`;

// Lucide's flag, 24px grid.
const flagIcon = (x: number, y: number, size: number) =>
	`<g transform="translate(${x} ${y}) scale(${size / 24})" fill="#ef4444" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7" fill="none"/></g>`;

const chipWidth = (chip: Chip, maxWidth: number, ctx: Context) =>
	Math.min(maxWidth, ctx.measure(chip.label, font(chip.size)) + 12 + (chip.dot ? 10 : 0));

/** Chips in rows within `maxWidth`. */
const layoutChips = (chips: Chip[], maxWidth: number, ctx: Context): Drawn => {
	const placed: { chip: Chip; dx: number; dy: number; width: number }[] = [];
	let dx = 0;
	let dy = 0;
	for (const chip of chips) {
		const width = chipWidth(chip, maxWidth, ctx);
		if (dx > 0 && dx + width > maxWidth) {
			dx = 0;
			dy += CHIP_HEIGHT + CHIP_GAP;
		}
		placed.push({ chip, dx, dy, width });
		dx += width + CHIP_GAP;
	}
	return {
		height: chips.length ? dy + CHIP_HEIGHT : 0,
		draw: (x, y) =>
			placed
				.map(({ chip, dx, dy, width }) => {
					const left = x + dx;
					const top = y + dy;
					const labelX = left + 6 + (chip.dot ? 10 : 0);
					const label = ellipsize(
						chip.label,
						font(chip.size),
						x + maxWidth - labelX - 6,
						ctx.measure
					);
					return [
						chip.tint
							? `<rect x="${left}" y="${top}" width="${width}" height="${CHIP_HEIGHT}" rx="4" fill="${escapeXml(chip.tint)}" fill-opacity="0.15"/>`
							: `<rect x="${left}" y="${top}" width="${width}" height="${CHIP_HEIGHT}" rx="4" fill="${ctx.theme.pill}"/>`,
						chip.dot
							? `<circle cx="${left + 10}" cy="${top + CHIP_HEIGHT / 2}" r="3.5" fill="${escapeXml(chip.dot)}"/>`
							: '',
						text(labelX, top + CHIP_HEIGHT / 2 + chip.size * 0.35, label, {
							size: chip.size,
							fill: chip.color
						})
					].join('');
				})
				.join('')
	};
};

const eventChips = (event: CaseTimelineEvent, ctx: Context): Chip[] => {
	const { theme, options } = ctx;
	const chips: Chip[] = [];
	if (ctx.timelines.length > 1) {
		const on = new Set(event.timeline_ids ?? []);
		for (const t of ctx.timelines) {
			if (!on.has(t.timeline_id)) continue;
			chips.push({
				label: t.name,
				color: theme.body,
				dot: t.color || NEUTRAL_TIMELINE_COLOR,
				size: 10
			});
		}
	}
	if (options.links) {
		for (const asset of event.assets ?? []) {
			chips.push({
				label: String(asset.asset_name ?? asset.name ?? ''),
				color: theme.asset,
				tint: '#f59e0b',
				size: 11
			});
		}
		for (const ioc of event.iocs ?? []) {
			chips.push({
				label: String(ioc.ioc_value ?? ioc.name ?? ''),
				color: theme.ioc,
				tint: '#ef4444',
				size: 11
			});
		}
	}
	if (options.tags) {
		for (const tag of (event.event_tags ?? '').split(',')) {
			if (tag.trim()) chips.push({ label: `#${tag.trim()}`, color: theme.muted, size: 10 });
		}
	}
	return chips.filter((c) => c.label && c.label !== '#');
};

/** One event card, `width` wide, as the cards view draws it. */
const layoutCard = (event: CaseTimelineEvent, width: number, ctx: Context): Drawn => {
	const { theme, options, measure } = ctx;
	const accent = eventAccentColor(event);
	const inner = width - 2 * CARD_PAD_X;

	const titleFont = font(14, 600);
	const titleLines = wrapText(
		event.event_title || `Event #${event.event_id}`,
		titleFont,
		inner,
		TITLE_LINES,
		measure
	);

	const bodyFont = font(12);
	const description =
		options.descriptions && event.event_content
			? wrapText(
					toPlainSnippet(event.event_content, MAX_TEXT_CHARS),
					bodyFont,
					inner,
					DESCRIPTION_LINES,
					measure
				)
			: [];

	const flow = options.links ? eventFlow(event.assets, event.iocs) : null;
	const chips = layoutChips(eventChips(event, ctx), inner, ctx);

	// Top of each block, from the top of the card.
	let cursor = CARD_PAD_Y;
	const metaTop = cursor;
	cursor += 16;
	const titleTop = cursor + 4;
	cursor = titleTop + titleLines.length * 18;
	const descriptionTop = cursor + 4;
	if (description.length) cursor = descriptionTop + description.length * 16;
	const flowTop = cursor + 6;
	if (flow) cursor = flowTop + 14;
	const chipsTop = cursor + 8;
	if (chips.height) cursor = chipsTop + chips.height;
	const height = cursor + CARD_PAD_Y;

	const meta = (x: number, y: number): string => {
		const parts: string[] = [];
		const baseline = y + 12;
		const limit = x + inner;
		let at = x;

		const time = formatTime(event.event_date, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		parts.push(text(at, baseline, time, { size: 11, fill: theme.muted, family: MONO }));
		at += measure(time, font(11, 400, MONO)) + 8;

		if (event.category_name) {
			const label = ellipsize(event.category_name, font(10, 500), limit - at - 16, measure);
			const pillWidth = measure(label, font(10, 500)) + 16;
			parts.push(
				`<rect x="${at}" y="${y}" width="${pillWidth}" height="16" rx="8" fill="${escapeXml(accent)}" fill-opacity="0.13"/>`,
				text(at + 8, baseline - 0.5, label, { size: 10, weight: 500, fill: accent })
			);
			at += pillWidth + 8;
		}

		const tail = `#${event.event_id}`;
		const tailWidth = measure(tail, font(10)) + (event.event_is_flagged ? 18 : 0);

		if (event.event_source) {
			const room = limit - at - tailWidth - 8;
			if (room > 24) {
				const source = ellipsize(`· ${event.event_source.toUpperCase()}`, font(10), room, measure);
				parts.push(text(at, baseline - 0.5, source, { size: 10, fill: theme.muted }));
				at += measure(source, font(10)) + 8;
			}
		}
		if (event.event_is_flagged) {
			parts.push(flagIcon(at, y + 2, 12));
			at += 18;
		}
		parts.push(text(at, baseline - 0.5, tail, { size: 10, fill: theme.faint }));
		return parts.join('');
	};

	return {
		height,
		draw: (x, y) => {
			const clip = `card-${ctx.nextId()}`;
			const left = x + CARD_PAD_X;
			const parts = [
				`<clipPath id="${clip}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12"/></clipPath>`,
				`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="${theme.card}" stroke="${theme.border}"/>`,
				`<rect x="${x}" y="${y}" width="4" height="${height}" fill="${escapeXml(accent)}" clip-path="url(#${clip})"/>`,
				`<g clip-path="url(#${clip})">`,
				meta(left, y + metaTop),
				...titleLines.map((l, i) =>
					text(left, y + titleTop + i * 18 + 13, l, { size: 14, weight: 600, fill: theme.text })
				),
				...description.map((l, i) =>
					text(left, y + descriptionTop + i * 16 + 12, l, { size: 12, fill: theme.body })
				)
			];
			if (flow) {
				const flowText = ellipsize(formatEventFlow(flow), font(10, 500), inner - 16, measure);
				parts.push(
					text(left, y + flowTop + 10, '→', { size: 11, weight: 700, fill: theme.flow }),
					text(left + 14, y + flowTop + 10, flowText, { size: 10, weight: 500, fill: theme.body })
				);
			}
			if (chips.height) parts.push(chips.draw(left, y + chipsTop));
			parts.push('</g>');
			return parts.join('');
		}
	};
};

type Group = {
	day: string;
	roots: CaseTimelineEvent[];
};

/** Roots by day, and children by parent, as the cards view nests them. */
const structure = (events: CaseTimelineEvent[]) => {
	const ids = new Set(events.map((e) => e.event_id));
	const children = new Map<number, CaseTimelineEvent[]>();
	const groups: Group[] = [];
	const byDay = new Map<string, Group>();

	for (const event of events) {
		if (event.parent_event_id && ids.has(event.parent_event_id)) {
			const siblings = children.get(event.parent_event_id) ?? [];
			siblings.push(event);
			children.set(event.parent_event_id, siblings);
			continue;
		}
		const day = dayKey(event.event_date);
		let group = byDay.get(day);
		if (!group) {
			group = { day, roots: [] };
			byDay.set(day, group);
			groups.push(group);
		}
		group.roots.push(event);
	}
	return { groups, children };
};

/** Days are spelled out in full: "today" means nothing in a report. */
const dayHeading = (group: Group) =>
	formatDate(group.roots[0]?.event_date, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	}) || group.day;

const DAY_HEADING_HEIGHT = 24;

const dayPill = (centerX: number, y: number, label: string, ctx: Context) => {
	const width = ctx.measure(label, font(12, 600)) + 24;
	return [
		`<rect x="${centerX - width / 2}" y="${y}" width="${width}" height="${DAY_HEADING_HEIGHT}" rx="12" fill="${ctx.theme.pill}" stroke="${ctx.theme.border}"/>`,
		text(centerX, y + 16, label, { size: 12, weight: 600, fill: ctx.theme.text, anchor: 'middle' })
	].join('');
};

/** Title, subtitle and the timelines pictured; returns where content starts. */
const header = (input: TimelineImageInput, width: number, ctx: Context, out: string[]): number => {
	const { theme, measure } = ctx;
	let y = PAD;
	const titleLines = wrapText(input.title, font(20, 700), width - 2 * PAD, 2, measure);
	for (const l of titleLines) {
		out.push(text(PAD, y + 20, l, { size: 20, weight: 700, fill: theme.text }));
		y += 26;
	}
	if (input.subtitle) {
		const subtitle = ellipsize(input.subtitle, font(12), width - 2 * PAD, measure);
		out.push(text(PAD, y + 14, subtitle, { size: 12, fill: theme.muted }));
		y += 20;
	}
	if (input.timelines.length) {
		const legend = layoutChips(
			input.timelines.map((t) => ({
				label: t.name,
				color: theme.body,
				dot: t.color || NEUTRAL_TIMELINE_COLOR,
				size: 11
			})),
			width - 2 * PAD,
			ctx
		);
		out.push(legend.draw(PAD, y + 6));
		y += 6 + legend.height;
	}
	return y + 20;
};

const layoutList = (input: TimelineImageInput, ctx: Context, out: string[]) => {
	const width = LIST_WIDTH;
	const { groups, children } = structure(input.events);
	const railX = PAD + 18;
	const cardX = PAD + 48;
	const cardWidth = width - PAD - cardX;
	const back: string[] = [];
	const front: string[] = [];
	let y = header(input, width, ctx, out);
	let railTop: number | null = null;
	let railBottom = y;

	const place = (event: CaseTimelineEvent) => {
		const card = layoutCard(event, cardWidth, ctx);
		railTop ??= y + 26;
		railBottom = y + 26;
		front.push(
			card.draw(cardX, y),
			`<circle cx="${railX}" cy="${y + 26}" r="6" fill="${escapeXml(eventAccentColor(event))}" stroke="${ctx.theme.background}" stroke-width="4"/>`
		);
		y += card.height + 8;
		for (const child of children.get(event.event_id) ?? []) place(child);
	};

	for (const group of groups) {
		const label = dayHeading(group);
		const center = PAD + (width - 2 * PAD) / 2;
		const half = ctx.measure(label, font(12, 600)) / 2 + 12;
		front.push(
			line(
				PAD,
				y + DAY_HEADING_HEIGHT / 2,
				center - half - 8,
				y + DAY_HEADING_HEIGHT / 2,
				ctx.theme.rail
			),
			line(
				center + half + 8,
				y + DAY_HEADING_HEIGHT / 2,
				width - PAD,
				y + DAY_HEADING_HEIGHT / 2,
				ctx.theme.rail
			),
			dayPill(center, y, label, ctx)
		);
		y += DAY_HEADING_HEIGHT + 12;
		for (const root of group.roots) place(root);
		y += 8;
	}
	if (railTop !== null && railBottom > railTop) {
		back.push(line(railX, railTop, railX, railBottom, ctx.theme.rail));
	}
	out.push(...back, ...front);
	return { width, height: y + PAD - 8 };
};

const TREE_BRANCH = 24;
const TREE_INDENT = 28;

const layoutTree = (input: TimelineImageInput, ctx: Context, out: string[]) => {
	const width = TREE_WIDTH;
	const { groups, children } = structure(input.events);
	const spineX = width / 2;
	const columnWidth = (width - 2 * PAD) / 2 - TREE_BRANCH;
	const back: string[] = [];
	const front: string[] = [];
	let y = header(input, width, ctx, out);
	const spineTop = y;
	let index = 0;

	/** Children under their parent, indented away from the spine side. */
	const placeChildren = (
		parent: CaseTimelineEvent,
		x: number,
		cardWidth: number,
		side: 'left' | 'right'
	) => {
		const kids = children.get(parent.event_id) ?? [];
		if (!kids.length) return;
		const childWidth = cardWidth - TREE_INDENT;
		const elbowX = side === 'left' ? x + cardWidth - 12 : x + 12;
		const childX = side === 'left' ? x : x + TREE_INDENT;
		const elbowTop = y - 8;
		for (const kid of kids) {
			const card = layoutCard(kid, childWidth, ctx);
			const joinY = y + 24;
			back.push(
				line(elbowX, elbowTop, elbowX, joinY, ctx.theme.rail),
				side === 'left'
					? line(childX + childWidth, joinY, elbowX, joinY, ctx.theme.rail)
					: line(elbowX, joinY, childX, joinY, ctx.theme.rail)
			);
			front.push(card.draw(childX, y));
			y += card.height + 8;
			placeChildren(kid, childX, childWidth, side);
		}
	};

	for (const group of groups) {
		front.push(dayPill(spineX, y, dayHeading(group), ctx));
		y += DAY_HEADING_HEIGHT + 12;
		for (const root of group.roots) {
			const side = index++ % 2 === 0 ? 'left' : 'right';
			const x = side === 'left' ? PAD : spineX + TREE_BRANCH;
			const card = layoutCard(root, columnWidth, ctx);
			back.push(
				side === 'left'
					? line(x + columnWidth, y + 24, spineX, y + 24, ctx.theme.rail)
					: line(spineX, y + 24, x, y + 24, ctx.theme.rail)
			);
			front.push(
				card.draw(x, y),
				`<circle cx="${spineX}" cy="${y + 24}" r="6" fill="${escapeXml(eventAccentColor(root))}" stroke="${ctx.theme.background}" stroke-width="4"/>`
			);
			y += card.height + 8;
			placeChildren(root, x, columnWidth, side);
			y += 4;
		}
		y += 8;
	}
	out.push(line(spineX, spineTop, spineX, y - 12, ctx.theme.rail), ...back, ...front);
	return { width, height: y + PAD - 12 };
};

/** The SVG picture of the events, as the cards view lays them out. */
export const buildTimelineSvg = (input: TimelineImageInput): TimelineImage => {
	let id = 0;
	const ctx: Context = {
		theme: THEMES[input.options.theme],
		options: input.options,
		timelines: input.timelines,
		measure: input.measure ?? canvasMeasure,
		nextId: () => id++
	};
	const body: string[] = [];
	const { width, height } =
		input.options.layout === 'tree' ? layoutTree(input, ctx, body) : layoutList(input, ctx, body);
	const empty = input.events.length
		? ''
		: text(PAD, height - PAD, 'No timeline events.', { size: 12, fill: ctx.theme.muted });
	const svg = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + (empty ? 24 : 0)}" viewBox="0 0 ${width} ${height + (empty ? 24 : 0)}">`,
		`<title>${escapeXml(input.title)}</title>`,
		`<rect width="100%" height="100%" fill="${ctx.theme.background}"/>`,
		...body,
		empty,
		'</svg>'
	].join('\n');
	return { svg, width, height: height + (empty ? 24 : 0) };
};

// Browsers refuse canvases past ~32k pixels a side or ~268M pixels.
const MAX_CANVAS_SIDE = 32_000;
const MAX_CANVAS_AREA = 200_000_000;
const PNG_SCALE = 2;
const MIN_PNG_SCALE = 0.5;

/** Pixels per SVG unit for the PNG; null when it would be unreadable. */
export const pngScale = (width: number, height: number): number | null => {
	const scale = Math.min(
		PNG_SCALE,
		MAX_CANVAS_SIDE / width,
		MAX_CANVAS_SIDE / height,
		Math.sqrt(MAX_CANVAS_AREA / (width * height))
	);
	return scale >= MIN_PNG_SCALE ? scale : null;
};

/** The picture drawn on a canvas, as a PNG. */
export const timelineImageToPng = async (image: TimelineImage): Promise<Blob> => {
	const scale = pngScale(image.width, image.height);
	if (scale === null) {
		throw new Error(
			'Too many events for a PNG. Export as SVG, or pick fewer timelines or a shorter time range.'
		);
	}
	const url = URL.createObjectURL(new Blob([image.svg], { type: 'image/svg+xml;charset=utf-8' }));
	try {
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('The browser could not draw the picture.'));
			img.src = url;
		});
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(image.width * scale);
		canvas.height = Math.ceil(image.height * scale);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('The browser could not draw the picture.');
		context.drawImage(img, 0, 0, canvas.width, canvas.height);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(blob) =>
					blob ? resolve(blob) : reject(new Error('The browser could not draw the picture.')),
				'image/png'
			)
		);
	} finally {
		URL.revokeObjectURL(url);
	}
};
