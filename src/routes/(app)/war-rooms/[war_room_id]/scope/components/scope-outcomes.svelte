<!--
  Per-case outcome of a fan-out write (create / push / set stage).
-->
<script lang="ts">
	import { OUTCOME_CLASS, OUTCOME_LABEL, summariseOutcomes, type ScopeOutcome } from './helpers';

	type Props = {
		rows: ScopeOutcome[];
		caseNames?: Record<number, string>;
	};

	let { rows, caseNames = {} }: Props = $props();
</script>

<div class="rounded-md border" data-testid="scope-outcomes">
	<p class="border-b bg-muted/30 px-3 py-1.5 text-xs font-medium">{summariseOutcomes(rows)}</p>
	<ul class="max-h-64 divide-y overflow-y-auto">
		{#each rows as r, i (i)}
			<li class="flex items-start gap-2 px-3 py-1.5 text-xs">
				<span
					class={[
						'mt-px shrink-0 rounded-md border px-1.5 py-px text-2xs font-medium',
						OUTCOME_CLASS[r.status] ?? OUTCOME_CLASS.error
					]}
				>
					{OUTCOME_LABEL[r.status] ?? r.status}
				</span>
				<span class="min-w-0 flex-1">
					{#if r.label}
						<span class="font-medium">{r.label}</span>
						<span class="text-muted-foreground">→</span>
					{/if}
					<span class="font-mono text-2xs text-muted-foreground">#{r.case_id}</span>
					{#if caseNames[r.case_id]}
						<span>{caseNames[r.case_id]}</span>
					{/if}
					{#if r.message}
						<span class="block text-2xs text-muted-foreground">{r.message}</span>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</div>
