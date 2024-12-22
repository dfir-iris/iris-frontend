<script lang="ts">
	import { BiohazardIcon, CheckCheckIcon, ComputerIcon, FileIcon, PlusIcon } from 'lucide-svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';

	let { isCollapsed }: { isCollapsed: boolean } = $props();
</script>

<DropdownMenu>
	<!-- Add item btn -->
	<DropdownMenuTrigger class="w-fit {isCollapsed ? '' : ''}">
		{#if isCollapsed}
			<Button variant="outline" class="gap-x-1 px-2">
				<PlusIcon size={24} />
			</Button>
		{:else}
			<Button variant="outline" class="gap-x-1 px-4 py-5">
				<PlusIcon size={24} /> Add Item
			</Button>
		{/if}
	</DropdownMenuTrigger>

	<!-- Dropdown items -->
	<DropdownMenuContent class=" shadow" align="start" side="left">
		<DropdownMenuItem>
			<FileIcon class="mr-1 h-4 w-4" />
			<span>Note</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<CheckCheckIcon class="mr-1 h-4 w-4" />
			<span>Task</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<ComputerIcon class="mr-1 h-4 w-4" />
			<span>Asset</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<BiohazardIcon class="mr-1 h-4 w-4" />
			<span>IOC</span>
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>
