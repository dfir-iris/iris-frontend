import { describe, expect, it } from 'vitest';
import {
	applyCandidate,
	contextPaths,
	splitSegments,
	templateCandidates,
	templateQuery,
	templateSegments,
	type TemplateSources
} from './template-complete';

const SOURCES: TemplateSources = {
	nodes: [
		{
			id: 'triage',
			label: 'Triage',
			type: 'ai_agent',
			config: { output_schema: { properties: { verdict: {} } } }
		},
		{ id: 'n3', label: 'VirusTotal lookup', type: 'http_request' },
		{
			id: 'vars1',
			label: 'Set',
			type: 'set_variables',
			config: { variables: [{ name: 'ioc_value' }, { name: '' }] }
		}
	],
	keys: [{ name: 'VT_KEY', is_secret: true }, { name: 'BASE_URL' }],
	samples: ['entity.alert_title', 'nodes.n3.output.body.data']
};

const values = (text: string, mode: 'template' | 'path' | 'expression' = 'template') => {
	const q = templateQuery(text, text.length, mode);
	return q ? templateCandidates(q, SOURCES).map((c) => c.value) : null;
};

describe('templateQuery', () => {
	it('completes inside an open {{ only', () => {
		expect(templateQuery('Hello {{ no', 11, 'template')).toMatchObject({
			kind: 'path',
			prefix: 'no',
			from: 9,
			to: 11,
			close: true
		});
		expect(templateQuery('{{ a }} no', 10, 'template')).toBeNull();
		expect(templateQuery('plain', 5, 'template')).toBeNull();
		expect(templateQuery('{{ a }}', 4, 'template')?.close).toBe(false);
	});

	it('flags a fresh {{', () => {
		expect(templateQuery('{{ ', 3, 'template')).toMatchObject({ prefix: '', fresh: true });
	});

	it('knows key arguments, filters and strings', () => {
		expect(templateQuery("{{ key('VT", 10, 'template')).toMatchObject({
			kind: 'key',
			prefix: 'VT',
			quote: "'"
		});
		expect(templateQuery('{{ x | tru', 10, 'template')).toMatchObject({
			kind: 'filter',
			prefix: 'tru'
		});
		expect(templateQuery("{{ 'no", 6, 'template')).toBeNull();
		expect(templateQuery('{{ x[0].na', 10, 'template')).toBeNull();
	});

	it('treats a path field as a whole', () => {
		expect(templateQuery('nodes.tr', 8, 'path')).toMatchObject({ prefix: 'nodes.tr', from: 0 });
		expect(templateQuery('a b', 3, 'path')).toBeNull();
	});

	it('completes the last identifier of an expression', () => {
		expect(templateQuery('entity.x >= 4 and vars.i', 24, 'expression')).toMatchObject({
			prefix: 'vars.i',
			from: 18
		});
	});
});

describe('templateCandidates', () => {
	it('proposes the roots and the nodes by id or label', () => {
		const out = values('{{ no');
		expect(out).toContain('nodes');
		expect(out).toContain('now');
		expect(values('{{ tri')).toEqual(['trigger', 'nodes.triage.output']);
		expect(values('{{ virus')).toEqual(['nodes.n3.output']);
	});

	it('goes straight to the output of a node', () => {
		expect(values('{{ nodes.')).toEqual([
			'nodes.triage.output',
			'nodes.n3.output',
			'nodes.vars1.output'
		]);
	});

	it('knows the outputs of each type, the output schema and the sampled paths', () => {
		expect(values('{{ nodes.n3.output.')).toEqual([
			'nodes.n3.output.status_code',
			'nodes.n3.output.headers',
			'nodes.n3.output.body',
			'nodes.n3.output.error'
		]);
		expect(values('{{ nodes.triage.output.output.')).toEqual([
			'nodes.triage.output.output.verdict'
		]);
		expect(values('{{ nodes.n3.output.body.')).toEqual(['nodes.n3.output.body.data']);
		expect(values('{{ entity.')).toEqual(['entity.alert_title']);
	});

	it('lists variables, keys and filters', () => {
		expect(values('{{ vars.')).toEqual(['vars.ioc_value']);
		expect(values('{{ ioc')).toEqual(['vars.ioc_value']);
		expect(values("{{ key('V")).toEqual(['VT_KEY']);
		expect(values('{{ x | to')).toEqual(['tojson']);
		expect(values('{{ ke')).toEqual(["key('"]);
	});

	it('only offers callback in an async request', () => {
		const q = templateQuery('{{ call', 7, 'template')!;
		expect(templateCandidates(q, SOURCES)).toEqual([]);
		expect(templateCandidates(q, { ...SOURCES, callback: true }).map((c) => c.value)).toEqual([
			'callback'
		]);
	});
});

