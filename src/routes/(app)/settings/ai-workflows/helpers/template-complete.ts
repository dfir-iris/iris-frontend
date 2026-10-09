/**
 * Completion and highlighting of the template fields of the node
 * config form. Three kinds of field:
 *
 * - `template`: text with `{{ … }}` blocks (prompts, titles, URLs…);
 * - `path`: a bare dotted path (`nodes.n2.output.score`);
 * - `expression`: a Jinja expression without braces.
 *
 * The known paths come from the run context layout, the other nodes
 * (and what each type outputs), the variables set in the graph, the
 * keystore and the paths seen in the context of recent runs.
 */

export type TemplateMode = 'template' | 'path' | 'expression';

export type TemplateQueryKind = 'path' | 'key' | 'filter';

export interface TemplateQuery {
	kind: TemplateQueryKind;
	/** What was typed: a dotted path, a keystore name or a filter name. */
	prefix: string;
	/** `text.slice(from, to)` is replaced by the accepted candidate. */
	from: number;
	to: number;
	/** In a `{{` that is not closed yet: accepting closes it. */
	close: boolean;
	/** Right after `{{`: nothing typed yet, but worth proposing. */
	fresh: boolean;
	/** The quote of a `key('…` argument. */
	quote?: string;
}

export type TemplateCandidateKind = 'context' | 'node' | 'field' | 'var' | 'key' | 'filter';

export interface TemplateCandidate {
	/** Inserted text. */
	value: string;
	detail: string;
	kind: TemplateCandidateKind;
}

export interface TemplateNodeRef {
	id: string;
	label: string;
	type: string;
	config?: Record<string, unknown>;
}

export interface TemplateSources {
	nodes: TemplateNodeRef[];
	keys: { name: string; is_secret?: boolean }[];
	/** Paths seen in the context of recent runs. */
	samples: string[];
	/** The field belongs to an async HTTP request: `callback.*` exists. */
	callback?: boolean;
}

const CONTEXT: [string, string][] = [
	['trigger', 'What started the run'],
	['trigger.type', 'event, cron, manual or webhook'],
	['trigger.hook', 'Hook name of an event trigger'],
	['trigger.payload', 'Raw trigger payload'],
	['trigger.entity_type', 'alert, alert_cluster, case or war_room'],
	['trigger.entity_id', 'Id of the entity'],
	['trigger.sub_entity', 'Task, IOC… that fired the event'],
	['entity', 'Snapshot of the entity'],
	['nodes', 'Outputs of the nodes that ran'],
	['vars', 'Variables set by Set variables nodes'],
	['run', 'The run'],
	['run.uuid', 'Run id'],
	['run.workflow_id', 'Workflow id'],
	['run.workflow_name', 'Workflow name'],
	['run.version', 'Workflow version'],
	['run.dry_run', 'Whether writes become suggestions'],
	['now', 'Current time (ISO 8601, UTC)']
];

const CALLBACK: [string, string][] = [
	['callback', 'Callback of this request'],
	['callback.url', 'Where the external system POSTs back'],
	['callback.token', 'Bearer token of the callback']
];

/** What each node type outputs (the top-level keys of `nodes.<id>.output`). */
const OUTPUTS: Record<string, string[]> = {
	trigger: ['type', 'hook', 'entity_type', 'entity_id', 'sub_entity'],
	ai_agent: ['text', 'output', 'suggestion_ids', 'tool_calls'],
	condition: ['result'],
	http_request: ['status_code', 'headers', 'body', 'error'],
	ask_analyst: ['answer', 'answered_by'],
	find_related: ['source', 'result'],
	find_war_room_tasks: ['tasks', 'count', 'since'],
	suggest: ['suggestion_id'],
	action: ['ok', 'executed', 'result', 'suggestion_id'],
	notify: ['notified', 'note'],
	python: ['result', 'logs'],
	stop: ['status', 'reason']
};

