<script lang="ts">
	import {
		EllipsisVerticalIcon,
		FilterIcon,
		ListIcon,
		ListTreeIcon,
		PlusIcon,
		RefreshCwIcon
	} from 'lucide-svelte';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import { Button } from '$lib/components/ui/button';
	import { DropdownMenu, DropdownMenuTrigger } from '$lib/components/ui/dropdown-menu';
	import DropdownMenuContent from '$lib/components/ui/dropdown-menu/dropdown-menu-content.svelte';
	import DropdownMenuItem from '$lib/components/ui/dropdown-menu/dropdown-menu-item.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import type { TimelineFilterData, TimelineFilterFieldValue } from '../types';
	import { visualize } from '../visualize/helpers';
	import TimelineFilters from './timeline-filters.svelte';

	type ViewMode = 'list' | 'tree';

	type Props = {
		filters: TimelineFilterData;
		eventCategories: EventCategory[];
		viewMode: ViewMode;
		onUpdateFilter: (field: keyof TimelineFilterData, value: TimelineFilterFieldValue) => void;
		onApplyFilters: () => void;
		onClearFilters: () => void;
		onRefresh: () => void;
		onAddEvent: () => void;
		onViewModeChange: (mode: ViewMode) => void;
		onDownloadCsv: () => void;
		onDownloadCsvWithUserInfo: () => void;
		onUploadCsv: () => void;
	};

	let {
		filters,
		eventCategories,
		viewMode,
		onUpdateFilter,
		onApplyFilters,
		onClearFilters,
		onRefresh,
		onAddEvent,
		onViewModeChange,
		onDownloadCsv,
		onDownloadCsvWithUserInfo,
		onUploadCsv
	}: Props = $props();

	let isMenuOpen = $state(false);
	let showFilters = $state(false);
</script>

<div class="border-b border-border bg-card">
	<div class="flex items-center px-4 py-2">
		<div class="mr-auto flex items-center gap-1.5">
			<h2 class="mr-2 text-sm font-semibold">Timeline</h2>

			<Button
				variant={showFilters ? 'secondary' : 'ghost'}
				size="sm"
				onclick={() => (showFilters = !showFilters)}
			>
				<FilterIcon class="mr-1.5 size-3.5" />
				Filter
			</Button>

			<Button variant="ghost" size="sm" onclick={onRefresh}>
				<RefreshCwIcon class="mr-1.5 size-3.5" />
				Refresh
			</Button>
		</div>

		<div class="ml-auto flex items-center gap-1.5">
			<div class="mr-1 flex items-center overflow-hidden rounded-md border border-border">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Button
								variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
								size="icon"
								class="size-7 rounded-none"
								onclick={() => onViewModeChange('tree')}
							>
								<ListTreeIcon class="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Tree view</TooltipContent>
					</Tooltip>
				</TooltipProvider>

				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Button
								variant={viewMode === 'list' ? 'secondary' : 'ghost'}
								size="icon"
								class="size-7 rounded-none"
								onclick={() => onViewModeChange('list')}
							>
								<ListIcon class="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>List view</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<Button variant="default" size="sm" onclick={onAddEvent}>
				<PlusIcon class="mr-1 size-3.5" />
				Add event
			</Button>

			<DropdownMenu bind:open={isMenuOpen}>
				<DropdownMenuTrigger>
					<Button variant="ghost" size="icon" class="size-8">
						<EllipsisVerticalIcon class="size-4" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end">
					<DropdownMenuItem onclick={() => visualize()}>Visualize</DropdownMenuItem>

					<DropdownMenuItem onclick={() => visualize('asset')}>Visualize by asset</DropdownMenuItem>

					<DropdownMenuItem onclick={() => visualize('category')}
						>Visualize by category</DropdownMenuItem
					>

					<Separator class="my-2" />

					<DropdownMenuItem onclick={onDownloadCsv}>Download as CSV</DropdownMenuItem>

					<DropdownMenuItem onclick={onDownloadCsvWithUserInfo}>
						Download as CSV with user info
					</DropdownMenuItem>

					<Separator class="my-2" />

					<DropdownMenuItem onclick={onUploadCsv}>Upload CSV of events</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>

	{#if showFilters}
		<TimelineFilters
			{filters}
			{eventCategories}
			onUpdateField={onUpdateFilter}
			onApply={onApplyFilters}
			onClear={onClearFilters}
		/>
	{/if}
</div>
