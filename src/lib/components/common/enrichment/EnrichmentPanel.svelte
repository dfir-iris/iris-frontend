<!--
  Enrichment of an IOC or an asset, one block per source (VirusTotal,
  MISP, a workflow…): its summary, verdict, link and one-line fields.
  The full payload stays one click away in the JSON dialog.
-->
<script lang="ts">
	import { BracesIcon, ExternalLinkIcon } from 'lucide-svelte';
	import EnrichmentDialog from '$lib/components/common/EnrichmentDialog.svelte';
	import { cn } from '$lib/utils';
	import { enrichmentSources } from './enrichment-view';

	type Props = {
		enrichment: unknown;
		/** What the enrichment belongs to, for the JSON dialog title. */
		subject?: string;
	};

	let { enrichment, subject = '' }: Props = $props();

	const sources = $derived(enrichmentSources(enrichment));
	let rawOpen = $state(false);

	const VERDICT_TONES: Record<string, string> = {
		malicious: 'border-destructive/30 bg-destructive/10 text-destructive',
		suspicious: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
		clean: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
	};
</script>

{#if sources.length}
	<section class="mt-6 space-y-2" data-testid="enrichment-panel">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Enrichment
			</h3>
			<button
				type="button"
				class="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
				onclick={() => (rawOpen = true)}
			>
				<BracesIcon size={12} />
				JSON
			</button>
		</div>

		{#each sources as src (src.key)}
			<div class="rounded-md border bg-muted/20 p-3" data-testid={`enrichment-${src.key}`}>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-medium">{src.label}</span>
					{#if src.verdict}
						<span
							class={cn(
								'rounded border px-1.5 py-px text-2xs font-medium capitalize',
								VERDICT_TONES[src.verdict.toLowerCase()] ?? 'bg-muted text-muted-foreground'
							)}
						>
							{src.verdict}
						</span>
					{/if}
					{#if src.link}
						<a
							href={src.link}
							target="_blank"
							rel="noopener noreferrer"
							class="ml-auto flex items-center gap-1 text-2xs text-primary hover:underline"
						>
							Open report
							<ExternalLinkIcon size={11} />
						</a>
					{/if}
				</div>

				{#if src.summary}
					<p class="mt-1.5 text-sm leading-relaxed">{src.summary}</p>
				{/if}

				{#if src.fields.length}
					<dl class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
						{#each src.fields as field (field.label)}
							<dt class="text-muted-foreground">{field.label}</dt>
							<dd class="min-w-0 break-words">{field.value}</dd>
						{/each}
					</dl>
				{/if}

				{#if src.hasMore}
					<button
						type="button"
						class="mt-1.5 text-2xs text-muted-foreground hover:text-foreground hover:underline"
						onclick={() => (rawOpen = true)}
					>
						More in the JSON view
					</button>
				{/if}
			</div>
		{/each}
	</section>

	<EnrichmentDialog bind:open={rawOpen} {subject} {enrichment} />
{/if}