describe('applyCandidate', () => {
	it('closes an open {{ and leaves the caret after the path', () => {
		const text = 'Hi {{ no';
		const q = templateQuery(text, text.length, 'template')!;
		const out = applyCandidate(text, q, { value: 'nodes.triage.output', detail: '', kind: 'node' });
		expect(out.text).toBe('Hi {{ nodes.triage.output }}');
		expect(out.caret).toBe('Hi {{ nodes.triage.output'.length);
	});

	it('replaces the rest of the word and keeps an existing }}', () => {
		const text = '{{ nodes.tr }} end';
		const q = templateQuery(text, 9, 'template')!;
		const out = applyCandidate(text, q, { value: 'nodes.triage.output', detail: '', kind: 'node' });
		expect(out.text).toBe('{{ nodes.triage.output }} end');
	});

	it('closes key arguments', () => {
		const text = "{{ key('V";
		const q = templateQuery(text, text.length, 'template')!;
		expect(applyCandidate(text, q, { value: 'VT_KEY', detail: '', kind: 'key' }).text).toBe(
			"{{ key('VT_KEY')"
		);
		const start = templateQuery('{{ ke', 5, 'template')!;
		const out = applyCandidate('{{ ke', start, { value: "key('", detail: '', kind: 'key' });
		expect(out).toEqual({ text: "{{ key('') }}", caret: 8 });
	});
});

describe('templateSegments', () => {
	it('splits the blocks and flags unknown nodes', () => {
		const segs = templateSegments(
			'A {{ nodes.gone.output }} {{ entity }}',
			'template',
			new Set(['n1'])
		);
		expect(segs.map((s) => s.kind)).toEqual([
			'plain',
			'brace',
			'invalid',
			'brace',
			'plain',
			'brace',
			'expr',
			'brace'
		]);
		expect(segs.map((s) => s.text).join('')).toBe('A {{ nodes.gone.output }} {{ entity }}');
	});

	it('keeps an unclosed block highlighted to the end', () => {
		expect(templateSegments('x {{ nod', 'template').map((s) => s.kind)).toEqual([
			'plain',
			'brace',
			'expr'
		]);
	});

	it('highlights the references of an expression', () => {
		const segs = templateSegments('entity.sev >= 4', 'expression');
		expect(segs).toEqual([
			{ text: 'entity.sev', kind: 'expr' },
			{ text: ' >= 4', kind: 'plain' }
		]);
	});

	it('cuts segments at an offset', () => {
		const [head, tail] = splitSegments(templateSegments('ab {{ x }}', 'template'), 5);
		expect(head.map((s) => s.text).join('')).toBe('ab {{');
		expect(tail.map((s) => s.text).join('')).toBe(' x }}');
	});
});

describe('contextPaths', () => {
	it('walks the context roots, not lists', () => {
		const paths = contextPaths({
			trigger: { type: 'event' },
			nodes: { n2: { output: { items: [{ a: 1 }], 'bad key': 1 } } },
			run: { uuid: 'x' }
		});
		expect([...paths]).toEqual([
			'trigger',
			'trigger.type',
			'nodes',
			'nodes.n2',
			'nodes.n2.output',
			'nodes.n2.output.items'
		]);
	});
});
