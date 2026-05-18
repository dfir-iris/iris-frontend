<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { DropdownMenu, DropdownMenuTrigger } from '$lib/components/ui/dropdown-menu';
	import { EllipsisVerticalIcon } from 'lucide-svelte';
	import DropdownMenuContent from '$lib/components/ui/dropdown-menu/dropdown-menu-content.svelte';
	import DropdownMenuItem from '$lib/components/ui/dropdown-menu/dropdown-menu-item.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';

	type TimelineView = 'normal' | 'tree';

	type Props = {
		filter: string;
		compact: boolean;
		view: TimelineView;
		onRefresh: () => void;
		onAddEvent: () => void;
		onToggleView: () => void;
		onToggleCompact: () => void;
		onDownloadCsv: () => void;
		onDownloadCsvWithUserInfo: () => void;
		onUploadCsv: () => void;
	};

	let {
		filter = $bindable(),
		compact,
		view,
		onRefresh,
		onAddEvent,
		onToggleView,
		onToggleCompact,
		onDownloadCsv,
		onDownloadCsvWithUserInfo,
		onUploadCsv
	}: Props = $props();

	let isMenuOpen = $state<boolean>(false);
</script>

<div class="flex items-center gap-2 bg-primary px-6 py-3">
	<Input bind:value={filter} placeholder="Filter timeline" class="h-8 max-w-72 text-xs" />

	<Button variant="secondary" size="sm">Apply filter</Button>

	<Button variant="secondary" size="sm" onclick={() => (filter = '')}>Reset</Button>

	<div class="ml-auto flex items-center gap-2">
		<Button variant="secondary" size="sm" onclick={onRefresh}>Refresh</Button>

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
