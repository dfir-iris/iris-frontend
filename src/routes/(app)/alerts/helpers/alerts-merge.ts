import type { AlertsContext } from '$lib/contexts/alerts.context.svelte';
import type { CasesContext } from '$lib/contexts/cases.context.svelte';
import type { AlertIdentifier } from '$lib/services/alerts.service';
import type { Alert } from '$lib/types/resources/alert';
import type { MergeAlertPayload } from '../components/alerts-merge-dialog.svelte';

type MergeAlertsDeps = {
	alerts: AlertsContext;
	cases: CasesContext;
};

export type MergeAlertsResult = {
	caseId: number | null;
	merged: AlertIdentifier[];
	failed: AlertIdentifier[];
};

/**
 * One selectable row in the merge dialog. Alerts carry their own copy of
 * an IOC/asset, so the same value seen on several alerts has several
 * UUIDs; it is shown once and selecting it selects every copy.
 */
export type ImportGroup = {
	key: string;
	label: string;
	detail: string;
	uuids: string[];
};

type ImportableAlert = Pick<Alert, 'iocs' | 'assets'>;

const addToGroup = (
	groups: Map<string, ImportGroup>,
	key: string,
	label: string,
	detail: string,
	uuid: string
) => {
	const group = groups.get(key);
	if (group) {
		if (!group.uuids.includes(uuid)) group.uuids.push(uuid);
		return;
	}
	groups.set(key, { key, label, detail, uuids: [uuid] });
};

// Keyed the way the backend dedupes on merge: (type, value) for IOCs and
// (type, name) for assets.
export const groupImportableObservables = (
	alertsList: ImportableAlert[]
): { iocs: ImportGroup[]; assets: ImportGroup[] } => {
	const iocs = new Map<string, ImportGroup>();
	const assets = new Map<string, ImportGroup>();

	for (const alert of alertsList) {
		for (const ioc of alert.iocs ?? []) {
			addToGroup(
				iocs,
				`${ioc.ioc_type_id}|${ioc.ioc_value}`,
				ioc.ioc_value,
				ioc.ioc_type?.type_name ?? '',
				ioc.ioc_uuid
			);
		}
		for (const asset of alert.assets ?? []) {
			addToGroup(
				assets,
				`${asset.asset_type_id}|${asset.asset_name}`,
				asset.asset_name,
				[asset.asset_type?.asset_name, asset.asset_ip].filter(Boolean).join(' · '),
				asset.asset_uuid
			);
		}
	}

	return { iocs: [...iocs.values()], assets: [...assets.values()] };
};

// The backend matches import lists against `ioc_uuid` / `asset_uuid`, not
// the numeric ids — sending ids silently imports nothing into the case.
// `selected` is the user's pick from the dialog; when absent, everything
// on the alert is imported.
const keepSelected = (uuids: string[], selected?: string[]) => {
	if (!selected) return uuids;
	const wanted = new Set(selected);
	return uuids.filter((uuid) => wanted.has(uuid));
};

const getIocsImportList = (alert: ImportableAlert, selected?: string[]) =>
	keepSelected(
		(alert.iocs ?? []).map((ioc) => ioc.ioc_uuid),
		selected
	);

const getAssetsImportList = (alert: ImportableAlert, selected?: string[]) =>
	keepSelected(
		(alert.assets ?? []).map((asset) => asset.asset_uuid),
		selected
	);

export const mergeAlerts = async (
	{ alerts, cases }: MergeAlertsDeps,
	alertIds: AlertIdentifier[],
	payload: MergeAlertPayload
): Promise<MergeAlertsResult> => {
	const merged: AlertIdentifier[] = [];
	const failed: AlertIdentifier[] = [];

	const mergeInto = async (targetCaseId: number, alertId: AlertIdentifier) => {
		const alert = await alerts.get(alertId);

		if (!alert) {
			failed.push(alertId);
			return;
		}

		const result = await alerts.merge(alertId, {
			target_case_id: targetCaseId,
			note: payload.note,
			import_as_event: payload.import_as_event,
			iocs_import_list: getIocsImportList(alert, payload.iocs_import_list),
			assets_import_list: getAssetsImportList(alert, payload.assets_import_list)
		});

		if (result) merged.push(alertId);
		else failed.push(alertId);
	};

	const settle = async (caseId: number | null): Promise<MergeAlertsResult> => {
		if (merged.length > 0) {
			await cases.refresh();
			await alerts.refresh();
		}

		return { caseId, merged, failed };
	};

	if (payload.target_case_id !== null) {
		for (const alertId of alertIds) {
			await mergeInto(payload.target_case_id, alertId);
		}

		return settle(payload.target_case_id);
	}

	let createdCaseId: number | null = null;

	for (const alertId of alertIds) {
		if (createdCaseId !== null) {
			await mergeInto(createdCaseId, alertId);
			continue;
		}

		const alert = await alerts.get(alertId);

		if (!alert) {
			failed.push(alertId);
			continue;
		}

		const escalated = await alerts.escalate(alertId, {
			case_title: payload.case_title,
			case_tags: payload.case_tags,
			case_template_id: payload.case_template_id ? String(payload.case_template_id) : undefined,
			import_as_event: payload.import_as_event,
			iocs_import_list: getIocsImportList(alert, payload.iocs_import_list),
			assets_import_list: getAssetsImportList(alert, payload.assets_import_list)
		});

		if (!escalated) {
			failed.push(alertId);
			continue;
		}

		createdCaseId = escalated.case_id;
		merged.push(alertId);
	}

	return settle(createdCaseId);
};
