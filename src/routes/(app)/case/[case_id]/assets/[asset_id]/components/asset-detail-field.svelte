<script lang="ts">
	import { ServerIcon } from 'lucide-svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	type IconComponent = typeof ServerIcon;

	type Props = {
		label: string;
		value?: string | number | null;
		Icon: IconComponent;
	};

	let { label, value, Icon }: Props = $props();

	const displayValue = $derived(value ?? 'N/A');
	const canCopy = $derived(displayValue !== 'N/A' && displayValue.toString().length > 0);
</script>

<div class="rounded-lg bg-card/40 p-4">
	<div class="flex items-start gap-3">
		<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
			<Icon class="h-4 w-4" />
		</div>

		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium text-muted-foreground">{label}</p>

			<div class="flex items-center gap-1">
				<p class="break-all font-semibold text-foreground">{displayValue}</p>

				{#if canCopy}
					<ClipboardCopy value={displayValue.toString()} />
				{/if}
			</div>
		</div>
	</div>
</div>
