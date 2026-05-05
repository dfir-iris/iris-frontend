<script lang="ts">
	import { getContext } from 'svelte';
	import { BiohazardIcon, CheckCheckIcon, ComputerIcon, FileIcon, PlusIcon } from 'lucide-svelte';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { newAsset } from '../assets/helpers';
	import { newIoc } from '../iocs/helpers';
	import { newNote } from '../notes/helpers';

	export let buttonClass: string = '';

	const caseNotes = getContext<CaseNotesContext>(CASE_NOTES_CTX);
	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
</script>

<DropdownMenu>
	<!-- Add item btn -->
	<DropdownMenuTrigger>
		<!-- Compact version for topbar -->
		<Button variant="outline" size="sm" class={`gap-x-1 ${buttonClass}`}>
			<PlusIcon size={16} />
			<span class="hidden sm:inline">Add Item</span>
		</Button>
	</DropdownMenuTrigger>

	<!-- Dropdown items -->
	<DropdownMenuContent class="shadow" align={'end'} side={'bottom'}>
		<DropdownMenuItem onclick={() => newNote(caseNotes)}>
			<FileIcon class="mr-2 h-4 w-4" />
			<span>Note</span>
		</DropdownMenuItem>
		<DropdownMenuItem>
			<CheckCheckIcon class="mr-2 h-4 w-4" />
			<span>Task</span>
		</DropdownMenuItem>
		<DropdownMenuItem onclick={() => newAsset(caseAssets)}>
			<ComputerIcon class="mr-2 h-4 w-4" />
			<span>Asset</span>
		</DropdownMenuItem>
		<DropdownMenuItem onclick={() => newIoc(caseIocs)}>
			<BiohazardIcon class="mr-2 h-4 w-4" />
			<span>IOC</span>
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>
