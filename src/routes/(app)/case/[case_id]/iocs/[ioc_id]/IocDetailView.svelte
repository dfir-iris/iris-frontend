<!--
  IOC detail panel. Renders the tabs (Details / History / Comments) plus the
  metadata footer for one IOC. Used by:
    - the IOC route page  (/case/:case_id/iocs/:ioc_id)
    - the IocDetailDialog (modal opened from mention chips)

  All editing/saving/deleting state lives here so the surrounding shell stays
  dumb. The `onAfterDelete` callback lets the host decide what to do once the
  IOC is gone (navigate to the list, close the dialog, etc).
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		AlertTriangleIcon,
		HistoryIcon,
		InfoIcon,
		MessagesSquareIcon,
		SearchIcon
	} from 'lucide-svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import type { UpdateCaseIocBody } from '$lib/services/case-iocs.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import { normalizeTags, stringToTags, tagsToString } from '$lib/utils/tags';
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { Tag } from '$lib/types/resources/tag';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import CommentsTab from './comments-tab.svelte';

	type EditData = {
		ioc_value: string;
		ioc_description: string;
		ioc_type_id: number | undefined;
		ioc_tlp_id: number | undefined;
		ioc_tags: string;
	};

	let {
		caseId,
		iocId,
		onAfterDelete
	}: {
		caseId: number;
		iocId: number;
		onAfterDelete?: () => void;
	} = $props();

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);

	const ioc = $derived(caseIocs.byId[iocId]);

	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);
	let isLoading = $state(true);
	let loadError = $state<string | null>(null);

	let currentTags = $state<Tag[]>([]);
	let comments = $state<Comment[]>([]);

	let editData = $state<EditData>({
		ioc_value: '',
		ioc_description: '',
		ioc_type_id: undefined,
		ioc_tlp_id: undefined,
		ioc_tags: ''
	});

	const syncTagsFromIoc = (currentIoc: Ioc | undefined) => {
		currentTags = normalizeTags(currentIoc?.ioc_tags);
	};

	const resetEditData = (currentIoc: Ioc) => {
		editData = {
			ioc_value: currentIoc.ioc_value,
			ioc_description: currentIoc.ioc_description || '',
			ioc_type_id: currentIoc.ioc_type_id ?? currentIoc.ioc_type?.type_id,
			ioc_tlp_id: currentIoc.ioc_tlp_id,
			ioc_tags: currentIoc.ioc_tags || ''
		};
	};

	const loadComments = async () => {
		if (!ioc) return;
		const res = await CommentsService.list('iocs', ioc.ioc_id);
		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];
	};

	const loadIoc = async () => {
		isLoading = true;
		loadError = null;

		try {
			const loaded = await caseIocs.getIoc(iocId, { fetch });

			if (!loaded) {
				loadError = 'Failed to load IOC';
				return;
			}

			await loadComments();
			syncTagsFromIoc(loaded);
			resetEditData(loaded);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Failed to load IOC';
		} finally {
			isLoading = false;
		}
	};

	const handleIocChange = (updatedIoc: Partial<Ioc>) => {
		const currentIoc = caseIocs.byId[iocId];
		if (!currentIoc) return;
		caseIocs.byId[iocId] = { ...currentIoc, ...updatedIoc };
	};

	const handleUpdateEditData = (field: string, value: string | number | Tag[]) => {
		if (field === 'ioc_tags') {
			if (Array.isArray(value)) {
				currentTags = [...value];
				editData.ioc_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				editData.ioc_tags = value;
			}
			return;
		}

		if (field === 'ioc_value' && typeof value === 'string') {
			editData.ioc_value = value;
			return;
		}

		if (field === 'ioc_description' && typeof value === 'string') {
			editData.ioc_description = value;
			return;
		}

		if (field === 'ioc_type_id') {
			editData.ioc_type_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'ioc_tlp_id') {
			editData.ioc_tlp_id = typeof value === 'number' ? value : undefined;
		}
	};

	const startEditing = () => {
		if (!ioc) return;
		syncTagsFromIoc(ioc);
		resetEditData(ioc);
		isEditing = true;
	};

	const cancelEditing = () => {
		if (ioc) {
			syncTagsFromIoc(ioc);
			resetEditData(ioc);
		}
		isEditing = false;
	};

	const saveChanges = async () => {
		if (!ioc) return;

		isSaving = true;

		try {
			const payload: UpdateCaseIocBody = {
				ioc_value: editData.ioc_value,
				ioc_description: editData.ioc_description,
				ioc_type_id: editData.ioc_type_id,
				ioc_tlp_id: editData.ioc_tlp_id,
				ioc_tags: tagsToString(currentTags)
			};

			const updated = await caseIocs.patchIoc(iocId, payload, { fetch });

			if (!updated) throw new Error('Failed to update IOC');

			syncTagsFromIoc(updated);
			isEditing = false;

			toast({
				title: 'IOC updated',
				description: 'IOC details have been successfully updated.',
				variant: 'success'
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toast({
				title: 'Update failed',
				description: `There was a problem updating the IOC. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	const handleIocDeleted = async () => {
		await caseIocs.removeIoc(iocId, { fetch });
		onAfterDelete?.();
	};

	$effect(() => {
		void iocId;
		loadIoc();
	});
</script>

{#if isLoading && !ioc}
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
				<span>There was a problem loading IOC #{iocId}!</span>
			</div>
		</ErrorAlert>
	</div>
{:else if ioc?.ioc_id}
	<div in:fade={{ duration: 150 }} class="flex h-full min-h-0 flex-col">
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="shrink-0 border-b bg-muted/20">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="history"
								class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<HistoryIcon class="h-4 w-4" />
								<span>History</span>
							</TabsTrigger>

							<TabsTrigger
								value="comments"
								class="relative flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
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
								{ioc}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
								onIocChange={handleIocChange}
								onStartEditing={startEditing}
								onCancelEditing={cancelEditing}
								onSaveChanges={saveChanges}
								onDeleteIoc={handleIocDeleted}
								{isSaving}
								deleteUrl={`/api/v2/cases/${caseId}/iocs/${ioc.ioc_id}`}
							/>
						</TabsContent>

						<TabsContent value="history">
							<HistoryTab {ioc} />
						</TabsContent>

						<TabsContent value="comments">
							<CommentsTab {ioc} onRefresh={() => loadComments()} />
						</TabsContent>
					</div>
				</Tabs>
			</div>

			<div class="shrink-0 border-t bg-muted/30 px-6 py-4">
				<div class="text-xs text-muted-foreground">
					ID #{ioc.ioc_id || 'Unknown ID'} - UUID #{ioc.ioc_uuid || 'Unknown ID'}
				</div>
			</div>
		</div>
	</div>
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />
		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">IOC Not Found</h2>
		<p class="text-muted-foreground">The IOC with ID #{iocId} could not be found or loaded.</p>
	</div>
{/if}
