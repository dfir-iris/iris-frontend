import { describe, expect, it } from 'vitest';
import {
	canvasFilename,
	detectImportFormat,
	exportFilename,
	exportMime,
	exportText,
	importSummary,
	IMPORT_MAX_OBJECTS,
	parseImport
} from '../exchange';

describe('graph exchange helpers', () => {
	it('builds the export download', () => {
		expect(exportText('<graphml/>')).toBe('<graphml/>');
		expect(exportText({ a: 1 })).toBe('{\n  "a": 1\n}');
		expect(exportMime('graphml')).toBe('application/graphml+xml');
		expect(exportMime('stix')).toBe('application/json');
		expect(exportFilename(3, 'stix', 'case-3-graph.stix.json')).toBe('case-3-graph.stix.json');
		expect(exportFilename(3, 'stix', '../etc/passwd')).toBe('case-3-graph.stix.json');
		expect(exportFilename(3, 'graphml')).toBe('case-3-graph.graphml');
		expect(canvasFilename(3, 'png')).toBe('case-3-graph.png');
	});

	it('detects the import format', () => {
		expect(detectImportFormat({ type: 'bundle', objects: [] })).toBe('stix');
		expect(detectImportFormat({ nodes: [], edges: [] })).toBe('json');
		expect(detectImportFormat([])).toBeNull();
		expect(detectImportFormat({ foo: 1 })).toBeNull();
	});

	it('parses import files', () => {
		expect(parseImport('{')).toEqual({ error: 'The file is not valid JSON.' });
		expect(parseImport('{"x":1}')).toHaveProperty('error');
		expect(parseImport('{"nodes":[],"edges":[]}')).toEqual({
			error: 'The document holds nothing to import.'
		});

		const json = parseImport('{"nodes":[{"key":"asset:1"}],"edges":[{},{}]}');
		expect(json).toMatchObject({ format: 'json', count: 3, counts: { nodes: 1, edges: 2 } });

		const stix = parseImport(
			JSON.stringify({
				type: 'bundle',
				objects: [{ type: 'indicator' }, { type: 'indicator' }, { type: 'relationship' }, 4]
			})
		);
		expect(stix).toMatchObject({
			format: 'stix',
			count: 4,
			counts: { indicator: 2, relationship: 1, unknown: 1 }
		});

		expect(parseImport('{"nodes":[{}]}', 'stix')).toHaveProperty('error');

		const big = JSON.stringify({ nodes: new Array(IMPORT_MAX_OBJECTS + 1).fill({}) });
		expect((parseImport(big) as { error: string }).error).toMatch(/At most/);
	});

	it('summarises an import result', () => {
		expect(
			importSummary({ nodes_created: 1, edges_created: 3, skipped: 2, skipped_details: [] })
		).toBe('1 object created, 3 relations created, 2 skipped');
		expect(
			importSummary({ nodes_created: 0, edges_created: 1, skipped: 0, skipped_details: [] })
		).toBe('0 objects created, 1 relation created');
	});
});
