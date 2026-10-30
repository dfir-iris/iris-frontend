import { describe, expect, it } from 'vitest';
import {
	alertGraphEdges,
	graphNodeRawId,
	isHtmlTitle,
	sanitizeGraphTitle,
	shortGraphLabel
} from '../alert-graph';

describe('alertGraphEdges', () => {
	it('derives stable ids from the endpoints and keeps dashes', () => {
		expect(
			alertGraphEdges([
				{ from: 'alert_1', to: 'ioc_2', dashes: true },
				{ from: 'alert_1', to: 'asset_3' }
			])
		).toEqual([
			{
				group: 'edges',
				data: { id: 'alert_1->ioc_2', source: 'alert_1', target: 'ioc_2', lineStyle: 'dashed' },
				selectable: false
			},
			{
				group: 'edges',
				data: { id: 'alert_1->asset_3', source: 'alert_1', target: 'asset_3' },
				selectable: false
			}
		]);
	});

	it('keeps repeated pairs distinct', () => {
		const ids = alertGraphEdges([
			{ from: 'a', to: 'b' },
			{ from: 'a', to: 'b' },
			{ from: 'b', to: 'a' }
		]).map((e) => e.data.id);
		expect(ids).toEqual(['a->b', 'a->b#1', 'b->a']);
	});

	it('never adds arrows: the edges are associations', () => {
		const [edge] = alertGraphEdges([{ from: 'a', to: 'b' }]);
		expect(edge.data.arrow).toBeUndefined();
	});
});

describe('graph titles', () => {
	it('strips anything but inline formatting', () => {
		expect(sanitizeGraphTitle('<b>evil</b><img src=x onerror=alert(1)><br>type: ip')).toBe(
			'<b>evil</b><br>type: ip'
		);
		expect(sanitizeGraphTitle('<span style="color:red">x</span>')).toBe('<span>x</span>');
	});

	it('detects markup', () => {
		expect(isHtmlTitle('<b>x</b>')).toBe(true);
		expect(isHtmlTitle('plain')).toBe(false);
		expect(isHtmlTitle(undefined)).toBe(false);
	});
});

describe('shortGraphLabel', () => {
	it('keeps short labels and truncates long ones to 42 characters', () => {
		expect(shortGraphLabel('short')).toBe('short');
		expect(shortGraphLabel(undefined)).toBe('');
		const long = 'x'.repeat(60);
		expect(shortGraphLabel(long)).toBe(`${'x'.repeat(40)}…`);
	});
});

describe('graphNodeRawId', () => {
	it('splits on the first underscore', () => {
		expect(graphNodeRawId('alert_12')).toBe('12');
		expect(graphNodeRawId('case_3')).toBe('3');
	});
});
