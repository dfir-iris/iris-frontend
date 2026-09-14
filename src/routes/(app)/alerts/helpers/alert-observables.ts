import type { Alert } from '$lib/types/resources/alert';
import type { Asset } from '$lib/types/resources/asset';
import type { Ioc } from '$lib/types/resources/ioc';
import {
	AlertService,
	type UpdateAlertAssetBody,
	type UpdateAlertIocBody
} from '$lib/services/alerts.service';
import { toast } from '$lib/components/ui/toast';

/** What the IOC edit dialog holds while the analyst types. */
export type AlertIocForm = {
	ioc_value: string;
	ioc_type_id: number | null;
	ioc_tlp_id: number | null;
	ioc_description: string;
	ioc_tags: string;
	/** Raw JSON text — parsed only when it is about to be sent. */
	ioc_enrichment: string;
};

/** Same, for assets. */
export type AlertAssetForm = {
	asset_name: string;
	asset_type_id: number | null;
	asset_description: string;
	asset_domain: string;
	asset_ip: string;
	asset_tags: string;
	asset_enrichment: string;
};

export type EnrichmentParse =
	| { ok: true; value: Record<string, unknown> | null }
	| { ok: false; error: string };

/**
 * Enrichment is free-form JSON written by modules. The analyst edits it
 * as text, so it has to be parsed back before being sent — and an object
 * is the only thing the column is allowed to hold: a bare `4` or `"x"`
 * is valid JSON but not an enrichment payload, and would come back from
 * the API as something no reader of the field expects.
 */
export const parseEnrichment = (text: string): EnrichmentParse => {
	const trimmed = text.trim();

	// Cleared field — the API takes null and drops whatever was there.
	if (!trimmed) return { ok: true, value: null };

	let parsed: unknown;

	try {
		parsed = JSON.parse(trimmed);
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return { ok: false, error: 'Enrichment must be a JSON object.' };
	}

	return { ok: true, value: parsed as Record<string, unknown> };
};

const formatEnrichment = (enrichment: unknown): string => {
	if (enrichment === null || enrichment === undefined) return '';

	try {
		return JSON.stringify(enrichment, null, 2);
	} catch {
		return '';
	}
};

const sameEnrichment = (current: unknown, next: Record<string, unknown> | null): boolean => {
	const currentIsEmpty = current === null || current === undefined;

	if (currentIsEmpty || next === null) return currentIsEmpty && next === null;

	return JSON.stringify(current) === JSON.stringify(next);
};

export const alertIocForm = (ioc: Ioc): AlertIocForm => ({
	ioc_value: ioc.ioc_value ?? '',
	ioc_type_id: ioc.ioc_type_id ?? null,
	ioc_tlp_id: ioc.ioc_tlp_id ?? null,
	ioc_description: ioc.ioc_description ?? '',
	ioc_tags: ioc.ioc_tags ?? '',
	ioc_enrichment: formatEnrichment(ioc.ioc_enrichment)
});

export const alertAssetForm = (asset: Asset): AlertAssetForm => ({
	asset_name: asset.asset_name ?? '',
	asset_type_id: asset.asset_type_id ?? null,
	asset_description: asset.asset_description ?? '',
	asset_domain: asset.asset_domain ?? '',
	asset_ip: asset.asset_ip ?? '',
	asset_tags: asset.asset_tags ?? '',
	asset_enrichment: formatEnrichment(asset.asset_enrichment)
});

/**
 * The fields the analyst actually touched. Sending the untouched ones
 * back would have the server record them as modifications in the alert's
 * history — the timeline is meant to say what changed, not what was on
 * screen when Save was pressed.
 */
