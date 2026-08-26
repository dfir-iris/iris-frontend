<!--
  Asset detail panel. Renders the tabs (Details / IOCs / History / Comments)
  plus the metadata footer for one asset. Used by:
    - the asset route page  (/case/:case_id/assets/:asset_id)
    - the AssetDetailDialog (modal opened from mention chips)

  All editing/saving/deleting state lives here so the surrounding shell stays
  dumb. The `onAfterDelete` callback lets the host decide what to do once the
  asset is gone (navigate back to the list, close the dialog, etc).
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		ClockIcon,
		HistoryIcon,
		InfoIcon,
		MessagesSquareIcon,
		SearchIcon,
		ShieldAlertIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import CustomAttributesTabWrapper from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import {
		ensureHasCustomAttributes,
		hasCustomAttributes
	} from '$lib/stores/custom-attributes.store.svelte';
	import { onMount } from 'svelte';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import type { UpdateCaseAssetBody } from '$lib/services/case-assets.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import { cn } from '$lib/utils';
	import { normalizeTags, stringToTags, tagsToString } from '$lib/utils/tags';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import { page } from '$app/state';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import EntityDetailHeader from '$lib/components/common/EntityDetailHeader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { getAssetTypeIcon } from '$lib/components/common/assets/asset-type-icon';
	import { getAssetUrl } from '../helpers';
	import CommentsTab from './comments-tab.svelte';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import IOCTab from './ioc-tab.svelte';
	import TimelineTab from './timeline-tab.svelte';
	import SeenElsewhereBadge from '$lib/components/common/SeenElsewhereBadge.svelte';
	import { CaseAssetsService } from '$lib/services/case-assets.service';

	type EditData = {
		asset_name: string;
		asset_description: string;
		asset_ip: string;
		asset_domain: string;
		asset_type_id: number | undefined;
		analysis_status_id: number | undefined;
		asset_compromise_status_id: number | undefined;
		asset_tags: string;
	};

	let {
		assetId,
		onAfterDelete
	}: {
		assetId: number;
		onAfterDelete?: () => void;
	} = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);

	const asset = $derived(caseAssets.byId[assetId]);
	const AssetTypeIcon = $derived(getAssetTypeIcon(asset?.asset_type?.asset_name));
	const isCompromised = $derived(asset?.asset_compromise_status_id === 1);
	// Component-level caseId reactive on the route param. Used by the
	// "seen elsewhere" badge below; we read it from URL state so the
	// detail view works equally well when mounted as a dialog (no
	// `case_id` prop available) and when rendered as a route.
	const caseId = $derived(Number(page.params.case_id));

	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);

	let currentTags = $state<Tag[]>([]);
	let comments = $state<Comment[]>([]);

	// Lightweight precount so the Timeline tab trigger can show a badge
	// without forcing the user to click the tab first. We request a single
	// page-of-one row purely for `pagination.total`. Null means "not yet
	// known"; render the tab without a number in that case.
	let timelineCount = $state<number | null>(null);

	const loadTimelineCount = async () => {
		const caseId = Number(page.params.case_id);
		if (!Number.isFinite(caseId)) return;
		const res = await CaseTimelineService.listEvents(
			caseId,
			{ asset_id: [assetId] },
			{ fetch },
			{ page: 1, per_page: 1 }
		);
		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') return;
		timelineCount = res.data.pagination?.total ?? res.data.timeline?.length ?? 0;
	};

	let editData = $state<EditData>({
		asset_name: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: '',
		asset_type_id: undefined,
		analysis_status_id: undefined,
		asset_compromise_status_id: undefined,
		asset_tags: ''
	});

	const syncTagsFromAsset = (currentAsset: Asset | undefined) => {
		currentTags = normalizeTags(currentAsset?.asset_tags);
	};

	const resetEditData = (currentAsset: Asset) => {
		editData = {
			asset_name: currentAsset.asset_name,
			asset_description: currentAsset.asset_description || '',
			asset_ip: currentAsset.asset_ip || '',
			asset_domain: currentAsset.asset_domain || '',
			asset_type_id: currentAsset.asset_type_id ?? currentAsset.asset_type?.asset_id,
			analysis_status_id: currentAsset.analysis_status_id ?? currentAsset.analysis_status?.id,
			asset_compromise_status_id: currentAsset.asset_compromise_status_id,
			asset_tags: currentAsset.asset_tags || ''
		};
	};

	const loadComments = async () => {
		if (!asset) return;
		const res = await CommentsService.list('assets', asset.asset_id);

		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];
	};

	const loadAsset = async () => {
		await caseAssets.getAsset(assetId, { fetch });
		await loadComments();
		syncTagsFromAsset(caseAssets.byId[assetId]);
	};

	const handleUpdateEditData = (field: string, value: string | number | Tag[]) => {
		if (field === 'asset_tags') {
			if (Array.isArray(value)) {
				currentTags = [...value];
				editData.asset_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				editData.asset_tags = value;
			}
			return;
		}

		if (field === 'asset_type_id') {
			editData.asset_type_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'analysis_status_id') {
			editData.analysis_status_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'asset_compromise_status_id') {
			editData.asset_compromise_status_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'asset_name' && typeof value === 'string') {
			editData.asset_name = value;
			return;
		}

		if (field === 'asset_description' && typeof value === 'string') {
			editData.asset_description = value;
			return;
		}

		if (field === 'asset_ip' && typeof value === 'string') {
			editData.asset_ip = value;
			return;
		}

		if (field === 'asset_domain' && typeof value === 'string') {
			editData.asset_domain = value;
		}
	};

	const startEditing = () => {
		if (!asset) return;
		syncTagsFromAsset(asset);
		resetEditData(asset);
		// Edit lives in the header strip now, so it can be hit from any tab —
		// send the user to the form they just asked for.
		activeTab = 'details';
		isEditing = true;
	};

	const cancelEditing = () => {
		if (asset) {
			syncTagsFromAsset(asset);
			resetEditData(asset);
		}
		isEditing = false;
	};

	const saveChanges = async () => {
		if (!asset) return;

		isSaving = true;

		try {
			const payload: UpdateCaseAssetBody = {
				asset_name: editData.asset_name,
				asset_description: editData.asset_description,
				asset_ip: editData.asset_ip,
				asset_domain: editData.asset_domain,
				asset_type_id: editData.asset_type_id,
				analysis_status_id: editData.analysis_status_id,
				asset_compromise_status_id: editData.asset_compromise_status_id,
				asset_tags: tagsToString(currentTags)
			};

			const updated = await caseAssets.patchAsset(assetId, payload, { fetch });

			if (!updated) throw new Error('Failed to update asset');

			syncTagsFromAsset(updated);
			isEditing = false;

			toast({
				title: 'Asset updated',
				description: 'Asset details have been successfully updated.',
				variant: 'success'
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			toast({
				title: 'Update failed',
				description: `There was a problem updating the asset. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	const handleAssetDeleted = async () => {
		await caseAssets.removeAsset(assetId, { fetch });
		onAfterDelete?.();
	};

	// Re-fetch whenever the assetId prop changes (covers route param changes
	// and dialog reuse where the same component instance switches assets).
	$effect(() => {
		void assetId;
		loadAsset();
		timelineCount = null;
		void loadTimelineCount();
	});

	onMount(() => {
		void ensureHasCustomAttributes('asset');
	});
</script>

{#if asset?.asset_id}
	<div in:fade={{ duration: 150 }} class="flex h-full min-h-0 flex-col">
		<div class="flex h-full min-h-0 flex-col overflow-hidden">
			<EntityDetailHeader
				Icon={AssetTypeIcon}
				title={asset.asset_name}
				subtitle={`${asset.asset_type?.asset_name ?? 'Unknown type'} · #${asset.asset_id}`}
				accent={isCompromised ? 'danger' : 'none'}
				{isEditing}
				{isSaving}
				{canEdit}
				editLabel="Edit Asset"
				onStartEditing={startEditing}
				onCancelEditing={cancelEditing}
				onSaveChanges={saveChanges}
				onDelete={handleAssetDeleted}
				deleteUrl={`/api/v2/cases/${caseId}/assets/${asset.asset_id}`}
				deletePrompt={`Are you sure you want to delete the asset "${asset.asset_name}"? This action cannot be undone.`}
				shareUrl={getAssetUrl(asset.case_id, String(asset.asset_id))}
				hookType="asset"
				{caseId}
				objectId={asset.asset_id}
			>
				{#snippet badges()}
					{#if isCompromised}
						<Badge variant="compromised" class="px-2 py-0 text-2xs">Compromised</Badge>
					{/if}
				{/snippet}
			</EntityDetailHeader>

			<div class="flex min-h-0 flex-1 flex-col p-0">
				<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
					<!--
					  VISUAL TEST (lighter chrome): keeps `border-b` — the active
					  tab's underline needs a baseline to sit on — but drops the
					  `bg-muted/20` tint, so this is a rule instead of a band.
					-->
					<div class="relative flex shrink-0 items-center border-b">
						<TabsList class="h-auto w-full rounded-none border-0 bg-transparent p-0">
							<TabsTrigger
								value="details"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<InfoIcon class="mr-1 h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="ioc"
								class="relative flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<ShieldAlertIcon class="mr-1 h-4 w-4" />
								<span>IOCs</span>

								<!--
								  Zero renders dimmed rather than hidden: "checked,
								  none" and "not loaded yet" have to look different,
								  and these counts are now the only place the link
								  totals appear.
								-->
								<span
									class={cn(
										'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors',
										!asset.iocs?.length && 'opacity-40'
									)}
								>
									{asset.iocs?.length ?? 0}
								</span>
							</TabsTrigger>

							<TabsTrigger
								value="timeline"
								class="relative flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<ClockIcon class="mr-1 h-4 w-4" />
								<span>Timeline</span>

								{#if timelineCount !== null}
									<span
										class={cn(
											'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors',
											timelineCount === 0 && 'opacity-40'
										)}
									>
										{timelineCount}
									</span>
								{/if}
							</TabsTrigger>

							<TabsTrigger
								value="history"
								class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<HistoryIcon class="mr-1 h-4 w-4" />
								<span>History</span>
							</TabsTrigger>

							<TabsTrigger
								value="comments"
								class="relative flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<MessagesSquareIcon class="mr-1 h-4 w-4" />
								<span>Comments</span>

								<span
									class={cn(
										'ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors',
										!comments.length && 'opacity-40'
									)}
								>
									{comments.length}
								</span>
							</TabsTrigger>

							{#if hasCustomAttributes.asset === true}
								<TabsTrigger
									value="custom_attributes"
									class="flex items-center gap-2 rounded-none px-4 py-3 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
								>
									<WaypointsIcon class="mr-1 h-4 w-4" />
									<span>Custom attributes</span>
								</TabsTrigger>
							{/if}
						</TabsList>

						<!--
						  Cross-case pivot. Lights up when this asset (name +
						  type, same customer) has been seen on another case
						  the analyst can read; clicking the badge opens a
						  popover with the matching case list.

						  Absolutely positioned so it sits outside the tab row's
						  flow: the badge appears asynchronously (and only for
						  some assets), and in flow it would shift the centred
						  TabsList sideways the moment it loaded.
						-->
						<div class="absolute right-4 top-1/2 -translate-y-1/2">
							<SeenElsewhereBadge
								objectLabel="asset"
								objectId={asset.asset_id}
								load={async () => {
									const res = await CaseAssetsService.listOtherCaseLinks(caseId, asset.asset_id);
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
								{asset}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
							/>
						</TabsContent>

						<TabsContent value="ioc" class="mt-0 p-4">
							<IOCTab bind:asset={caseAssets.byId[assetId]} />
						</TabsContent>

						<TabsContent value="timeline" class="mt-0 p-4">
							<TimelineTab {assetId} onCountChange={(c) => (timelineCount = c)} />
						</TabsContent>

						<TabsContent value="history" class="mt-0 p-4">
							<HistoryTab {asset} />
						</TabsContent>

						<TabsContent value="comments" class="mt-0 p-4">
							<CommentsTab {asset} onRefresh={() => loadComments()} />
						</TabsContent>

						{#if hasCustomAttributes.asset === true}
							<TabsContent value="custom_attributes" class="mt-0 p-4">
								<CustomAttributesTabWrapper
									objectType="asset"
									existing={(asset.custom_attributes ?? null) as Record<
										string,
										Record<string, unknown>
									> | null}
									{canEdit}
									onSave={async (values) => {
										const updated = await caseAssets.patchAsset(
											assetId,
											{ custom_attributes: values },
											{ fetch }
										);
										if (!updated) throw new Error('Failed to update asset');
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

		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">Asset Not Found</h2>

		<p class="text-muted-foreground">
			The asset with ID #{assetId} could not be found or loaded.
		</p>
	</div>
{/if}
