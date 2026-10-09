import { describe, expect, it } from 'vitest';
import { enrichmentLabel, enrichmentSafeLink, enrichmentSources } from '../enrichment-view';

describe('enrichmentSources', () => {
	it('lifts the summary, link and verdict and keeps one-line fields', () => {
		const [vt] = enrichmentSources({
			virustotal: {
				summary: 'Malicious: 5/65 engines.',
				link: 'https://www.virustotal.com/gui/file/abc',
				verdict: 'malicious',
				detection_ratio: '5/65',
				names: ['invoice.exe', 'payload.bin'],
				found: true,
				community_votes: { harmless: 0, malicious: 2 }
			}
		});
		expect(vt.label).toBe('VirusTotal');
		expect(vt.summary).toBe('Malicious: 5/65 engines.');
		expect(vt.link).toBe('https://www.virustotal.com/gui/file/abc');
		expect(vt.verdict).toBe('malicious');
		expect(vt.fields).toEqual([
			{ label: 'Detection ratio', value: '5/65' },
			{ label: 'Names', value: 'invoice.exe, payload.bin' },
			{ label: 'Found', value: 'true' }
		]);
		expect(vt.hasMore).toBe(true);
	});

	it('never turns a non-http link into a link', () => {
		const [src] = enrichmentSources({ x: { link: 'javascript:alert(1)' } });
		expect(src.link).toBeNull();
		expect(enrichmentSafeLink('http://example.org/a')).toBe('http://example.org/a');
	});

	it('handles scalar sources and payloads that are not objects', () => {
		expect(enrichmentSources({ note: 'seen in MISP' })[0].fields).toEqual([
			{ label: 'Value', value: 'seen in MISP' }
		]);
		expect(enrichmentSources(null)).toEqual([]);
		expect(enrichmentSources([1, 2])).toEqual([]);
	});

	it('shortens long lists', () => {
		const [src] = enrichmentSources({ s: { tags: Array.from({ length: 20 }, (_, i) => `t${i}`) } });
		expect(src.fields[0].value.endsWith('(+5)')).toBe(true);
	});
});

describe('enrichmentLabel', () => {
	it('names known sources and humanises keys', () => {
		expect(enrichmentLabel('misp')).toBe('MISP');
		expect(enrichmentLabel('first_seen')).toBe('First seen');
	});
});
