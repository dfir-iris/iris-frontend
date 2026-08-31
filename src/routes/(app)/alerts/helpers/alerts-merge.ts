import type { AlertsContext } from '$lib/contexts/alerts.context.svelte';
import type { CasesContext } from '$lib/contexts/cases.context.svelte';
import type { AlertIdentifier } from '$lib/services/alerts.service';
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

const getIocsImportList = (alert: { iocs?: Array<{ ioc_id: number }> }) =>
	(alert.iocs ?? []).map((ioc) => String(ioc.ioc_id));

const getAssetsImportList = (alert: { assets?: Array<{ asset_id: number }> }) =>
	(alert.assets ?? []).map((asset) => String(asset.asset_id));

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
			iocs_import_list: getIocsImportList(alert),
			assets_import_list: getAssetsImportList(alert)
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
			iocs_import_list: getIocsImportList(alert),
			assets_import_list: getAssetsImportList(alert)
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
