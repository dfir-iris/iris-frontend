<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { getContext } from 'svelte';
	import {
		ShieldAlertIcon,
		SearchIcon,
		AlertTriangleIcon,
		Trash2Icon,
		CheckIcon,
		XIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { toast } from '$lib/components/ui/toast';
	import IOCCard from '$lib/components/common/ioc/IOCCard.svelte';
	import IocLinkButton from '$lib/components/common/ioc/IOCLinkButton.svelte';

	let { asset = $bindable() }: { asset: Asset } = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let iocs = $state<Ioc[]>([]);
	let searchQuery = $state('');
	let filteredIocs = $state<Ioc[]>([]);
	let needsRefresh = $state(false);

	let selectionMode = $state(false);
	let selectedIocs = $state<Set<number>>(new Set());
	let isRemoving = $state(false);

	const getLinkedIocIds = (currentAsset: Asset) =>
		(currentAsset.iocs ?? [])
			.map((ioc) => (typeof ioc === 'number' ? ioc : ioc.ioc_id))
			.filter((id): id is number => typeof id === 'number');

	const linkedIocIds = $derived(getLinkedIocIds(asset));

	const fetchIocs = async (ids = linkedIocIds) => {
		if (ids.length === 0) {
			isLoading = false;
			iocs = [];
			filteredIocs = [];
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await CaseIocsService.list(
				caseId,
				{
					page: 1,
					per_page: ids.length,
					custom_conditions: JSON.stringify([{ field: 'ioc_id', operator: 'in', value: ids }])
				},
				{ fetch }
			);

			if (!response.ok || response.error || !response.data || typeof response.data === 'string') {
				throw new Error(response.error?.message ?? 'Failed to load IOCs');
			}

			iocs = response.data.data;

			filterIocs();
		} catch (err) {
			console.error('Error fetching IOCs:', err);
			error = 'An error occurred while loading IOCs';
		} finally {
			isLoading = false;
		}
	};

	const refreshAssetAndIocs = async () => {
		const response = await CaseAssetsService.get(caseId, asset.asset_id, { fetch });

		if (!response.ok || response.error || !response.data || typeof response.data === 'string') {
			await fetchIocs();
			return;
		}

		asset = response.data;
		caseAssets.byId[asset.asset_id] = response.data;

		await fetchIocs(getLinkedIocIds(response.data));
	};

	const filterIocs = () => {
		if (!searchQuery.trim()) {
			filteredIocs = [...iocs];
			return;
		}

		const query = searchQuery.toLowerCase();

		filteredIocs = iocs.filter((ioc) => {
			const typeName = ioc.ioc_type?.type_name ?? '';

			return (
				ioc.ioc_value.toLowerCase().includes(query) ||
				typeName.toLowerCase().includes(query) ||
				(ioc.ioc_description ?? '').toLowerCase().includes(query) ||
				(ioc.ioc_tags ?? '').toLowerCase().includes(query)
			);
		});
	};

	const handleSearch = (event: Event) => {
		searchQuery = (event.target as HTMLInputElement).value;
	};

	const getGroupedIocs = () => {
		const grouped = new Map<string, Ioc[]>();

		for (const ioc of filteredIocs) {
			const typeName = ioc.ioc_type?.type_name ?? 'Unknown';

			grouped.set(typeName, [...(grouped.get(typeName) ?? []), ioc]);
		}

		return grouped;
	};

	const toggleSelectionMode = () => {
		selectionMode = !selectionMode;

		if (!selectionMode) {
			selectedIocs = new Set();
		}
	};

	const exitSelectionMode = () => {
		selectionMode = false;
		selectedIocs = new Set();
	};

	const toggleIocSelection = (iocId: number) => {
		if (selectedIocs.has(iocId)) {
			selectedIocs.delete(iocId);
		} else {
			selectedIocs.add(iocId);
		}

		selectedIocs = new Set(selectedIocs);
	};

	const selectAllIocs = () => (selectedIocs = new Set(filteredIocs.map((ioc) => ioc.ioc_id)));

	const deselectAllIocs = () => (selectedIocs = new Set());

	const removeIocs = async (iocIds: number[]) => {
		if (iocIds.length === 0) return;

		isRemoving = true;

		try {
			const nextIocIds = linkedIocIds.filter((id) => !iocIds.includes(id));

			const updated = await caseAssets.patchAsset(
				asset.asset_id,
				{ ioc_links: nextIocIds.map(String) },
				{ fetch }
			);

			if (!updated) {
				throw new Error('Failed to update asset IOC links');
			}

			asset = updated;
			iocs = iocs.filter((ioc) => !iocIds.includes(ioc.ioc_id));
			filterIocs();
			exitSelectionMode();

			toast({
				title: iocIds.length > 1 ? 'IOCs removed' : 'IOC removed',
				description: `Successfully removed ${iocIds.length} IOC${iocIds.length > 1 ? 's' : ''} from this asset.`,
				variant: 'success'
			});
		} catch (err) {
			console.error('Error removing IOCs:', err);

			toast({
				title: 'Error',
				description: 'Failed to remove IOCs. Please try again.',
				variant: 'destructive'
			});
		} finally {
			isRemoving = false;
		}
	};

	const removeSelectedIocs = () => {
		removeIocs([...selectedIocs]);
	};

	$effect(() => {
		void asset.asset_id;
		void linkedIocIds.join(',');

		fetchIocs();
	});

	$effect(() => {
		filterIocs();
	});

	$effect(() => {
		if (selectionMode && filteredIocs.length === 0) {
			exitSelectionMode();
		}
	});

	$effect(() => {
		if (!needsRefresh) return;

		refreshAssetAndIocs().finally(() => {
			needsRefresh = false;
		});
	});
</script>

<div class="space-y-6">
	<header class="flex flex-col gap-4 sm:flex-row sm:items-center">
		<div class="flex items-center gap-2">
			<ShieldAlertIcon class="h-5 w-5 text-primary" />
			<h2 class="text-xl font-semibold">Indicators of Compromise</h2>
		</div>

		<div class="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
			{#if selectionMode}
				<div
					class="flex h-10 items-center gap-2 text-nowrap rounded-md bg-muted/50 px-4 py-1 text-sm"
				>
					<span class="font-medium">{selectedIocs.size} selected</span>
				</div>

				<Button
					variant="outline"
					onclick={selectAllIocs}
					disabled={filteredIocs.length === 0 || selectedIocs.size === filteredIocs.length}
				>
					Select All
				</Button>

				<Button variant="outline" onclick={deselectAllIocs} disabled={selectedIocs.size === 0}>
					Deselect All
				</Button>

				<Button
					variant="destructive"
					onclick={removeSelectedIocs}
					disabled={selectedIocs.size === 0 || isRemoving}
				>
					{#if isRemoving}
						<span class="mr-1 animate-spin">⟳</span>
						Removing...
					{:else}
						<Trash2Icon class="mr-1" />
						Remove Selected
					{/if}
				</Button>

				<Button variant="outline" onclick={exitSelectionMode} class="text-xs">
					<XIcon class="mr-1" />
					Cancel
				</Button>
			{:else}
				<div class="relative w-full sm:w-64 md:w-80">
					<SearchIcon class="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

					<Input
						type="search"
						placeholder="Search IOCs..."
						class="w-full pl-9"
						value={searchQuery}
						oninput={handleSearch}
						disabled={isLoading || iocs.length === 0}
					/>
				</div>

				<Button
					variant="outline"
					onclick={toggleSelectionMode}
					disabled={filteredIocs.length === 0}
					class="whitespace-nowrap"
				>
					<CheckIcon class="mr-2" />
					Select
				</Button>

				<IocLinkButton
					assetId={asset.asset_id}
					caseId={asset.case_id}
					bind:hasRefreshed={needsRefresh}
					alreadyLinkedIocIds={linkedIocIds}
				/>
			{/if}
		</div>
	</header>

	{#if isLoading}
		<div class="space-y-4">
			{#each Array(3), i}
				<div class="rounded-lg border bg-card p-4" in:fade={{ delay: i * 100 }}>
					<div class="mb-3 flex items-center gap-3">
						<Skeleton class="h-6 w-6 rounded-full" />
						<Skeleton class="h-5 w-40" />
						<Skeleton class="ml-auto h-5 w-16" />
					</div>

					<Skeleton class="mb-2 h-4 w-full" />
					<Skeleton class="h-4 w-3/4" />
				</div>
			{/each}
		</div>
	{:else if error}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive"
			in:fade
		>
			<div class="mb-2 flex items-center gap-2">
				<AlertTriangleIcon class="h-5 w-5" />
				<h3 class="font-medium">Error Loading IOCs</h3>
			</div>

			<p>{error}</p>

			<Button variant="outline" class="mt-3" onclick={() => fetchIocs()}>Retry</Button>
		</div>
	{:else if linkedIocIds.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/30 p-10 text-center"
			in:fade
		>
			<div class="mb-4 rounded-full bg-muted/50 p-4">
				<ShieldAlertIcon class="h-8 w-8 text-muted-foreground/60" />
			</div>

			<h3 class="mb-1 text-lg font-medium">No IOCs Found</h3>

			<p class="max-w-md text-sm text-muted-foreground">
				This asset doesn't have any associated Indicators of Compromise.
			</p>
		</div>
	{:else if filteredIocs.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/50 bg-muted/30 p-10 text-center"
			in:fade
		>
			<div class="mb-4 rounded-full bg-muted/50 p-4">
				<SearchIcon class="h-8 w-8 text-muted-foreground/60" />
			</div>

			<h3 class="mb-1 text-lg font-medium">No Matching IOCs</h3>

			<p class="max-w-md text-sm text-muted-foreground">
				No IOCs match your search criteria. Try adjusting your search.
			</p>

			<Button variant="outline" class="mt-4" onclick={() => (searchQuery = '')}>
				Clear Search
			</Button>
		</div>
	{:else}
		{#if searchQuery}
			<div class="mb-4 flex items-center gap-2 text-sm">
				<span class="text-muted-foreground">Showing results for:</span>

				<Badge variant="secondary" class="gap-1 px-2 py-1">
					{searchQuery}
					<button class="ml-1 hover:text-primary" onclick={() => (searchQuery = '')}>×</button>
				</Badge>
			</div>
		{/if}

		<div class="space-y-6">
			{#each [...getGroupedIocs()] as [typeName, typeIocs]}
				<section in:slide={{ duration: 300 }}>
					<h3
						class="mb-3 flex items-center gap-2 border-b pb-1 text-sm font-medium text-muted-foreground"
					>
						<span>{typeName}</span>

						<span
							class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-muted px-1 text-[10px] font-medium leading-none text-muted-foreground transition-colors"
						>
							{typeIocs.length}
						</span>
					</h3>

					<div class="grid grid-cols-1 gap-4">
						{#each typeIocs as ioc (ioc.ioc_id)}
							<div class="group relative">
								{#if selectionMode}
									<div class="absolute left-3 top-1/2 z-10 -translate-y-1/2">
										<Checkbox
											checked={selectedIocs.has(ioc.ioc_id)}
											onchange={() => toggleIocSelection(ioc.ioc_id)}
											id={`ioc-select-${ioc.ioc_id}`}
										/>
									</div>
								{/if}

								<div
									class={cn('relative transition-all duration-200', selectionMode ? 'pl-10' : '')}
								>
									<IOCCard {ioc} />

									{#if !selectionMode}
										<div
											class="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
										>
											<Button
												variant="destructive"
												size="sm"
												onclick={() => removeIocs([ioc.ioc_id])}
												class="h-8 px-2 text-xs"
											>
												<Trash2Icon class="mr-1 h-3.5 w-3.5" />
												Remove
											</Button>
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</div>
