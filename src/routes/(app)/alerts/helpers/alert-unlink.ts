import type { Alert } from '$lib/types/resources/alert';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';

type UnlinkAlertCaseDeps = {
	updateAlert: (alertId: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;
};

export const unlinkAlertCase = async (
	{ updateAlert }: UnlinkAlertCaseDeps,
	alert: Alert,
	caseId: number
) => {
	return await updateAlert(alert.alert_id, {
		cases: alert.cases.filter((id) => id !== caseId)
	});
};
