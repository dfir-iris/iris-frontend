<script lang="ts">
	import { ArrowLeftIcon, RotateCcwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import OtterIllustration from '$lib/components/common/OtterIllustration.svelte';

	let {
		reason,
		caseId,
		onRetry
	}: {
		reason: 'not-found' | 'denied' | 'error';
		caseId: string;
		onRetry?: () => void;
	} = $props();

	const copy = $derived(
		{
			'not-found': {
				sign: '404',
				title: 'Case not found',
				message: `There is no case #${caseId}. It may have been deleted, or the link is wrong.`
			},
			denied: {
				sign: '403',
				title: 'No access to this case',
				message: `You don't have access to case #${caseId}. Ask a case owner or an administrator to grant it.`
			},
			error: {
				sign: '???',
				title: 'Could not load this case',
				message: `Case #${caseId} could not be loaded. The server may be unreachable — try again in a moment.`
			}
		}[reason]
	);
</script>

<div
	class="flex h-full w-full grow flex-col items-center justify-center gap-y-3 p-8 text-center"
	data-testid="case-unavailable"
	data-reason={reason}
>
	<OtterIllustration sign={copy.sign} class="h-40 w-60" />
	<h1 class="text-xl font-semibold">{copy.title}</h1>
	<p class="max-w-md text-sm text-muted-foreground">{copy.message}</p>
	<div class="mt-2 flex gap-2">
		<Button variant="outline" href="/cases">
			<ArrowLeftIcon class="mr-2 size-4" /> Back to cases
		</Button>
		{#if reason === 'error' && onRetry}
			<Button onclick={onRetry}>
				<RotateCcwIcon class="mr-2 size-4" /> Retry
			</Button>
		{/if}
	</div>
</div>
