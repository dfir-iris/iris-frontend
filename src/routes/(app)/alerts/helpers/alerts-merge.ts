import type { AlertsContext } from '$lib/contexts/alerts.context.svelte';
import type { CasesContext } from '$lib/contexts/cases.context.svelte';
import type { AlertIdentifier } from '$lib/services/alerts.service';
import type { MergeAlertPayload } from '../components/alerts-merge-dialog.svelte';

type MergeAlertsDeps = {
	alerts: AlertsContext;
	cases: CasesContext;
};

const getIocsImportList = (alert: { iocs?: Array<{ ioc_id: number }> }) =>
	(alert.iocs ?? []).map((ioc) => String(ioc.ioc_id));

const getAssetsImportList = (alert: { assets?: Array<{ asset_id: number }> }) =>
	(alert.assets ?? []).map((asset) => String(asset.asset_id));

export const mergeAlerts = async (
	{ alerts, cases }: MergeAlertsDeps,
	alertIds: AlertIdentifier[],
	payload: MergeAlertPayload
) => {
	if (payload.target_case_id !== null) {
		for (const alertId of alertIds) {
			const alert = await alerts.get(alertId);
			if (!alert) return null;

			const merged = await alerts.merge(alertId, {
				target_case_id: payload.target_case_id,
				note: payload.note,
				import_as_event: payload.import_as_event,
				iocs_import_list: getIocsImportList(alert),
				assets_import_list: getAssetsImportList(alert)
			});

			if (!merged) return null;
		}

		await cases.refresh();
		await alerts.refresh();

		return payload.target_case_id;
	}

	let createdCaseId: number | null = null;

	for (const alertId of alertIds) {
		const alert = await alerts.get(alertId);
		if (!alert) return null;

		const iocsImportList = getIocsImportList(alert);
		const assetsImportList = getAssetsImportList(alert);

		const escalated = await alerts.escalate(alertId, {
			case_title: payload.case_title,
			case_tags: payload.case_tags,
			case_template_id: payload.case_template_id ? String(payload.case_template_id) : undefined,
			import_as_event: payload.import_as_event,
			iocs_import_list: iocsImportList,
			assets_import_list: assetsImportList
		});

		if (!escalated) return null;

		if (createdCaseId === null) {
			createdCaseId = escalated.case_id;
			continue;
		}

		const merged = await alerts.merge(alertId, {
			target_case_id: createdCaseId,
			note: payload.note,
			import_as_event: payload.import_as_event,
			iocs_import_list: iocsImportList,
			assets_import_list: assetsImportList
		});

		if (!merged) return null;
	}

	await cases.refresh();
	await alerts.refresh();

	return createdCaseId;
};
