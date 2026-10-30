import type {
	GraphExportFormat,
	GraphImportFormat,
	GraphImportResult
} from '$lib/types/resources/case-graph';

/** Backend limit (CASE_GRAPH_IMPORT_MAX_OBJECTS). */
export const IMPORT_MAX_OBJECTS = 20000;

export const EXPORT_FORMATS: { format: GraphExportFormat; label: string; hint: string }[] = [
	{ format: 'json', label: 'IRIS JSON', hint: 'Graph and saved views, re-importable' },
	{ format: 'stix', label: 'STIX 2.1 bundle', hint: 'For threat-intel platforms' },
	{ format: 'graphml', label: 'GraphML', hint: 'For Gephi, yEd, Cytoscape desktop' }
];

export const exportMime = (format: GraphExportFormat) =>
	format === 'graphml' ? 'application/graphml+xml' : 'application/json';

/** Text to download from the `content` of an export (JSON objects pretty-printed). */
export const exportText = (content: unknown): string =>
	typeof content === 'string' ? content : JSON.stringify(content ?? null, null, 2);

/** Name of an export file; the backend name when it is safe, else a default. */
export const exportFilename = (caseId: number, format: GraphExportFormat, backend?: unknown) => {
	if (typeof backend === 'string' && /^[\w.-]{1,200}$/.test(backend)) return backend;
	const ext = format === 'stix' ? 'stix.json' : format;
	return `case-${caseId}-graph.${ext}`;
};

export const canvasFilename = (caseId: number, ext: 'png' | 'svg') => `case-${caseId}-graph.${ext}`;

export interface ImportPlan {
	format: GraphImportFormat;
	content: Record<string, unknown>;
	/** Objects the backend will look at (nodes + edges, or STIX objects). */
	count: number;
	counts: Record<string, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Format of an import document: a STIX bundle or an IRIS JSON graph. */
export const detectImportFormat = (doc: unknown): GraphImportFormat | null => {
	if (!isObj(doc)) return null;
	if (doc.type === 'bundle' && Array.isArray(doc.objects)) return 'stix';
	if (Array.isArray(doc.nodes) || Array.isArray(doc.edges)) return 'json';
	return null;
};

/**
 * Parse an import file. Returns the plan, or an error message for invalid
 * JSON, an unknown shape, a format mismatch or too many objects.
 */
export const parseImport = (
	text: string,
	forced?: GraphImportFormat | null
): ImportPlan | { error: string } => {
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		return { error: 'The file is not valid JSON.' };
	}
	const detected = detectImportFormat(doc);
	if (!detected || !isObj(doc)) {
		return { error: 'Neither an IRIS graph export (nodes / edges) nor a STIX 2.1 bundle.' };
	}
	if (forced && forced !== detected) {
		return {
			error: `This looks like ${detected === 'stix' ? 'a STIX bundle' : 'an IRIS JSON graph'}, not ${forced === 'stix' ? 'a STIX bundle' : 'an IRIS JSON graph'}.`
		};
	}
	const counts: Record<string, number> = {};
	let count = 0;
	if (detected === 'stix') {
		for (const o of doc.objects as unknown[]) {
			const t = isObj(o) && typeof o.type === 'string' ? o.type : 'unknown';
			counts[t] = (counts[t] ?? 0) + 1;
			count++;
		}
	} else {
		counts.nodes = Array.isArray(doc.nodes) ? doc.nodes.length : 0;
		counts.edges = Array.isArray(doc.edges) ? doc.edges.length : 0;
		count = counts.nodes + counts.edges;
	}
	if (count > IMPORT_MAX_OBJECTS) {
		return { error: `At most ${IMPORT_MAX_OBJECTS} objects can be imported at once (${count}).` };
	}
	if (!count) return { error: 'The document holds nothing to import.' };
	return { format: detected, content: doc, count, counts };
};

/** One-line result of an import. */
export const importSummary = (r: GraphImportResult) => {
	const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
	const parts = [
		`${plural(r.nodes_created, 'object')} created`,
		`${plural(r.edges_created, 'relation')} created`
	];
	if (r.skipped) parts.push(`${r.skipped} skipped`);
	return parts.join(', ');
};
