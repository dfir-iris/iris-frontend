<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Alert } from '$lib/types/resources/alert';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import {
		INVESTIGATION_FLOW_PANEL_CTX,
		type InvestigationFlowPanelContext
	} from '$lib/contexts/investigation-flow-panel.context.svelte';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import { current_user } from '$lib/stores/auth.store';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { AlertCard } from '../components/AlertCard';
	import AlertsReasignDialog from '../components/alerts-reasign-dialog.svelte';
	import AlertsCloseDialog from '../components/alerts-close-dialog.svelte';
	import AlertHistoryDialog from '../components/alert-history-dialog.svelte';
	import AlertEditDialog from '../components/alert-edit-dialog.svelte';
	import AlertsMergeDialog, {
		type MergeAlertPayload
	} from '../components/alerts-merge-dialog.svelte';
	import { loadAlertStatuses } from '../helpers/alert-status';
	import { mergeAlerts } from '../helpers/alerts-merge';
	import { closeAlerts } from '../helpers/alerts-close';
	import { assignAlertsToOwner, reassignAlertOwner } from '../helpers/alerts-assign';
	import { unlinkAlertCase } from '../helpers/alert-unlink';

	const alerts = getContext<AlertsContext>(ALERTS_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);
	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);
	const investigationFlowPanel = getContext<InvestigationFlowPanelContext>(
		INVESTIGATION_FLOW_PANEL_CTX
	);

	let alertPromise = $state<Promise<Alert | null> | null>(null);
	let alertStatuses = $state<AlertStatus[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);
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

	const updateAlert = async (alert_id: number, changes: UpdateAlertBody): Promise<Alert | null> =>
		await alerts.patch(alert_id, changes);

	const confirmReassign = async () => {
		if (!reassignAlert) return;

		await refreshConditionally(
			await reassignAlertOwner({ updateAlert }, reassignAlert.alert_id, {
				ownerId: reassignOwnerId
			})
		);
	};

	const assignToCurrentUser = async (alert: Alert) => {
		const nextOwnerId = $current_user?.id;

		const [updated] = await assignAlertsToOwner({ updateAlert }, [alert.alert_id], nextOwnerId);
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

	const setStatus = async (alert_status_id: number) =>
		await refreshConditionally(await updateAlert(alert_id, { alert_status_id }));

	const confirmMergeAlert = async (mergeAlertPayload: MergeAlertPayload) => {
		const { merged, failed } = await mergeAlerts(
			{ alerts, cases },
			[alert.alert_id],
			mergeAlertPayload
		);

		if (merged.length > 0) {
			refreshAlert();
		}

		if (failed.length > 0) {
			toast({
				title: 'Failed to merge alert',
				description: 'The alert was left unchanged.',
				variant: 'destructive'
			});
		}

		showAlertMerge = false;
	};

	const closeWithNote = async (changes: UpdateAlertBody) => {
		const [updated] = await closeAlerts({ updateAlert }, [alert_id], alertStatuses, changes);

		await refreshConditionally(updated ?? null);

		showAlertClose = false;
	};

	const unlinkCase = async (case_id: number) => {
		const updates = await unlinkAlertCase({ updateAlert }, alert, case_id);

		if (updates) {
			refreshAlert();
		}
	};

	const deleteAlert = async () => {
		if (!(await alerts.remove(alert_id))) {
			toast({
				title: 'Failed to delete alert',
				description: alerts.mutation.error ?? 'The alert was not deleted.',
				variant: 'destructive'
			});

			return;
		}

		goto('/alerts');
	};

	$effect(() => {
		refreshAlert();
	});

	onMount(async () => {
		alertStatuses = await loadAlertStatuses();
	});
</script>

<svelte:head>
	<title>Alert #{alert_id}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-8xl grow flex-col gap-4 p-4">
	{#await alertPromise}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">Loading...</div>
	{:then alert}
		{#if alert}
			<AlertCard
				{alert}
				{alertStatuses}
				onAssign={() => assign(alert)}
				onAssignToCurrentUser={() => assignToCurrentUser(alert)}
				onSetStatus={(s) => setStatus(s)}
				onShowInvestigationFlow={() =>
					investigationFlowPanel.open({
						id: alert.alert_id,
						label: alert.alert_title ?? `Alert #${alert.alert_id}`
					})}
				onShowEdit={() => (showAlertEdit = true)}
				onShowHistory={() => (showAlertHistory = true)}
				onShowComments={() =>
					commentsPanel.open({
						type: 'alerts',
						id: alert.alert_id,
						label: alert.alert_title ?? `Alert #${alert.alert_id}`
					})}
				onShowMerge={() => (showAlertMerge = true)}
				onShowClose={(withNote) => {
					if (withNote) {
						showAlertClose = true;
					} else {
						closeWithNote({});
					}
				}}
				onUnlinkCase={(case_id) => unlinkCase(case_id)}
				onDelete={() => (showConfirmDelete = true)}
				alwaysExpanded
			/>
		{/if}
	{/await}
</div>

{#if alert}
	<AlertHistoryDialog bind:open={showAlertHistory} onClose={() => {}} {alert} />

	<AlertsMergeDialog
		bind:open={showAlertMerge}
		selectedAlertIds={[alert_id]}
		selectedAlert={alert}
		onConfirm={confirmMergeAlert}
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
