<script lang="ts">
	import { getContext, onMount, setContext, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import {
		BanIcon,
		ChartLineIcon,
		ClipboardCheckIcon,
		ClipboardPasteIcon,
		HardDriveUploadIcon,
		PlayIcon,
		RotateCcwIcon,
		ThumbsUpIcon,
		ZapIcon
	} from 'lucide-svelte';
	import { current_user } from '$lib/stores/auth.store';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		CASE_ASSETS_CTX,
		createCaseAssetsContext,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import {
		CASE_IOCS_CTX,
		createCaseIocsContext,
		type CaseIocsContext
	} from '$lib/contexts/case-iocs.context.svelte';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import {
		CASE_TASKS_CTX,
		createCaseTasksContext,
		type CaseTasksContext
	} from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_EVIDENCES_CTX,
		createCaseEvidencesContext,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import {
		CASE_DATASTORE_CTX,
		createCaseDatastoreContext,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import {
		CASE_ACCESS_CTX,
		createCaseAccessContext,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		createCommentsPanelContext,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import {
		ACTIVITY_PANEL_CTX,
		createActivityPanelContext,
		type ActivityPanelContext
	} from '$lib/contexts/activity-panel.context.svelte';
	import {
		DATASTORE_PANEL_CTX,
		createDatastorePanelContext,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuSub,
		DropdownMenuSubContent,
		DropdownMenuSubTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { toast } from '$lib/components/ui/toast';
	import CaseTopbar from './components/CaseTopbar.svelte';
	import ReadOnlyBanner from './components/ReadOnlyBanner.svelte';
	import ReviewBanner from './components/ReviewBanner.svelte';
	import RequestReviewDialog from './components/RequestReviewDialog.svelte';
	import { callHook } from './utils/hooks';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import type { Case } from '$lib/types/resources/case';
	import type { UserInfo } from '$lib/services/auth.service';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import type { RequestResponse } from '$lib/services/api.service';
	import { CaseManageModal } from '../../[components]/CaseModals';
	import AssetAddDialog from './assets/components/asset-add-dialog.svelte';
	import IocAddDialog from './iocs/components/ioc-add-dialog.svelte';
	import TaskAddDialog from './tasks/components/task-add-dialog.svelte';
	import EvidenceAddDialog from './evidence/components/evidence-add-dialog.svelte';
	import DatastoreAddFileDialog from '$lib/components/common/Datastore/DatastoreAddFileDialog.svelte';
	import DatastoreAddFolderDialog from '$lib/components/common/Datastore/DatastoreAddFolderDialog.svelte';

	let { children }: { children: Snippet } = $props();

	const app = getContext<AppContext>(APP_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);

	const caseAssets = createCaseAssetsContext(() => Number(page.params.case_id));
	const caseIocs = createCaseIocsContext(() => Number(page.params.case_id));
	const caseNotes = createCaseNotesContext(() => Number(page.params.case_id));
	const caseTasks = createCaseTasksContext(() => Number(page.params.case_id));
	const caseEvidences = createCaseEvidencesContext(() => Number(page.params.case_id));
	const caseDatastore = createCaseDatastoreContext(() => Number(page.params.case_id));
	const caseAccess = createCaseAccessContext(() => Number(page.params.case_id));

	setContext<CaseAssetsContext>(CASE_ASSETS_CTX, caseAssets);
	setContext<CaseIocsContext>(CASE_IOCS_CTX, caseIocs);
	setContext<CaseNotesContext>(CASE_NOTES_CTX, caseNotes);
	setContext<CaseTasksContext>(CASE_TASKS_CTX, caseTasks);
	setContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX, caseEvidences);
	setContext<CaseDatastoreContext>(CASE_DATASTORE_CTX, caseDatastore);
	setContext<CaseAccessContext>(CASE_ACCESS_CTX, caseAccess);

	const commentsPanel = createCommentsPanelContext();
	setContext<CommentsPanelContext>(COMMENTS_PANEL_CTX, commentsPanel);

	const activityPanel = createActivityPanelContext();
	setContext<ActivityPanelContext>(ACTIVITY_PANEL_CTX, activityPanel);

	const datastorePanel = createDatastorePanelContext();
	setContext<DatastorePanelContext>(DATASTORE_PANEL_CTX, datastorePanel);

	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let hookOptions = $state<HookOption[]>([]);
	let showRequestReview = $state(false);

	const refresh = async () => {
		const id = cases.currentCaseId();
		await cases.load({ case_ids: [id] });
	};

	const callModule = async (hookOption: HookOption) => {
		const id = cases.currentCaseId();
		const result = await callHook(id, 'case', [id], hookOption);
		toast({
			variant: result?.status === 'error' ? 'destructive' : 'success',
			title: result?.message
		});
	};

	// Review status IDs are seeded in a fixed order by post_init.py:
	// 1=No review required, 2=Not reviewed, 3=Pending review,
	// 4=Review in progress, 5=Reviewed
	const REVIEW_STATUS = {
		NO_REVIEW_REQUIRED: 1,
		NOT_REVIEWED: 2,
		PENDING_REVIEW: 3,
		REVIEW_IN_PROGRESS: 4,
		REVIEWED: 5
	} as const;

	const setReviewer = async (admin: UserInfo) => {
		const id = cases.currentCaseId();
		if (!currentCase) return;
		await cases.patch(id, {
			reviewer_id: admin.user_id,
			review_status_id: REVIEW_STATUS.PENDING_REVIEW
		});
	};

	const setReviewStatus = async (review_status_id: number) => {
		const id = cases.currentCaseId();
		if (!currentCase) return;
		const body: UpdateCaseBody = { review_status_id };
		if (review_status_id === REVIEW_STATUS.NOT_REVIEWED) {
			body.reviewer_id = null;
		}
		await cases.patch(id, body);
	};

	const myUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);
	const reviewStatus = $derived(currentCase?.review_status?.status_name ?? null);
	const reviewerId = $derived(currentCase?.reviewer_id ?? null);
	const isReviewer = $derived(myUserId !== null && reviewerId !== null && myUserId === reviewerId);

	let lastCaseId = $state<number | null>(null);

	$effect(() => {
		const case_id = Number(page.params.case_id);
		if (!Number.isInteger(case_id)) return;

		if (lastCaseId !== null && lastCaseId !== case_id) {
			caseAssets.reset();
			caseIocs.reset();
			caseNotes.reset();
			caseTasks.reset();
			caseEvidences.reset();
			caseDatastore.reset();
			caseAccess.reset();
		}
		lastCaseId = case_id;

		if (app.state.currentCaseID !== case_id) {
			app.state.currentCaseID = case_id;
		}

		const current = cases.currentCase();

		if (!current || current.case_id !== case_id) {
			cases.load({ case_ids: [case_id] });
		}

		caseAccess.load();
	});

	onMount(async () => {
		const hooksResponse = await HooksService.list('case');
		hookOptions = (hooksResponse.data as HookOption[]) ?? [];
	});

	// Workspace-wide comments side panel. When the URL's entity segment
	// changes (notes, assets, IOCs, tasks, events…), update the panel so
	// it follows the user. If the panel is OPEN we silently swap the
	// entity — the user is in "comments mode" and expects to see comments
	// for whatever they're now looking at. If the panel is closed, the
	// next time the user opens it they get the current entity by default.
	//
	// We derive the entity from the URL params and the relevant case
	// context (the by-id store is the authoritative source for labels;
	// when it's not loaded yet we fall back to a short placeholder so the
	// panel still opens against the right ID).
	type Resolver = () => { type: 'assets' | 'iocs' | 'tasks' | 'notes' | 'evidences'; id: number; label: string } | null;
	const resolveCurrentEntity: Resolver = () => {
		const p = page.params as Record<string, string | undefined>;
		if (p.asset_id) {
			const id = Number(p.asset_id);
			const asset = caseAssets.byId[id];
			return { type: 'assets', id, label: asset?.asset_name ?? `Asset #${id}` };
		}
		if (p.ioc_id) {
			const id = Number(p.ioc_id);
			const ioc = caseIocs.byId[id];
			return { type: 'iocs', id, label: ioc?.ioc_value ?? `IOC #${id}` };
		}
		if (p.task_id) {
			const id = Number(p.task_id);
			const task = caseTasks.byId[id];
			return { type: 'tasks', id, label: task?.task_title ?? `Task #${id}` };
		}
		if (p.note_id) {
			const id = Number(p.note_id);
			const note = caseNotes.byId[id];
			return { type: 'notes', id, label: note?.note_title ?? `Note #${id}` };
		}
		if (p.evidence_id) {
			const id = Number(p.evidence_id);
			const evidence = caseEvidences.byId[id];
			return { type: 'evidences', id, label: evidence?.filename ?? `Evidence #${id}` };
		}
		return null;
	};

	let lastEntitySig = $state<string | null>(null);

	$effect(() => {
		const entity = resolveCurrentEntity();
		const sig = entity ? `${entity.type}:${entity.id}` : null;

		// Skip the first run after mount — we don't want to auto-open or
		// auto-clear when the user lands on a page; only react to *changes*.
		if (lastEntitySig === null) {
			lastEntitySig = sig;
			return;
		}

		if (sig === lastEntitySig) {
			// Same entity, but label may have caught up after a context load —
			// keep the panel label fresh if the panel is open on this entity.
			if (
				entity &&
				commentsPanel.state.open &&
				commentsPanel.state.entity?.type === entity.type &&
				commentsPanel.state.entity?.id === entity.id &&
				commentsPanel.state.entity?.label !== entity.label
			) {
				commentsPanel.open(entity);
			}
			return;
		}

		lastEntitySig = sig;

		if (!commentsPanel.state.open) return;

		if (entity) {
			commentsPanel.open(entity);
		} else {
			commentsPanel.clearEntity();
		}
	});
</script>

{#snippet caseMenuItems()}
	<DropdownMenuLabel>Reports</DropdownMenuLabel>
	<DropdownMenuItem>
		<ClipboardPasteIcon class="mr-2 size-4" /> Generate report
	</DropdownMenuItem>
	<DropdownMenuItem>
		<ChartLineIcon class="mr-2 size-4" /> Activity report
	</DropdownMenuItem>

	{#if caseAccess.canEdit()}
		<DropdownMenuSeparator />
		<DropdownMenuLabel>Workflow</DropdownMenuLabel>
		<DropdownMenuItem>
			<HardDriveUploadIcon class="mr-2 size-4" /> Pipelines
		</DropdownMenuItem>
		{#if hookOptions.length}
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>
					<ZapIcon class="mr-2 size-4" /> Processors
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent>
					{#each hookOptions as hookOption}
						<DropdownMenuItem onclick={() => callModule(hookOption)}>
							{hookOption.manual_hook_ui_name}
						</DropdownMenuItem>
					{/each}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		{/if}
	{/if}
	{#if caseAccess.canEdit() || isReviewer}
		<DropdownMenuSeparator />
		<DropdownMenuLabel>Review</DropdownMenuLabel>
		{#if caseAccess.canEdit()}
			{#if reviewStatus === null || reviewStatus === 'Not reviewed' || reviewStatus === 'No review required'}
				<DropdownMenuItem onclick={() => (showRequestReview = true)}>
					<ClipboardCheckIcon class="mr-2 size-4" /> Request review
				</DropdownMenuItem>
			{/if}
			{#if reviewStatus !== null && reviewStatus !== 'Not reviewed' && reviewStatus !== 'No review required'}
				<DropdownMenuItem onclick={() => setReviewStatus(REVIEW_STATUS.NOT_REVIEWED)}>
					<RotateCcwIcon class="mr-2 size-4" /> Cancel review request
				</DropdownMenuItem>
			{/if}
			{#if reviewStatus !== 'No review required'}
				<DropdownMenuItem onclick={() => setReviewStatus(REVIEW_STATUS.NO_REVIEW_REQUIRED)}>
					<BanIcon class="mr-2 size-4" /> No review required
				</DropdownMenuItem>
			{/if}
		{/if}
		{#if isReviewer && reviewStatus === 'Pending review'}
			<DropdownMenuItem onclick={() => setReviewStatus(REVIEW_STATUS.REVIEW_IN_PROGRESS)}>
				<PlayIcon class="mr-2 size-4" /> Start review
			</DropdownMenuItem>
		{/if}
		{#if isReviewer && reviewStatus === 'Review in progress'}
			<DropdownMenuItem onclick={() => setReviewStatus(REVIEW_STATUS.REVIEWED)}>
				<ThumbsUpIcon class="mr-2 size-4" /> Confirm review
			</DropdownMenuItem>
		{/if}
	{/if}
{/snippet}

{#if !currentCase}
	<div class="flex flex-col overflow-hidden">
		<div class="flex items-start gap-y-1 overflow-y-auto border-b p-4 shadow">
			<div class="mb-2 flex w-full flex-col items-start">
				<Skeleton class="mb-2 h-3 w-8" />
				<Skeleton class="h-6 w-24" />
				<Skeleton class="mt-4 h-8 w-1/2" />
			</div>
		</div>
	</div>
{:else}
	<div class="flex w-full grow flex-col bg-background">
		<CaseTopbar menuItems={caseMenuItems} />

		{#if caseAccess.isReadOnly()}
			<ReadOnlyBanner />
		{/if}

		{#if isReviewer && (reviewStatus === 'Pending review' || reviewStatus === 'Review in progress')}
			<ReviewBanner
				statusName={reviewStatus}
				onStartReview={reviewStatus === 'Pending review'
					? () => setReviewStatus(REVIEW_STATUS.REVIEW_IN_PROGRESS)
					: undefined}
				onConfirmReview={reviewStatus === 'Review in progress'
					? () => setReviewStatus(REVIEW_STATUS.REVIEWED)
					: undefined}
			/>
		{/if}

		<div class="flex grow overflow-y-auto">
			{@render children()}
		</div>
	</div>
{/if}

<CaseManageModal
	open={cases.ui.showManageModal}
	onOpenChange={(openState) => {
		cases.ui.showManageModal = openState;

		if (!openState) {
			refresh();
		}
	}}
/>

<AssetAddDialog
	open={caseAssets.ui.showAddModal}
	onOpenChange={(open) => (caseAssets.ui.showAddModal = open)}
/>

<IocAddDialog
	open={caseIocs.ui.showAddModal}
	onOpenChange={(open) => (caseIocs.ui.showAddModal = open)}
/>

<TaskAddDialog
	open={caseTasks.ui.showAddModal}
	onOpenChange={(open) => (caseTasks.ui.showAddModal = open)}
/>

<EvidenceAddDialog
	open={caseEvidences.ui.showAddModal}
	onOpenChange={(open) => (caseEvidences.ui.showAddModal = open)}
/>

<DatastoreAddFileDialog
	open={caseDatastore.ui.showAddFileModal}
	onOpenChange={(open) => (caseDatastore.ui.showAddFileModal = open)}
/>

<DatastoreAddFolderDialog
	open={caseDatastore.ui.showAddFolderModal}
	onOpenChange={(open) => (caseDatastore.ui.showAddFolderModal = open)}
/>

<RequestReviewDialog bind:open={showRequestReview} onConfirm={(admin) => setReviewer(admin)} />
