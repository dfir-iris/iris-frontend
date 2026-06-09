<script lang="ts">
	import { getContext } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		HistoryIcon,
		InfoIcon,
		MessagesSquareIcon,
		SearchIcon,
		ShieldAlertIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import type { UpdateCaseAssetBody } from '$lib/services/case-assets.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import { normalizeTags, stringToTags, tagsToString } from '$lib/utils/tags';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import CommentsTab from './comments-tab.svelte';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import IOCTab from './ioc-tab.svelte';

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

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);

	const caseId = $derived(Number(page.params.case_id));
	const assetId = $derived(Number(page.params.asset_id));
	const asset = $derived(caseAssets.byId[assetId]);

	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);

	let currentTags = $state<Tag[]>([]);
	let comments = $state<Comment[]>([]);

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

	const formatDate = (dateString: string) => new Date(dateString).toLocaleString();

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

			if (!updated) {
				throw new Error('Failed to update asset');
			}

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

		goto(`/case/${caseId}/assets`);
	};

	$effect(() => {
		void caseId;
		void assetId;

		loadAsset();
	});
</script>

{#if asset?.asset_id}
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
								<InfoIcon class="mr-1 h-4 w-4" />
								<span>Details</span>
							</TabsTrigger>

							<TabsTrigger
								value="ioc"
								class="relative flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<ShieldAlertIcon class="mr-1 h-4 w-4" />
								<span>IOCs</span>

								{#if asset.iocs?.length}
									<span
										class="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] leading-none text-muted-foreground transition-colors"
									>
										{asset.iocs.length}
									</span>
								{/if}
							</TabsTrigger>

							<TabsTrigger
								value="history"
								class="flex items-center gap-2 rounded-none px-6 py-4 transition-colors hover:bg-muted/40 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80"
							>
								<HistoryIcon class="mr-1 h-4 w-4" />
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
								{asset}
								{isEditing}
								{editData}
								onUpdateEditData={handleUpdateEditData}
								{currentTags}
								onStartEditing={startEditing}
								onCancelEditing={cancelEditing}
								onSaveChanges={saveChanges}
								onDeleteAsset={handleAssetDeleted}
								{isSaving}
							/>
						</TabsContent>

						<TabsContent value="ioc">
							<IOCTab bind:asset={caseAssets.byId[assetId]} />
						</TabsContent>

						<TabsContent value="history">
							<HistoryTab {asset} />
						</TabsContent>

						<TabsContent value="comments">
							<CommentsTab {asset} onRefresh={() => loadComments()} />
						</TabsContent>
					</div>
				</Tabs>
			</div>

			<div class="shrink-0 border-t bg-muted/30 px-6 py-4">
				<div class="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
					<div class="flex-grow text-xs text-muted-foreground">
						<div class="flex flex-wrap items-center gap-3">
							<span class="flex items-center gap-1">
								<span class="inline-block h-2 w-2 rounded-full bg-green-500 opacity-60"></span>
								Added {formatDate(asset.date_added)}
							</span>

							<span class="flex items-center gap-1">
								<span class="inline-block h-2 w-2 rounded-full bg-blue-500 opacity-60"></span>
								Updated {formatDate(asset.date_update)}
							</span>

							<span class="flex items-center gap-1 font-mono">
								<span class="inline-block h-2 w-2 rounded-full bg-purple-500 opacity-60"></span>
								ID #{asset.asset_id}
							</span>
						</div>
					</div>
				</div>
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

		<p class="mt-1 text-muted-foreground">
			Please select an asset from the list on the left, or try refreshing the page.
		</p>

		<Button
			variant="outline"
			class="mt-6"
			onclick={() => goto(`/case/${caseId}/assets`, { replaceState: true })}
		>
			Go to Assets List
		</Button>
	</div>
{/if}
