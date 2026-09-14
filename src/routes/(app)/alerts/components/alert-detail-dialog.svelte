<!--
  Full alert detail in a modal.

  The triage board opens alerts here rather than navigating to
  `/alerts/{id}`: leaving the board loses the column layout, the eager
  page of alerts behind it and the analyst's place in the queue, all to
  read one card. The body is the very same `AlertCard` the dedicated
  page renders (`alwaysExpanded`), so the two stay in step.

  Writes go straight through `AlertService` instead of
  `alerts.patch`, which optimistically merges the change into the store
  and would leave a rejected edit looking applied. The fresh row is kept
  locally and handed to `onUpdated` so the opener can resync its own
  copy — the board drops cards that leave triage that way.
-->
<script lang="ts">
	import { getContext, untrack } from 'svelte';
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
	import type { AlertIdentifier, UpdateAlertBody } from '$lib/services/alerts.service';
	import { AlertService } from '$lib/services/alerts.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import type { Alert } from '$lib/types/resources/alert';
	import { current_user } from '$lib/stores/auth.store';
	import * as Dialog from '$lib/components/ui/dialog';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { AlertCard } from './AlertCard';
	import AlertEditDialog from './alert-edit-dialog.svelte';
	import AlertHistoryDialog from './alert-history-dialog.svelte';
	import AlertsCloseDialog from './alerts-close-dialog.svelte';
	import AlertsMergeDialog, { type MergeAlertPayload } from './alerts-merge-dialog.svelte';
	import AlertsReasignDialog from './alerts-reasign-dialog.svelte';
	import { assignAlertsToOwner, reassignAlertOwner } from '../helpers/alerts-assign';
	import { closeAlerts } from '../helpers/alerts-close';
	import { mergeAlerts } from '../helpers/alerts-merge';
	import { unlinkAlertCase } from '../helpers/alert-unlink';

	type Props = {
		open: boolean;
		alertId: number | null;
		alertStatuses: AlertStatus[];
		/** Every server-confirmed change, so the opener can resync its row. */
		onUpdated?: (alert: Alert) => void;
		onDeleted?: (alertId: number) => void;
	};

	let { open = $bindable(), alertId, alertStatuses, onUpdated, onDeleted }: Props = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);
	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);
	const investigationFlowPanel = getContext<InvestigationFlowPanelContext>(
		INVESTIGATION_FLOW_PANEL_CTX
	);

	let alert = $state<Alert | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let reassignOpen = $state(false);
	let reassignOwnerId = $state('');
	let showEdit = $state(false);
	let showHistory = $state(false);
	let showMerge = $state(false);
	let showClose = $state(false);
	let showConfirmDelete = $state(false);

	// Guards against a slow fetch for an alert the analyst has already
	// navigated away from landing on top of a newer one.
	let requestSeq = 0;

	const fetchAlert = async (id: number) => {
		const seq = ++requestSeq;

		// Opening a *different* alert must not show the previous one's
		// body while the new one loads. The read is untracked so this
		// stays a one-way write as far as the effect below is concerned.
		if (untrack(() => alert)?.alert_id !== id) alert = null;

		loading = true;
		loadError = null;

		const fetched = await alerts.get(id);

		if (seq !== requestSeq) return;

		alert = fetched;
		loadError = fetched ? null : 'This alert could not be loaded.';
		loading = false;
	};

	// Deliberately does not clear `alert` on close: the dialog fades out
	// over ~200ms and emptying it first turns that into a blank box.
	$effect(() => {
		const id = alertId;

		if (!open || id == null) return;

		void fetchAlert(id);
	});

	/**
	 * Shared write path for the card and the helper modules. Returns the
	 * server's row on success and `null` on failure, after saying so —
	 * a silent no-op on a permission or validation error reads as "the
	 * change didn't take", which is exactly what it must not read as.
	 */
	const updateAlert = async (
		id: AlertIdentifier,
		changes: UpdateAlertBody
	): Promise<Alert | null> => {
		const response = await AlertService.update(id, changes);

		if (response.ok && !response.error && response.data && typeof response.data !== 'string') {
			const updated = response.data;
			if (updated.alert_id === alertId) alert = updated;
			onUpdated?.(updated);
			return updated;
		}

		toast({
			title: 'Could not update alert',
			description: response.error?.message ?? 'The change was not saved.',
			variant: 'destructive'
		});

		return null;
	};

	const assignToCurrentUser = async (target: Alert) => {
		const ownerId = $current_user?.id;
		if (ownerId == null) return;

		await assignAlertsToOwner({ updateAlert }, [target.alert_id], ownerId);
	};

	const assign = async (target: Alert) => {
		if (!$current_user) return;

		if (target.alert_owner_id) {
			reassignOwnerId = String(target.alert_owner_id ?? '');
			reassignOpen = true;
			return;
		}

		await assignToCurrentUser(target);
	};

	const confirmReassign = async () => {
		if (!alert) return;

		const updated = await reassignAlertOwner({ updateAlert }, alert.alert_id, {
			ownerId: reassignOwnerId
		});

		if (updated) {
			reassignOpen = false;
			reassignOwnerId = '';
		}
	};

	const setStatus = async (alert_status_id: number) => {
		if (!alert) return;
		await updateAlert(alert.alert_id, { alert_status_id });
	};

	const closeWithNote = async (changes: UpdateAlertBody) => {
		if (!alert) return;

		const [updated] = await closeAlerts({ updateAlert }, [alert.alert_id], alertStatuses, changes);

		showClose = false;

		// Closing takes the alert out of triage, so there is nothing left
		// to read here.
		if (updated) open = false;
	};

	const confirmMerge = async (payload: MergeAlertPayload) => {
		if (!alert) return;

		const { failed } = await mergeAlerts({ alerts, cases }, [alert.alert_id], payload);

		showMerge = false;

		if (failed.length > 0) {
			toast({
				title: 'Failed to merge alert',
				description: 'The alert was left unchanged.',
				variant: 'destructive'
			});
			return;
		}

		// Merge / escalation is applied server-side, so the local row is
		// stale — refetch before telling the opener what changed.
		const fresh = await alerts.get(alert.alert_id);
		if (fresh) onUpdated?.(fresh);

		open = false;
	};

	const unlinkCase = async (case_id: number) => {
		if (!alert) return;
		await unlinkAlertCase({ updateAlert }, alert, case_id);
	};

	const deleteAlert = async () => {
		if (!alert) return;

		const removedId = alert.alert_id;
		const removed = await alerts.remove(removedId);

		showConfirmDelete = false;

		if (!removed) {
			toast({
				title: 'Could not delete alert',
				description: alerts.mutation.error ?? 'The alert was not deleted.',
				variant: 'destructive'
			});

			return;
		}

		onDeleted?.(removedId);
		open = false;
	};

	/**
	 * The comments and investigation-flow panels dock to the side of the
	 * app shell, which a modal overlay would sit on top of. Stepping out
	 * of the modal first is the only way both are usable.
	 */
	const openComments = (target: Alert) => {
		open = false;
		commentsPanel.open({
			type: 'alerts',
			id: target.alert_id,
			label: target.alert_title ?? `Alert #${target.alert_id}`
		});
	};

	const openInvestigationFlow = (target: Alert) => {
		open = false;
		investigationFlowPanel.open({
			id: target.alert_id,
			label: target.alert_title ?? `Alert #${target.alert_id}`
		});
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] w-[95vw] max-w-[1200px] flex-col gap-0 p-0">
		<Dialog.Header class="border-b px-6 py-4 pr-14">
			<Dialog.Title class="text-base font-medium">
				{alert ? `Alert #${alert.alert_id}` : 'Alert'}
			</Dialog.Title>
			{#if alert?.alert_title}
				<Dialog.Description class="truncate">{alert.alert_title}</Dialog.Description>
			{/if}
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-y-auto p-4">
			{#if loading && !alert}
				<div class="flex flex-col gap-3">
					<Skeleton class="h-24 w-full rounded-lg" />
					<Skeleton class="h-64 w-full rounded-lg" />
				</div>
			{:else if loadError && !alert}
				<div class="flex flex-col items-center justify-center gap-3 py-10">
					<p class="text-sm text-muted-foreground">{loadError}</p>
					{#if alertId != null}
						<Button variant="outline" size="xs" onclick={() => fetchAlert(alertId)}>Retry</Button>
					{/if}
				</div>
			{:else if alert}
				{@const current = alert}
				<AlertCard
					alert={current}
					{alertStatuses}
					alwaysExpanded
					onAssign={() => assign(current)}
					onAssignToCurrentUser={() => assignToCurrentUser(current)}
					onSetStatus={(status_id) => setStatus(status_id)}
					onShowEdit={() => (showEdit = true)}
					onShowHistory={() => (showHistory = true)}
					onShowComments={() => openComments(current)}
					onShowMerge={() => (showMerge = true)}
					onShowClose={(withNote) => {
						if (withNote) {
							showClose = true;
						} else {
							void closeWithNote({});
						}
					}}
					onShowInvestigationFlow={() => openInvestigationFlow(current)}
					onUnlinkCase={(case_id) => unlinkCase(case_id)}
					onDelete={() => (showConfirmDelete = true)}
				/>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!--
  Kept outside the detail dialog: every one of these portals to the
  body, and nesting them inside its content would put a dialog inside
  another dialog's focus trap.
-->
{#if alert}
	{@const current = alert}
	<AlertHistoryDialog bind:open={showHistory} onClose={() => {}} alert={current} />

	<AlertEditDialog
		bind:open={showEdit}
		onClose={() => {}}
		onSave={async (changes) => {
			if (await updateAlert(current.alert_id, changes)) showEdit = false;
		}}
		alert={current}
	/>

	<AlertsMergeDialog
		bind:open={showMerge}
		selectedAlertIds={[current.alert_id]}
		selectedAlert={current}
		onConfirm={confirmMerge}
		onClose={() => {}}
	/>

	<AlertsCloseDialog
		bind:open={showClose}
		selectedAlertIds={[current.alert_id]}
		onConfirm={closeWithNote}
	/>

	<AlertsReasignDialog
		bind:open={reassignOpen}
		alert={current}
		ownerId={reassignOwnerId}
		onOwnerIdChange={(ownerId) => (reassignOwnerId = ownerId)}
		onConfirm={confirmReassign}
	/>
{/if}

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={deleteAlert}
	onCancel={() => (showConfirmDelete = false)}
/>
