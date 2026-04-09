import { type AlertStatus } from '$lib/services/alert-status.service';

export const getAlertStatusIdByName = (alertStatuses: AlertStatus[], statusName: string) =>
	alertStatuses.find(
		(alertStatus) => alertStatus.status_name.toLowerCase() === statusName.toLowerCase()
	)?.status_id;

export const getClosedAlertStatusId = (alertStatuses: AlertStatus[]) =>
	getAlertStatusIdByName(alertStatuses, 'closed');
