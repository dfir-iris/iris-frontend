<!--
  Evidence detail panel. Renders the tabs (Details / Comments) plus the metadata
  footer for one evidence item. Used by:
    - the evidence route page  (/case/:case_id/evidence/:evidence_id)
    - the EvidenceDetailDialog (modal opened from mention chips)
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import { AlertTriangleIcon, InfoIcon, MessagesSquareIcon, SearchIcon } from 'lucide-svelte';
	import { type Evidence } from '$lib/types/resources/evidence';
	import { toast } from '$lib/stores/toast.store';
	import type { UpdateCaseEvidenceBody } from '$lib/services/case-evidences.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import DetailsTab from './details-tab.svelte';
	import CommentsTab from './comments-tab.svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';

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
		await caseEvidences.removeEvidence(evidenceId, { fetch });
		onAfterDelete?.();
	};

	$effect(() => {
		void evidenceId;
		loadEvidence();
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
				{#each Array(9)}
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
			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b bg-muted/20">
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

								{#if comments?.length}
									<span
										class="absolute left-8 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-2xs text-white"
									>
										{comments.length}
									</span>
								{/if}
							</TabsTrigger>
						</TabsList>
					</div>

					<div class="min-h-0 flex-1 overflow-y-auto p-6">
						<TabsContent value="details">
							<DetailsTab
								{evidence}
								{caseId}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								onStartEditing={startEditing}
								onCancelEditing={cancelEditing}
								onSaveChanges={saveChanges}
								onDeleteEvidence={handleEvidenceDeleted}
								{isSaving}
								deleteUrl={`/api/v2/cases/${caseId}/evidences/${evidence.id}`}
							/>
						</TabsContent>

						<TabsContent value="comments">
							<CommentsTab {evidence} onRefresh={() => loadComments()} />
						</TabsContent>
					</div>
				</Tabs>
			</div>

			<div class="shrink-0 border-t bg-muted/30 px-6 py-4">
				<div class="text-xs text-muted-foreground">
					ID #{evidence.id || 'Unknown ID'} - UUID #{evidence.file_uuid || 'Unknown ID'}
				</div>
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
