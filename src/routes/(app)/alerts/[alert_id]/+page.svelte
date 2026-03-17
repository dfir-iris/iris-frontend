<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Alert } from '$lib/types/resources/alert';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RequestResponse } from '$lib/services/api.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import { AlertStatusService, type AlertStatus } from '$lib/services/alert-status.service';
	import { current_user } from '$lib/stores/auth.store';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { AlertCard } from '../components/AlertCard';
	import AlertsReasignDialog from '../components/alerts-reasign-dialog.svelte';
	import AlertsCloseDialog from '../components/alerts-close-dialog.svelte';
	import AlertHistoryDialog from '../components/alert-history-dialog.svelte';
	import AlertEditDialog from '../components/alert-edit-dialog.svelte';
	import AlertCommentsDialog from '../components/alert-comments-dialog.svelte';
	import AlertsMergeDialog, {
		type MergeAlertsPayload
	} from '../components/alerts-merge-dialog.svelte';

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	let alertPromise = $state<Promise<Alert | null> | null>(null);
	let alertStatuses = $state<AlertStatus[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);
	let showAlertComments = $state(false);
	let showAlertMerge = $state(false);
	let showAlertClose = $state(false);

	let alert_id = $derived(Number(page.params.alert_id));
	let alert = $derived(alerts.byId[alert_id]);

	const refreshAlert = () => {
		if (alert_id) {
			alertPromise = alerts.get(alert_id);
		}
	};

	const openReassignDialog = (alert?: Alert) => {
		if (alert) {
			reassignAlert = alert;
			reassignOwnerId = String(alert.alert_owner_id ?? '');
		}

		reassignOpen = true;
	};

	const refreshConditionally = async (update: Alert | null) => {
		if (update) {
			reassignOpen = false;
			reassignAlert = null;
			reassignOwnerId = '';

			refreshAlert();
		}
	};

	const updateAlert = async (alert_id: number, changes: UpdateAlertBody): Promise<Alert | null> => {
		return await alerts.patch(alert_id, changes);
	};

	const confirmReassign = async () => {
		if (!reassignAlert) return;

		await refreshConditionally(
			await updateAlert(reassignAlert.alert_id, { alert_owner_id: Number(reassignOwnerId) })
		);
	};

	const assignToCurrentUser = async (alert: Alert) => {
		const nextOwnerId = $current_user?.id;

		const updated = await updateAlert(alert.alert_id, { alert_owner_id: nextOwnerId });
		if (!updated) {
			refreshAlert();
		}
	};

	const assign = async (alert: Alert) => {
		if (!$current_user) return;

		if (alert.alert_owner_id) {
			openReassignDialog(alert);
			return;
		}

		await assignToCurrentUser(alert);
	};

	const setStatus = async (alert_status_id: number) => {
		await refreshConditionally(await updateAlert(alert_id, { alert_status_id }));
	};

	const mergeAlert = async (mergeAlertPayload: MergeAlertsPayload) => {
		console.log('merging:', mergeAlertPayload);

		showAlertMerge = false;
	};

	const closeWithNote = async (changes: UpdateAlertBody) => {
		const closedStatusId = alertStatuses.find(
			(alertStatus) => alertStatus.status_name.toLowerCase() === 'closed'
		)?.status_id;

		await refreshConditionally(
			await updateAlert(alert_id, {
				...changes,
				alert_status_id: closedStatusId,
				alert_resolution_status_id: changes.alert_resolution_status_id,
				alert_note: changes.alert_note,
				alert_tags: changes.alert_tags
			})
		);

		showAlertClose = false;
	};

	const deleteAlert = async () => {
		if (await alerts.remove(alert_id)) {
			goto('/alerts');
		}
	};

	$effect(() => {
		refreshAlert();
	});

	onMount(async () => {
		const alertStatusResponse = (await AlertStatusService.list())
			.data as unknown as RequestResponse<AlertStatus[]>;

		alertStatuses = alertStatusResponse.data as AlertStatus[];
	});
</script>

<svelte:head>
	<title>Alert | DFIR-IRIS</title>
</svelte:head>

<div class="flex grow flex-col gap-4 p-4">
	{#await alertPromise}
		<h1>Loading...</h1>
	{:then alert}
		{#if alert}
			<h1>Alert #{alert.alert_id}</h1>

			<ul class="flex flex-col gap-4">
				<li class="flex items-center gap-4">
					<AlertCard
						{alert}
						{alertStatuses}
						onAssign={() => assign(alert)}
						onAssignToCurrentUser={() => assignToCurrentUser(alert)}
						onSetStatus={(s) => setStatus(s)}
						onShowEdit={() => (showAlertEdit = true)}
						onShowHistory={() => (showAlertHistory = true)}
						onShowComments={() => (showAlertComments = true)}
						onShowMerge={() => (showAlertMerge = true)}
						onDelete={() => (showConfirmDelete = true)}
						alwaysExpanded
					/>
				</li>
			</ul>
		{/if}
	{/await}
</div>

{#if alert}
	<AlertHistoryDialog bind:open={showAlertHistory} onClose={() => {}} {alert} />

	<AlertsMergeDialog
		bind:open={showAlertMerge}
		selectedAlertIds={[alert_id]}
		onConfirm={mergeAlert}
		onClose={() => {}}
	/>

	<AlertEditDialog
		bind:open={showAlertEdit}
		onClose={() => {}}
		onSave={async (changes) => {
			await refreshConditionally(await updateAlert(alert_id, changes));

			showAlertEdit = false;
		}}
		{alert}
	/>

	<AlertCommentsDialog bind:open={showAlertComments} onClose={refreshAlert} {alert} />
{/if}

<AlertsReasignDialog
	bind:open={reassignOpen}
	alert={reassignAlert}
	ownerId={reassignOwnerId}
	onOwnerIdChange={(ownerId) => (reassignOwnerId = ownerId)}
	onConfirm={confirmReassign}
/>

<AlertsCloseDialog
	bind:open={showAlertClose}
	selectedAlertIds={[alert_id]}
	onConfirm={closeWithNote}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={deleteAlert}
	onCancel={() => (showConfirmDelete = false)}
/>
