<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { BiohazardIcon, FilterIcon, PlusIcon, TagIcon } from 'lucide-svelte';
	import type { LayoutData } from './$types';
	import { Badge } from '$lib/components/ui/badge';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="flex h-full flex-row">
	<div class="flex h-full w-1/3 shrink-0 flex-col gap-y-3 border-r bg-background/50 p-6">
		<!-- Top of sidebar -->
		<div class="flex flex-row items-center gap-x-2">
			<h2 class="w-full">Assets</h2>
			<Button variant="outline" size="icon" class="shrink-0">
				<FilterIcon size={20}></FilterIcon>
			</Button>
			<Button>
				<PlusIcon size={20}></PlusIcon>
				Add
			</Button>
		</div>
		<Searchbar placeholder="Search assets" />

		<!-- Sidebar items -->
		{#await data.assets}
			{#each Array(5) as _}
				<div class="space-y-1.5 rounded border bg-background p-3 text-sm shadow">
					<div class="flex flex-row gap-x-1">
						<Skeleton class="h-6 w-1/2 shrink-0"></Skeleton>
						<div class="w-full"></div>
						<Skeleton class="h-6 w-16"></Skeleton>
						<Skeleton class="h-6 w-16"></Skeleton>
					</div>
					<Skeleton class="h-4 w-1/2 shrink-0"></Skeleton>
					<Skeleton class="h-4 w-1/3 shrink-0"></Skeleton>
				</div>
			{/each}
		{:then { data: assets }}
			{#each assets.data as asset}
				<div class="rounded border bg-background p-3 text-sm shadow">
					<div class="flex flex-row gap-x-1">
						<!-- Asset name & address -->
						<a
							class="w-full justify-start text-base underline"
							href="/case/{page.params.case_id}/assets/{asset.asset_id}"
							>{asset.asset_name}
							<small class="font-mono"
								>({asset.asset_domain || asset.asset_ip || 'no address'})</small
							>
						</a>

						<!-- Counter badges of iocs/tags -->
						<Badge tooltip="IOCs" icon={BiohazardIcon} variant="secondary"
							>{asset.ioc_links?.length || '0'}</Badge
						>
						<Badge tooltip="Tags" icon={TagIcon} variant="secondary"
							>{asset.asset_tags?.length || '0'}</Badge
						>
					</div>
					<p>{asset.asset_description || 'No description'}</p>
					<p class="w-full text-muted-foreground">
						{asset.asset_type?.asset_name || asset.asset_type_id}
					</p>
				</div>
			{/each}
		{/await}
	</div>

	<div class="flex h-full w-full flex-col gap-y-2 overflow-y-auto p-12">
		<div class="flex h-full w-full flex-col">
			{@render children()}
		</div>
	</div>
</div>
