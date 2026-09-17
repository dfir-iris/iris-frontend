<script lang="ts">
	import { Link, ChevronDown, Search, X, CheckSquare, Square } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Badge } from '$lib/components/ui/badge';
	import { toast } from '$lib/components/ui/toast';

	let {
		caseId,
		assetId = undefined,
		alreadyLinkedIocIds = [],
		hasRefreshed = $bindable(false),
		mode = 'link',
		selectedForLinking = $bindable<Ioc[]>([])
	}: {
		caseId: number;
		assetId?: number;
		alreadyLinkedIocIds?: number[];
		hasRefreshed?: boolean;
		mode?: 'link' | 'select';
		selectedForLinking?: Ioc[];
	} = $props();

	let showIOCDropdown = $state(false);
	let iocList = $state<Ioc[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let searchTerm = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = $state(null);
	let currentPage = $state(1);
	let nextPage = $state<number | null>(null);
	let initialFetchDone = $state(false);

	let internalSelectedIocMap = $state<Map<number, Ioc>>(new Map());
	let initialSelectedOnOpenForSelectMode = $state<Ioc[] | undefined>(undefined);

	$effect(() => {
		if (mode === 'select') {
			if (showIOCDropdown) {
				if (initialSelectedOnOpenForSelectMode === undefined) {
					initialSelectedOnOpenForSelectMode = [...selectedForLinking];

					const newMap = new Map<number, Ioc>();
					initialSelectedOnOpenForSelectMode.forEach((ioc) => newMap.set(ioc.ioc_id, ioc));
					internalSelectedIocMap = newMap;
				}
			} else {
				initialSelectedOnOpenForSelectMode = undefined;
			}
		} else {
			initialSelectedOnOpenForSelectMode = undefined;
		}
	});

	let displayableIocs = $state<Ioc[]>([]);

	$effect(() => {
		if (searchTerm) {
			displayableIocs = iocList.filter(
				(ioc) =>
					ioc.ioc_value.toLowerCase().includes(searchTerm.toLowerCase()) ||
					(ioc.ioc_description ?? '').toLowerCase().includes(searchTerm.toLowerCase())
			);
		} else if (mode === 'link') {
			displayableIocs = iocList.filter((ioc) => !alreadyLinkedIocIds.includes(ioc.ioc_id));
		} else {
			displayableIocs = iocList;
		}
	});

	function buildSearchConditions(term: string) {
		if (!term) return undefined;

		return JSON.stringify([
			{ field: 'ioc_value', operator: 'like', value: term },
			{ field: 'ioc_description', operator: 'like', value: term }
		]);
	}

	async function fetchCaseIOCs(page = 1, resetList = true) {
		if (page === 1 && resetList && isLoading) return;

		isLoading = true;
		error = null;

		try {
			const response = await CaseIocsService.list(
				caseId,
				{
					page,
					per_page: 10,
					custom_conditions: buildSearchConditions(searchTerm)
				},
				{ fetch }
			);

			if (!response.ok || response.error || !response.data || typeof response.data === 'string') {
				throw new Error(response.error?.message ?? 'Failed to load IOCs');
			}

			const newIocs = response.data.data;

			nextPage = response.data.next_page;

			if (resetList) {
				iocList = newIocs;
			} else {
				iocList = [...iocList, ...newIocs];
			}

			initialFetchDone = true;
		} catch (err) {
			console.error('Error fetching IOCs:', err);
			error = 'Failed to load IOCs. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function handleSearchInput() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}

		searchTimeout = setTimeout(() => {
			currentPage = 1;
			fetchCaseIOCs(1, true);
		}, 300);
	}

	function clearSearch() {
		searchTerm = '';
		currentPage = 1;
		fetchCaseIOCs(1, true);
	}

	function loadMore() {
		if (nextPage !== null && !isLoading) {
			currentPage = nextPage;
			fetchCaseIOCs(currentPage, false);
		}
	}

	async function linkIOCToAsset(ioc: Ioc) {
		if (mode !== 'link' || !assetId) return;

		try {
			const response = await CaseAssetsService.update(
				caseId,
				assetId,
				{
					ioc_links: [...new Set([...alreadyLinkedIocIds, ioc.ioc_id])].map(String)
				},
				{ fetch }
			);

			if (!response.ok || response.error) {
				throw new Error(response.error?.message ?? 'Failed to link IOC');
			}

			hasRefreshed = true;
			showIOCDropdown = false;

			toast({
				title: 'IOC linked',
				description: 'The IOC has been successfully linked to the asset.',
				variant: 'success'
			});
		} catch (err) {
			console.error('Error linking IOC:', err);
			error = 'Failed to link IOC. Please try again.';

			toast({
				title: 'Link failed',
				description: 'Failed to link IOC. Please try again.',
				variant: 'destructive'
			});
		}
	}

	// Dark-mode shades mirror TlpBadge.svelte — see the note there.
	function getTLPColorClasses(tlpName: string) {
		switch (tlpName.toLowerCase().replace('tlp:', '')) {
			case 'red':
				return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
			case 'amber':
				return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
			case 'green':
				return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
			case 'white':
				return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
			default:
				return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20';
		}
	}

	function handleIOCInteraction(ioc: Ioc) {
		if (mode === 'link') {
			linkIOCToAsset(ioc);
		} else {
			const currentMap = new Map(internalSelectedIocMap);

			if (currentMap.has(ioc.ioc_id)) {
				currentMap.delete(ioc.ioc_id);
			} else {
				currentMap.set(ioc.ioc_id, ioc);
			}

			internalSelectedIocMap = currentMap;
		}
	}

	$effect(() => {
		if (showIOCDropdown && !initialFetchDone) {
			fetchCaseIOCs();
		}

		if (!showIOCDropdown && mode === 'select') {
			const newSelectionArray = Array.from(internalSelectedIocMap.values());

			const currentPropIds = new Set(selectedForLinking.map((ioc) => ioc.ioc_id));
			const newSelectionIds = new Set(newSelectionArray.map((ioc) => ioc.ioc_id));

			let needsUpdate = currentPropIds.size !== newSelectionIds.size;

			if (!needsUpdate) {
				for (const id of newSelectionIds) {
					if (!currentPropIds.has(id)) {
						needsUpdate = true;
						break;
					}
				}
			}

			if (needsUpdate) {
				selectedForLinking = newSelectionArray;
			}
		}
	});
</script>

<div class="flex gap-2">
	<Popover bind:open={showIOCDropdown}>
		<PopoverTrigger>
			<Button variant="outline" class="whitespace-nowrap">
				<Link class="mr-2 h-4 w-4" />

				{#if mode === 'link'}
					Link IOC
				{:else}
					Select IOCs
					{#if internalSelectedIocMap.size > 0}
						({internalSelectedIocMap.size})
					{/if}
				{/if}

				<ChevronDown class="ml-1 h-3 w-3 opacity-70" />
			</Button>
		</PopoverTrigger>

		<PopoverContent class="w-80 p-0" align="end">
			<div class="border-b p-2">
				<h4 class="text-sm font-medium">
					{#if mode === 'link'}
						Link IOC to Asset
					{:else}
						Select IOCs to Link
					{/if}
				</h4>

				<p class="text-xs text-muted-foreground">
					{#if mode === 'link'}
						Select an IOC to link to this asset
					{:else}
						Choose IOCs from the list below
					{/if}
				</p>
			</div>

			<div class="border-b p-2">
				<div class="relative">
					<Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />

					<Input
						type="search"
						placeholder="Search IOCs..."
						class={cn('h-9 pl-8 text-sm', searchTerm ? 'pr-8' : '')}
						bind:value={searchTerm}
						oninput={handleSearchInput}
					/>

					{#if searchTerm}
						<button
							type="button"
							class="absolute right-2 top-2.5 text-muted-foreground transition-colors hover:text-foreground"
							onclick={clearSearch}
							aria-label="Clear search"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>

			<div
				class="max-h-[300px] overflow-y-auto"
				onscroll={(e) => {
					const target = e.target as HTMLDivElement;

					if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
						loadMore();
					}
				}}
			>
				{#if isLoading && iocList.length === 0}
					<div class="flex justify-center py-4">
						<div
							class="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
						></div>
					</div>
				{:else if error}
					<div class="p-3 text-xs text-destructive">{error}</div>
				{:else if iocList.length === 0 && !searchTerm}
					<div class="p-3 text-center text-xs text-muted-foreground">
						No IOCs found for this case.
					</div>
				{:else if displayableIocs.length === 0}
					<div class="p-3 text-center text-xs text-muted-foreground">
						{#if mode === 'link'}
							{searchTerm
								? 'No unlinked IOCs match your search.'
								: 'All available IOCs for this case are already linked or none exist.'}
						{:else}
							{searchTerm ? 'No IOCs match your search.' : 'No IOCs found for this case.'}
						{/if}
					</div>
				{:else}
					<div class="py-1">
						{#each displayableIocs as ioc}
							{@const isSelectedInSelectMode =
								mode === 'select' && internalSelectedIocMap.has(ioc.ioc_id)}
							{@const tlpName = ioc.tlp?.tlp_name ?? 'unknown'}

							<button
								class={cn(
									'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
									isSelectedInSelectMode ? 'bg-primary/10' : ''
								)}
								onclick={() => handleIOCInteraction(ioc)}
								disabled={mode === 'link' && alreadyLinkedIocIds.includes(ioc.ioc_id)}
							>
								{#if mode === 'select'}
									{#if isSelectedInSelectMode}
										<CheckSquare class="h-4 w-4 shrink-0 text-primary" />
									{:else}
										<Square class="h-4 w-4 shrink-0 text-muted-foreground" />
									{/if}
								{/if}

								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-2">
										<code class="flex-1 truncate break-all font-mono text-xs text-foreground/90">
											{ioc.ioc_value}
										</code>

										<Badge
											variant="outline"
											class={cn(
												'h-4 whitespace-nowrap border px-1.5 py-0 text-xs capitalize',
												getTLPColorClasses(tlpName)
											)}
										>
											{tlpName.toLowerCase().startsWith('tlp:') ? tlpName : `TLP:${tlpName}`}
										</Badge>
									</div>

									{#if ioc.ioc_description}
										<p class="mt-0.5 truncate text-xs italic text-muted-foreground">
											{ioc.ioc_description}
										</p>
									{/if}
								</div>
							</button>
						{/each}

						{#if isLoading && iocList.length > 0}
							<div class="flex justify-center py-2">
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
								></div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</PopoverContent>
	</Popover>
</div>
