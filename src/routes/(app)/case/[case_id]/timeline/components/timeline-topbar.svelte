<script lang="ts">
	import {
		ChevronDownIcon,
		ChevronUpIcon,
		EllipsisVerticalIcon,
		FilterIcon,
		ListIcon,
		ListTreeIcon,
		RefreshCwIcon,
		SearchIcon,
		XIcon
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
	import TimelineFilters from './timeline-filters.svelte';

	type ViewMode = 'list' | 'tree';

	type Props = {
		filters: TimelineFilterData;
		eventCategories: EventCategory[];
		viewMode: ViewMode;
		quickSearch: string;
		quickSearchMatchIndex: number;
		quickSearchMatchCount: number;
		quickSearchLoading?: boolean;
		onUpdateFilter: (field: keyof TimelineFilterData, value: TimelineFilterFieldValue) => void;
		onApplyFilters: () => void;
		onClearFilters: () => void;
		onRefresh: () => void;
		onAddEvent: () => void;
		onViewModeChange: (mode: ViewMode) => void;
		onQuickSearchChange: (value: string) => void;
		onQuickSearchNext: () => void;
		onQuickSearchPrev: () => void;
		onDownloadCsv: () => void;
		onDownloadCsvWithUserInfo: () => void;
		onUploadCsv: () => void;
		canEdit?: boolean;
	};

	let {
		filters,
		eventCategories,
		viewMode,
		quickSearch,
		quickSearchMatchIndex,
		quickSearchMatchCount,
		quickSearchLoading = false,
		onUpdateFilter,
		onApplyFilters,
		onClearFilters,
		onRefresh,
		onAddEvent: _onAddEvent,
		onViewModeChange,
		onQuickSearchChange,
		onQuickSearchNext,
		onQuickSearchPrev,
		onDownloadCsv,
		onDownloadCsvWithUserInfo,
		onUploadCsv,
		canEdit = true
	}: Props = $props();

	let isMenuOpen = $state(false);
	let showFilters = $state(false);

	const handleQuickSearchKey = (e: KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (e.shiftKey) onQuickSearchPrev();
		else onQuickSearchNext();
	};
</script>

<div class="border-b border-border bg-card">
	<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2">
		<div class="flex items-center gap-1.5">
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

		<div
			class="flex w-80 max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 pl-2 pr-1 focus-within:border-primary focus-within:bg-background dark:bg-slate-800/60"
		>
			<SearchIcon class="size-3.5 shrink-0 text-muted-foreground" />
			<input
				type="text"
				value={quickSearch}
				oninput={(e) => onQuickSearchChange((e.target as HTMLInputElement).value)}
				onkeydown={handleQuickSearchKey}
				placeholder="Search timeline…"
				class="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
				aria-label="Quick search timeline"
			/>

			{#if quickSearch}
				<span
					class="flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs tabular-nums text-muted-foreground"
					aria-live="polite"
				>
					{#if quickSearchLoading}
						<RefreshCwIcon class="size-3 animate-spin" />
						Loading…
					{:else}
						{quickSearchMatchCount === 0
							? 'No matches'
							: `${quickSearchMatchIndex + 1}/${quickSearchMatchCount}`}
					{/if}
				</span>

				<div class="flex shrink-0 items-center">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<button
									type="button"
									class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
									disabled={quickSearchMatchCount === 0}
									aria-label="Previous match"
									onclick={onQuickSearchPrev}
								>
									<ChevronUpIcon class="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Previous match (Shift+Enter)</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<button
									type="button"
									class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
									disabled={quickSearchMatchCount === 0}
									aria-label="Next match"
									onclick={onQuickSearchNext}
								>
									<ChevronDownIcon class="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Next match (Enter)</TooltipContent>
						</Tooltip>
					</TooltipProvider>

					<button
						type="button"
						class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Clear search"
						onclick={() => onQuickSearchChange('')}
					>
						<XIcon class="size-3.5" />
					</button>
				</div>
			{/if}
		</div>

		<div class="flex items-center justify-end gap-1.5">
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

			<!--
			  "Add event" lives in the case top bar (CaseQuickAddButton)
			  so we don't render a duplicate here. The empty-state CTA
			  rendered when the timeline has no events is still wired
			  via onAddEvent — that's why the prop survives.
			-->
			<DropdownMenu bind:open={isMenuOpen}>
				<DropdownMenuTrigger>
					<Button variant="ghost" size="icon" class="size-8">
						<EllipsisVerticalIcon class="size-4" />
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end">
					<DropdownMenuItem onclick={onDownloadCsv}>Download as CSV</DropdownMenuItem>

					<DropdownMenuItem onclick={onDownloadCsvWithUserInfo}>
						Download as CSV with user info
					</DropdownMenuItem>

					{#if canEdit}
						<Separator class="my-2" />

						<DropdownMenuItem onclick={onUploadCsv}>Upload CSV of events</DropdownMenuItem>
					{/if}
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
