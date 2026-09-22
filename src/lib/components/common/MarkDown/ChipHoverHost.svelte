<!--
  Reusable hover-popover + detail-dialog host for .mention-chip elements
  inside its slot. Centralizes the wiring that originated in MarkDownEditor
  so any place that renders chips (timeline cards, dashboards, summaries)
  can reuse the identical UX without duplicating ~150 lines of glue.

  Usage:
    Wrap any subtree that contains .mention-chip elements with this host.
    Each chip must carry data-kind / data-id / data-label, matching the
    format emitted by mention-node.ts.
-->
<script lang="ts">
	import { getContext, mount, unmount, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import { UsersService, type User } from '$lib/services/users.service';
	import { AlertService } from '$lib/services/alerts.service';
	import type { Alert } from '$lib/types/resources/alert';
	import MentionPopover, { type MentionPopoverPayload } from './MentionPopover.svelte';
	import AssetDetailDialog from '../../../../routes/(app)/case/[case_id]/assets/[asset_id]/AssetDetailDialog.svelte';
	import IocDetailDialog from '../../../../routes/(app)/case/[case_id]/iocs/[ioc_id]/IocDetailDialog.svelte';
	import TaskDetailDialog from '../../../../routes/(app)/case/[case_id]/tasks/[task_id]/TaskDetailDialog.svelte';
	import NoteDetailDialog from '../../../../routes/(app)/case/[case_id]/notes/[note_id]/NoteDetailDialog.svelte';

	let {
		caseId,
		children,
		class: className = ''
	}: {
		caseId?: number | string | null;
		children: Snippet;
		class?: string;
	} = $props();

	const caseAssets = getContext<CaseAssetsContext | undefined>(CASE_ASSETS_CTX);
	const caseIocs = getContext<CaseIocsContext | undefined>(CASE_IOCS_CTX);
	const caseNotes = getContext<CaseNotesContext | undefined>(CASE_NOTES_CTX);
	const caseTasks = getContext<CaseTasksContext | undefined>(CASE_TASKS_CTX);

	let cachedUsers: User[] | null = null;
	const loadUsers = async (): Promise<User[]> => {
		if (cachedUsers) return cachedUsers;
		const res = await UsersService.list({ fetch });
		const raw = (res?.data as unknown as { data?: User[] })?.data;
		cachedUsers = Array.isArray(raw) ? raw : Array.isArray(res?.data) ? (res.data as User[]) : [];
		return cachedUsers;
	};

	// Alert chips are the one kind with no case context to read from: the
	// backend writes them into a case description on escalate/merge, and the
	// referenced alert may not be in any store this page loaded. Fetch on
	// first hover and memoise per id — including the misses, so a chip
	// pointing at a deleted alert doesn't re-request on every hover.
	const cachedAlerts = new Map<number, Alert | null>();
	const loadAlert = async (alertId: number): Promise<Alert | null> => {
		const cached = cachedAlerts.get(alertId);
		if (cached !== undefined) return cached;
		const res = await AlertService.get(alertId);
		const alert = res.ok && res.data && typeof res.data !== 'string' ? res.data : null;
		cachedAlerts.set(alertId, alert);
		return alert;
	};

	let assetDialogId = $state<number | null>(null);
	let assetDialogOpen = $state(false);
	let iocDialogId = $state<number | null>(null);
	let iocDialogOpen = $state(false);
	let taskDialogId = $state<number | null>(null);
	let taskDialogOpen = $state(false);
	let noteDialogId = $state<number | null>(null);
	let noteDialogOpen = $state(false);

	const openAssetDialog = (id: number) => {
		assetDialogId = id;
		assetDialogOpen = true;
	};
	const openIocDialog = (id: number) => {
		iocDialogId = id;
		iocDialogOpen = true;
	};
	const openTaskDialog = (id: number) => {
		taskDialogId = id;
		taskDialogOpen = true;
	};
	const openNoteDialog = (id: number) => {
		noteDialogId = id;
		noteDialogOpen = true;
	};

	let popoverHandle: { destroy: () => void } | null = null;
	let popoverHostEl: HTMLElement | null = null;

	const closePopover = () => {
		popoverHandle?.destroy();
		popoverHandle = null;
		activeChip = null;
	};

	const openPopoverFor = async (el: HTMLElement) => {
		closePopover();

		const kind = el.getAttribute('data-kind') ?? 'user';
		const id = el.getAttribute('data-id') ?? '';
		const label = el.getAttribute('data-label') ?? el.textContent?.replace(/^[@#]/, '') ?? '';
		const numericId = Number(id);

		let payload: MentionPopoverPayload;

		if (kind === 'asset') {
			const asset = caseAssets?.byId[numericId];
			payload = {
				kind: 'asset',
				id,
				label,
				asset_type: asset?.asset_type?.asset_name ?? null,
				asset_ip: asset?.asset_ip ?? null,
				asset_domain: asset?.asset_domain ?? null,
				onOpen: Number.isFinite(numericId) ? () => openAssetDialog(numericId) : undefined
			};
		} else if (kind === 'ioc') {
			const ioc = caseIocs?.byId[numericId];
			payload = {
				kind: 'ioc',
				id,
				label,
				ioc_type: ioc?.ioc_type?.type_name ?? null,
				ioc_description: ioc?.ioc_description ?? null,
				onOpen: Number.isFinite(numericId) ? () => openIocDialog(numericId) : undefined
			};
		} else if (kind === 'note') {
			const note = caseNotes?.byId[numericId];
			const folder = note?.directory_id ? caseNotes?.foldersById[note.directory_id] : null;
			payload = {
				kind: 'note',
				id,
				label,
				directory: folder?.name ?? null,
				onOpen: Number.isFinite(numericId) ? () => openNoteDialog(numericId) : undefined
			};
		} else if (kind === 'task') {
			const task = caseTasks?.byId[numericId];
			payload = {
				kind: 'task',
				id,
				label,
				status: task?.status?.status_name ?? null,
				assignees: task?.task_assignees?.map((a) => a.name || a.user).join(', ') || null,
				onOpen: Number.isFinite(numericId) ? () => openTaskDialog(numericId) : undefined
			};
		} else if (kind === 'alert') {
			const alert = Number.isFinite(numericId) ? await loadAlert(numericId) : null;
			payload = {
				kind: 'alert',
				id,
				label,
				title: alert?.alert_title ?? null,
				severity: alert?.severity?.severity_name ?? null,
				status: alert?.status?.status_name ?? null,
				customer: alert?.customer?.customer_name ?? null,
				// Navigate rather than mounting AlertDetailDialog: that dialog
				// reads ALERTS_CTX / CASES_CTX / COMMENTS_PANEL_CTX /
				// INVESTIGATION_FLOW_PANEL_CTX, none of which exist on a case
				// page. The dedicated route provides all four itself.
				onOpen: Number.isFinite(numericId) ? () => goto(`/alerts/${numericId}`) : undefined
			};
		} else {
			const users = await loadUsers();
			const user = users.find((u) => String(u.user_id) === id);
			payload = {
				kind: 'user',
				id,
				label,
				user_login: user?.user_login ?? null
			};
		}

		const rect = el.getBoundingClientRect();
		const host = document.createElement('div');
		host.style.position = 'absolute';
		host.style.zIndex = '60';
		host.style.top = `${rect.bottom + window.scrollY + 4}px`;
		host.style.left = `${rect.left + window.scrollX}px`;
		document.body.appendChild(host);
		popoverHostEl = host;

		host.addEventListener('mouseenter', cancelCloseTimer);
		host.addEventListener('mouseleave', (e) => {
			const toEl = e.relatedTarget as Node | null;
			if (toEl && activeChip?.contains(toEl)) return;
			scheduleClose();
		});

		const onClose = () => {
			closePopover();
		};

		const component = mount(MentionPopover, {
			target: host,
			props: { payload, onClose }
		});

		popoverHandle = {
			destroy: () => {
				unmount(component);
				host.remove();
				if (popoverHostEl === host) popoverHostEl = null;
			}
		};
	};

	const HOVER_OPEN_DELAY = 300;
	const HOVER_CLOSE_DELAY = 200;

	let activeChip: HTMLElement | null = null;
	let openTimer: ReturnType<typeof setTimeout> | null = null;
	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	const cancelOpenTimer = () => {
		if (openTimer) {
			clearTimeout(openTimer);
			openTimer = null;
		}
	};

	const cancelCloseTimer = () => {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	};

	const scheduleClose = () => {
		cancelCloseTimer();
		closeTimer = setTimeout(() => {
			closePopover();
			activeChip = null;
		}, HOVER_CLOSE_DELAY);
	};

	const handleChipMouseEnter = (chip: HTMLElement) => {
		cancelCloseTimer();
		if (activeChip === chip && popoverHandle) return;
		cancelOpenTimer();
		openTimer = setTimeout(() => {
			openTimer = null;
			activeChip = chip;
			openPopoverFor(chip);
		}, HOVER_OPEN_DELAY);
	};

	const handleChipMouseLeave = (e: MouseEvent) => {
		cancelOpenTimer();
		const toEl = e.relatedTarget as Node | null;
		if (toEl && popoverHostEl?.contains(toEl)) return;
		scheduleClose();
	};

	const handleBodyMouseOver = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		handleChipMouseEnter(chip);
	};

	const handleBodyMouseOut = (e: MouseEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		const toEl = e.relatedTarget as Node | null;
		if (toEl && chip.contains(toEl)) return;
		handleChipMouseLeave(e);
	};

	const handleBodyFocusIn = (e: FocusEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		cancelCloseTimer();
		cancelOpenTimer();
		activeChip = chip;
		openPopoverFor(chip);
	};

	const handleBodyFocusOut = (e: FocusEvent) => {
		const target = e.target as HTMLElement | null;
		if (!target) return;
		const chip = target.closest('.mention-chip') as HTMLElement | null;
		if (!chip) return;
		const toEl = e.relatedTarget as Node | null;
		if (toEl && (chip.contains(toEl) || popoverHostEl?.contains(toEl))) return;
		scheduleClose();
	};
</script>

<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<div
	role="group"
	class={className}
	onmouseover={handleBodyMouseOver}
	onmouseout={handleBodyMouseOut}
	onfocusin={handleBodyFocusIn}
	onfocusout={handleBodyFocusOut}
>
	{@render children()}
</div>

{#if assetDialogId !== null}
	<AssetDetailDialog assetId={assetDialogId} bind:open={assetDialogOpen} />
{/if}

{#if iocDialogId !== null && caseId != null}
	<IocDetailDialog caseId={Number(caseId)} iocId={iocDialogId} bind:open={iocDialogOpen} />
{/if}

{#if taskDialogId !== null && caseId != null}
	<TaskDetailDialog caseId={Number(caseId)} taskId={taskDialogId} bind:open={taskDialogOpen} />
{/if}

{#if noteDialogId !== null && caseId != null}
	<NoteDetailDialog caseId={Number(caseId)} noteId={noteDialogId} bind:open={noteDialogOpen} />
{/if}
