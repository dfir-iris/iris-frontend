<!--
  Evidence detail panel. Renders the identity strip plus the tabs (Details /
  Comments) for one evidence item. Used by:
    - the evidence route page  (/case/:case_id/evidence/:evidence_id)
    - the EvidenceDetailDialog (modal opened from mention chips)
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		AlertTriangleIcon,
		FileLock2Icon,
		InfoIcon,
		MessagesSquareIcon,
		SearchIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import CustomAttributesTabWrapper from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import { onMount } from 'svelte';
	import { type Evidence } from '$lib/types/resources/evidence';
	import { cn } from '$lib/utils';
	import { toast } from '$lib/stores/toast.store';
	import type { UpdateCaseEvidenceBody } from '$lib/services/case-evidences.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import EntityDetailHeader from '$lib/components/common/EntityDetailHeader.svelte';
	import { getEvidenceUrl } from '../helpers';
	import DetailsTab from './details-tab.svelte';
	import CommentsTab from './comments-tab.svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';

	type EditData = {
		filename: string;
		file_description: string;
		type_id?: number;
		file_hash?: string;
		file_size?: number;
		acquisition_date?: string;
	};

	let {
		caseId,
		evidenceId,
		onAfterDelete
	}: {
		caseId: number;
		evidenceId: number;
		onAfterDelete?: () => void;
	} = $props();

	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);
	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);

	const evidence = $derived(caseEvidences.byId[evidenceId]);

	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	let comments = $state<Comment[]>([]);

	let editData = $state<EditData>({
		filename: '',
		file_description: '',
		type_id: undefined,
		file_hash: undefined,
		file_size: undefined,
		acquisition_date: undefined
	});

	const resetEditData = (current: Evidence) => {
		editData = {
			filename: current.filename,
			file_description: current.file_description ?? '',
			type_id: current.type_id ?? undefined,
			file_hash: current.file_hash ?? undefined,
			file_size: current.file_size ?? undefined,
			acquisition_date: current.acquisition_date ?? undefined
		};
	};

	const loadComments = async () => {
		if (!evidence) return;
		const res = await CommentsService.list('evidences', evidence.id);
		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];
	};

	const loadEvidence = async () => {
		isLoading = true;
		loadError = null;

		try {
			const loaded = await caseEvidences.getEvidence(evidenceId, { fetch });

			if (!loaded) {
				loadError = 'Failed to load evidence';
				return;
			}

			await loadComments();
			resetEditData(loaded);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load evidence';
		} finally {
			isLoading = false;
		}
	};

	const handleUpdateEditData = (field: string, value: string | number) => {
		if (field === 'filename' && typeof value === 'string') {
			editData.filename = value;
			return;
		}

		if (field === 'file_description' && typeof value === 'string') {
			editData.file_description = value;
			return;
		}

		if (field === 'file_hash' && typeof value === 'string') {
			editData.file_hash = value;
			return;
		}

		if (field === 'acquisition_date' && typeof value === 'string') {
			editData.acquisition_date = value;
			return;
		}

		if (field === 'type_id') {
			editData.type_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'file_size') {
			editData.file_size = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
		}
	};

	const startEditing = () => {
		if (!evidence) return;
		resetEditData(evidence);
		// Edit lives in the header strip now, so it can be hit from any tab —
		// send the user to the form they just asked for.
		activeTab = 'details';
		isEditing = true;
	};

	const cancelEditing = () => {
		if (evidence) {
			resetEditData(evidence);
		}
		isEditing = false;
	};

	const saveChanges = async () => {
		if (!evidence) return;

		isSaving = true;

		try {
			const payload: UpdateCaseEvidenceBody = {
				filename: editData.filename,
				file_description: editData.file_description,
				type_id: editData.type_id,
				file_hash: editData.file_hash,
				file_size: editData.file_size,
				acquisition_date: editData.acquisition_date
			};

			const updated = await caseEvidences.patchEvidence(evidenceId, payload, { fetch });

			if (!updated) throw new Error('Failed to update evidence');

			isEditing = false;

			toast({
				title: 'Evidence updated',
				description: 'Evidence details have been successfully updated.',
				variant: 'success'
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toast({
				title: 'Update failed',
				description: `There was a problem updating the evidence. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	const handleEvidenceDeleted = async () => {
		if (!(await caseEvidences.removeEvidence(evidenceId, { fetch }))) {
			toast({
				title: 'Failed to delete evidence',
				description: caseEvidences.mutation.error ?? 'The evidence is still in this case.',
				variant: 'destructive'
			});

			return;
		}

		toast({ title: 'Evidence deleted', variant: 'success' });
		onAfterDelete?.();
	};

	$effect(() => {
		void evidenceId;
		loadEvidence();
	});

	onMount(() => {
		void ensureHasCustomAttributes('evidence');
	});
</script>

{#if isLoading && !evidence}
	<Card class="overflow-hidden border shadow-lg">
		<CardContent class="p-8">
			<div class="mb-6 flex items-center gap-4">
				<Skeleton class="h-10 w-10 rounded-full"></Skeleton>
				<Skeleton class="h-8 w-64"></Skeleton>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-3">
				{#each Array(9) as _}
					<div class="space-y-2">
						<Skeleton class="h-4 w-24"></Skeleton>
						<Skeleton class="h-6 w-full"></Skeleton>
					</div>
				{/each}
			</div>
		</CardContent>
	</Card>
{:else if loadError}
	<div in:fade>
		<ErrorAlert>
			<div class="flex items-center gap-2">
				<AlertTriangleIcon class="h-5 w-5" />
				<span>There was a problem loading Evidence #{evidenceId}!</span>
			</div>
		</ErrorAlert>
	</div>
{:else if evidence?.id}
	<div in:fade={{ duration: 150 }} class="flex h-full min-h-0 flex-col">
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<EntityDetailHeader
				Icon={FileLock2Icon}
				title={evidence.filename}
				subtitle={`${evidence.type?.name ?? 'Evidence'} · #${evidence.id}`}
				mono
				{isEditing}
				{isSaving}
				{canEdit}
				editLabel="Edit Evidence"
				onStartEditing={startEditing}
				onCancelEditing={cancelEditing}
				onSaveChanges={saveChanges}
				onDelete={handleEvidenceDeleted}
				deleteUrl={`/api/v2/cases/${caseId}/evidences/${evidence.id}`}
				deletePrompt={`Are you sure you want to delete the evidence "${evidence.filename}"? This action cannot be undone.`}
				shareUrl={getEvidenceUrl(caseId, String(evidence.id))}
				markdownIcon="fa-file-shield"
				hookType="evidence"
				{caseId}
				objectId={evidence.id}
			/>

			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="comments"
								class="relative flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<MessagesSquareIcon class="mr-1 h-4 w-4" />
								<span>Comments</span>

								<!--
								  Zero renders dimmed rather than hidden: "checked,
								  none" and "not loaded yet" have to look different.
								-->
								<span
									class={cn(
										'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors',
										!comments.length && 'opacity-40'
									)}
								>
									{comments.length}
								</span>
							</TabsTrigger>

							{#if hasCustomAttributes.evidence === true}
								<TabsTrigger
									value="custom_attributes"
									class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
								>
									<WaypointsIcon class="mr-1 h-4 w-4" />
									<span>Custom attributes</span>
								</TabsTrigger>
							{/if}
						</TabsList>
					</div>

					<!--
					  No padding here: the Details tab opens on a full-bleed field
					  board that must reach both pane edges. Tabs that render
					  ordinary content bring their own padding.
					-->
					<div class="min-h-0 flex-1 overflow-y-auto">
						<TabsContent value="details" class="mt-0 min-h-full">
							<DetailsTab
								{evidence}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								onSaveChanges={saveChanges}
							/>
						</TabsContent>

						<TabsContent value="comments" class="mt-0 p-4">
							<CommentsTab {evidence} onRefresh={() => loadComments()} />
						</TabsContent>

						{#if hasCustomAttributes.evidence === true}
							<TabsContent value="custom_attributes" class="mt-0 p-4">
								<CustomAttributesTabWrapper
									objectType="evidence"
									existing={(evidence.custom_attributes ?? null) as Record<
										string,
										Record<string, unknown>
									> | null}
									{canEdit}
									onSave={async (values) => {
										const updated = await caseEvidences.patchEvidence(
											evidenceId,
											{ custom_attributes: values },
											{ fetch }
										);
										if (!updated) throw new Error('Failed to update evidence');
									}}
								/>
							</TabsContent>
						{/if}
					</div>
				</Tabs>
			</div>
		</div>
	</div>
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />
		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">Evidence Not Found</h2>
		<p class="text-muted-foreground">
			The evidence with ID #{evidenceId} could not be found or loaded.
		</p>
	</div>
{/if}