export const TEMPLATE_FILTERS: [string, string][] = [
	['default', "Fallback value: default('n/a')"],
	['tojson', 'Serialise as JSON'],
	['length', 'Number of items'],
	['join', "Join a list: join(', ')"],
	['first', 'First item'],
	['last', 'Last item'],
	['upper', 'Upper case'],
	['lower', 'Lower case'],
	['trim', 'Strip whitespace'],
	['truncate', 'Shorten: truncate(200)'],
	['replace', "Replace: replace('a', 'b')"],
	['round', 'Round a number'],
	['int', 'To an integer'],
	['float', 'To a number'],
	['string', 'To text'],
	['map', "Attribute of each item: map(attribute='name')"],
	['selectattr', "Filter a list: selectattr('x', 'equalto', 1)"],
	['list', 'To a list'],
	['sort', 'Sort a list'],
	['unique', 'Distinct items']
];

const MAX_CANDIDATES = 60;
const PATH = /[A-Za-z_][\w.]*$/;

/** Whether `text` has an odd number of unescaped `quote`s (an open string). */
function openString(text: string): boolean {
	let quote: string | null = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\') {
			i++;
		} else if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		}
	}
	return quote !== null;
}

/** What to complete at `caret`, or null when there is nothing to complete there. */
export function templateQuery(
	text: string,
	caret: number,
	mode: TemplateMode
): TemplateQuery | null {
	const before = text.slice(0, caret);
	const after = text.slice(caret);
	const to = caret + (/^\w*/.exec(after)?.[0].length ?? 0);

	if (mode === 'path') {
		const m = /^\s*([\w.]*)$/.exec(before);
		if (!m) return null;
		return {
			kind: 'path',
			prefix: m[1],
			from: caret - m[1].length,
			to,
			close: false,
			fresh: false
		};
	}

	let expr = before;
	let close = false;
	if (mode === 'template') {
		const open = before.lastIndexOf('{{');
		if (open < 0 || before.indexOf('}}', open) >= 0) return null;
		expr = before.slice(open + 2);
		const nextClose = after.indexOf('}}');
		const nextOpen = after.indexOf('{{');
		close = nextClose < 0 || (nextOpen >= 0 && nextOpen < nextClose);
	}

	const keyArg = /key\(\s*(['"])([\w.-]*)$/.exec(expr);
	if (keyArg) {
		const prefix = keyArg[2];
		const end = caret + (/^[\w.-]*/.exec(after)?.[0].length ?? 0);
		return {
			kind: 'key',
			prefix,
			from: caret - prefix.length,
			to: end,
			close: false,
			fresh: false,
			quote: keyArg[1]
		};
	}
	if (openString(expr)) return null;

	const filter = /\|\s*(\w*)$/.exec(expr);
	if (filter) {
		const prefix = filter[1];
		return { kind: 'filter', prefix, from: caret - prefix.length, to, close, fresh: false };
	}

	const prefix = PATH.exec(expr)?.[0] ?? '';
	const preceding = expr[expr.length - prefix.length - 1] ?? '';
	// `foo[0].bar`, `1.5`, `x.y` after a closing paren: not a path from the root
	if (/[\w.\])]/.test(preceding)) return null;
	const fresh = mode === 'template' && expr.trim() === '';
	return { kind: 'path', prefix, from: caret - prefix.length, to, close, fresh };
}

function nodeLabel(node: TemplateNodeRef): string {
	return node.label || node.id;
}

/** Every known path, with a description, in a stable order. */
export function templatePaths(
	sources: TemplateSources
): Map<string, { detail: string; kind: TemplateCandidateKind }> {
	const paths = new Map<string, { detail: string; kind: TemplateCandidateKind }>();
	const add = (path: string, detail: string, kind: TemplateCandidateKind) => {
		const known = paths.get(path);
		if (!known) paths.set(path, { detail, kind });
		else if (!known.detail && detail) known.detail = detail;
	};
	for (const [path, detail] of CONTEXT) add(path, detail, 'context');
	if (sources.callback) for (const [path, detail] of CALLBACK) add(path, detail, 'context');

	for (const node of sources.nodes) {
		const label = nodeLabel(node);
		add(`nodes.${node.id}`, label, 'node');
		add(`nodes.${node.id}.output`, `Output of ${label}`, 'node');
		let keys = OUTPUTS[node.type] ?? [];
		if (node.type === 'set_variables') keys = variableNames(node);
		for (const key of keys) add(`nodes.${node.id}.output.${key}`, label, 'field');
		if (node.type === 'ai_agent') {
			for (const key of schemaKeys(node.config?.output_schema)) {
				add(`nodes.${node.id}.output.output.${key}`, `${label} (output schema)`, 'field');
			}
		}
		for (const name of variableNames(node)) add(`vars.${name}`, `Set by ${label}`, 'var');
	}
	for (const path of sources.samples) {
		const parts = path.split('.');
		for (let i = 1; i <= parts.length; i++) {
			const sub = parts.slice(0, i).join('.');
			add(sub, '', sub.startsWith('vars.') ? 'var' : i > 2 ? 'field' : 'context');
		}
	}
	return paths;
}

function variableNames(node: TemplateNodeRef): string[] {
	if (node.type !== 'set_variables') return [];
	const rows = node.config?.variables;
	if (!Array.isArray(rows)) return [];
	return rows
		.map((r) => String((r as { name?: unknown })?.name ?? '').trim())
		.filter((name) => /^[A-Za-z_]\w*$/.test(name));
}

function schemaKeys(schema: unknown): string[] {
	const props = (schema as { properties?: unknown } | null)?.properties;
	return props && typeof props === 'object' && !Array.isArray(props) ? Object.keys(props) : [];
}

/** The candidates for `query`, best first. */
export function templateCandidates(
	query: TemplateQuery,
	sources: TemplateSources
): TemplateCandidate[] {
	const needle = query.prefix.toLowerCase();
	if (query.kind === 'key') {
		return sources.keys
			.filter((k) => k.name.toLowerCase().startsWith(needle))
			.slice(0, MAX_CANDIDATES)
			.map((k) => ({
				value: k.name,
				detail: k.is_secret ? 'Keystore secret' : 'Keystore value',
				kind: 'key'
			}));
	}
	if (query.kind === 'filter') {
		return TEMPLATE_FILTERS.filter(([name]) => name.startsWith(needle)).map(([name, detail]) => ({
			value: name,
			detail,
			kind: 'filter'
		}));
	}

	const paths = templatePaths(sources);
	const dot = query.prefix.lastIndexOf('.');
	const parent = dot < 0 ? '' : query.prefix.slice(0, dot);
	const partial = needle.slice(dot + 1);
	const out: TemplateCandidate[] = [];
	const seen = new Set<string>();
	const push = (value: string, detail: string, kind: TemplateCandidateKind) => {
		if (seen.has(value)) return;
		seen.add(value);
		out.push({ value, detail, kind });
	};

	for (const [path, info] of paths) {
		const pathDot = path.lastIndexOf('.');
		if ((pathDot < 0 ? '' : path.slice(0, pathDot)) !== parent) continue;
		const segment = path.slice(pathDot + 1).toLowerCase();
		if (!segment.startsWith(partial)) continue;
		// A node is only ever read through its output
		if (parent === 'nodes') push(`${path}.output`, info.detail, 'node');
		else push(path, info.detail, info.kind);
	}

	// `{{ tri` → nodes.triage.output, `{{ verd` → vars.verdict
	if (parent === '' && partial) {
		for (const node of sources.nodes) {
			const label = nodeLabel(node).toLowerCase();
			if (node.id.toLowerCase().includes(partial) || label.includes(partial)) {
				push(`nodes.${node.id}.output`, `Output of ${nodeLabel(node)}`, 'node');
			}
		}
		for (const [path, info] of paths) {
			if (path.startsWith('vars.') && path.slice(5).toLowerCase().includes(partial)) {
				push(path, info.detail, 'var');
			}
		}
	}
	if (parent === '' && query.kind === 'path' && 'key'.startsWith(partial) && sources.keys.length) {
		push("key('", 'A keystore entry', 'key');
	}
	return out.slice(0, MAX_CANDIDATES);
}

/** `text` once `candidate` is accepted for `query`, and where the caret goes. */
export function applyCandidate(
	text: string,
	query: TemplateQuery,
	candidate: TemplateCandidate
): { text: string; caret: number } {
	const insert = candidate.value;
	const rest = text.slice(query.to);
	const close = query.close ? ' }}' : '';
	let tail = close;
	if (query.kind === 'key') {
		const quote = query.quote ?? "'";
		tail = rest.startsWith(quote) ? '' : `${quote})`;
	} else if (insert.endsWith("('")) {
		// `key('` : the caret stays between the quotes, for the name
		tail = rest.startsWith("')") ? '' : `')${close}`;
	}
	const next = text.slice(0, query.from) + insert + tail + rest;
	return { text: next, caret: query.from + insert.length };
}

// ---- highlighting ---------------------------------------------------------

export type SegmentKind = 'plain' | 'brace' | 'expr' | 'invalid';

export interface TemplateSegment {
	text: string;
	kind: SegmentKind;
	/** Why an `invalid` segment is flagged. */
	title?: string;
}

const ROOTS = /\b(?:trigger|entity|nodes|vars|run|now|callback|inputs|key)\b(?:\.\w+)*/g;
const NODE_REF = /\bnodes\.(\w+)/g;

function missingNode(text: string, nodeIds: Set<string> | null): string | null {
	if (!nodeIds) return null;
	for (const m of text.matchAll(NODE_REF)) {
		if (!nodeIds.has(m[1])) return m[1];
	}
	return null;
}

/** Highlights the context references of a path or expression. */
function expressionSegments(text: string, nodeIds: Set<string> | null): TemplateSegment[] {
	const out: TemplateSegment[] = [];
	let last = 0;
	for (const m of text.matchAll(ROOTS)) {
		const start = m.index ?? 0;
		if (start > last) out.push({ text: text.slice(last, start), kind: 'plain' });
		const missing = missingNode(m[0], nodeIds);
		out.push(
			missing
				? { text: m[0], kind: 'invalid', title: `No node "${missing}" in this workflow` }
				: { text: m[0], kind: 'expr' }
		);
		last = start + m[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
	return out;
}

/**
 * `text` split for the highlighting backdrop. `nodeIds`, when given,
 * flags references to nodes that are not in the workflow.
 */
export function templateSegments(
	text: string,
	mode: TemplateMode,
	nodeIds: Set<string> | null = null
): TemplateSegment[] {
	if (mode !== 'template') return expressionSegments(text, nodeIds);
	const out: TemplateSegment[] = [];
	const block = /(\{\{|\{%)([\s\S]*?)(\}\}|%\}|$)/g;
	let last = 0;
	for (const m of text.matchAll(block)) {
		const start = m.index ?? 0;
		if (!m[0]) break;
		if (start > last) out.push({ text: text.slice(last, start), kind: 'plain' });
		const missing = missingNode(m[2], nodeIds);
		out.push({ text: m[1], kind: 'brace' });
		if (m[2]) {
			out.push(
				missing
					? { text: m[2], kind: 'invalid', title: `No node "${missing}" in this workflow` }
					: { text: m[2], kind: 'expr' }
			);
		}
		if (m[3]) out.push({ text: m[3], kind: 'brace' });
		last = start + m[0].length;
	}
	if (last < text.length) out.push({ text: text.slice(last), kind: 'plain' });
	return out;
}

/** `segments` cut at `offset`, so a marker can sit at that point of the text. */
export function splitSegments(
	segments: TemplateSegment[],
	offset: number
): [TemplateSegment[], TemplateSegment[]] {
	const head: TemplateSegment[] = [];
	const tail: TemplateSegment[] = [];
	let pos = 0;
	for (const seg of segments) {
		const end = pos + seg.text.length;
		if (end <= offset) head.push(seg);
		else if (pos >= offset) tail.push(seg);
		else {
			head.push({ ...seg, text: seg.text.slice(0, offset - pos) });
			tail.push({ ...seg, text: seg.text.slice(offset - pos) });
		}
		pos = end;
	}
	return [head, tail];
}

// ---- paths of recent runs -------------------------------------------------

const SAMPLE_ROOTS = ['trigger', 'entity', 'nodes', 'vars'];
const MAX_DEPTH = 6;
const MAX_SAMPLES = 600;

/** The dotted paths of a run context (lists are not walked into). */
export function contextPaths(context: unknown, into: Set<string> = new Set()): Set<string> {
	if (!context || typeof context !== 'object') return into;
	const walk = (value: unknown, path: string, depth: number) => {
		if (into.size >= MAX_SAMPLES) return;
		into.add(path);
		if (depth >= MAX_DEPTH || !value || typeof value !== 'object' || Array.isArray(value)) return;
		for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
			if (!/^[A-Za-z_]\w*$/.test(key)) continue;
			walk(item, `${path}.${key}`, depth + 1);
		}
	};
	const root = context as Record<string, unknown>;
	for (const key of SAMPLE_ROOTS) {
		if (key in root) walk(root[key], key, 1);
	}
	return into;
}
