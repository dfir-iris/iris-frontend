import { AlertStatusService, type AlertStatus } from '$lib/services/alert-status.service';
import type { RequestResponse } from '$lib/services/api.service';

export const loadAlertStatuses = async (): Promise<AlertStatus[]> => {
	const response = (await AlertStatusService.list()).data as unknown as RequestResponse<
		AlertStatus[]
	>;
	return (response.data as AlertStatus[]) ?? [];
};

export const getAlertStatusIdByName = (alertStatuses: AlertStatus[], statusName: string) =>
	alertStatuses.find(
		(alertStatus) => alertStatus.status_name.toLowerCase() === statusName.toLowerCase()
	)?.status_id;

export const getClosedAlertStatusId = (alertStatuses: AlertStatus[]) =>
	getAlertStatusIdByName(alertStatuses, 'closed');