export const alertIocChanges = (
	ioc: Ioc,
	form: AlertIocForm,
	enrichment: Record<string, unknown> | null
): UpdateAlertIocBody => {
	const changes: UpdateAlertIocBody = {};

	if (form.ioc_value !== (ioc.ioc_value ?? '')) changes.ioc_value = form.ioc_value;
	if (form.ioc_type_id !== null && form.ioc_type_id !== ioc.ioc_type_id) {
		changes.ioc_type_id = form.ioc_type_id;
	}
	if (form.ioc_tlp_id !== null && form.ioc_tlp_id !== ioc.ioc_tlp_id) {
		changes.ioc_tlp_id = form.ioc_tlp_id;
	}
	if (form.ioc_description !== (ioc.ioc_description ?? '')) {
		changes.ioc_description = form.ioc_description;
	}
	if (form.ioc_tags !== (ioc.ioc_tags ?? '')) changes.ioc_tags = form.ioc_tags;
	if (!sameEnrichment(ioc.ioc_enrichment, enrichment)) changes.ioc_enrichment = enrichment;

	return changes;
};

export const alertAssetChanges = (
	asset: Asset,
	form: AlertAssetForm,
	enrichment: Record<string, unknown> | null
): UpdateAlertAssetBody => {
	const changes: UpdateAlertAssetBody = {};

	if (form.asset_name !== (asset.asset_name ?? '')) changes.asset_name = form.asset_name;
	if (form.asset_type_id !== null && form.asset_type_id !== asset.asset_type_id) {
		changes.asset_type_id = form.asset_type_id;
	}
	if (form.asset_description !== (asset.asset_description ?? '')) {
		changes.asset_description = form.asset_description;
	}
	if (form.asset_domain !== (asset.asset_domain ?? '')) changes.asset_domain = form.asset_domain;
	if (form.asset_ip !== (asset.asset_ip ?? '')) changes.asset_ip = form.asset_ip;
	if (form.asset_tags !== (asset.asset_tags ?? '')) changes.asset_tags = form.asset_tags;
	if (!sameEnrichment(asset.asset_enrichment, enrichment)) changes.asset_enrichment = enrichment;

	return changes;
};

export const hasChanges = (changes: object): boolean => Object.keys(changes).length > 0;

/**
 * Writes the server's row back onto the alert. The rows are merged
 * rather than replaced: the alert routes dump the object through the
 * IOC/asset schemas, which carry slightly less than the alert's own
 * nested dump (an asset comes back without its `alerts` list), and the
 * card reads some of those fields.
 */
const mergeIoc = (alert: Alert, updated: Ioc) => {
	const index = alert.iocs.findIndex((ioc) => ioc.ioc_id === updated.ioc_id);

	if (index >= 0) alert.iocs[index] = { ...alert.iocs[index], ...updated };
};

const mergeAsset = (alert: Alert, updated: Asset) => {
	const index = alert.assets.findIndex((asset) => asset.asset_id === updated.asset_id);

	if (index >= 0) alert.assets[index] = { ...alert.assets[index], ...updated };
};

/**
 * Saves an alert IOC and patches it into `alert` in place. Returns the
 * server's row, or null after saying why it failed — a silent no-op on
 * a permission or validation error reads as "it saved", and an analyst
 * documenting an observable has to be able to trust that it did.
 */
export const saveAlertIoc = async (
	alert: Alert,
	iocId: number,
	changes: UpdateAlertIocBody
): Promise<Ioc | null> => {
	const response = await AlertService.updateIoc(alert.alert_id, iocId, changes);

	if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
		mergeIoc(alert, response.data);

		return response.data;
	}

	toast({
		title: 'Could not update the IOC',
		description: response.error?.message ?? 'The change was not saved.',
		variant: 'destructive'
	});

	return null;
};

/** See `saveAlertIoc`. */
export const saveAlertAsset = async (
	alert: Alert,
	assetId: number,
	changes: UpdateAlertAssetBody
): Promise<Asset | null> => {
	const response = await AlertService.updateAsset(alert.alert_id, assetId, changes);

	if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
		mergeAsset(alert, response.data);

		return response.data;
	}

	toast({
		title: 'Could not update the asset',
		description: response.error?.message ?? 'The change was not saved.',
		variant: 'destructive'
	});

	return null;
};
