<!--
  IOC detail panel. Renders the identity strip plus the tabs (Details /
  History / Comments) for one IOC. Used by:
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
		SearchIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import CustomAttributesTabWrapper from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import { onMount } from 'svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import type { UpdateCaseIocBody } from '$lib/services/case-iocs.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import { cn } from '$lib/utils';
	import { normalizeTags, stringToTags, tagsToString } from '$lib/utils/tags';
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { Tag } from '$lib/types/resources/tag';
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import EntityDetailHeader from '$lib/components/common/EntityDetailHeader.svelte';
	import { getIocTypeIcon } from '$lib/components/common/ioc/ioc-type-icon';
	import { getIocUrl } from '../helpers';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import CommentsTab from './comments-tab.svelte';
	import SeenElsewhereBadge from '$lib/components/common/SeenElsewhereBadge.svelte';
	import { CaseIocsService } from '$lib/services/case-iocs.service';

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
	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);

	const ioc = $derived(caseIocs.byId[iocId]);
	const IocTypeIcon = $derived(getIocTypeIcon(ioc?.ioc_type?.type_name));

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
		// Edit lives in the header strip now, so it can be hit from any tab —
		// send the user to the form they just asked for.
		activeTab = 'details';
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

	onMount(() => {
		void ensureHasCustomAttributes('ioc');
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
			<EntityDetailHeader
				Icon={IocTypeIcon}
				title={ioc.ioc_value}
				subtitle={`${ioc.ioc_type?.type_name ?? 'Unknown type'} · #${ioc.ioc_id}`}
				mono
				{isEditing}
				{isSaving}
				{canEdit}
				editLabel="Edit IOC"
				onStartEditing={startEditing}
				onCancelEditing={cancelEditing}
				onSaveChanges={saveChanges}
				onDelete={handleIocDeleted}
				deleteUrl={`/api/v2/cases/${caseId}/iocs/${ioc.ioc_id}`}
				deletePrompt={`Are you sure you want to delete the IOC "${ioc.ioc_value}"? This action cannot be undone.`}
				shareUrl={getIocUrl(caseId, String(ioc.ioc_id))}
				hookType="ioc"
				{caseId}
				objectId={ioc.ioc_id}
			/>

			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<div class="relative flex shrink-0 items-center border-b">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="history"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<HistoryIcon class="h-4 w-4" />
								<span>History</span>
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

							{#if hasCustomAttributes.ioc === true}
								<TabsTrigger
									value="custom_attributes"
									class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
								>
									<WaypointsIcon class="h-4 w-4" />
									<span>Custom attributes</span>
								</TabsTrigger>
							{/if}
						</TabsList>

						<!--
						  Cross-case pivot. Surfaces an inline badge when the
						  IOC value has been observed on another case the
						  analyst can read; the badge expands into a popover
						  listing those cases. Empty result → nothing
						  rendered (the helper handles the visibility).

						  Absolutely positioned so it sits outside the tab row's
						  flow: the badge appears asynchronously (and only for
						  some IOCs), and in flow it would shift the centred
						  TabsList sideways the moment it loaded.
						-->
						<div class="absolute right-4 top-1/2 -translate-y-1/2">
							<SeenElsewhereBadge
								objectLabel="IOC"
								objectId={ioc.ioc_id}
								load={async () => {
									const res = await CaseIocsService.listOtherCaseLinks(caseId, ioc.ioc_id);
									return res.ok && Array.isArray(res.data) ? res.data : null;
								}}
							/>
						</div>
					</div>

					<!--
					  No padding here: the Details tab opens on a full-bleed field
					  board that must reach both pane edges. Tabs that render
					  ordinary content bring their own padding.
					-->
					<div class="min-h-0 flex-1 overflow-y-auto">
						<TabsContent value="details" class="mt-0 min-h-full">
							<DetailsTab
								{ioc}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
								onSaveChanges={saveChanges}
							/>
						</TabsContent>

						<TabsContent value="history" class="mt-0 p-4">
							<HistoryTab {ioc} />
						</TabsContent>

						<TabsContent value="comments" class="mt-0 p-4">
							<CommentsTab {ioc} onRefresh={() => loadComments()} />
						</TabsContent>

						{#if hasCustomAttributes.ioc === true}
							<TabsContent value="custom_attributes" class="mt-0 p-4">
								<CustomAttributesTabWrapper
									objectType="ioc"
									existing={(ioc.custom_attributes ?? null) as Record<
										string,
										Record<string, unknown>
									> | null}
									{canEdit}
									onSave={async (values) => {
										const updated = await caseIocs.patchIoc(
											iocId,
											{ custom_attributes: values },
											{ fetch }
										);
										if (!updated) throw new Error('Failed to update IOC');
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
		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">IOC Not Found</h2>
		<p class="text-muted-foreground">The IOC with ID #{iocId} could not be found or loaded.</p>
	</div>
{/if}
