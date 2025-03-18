<script lang="ts">
	import { BiohazardIcon, CheckCheckIcon, ComputerIcon, FileIcon, PlusIcon } from 'lucide-svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';

	export let isCollapsed: boolean = false;
	export let buttonClass: string = '';
	export let inTopbar: boolean = false;
</script>

<DropdownMenu>
	<!-- Add item btn -->
	<DropdownMenuTrigger asChild>
		{#if inTopbar}
			<!-- Compact version for topbar -->
			<Button variant="outline" size="sm" class={`gap-x-1 ${buttonClass}`}>
				<PlusIcon size={16} />
				<span class="hidden sm:inline">Add Item</span>
			</Button>
		{:else if isCollapsed}
			<!-- Collapsed sidebar version -->
			<Button variant="outline" class="gap-x-1 px-4">
				<PlusIcon size={24} />
			</Button>
		{:else}
			<!-- Expanded sidebar version -->
			<Button variant="outline" class="gap-x-1 px-4 py-5">
				<PlusIcon size={24} /> Add Item
			</Button>
		{/if}
	</DropdownMenuTrigger>

	<!-- Dropdown items -->
	<DropdownMenuContent 
		class="shadow" 
		align={inTopbar ? "end" : "start"} 
		side={inTopbar ? "bottom" : "left"}
	>
		<DropdownMenuItem>
			<FileIcon class="mr-2 h-4 w-4" />
			<span>Note</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<CheckCheckIcon class="mr-2 h-4 w-4" />
			<span>Task</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<ComputerIcon class="mr-2 h-4 w-4" />
			<span>Asset</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<BiohazardIcon class="mr-2 h-4 w-4" />
			<span>IOC</span>
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>