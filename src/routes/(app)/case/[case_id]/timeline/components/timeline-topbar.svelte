<script lang="ts">
	import { EllipsisVerticalIcon } from 'lucide-svelte';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import { Button } from '$lib/components/ui/button';
	import { DropdownMenu, DropdownMenuTrigger } from '$lib/components/ui/dropdown-menu';
	import DropdownMenuContent from '$lib/components/ui/dropdown-menu/dropdown-menu-content.svelte';
	import DropdownMenuItem from '$lib/components/ui/dropdown-menu/dropdown-menu-item.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import type { TimelineFilterData, TimelineFilterFieldValue } from '../types';
	import TimelineFilters from './timeline-filters.svelte';

	type TimelineView = 'normal' | 'tree';

	type Props = {
		filters: TimelineFilterData;
		eventCategories: EventCategory[];
		compact: boolean;
		view: TimelineView;
		onUpdateFilter: (field: keyof TimelineFilterData, value: TimelineFilterFieldValue) => void;
		onApplyFilters: () => void;
		onClearFilters: () => void;
		onRefresh: () => void;
		onAddEvent: () => void;
		onToggleView: () => void;
		onToggleCompact: () => void;
		onDownloadCsv: () => void;
		onDownloadCsvWithUserInfo: () => void;
		onUploadCsv: () => void;
	};

	let {
		filters,
		eventCategories,
		compact,
		view,
		onUpdateFilter,
		onApplyFilters,
		onClearFilters,
		onRefresh,
		onAddEvent,
		onToggleView,
		onToggleCompact,
		onDownloadCsv,
		onDownloadCsvWithUserInfo,
		onUploadCsv
	}: Props = $props();

	let isMenuOpen = $state(false);
	let showFilters = $state(false);
</script>

<div class="bg-primary">
	<div class="flex px-6 py-3">
		<div class="mr-auto flex items-center gap-2">
			<Button variant="secondary" size="sm" onclick={() => (showFilters = !showFilters)}>
				Filter
			</Button>

			<Button variant="secondary" size="sm" onclick={onRefresh}>Refresh</Button>
		</div>

		<div class="ml-auto flex items-center gap-2">
			<Button variant="secondary" size="sm" onclick={onAddEvent}>Add event</Button>

			<DropdownMenu bind:open={isMenuOpen}>
				<DropdownMenuTrigger>
					<Button variant="ghost" size="sm" class="text-white hover:bg-white/10 hover:text-white">
						<EllipsisVerticalIcon />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end">
					<DropdownMenuItem onclick={onToggleView}>
						Toggle {view === 'normal' ? 'Tree' : 'Normal'} View
					</DropdownMenuItem>
					<DropdownMenuItem onclick={onToggleCompact}>
						Toggle {compact ? 'Detailed' : 'Compact'} View
					</DropdownMenuItem>

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
