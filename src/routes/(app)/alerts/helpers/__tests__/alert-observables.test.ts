import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/alerts.service', () => ({
	AlertService: {
		updateIoc: vi.fn(),
		updateAsset: vi.fn()
	}
}));

import type { Alert } from '$lib/types/resources/alert';
import type { Asset } from '$lib/types/resources/asset';
import type { Ioc } from '$lib/types/resources/ioc';
import { AlertService } from '$lib/services/alerts.service';
import {
	alertAssetChanges,
	alertAssetForm,
	alertIocChanges,
	alertIocForm,
	hasChanges,
	parseEnrichment,
	saveAlertAsset,
	saveAlertIoc
} from '../alert-observables';

const ioc = (overrides: Partial<Ioc> = {}): Ioc =>
	({
		ioc_id: 7,
		ioc_value: 'evil.example.com',
		ioc_type_id: 3,
		ioc_tlp_id: 2,
		ioc_description: null,
		ioc_tags: null,
		ioc_enrichment: null,
		...overrides
	}) as Ioc;

const asset = (overrides: Partial<Asset> = {}): Asset =>
	({
		asset_id: 4,
		asset_name: 'WKS-01',
		asset_type_id: 9,
		asset_description: '',
		asset_domain: '',
		asset_ip: '',
		asset_tags: '',
		asset_enrichment: null,
		...overrides
	}) as Asset;

describe('parseEnrichment', () => {
	it('reads an empty field as "drop the enrichment"', () => {
		expect(parseEnrichment('')).toEqual({ ok: true, value: null });
		expect(parseEnrichment('   \n ')).toEqual({ ok: true, value: null });
	});

	it('accepts a JSON object', () => {
		expect(parseEnrichment('{"vt": {"malicious": 3}}')).toEqual({
			ok: true,
			value: { vt: { malicious: 3 } }
		});
	});

	it('rejects malformed JSON and says what is wrong', () => {
		const result = parseEnrichment('{"vt": ');

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.error.length).toBeGreaterThan(0);
	});

	it('rejects valid JSON that is not an object — the column holds a mapping', () => {
		expect(parseEnrichment('[1, 2]').ok).toBe(false);
		expect(parseEnrichment('42').ok).toBe(false);
		expect(parseEnrichment('"text"').ok).toBe(false);
		expect(parseEnrichment('null').ok).toBe(false);
	});
});

describe('alertIocForm', () => {
	it('turns the nullable columns into editable text', () => {
		expect(alertIocForm(ioc())).toEqual({
			ioc_value: 'evil.example.com',
			ioc_type_id: 3,
			ioc_tlp_id: 2,
			ioc_description: '',
			ioc_tags: '',
			ioc_enrichment: ''
		});
	});

	it('pretty-prints the enrichment so it can be read and edited', () => {
		const form = alertIocForm(ioc({ ioc_enrichment: { vt: { malicious: 3 } } }));

		expect(form.ioc_enrichment).toBe(JSON.stringify({ vt: { malicious: 3 } }, null, 2));
	});
});

describe('alertIocChanges', () => {
	it('sends nothing when nothing was touched', () => {
		const current = ioc({ ioc_description: 'known bad', ioc_tags: 'c2' });
		const changes = alertIocChanges(current, alertIocForm(current), null);

		expect(changes).toEqual({});
		expect(hasChanges(changes)).toBe(false);
	});

	it('sends only the fields the analyst edited', () => {
		const current = ioc();
		const changes = alertIocChanges(
			current,
			{ ...alertIocForm(current), ioc_description: 'seen in proxy logs' },
			null
		);

		expect(changes).toEqual({ ioc_description: 'seen in proxy logs' });
	});

	it('treats a null column and an empty field as the same value', () => {
		const current = ioc({ ioc_description: null, ioc_tags: null });

		expect(alertIocChanges(current, alertIocForm(current), null)).toEqual({});
	});

	it('leaves an unchanged enrichment out, and sends null when it is cleared', () => {
		const current = ioc({ ioc_enrichment: { vt: { malicious: 3 } } });
		const form = alertIocForm(current);

		expect(alertIocChanges(current, form, { vt: { malicious: 3 } })).toEqual({});
		expect(alertIocChanges(current, form, null)).toEqual({ ioc_enrichment: null });
	});

	it('ignores an unset type or TLP rather than blanking the column', () => {
		const current = ioc();
		const changes = alertIocChanges(
			current,
			{ ...alertIocForm(current), ioc_type_id: null, ioc_tlp_id: null },
			null
		);

		expect(changes).toEqual({});
	});
});

describe('alertAssetChanges', () => {
	it('sends only the fields the analyst edited', () => {
		const current = asset();
		const changes = alertAssetChanges(
			current,
			{ ...alertAssetForm(current), asset_ip: '10.0.0.5', asset_description: 'jump host' },
			null
		);

		expect(changes).toEqual({ asset_ip: '10.0.0.5', asset_description: 'jump host' });
	});

	it('sends the enrichment when it is replaced', () => {
		const current = asset({ asset_enrichment: { edr: 'clean' } });
		const changes = alertAssetChanges(current, alertAssetForm(current), { edr: 'isolated' });

		expect(changes).toEqual({ asset_enrichment: { edr: 'isolated' } });
	});
});

describe('saveAlertIoc', () => {
	it('patches the server row onto the alert, keeping fields the route did not dump', async () => {
		const alert = {
			alert_id: 10,
			iocs: [ioc({ ioc_id: 7, link: [{ case_id: 1 }] as unknown as Ioc['link'] })],
			assets: []
		} as unknown as Alert;

		(AlertService.updateIoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: ioc({ ioc_id: 7, ioc_description: 'seen in proxy logs' })
		});

		const updated = await saveAlertIoc(alert, 7, { ioc_description: 'seen in proxy logs' });

		expect(updated?.ioc_description).toBe('seen in proxy logs');
		expect(alert.iocs[0].ioc_description).toBe('seen in proxy logs');
		expect(alert.iocs[0].link).toEqual([{ case_id: 1 }]);
	});

	it('leaves the alert untouched and reports null when the save is refused', async () => {
		const alert = {
			alert_id: 10,
			iocs: [ioc({ ioc_id: 7 })],
			assets: []
		} as unknown as Alert;

		(AlertService.updateIoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 403,
			data: null,
			error: { message: 'Permission denied', type: 'error', status: 403 }
		});

		const updated = await saveAlertIoc(alert, 7, { ioc_description: 'nope' });

		expect(updated).toBeNull();
		expect(alert.iocs[0].ioc_description).toBeNull();
	});
});

describe('saveAlertAsset', () => {
	it('patches the server row onto the alert', async () => {
		const alert = {
			alert_id: 10,
			iocs: [],
			assets: [asset({ asset_id: 4, alerts: [{ alert_id: 10 }] })]
		} as unknown as Alert;

		(AlertService.updateAsset as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			// The alert route dumps assets without their `alerts` list.
			data: asset({ asset_id: 4, asset_description: 'jump host' })
		});

		const updated = await saveAlertAsset(alert, 4, { asset_description: 'jump host' });

		expect(updated?.asset_description).toBe('jump host');
		expect(alert.assets[0].asset_description).toBe('jump host');
		expect(alert.assets[0].alerts).toEqual([{ alert_id: 10 }]);
	});
});
