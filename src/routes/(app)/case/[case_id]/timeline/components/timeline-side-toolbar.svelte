<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowUpIcon,
		CheckCheckIcon,
		PlusCircleIcon,
		RefreshCwIcon,
		TreePineIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<div class="fixed bottom-8 right-8 flex flex-col gap-3">
	<Button variant="ghost" size="icon"><CheckCheckIcon /></Button>
	<Button variant="ghost" size="icon"><PlusCircleIcon /></Button>
	<Button variant="ghost" size="icon"><TreePineIcon /></Button>
	<Button variant="ghost" size="icon"><RefreshCwIcon /></Button>
	<Button variant="ghost" size="icon"><ArrowUpIcon /></Button>
	<Button variant="ghost" size="icon"><ArrowDownIcon /></Button>
</div>
