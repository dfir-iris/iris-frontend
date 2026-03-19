import type { Alert } from '$lib/types/resources/alert';
import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';

type AlertOwnerDeps = {
	updateAlert: (alertId: AlertIdentifier, changes: UpdateAlertBody) => Promise<Alert | null>;
};

type ReassignAlertPayload = {
	ownerId: string;
};

export const assignAlertsToOwner = async (
	{ updateAlert }: AlertOwnerDeps,
	alertIds: AlertIdentifier[],
	alert_owner_id: UpdateAlertBody['alert_owner_id']
) => await Promise.all(alertIds.map((alertId) => updateAlert(alertId, { alert_owner_id })));

export const reassignAlertOwner = async (
	{ updateAlert }: AlertOwnerDeps,
	alertId: AlertIdentifier,
	payload: ReassignAlertPayload
) =>
	await updateAlert(alertId, {
		alert_owner_id: Number(payload.ownerId)
	});
