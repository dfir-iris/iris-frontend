<!--
  Token / context indicator — a slim status strip below the composer.

  Renders the current conversation's cumulative token spend, average
  context size across turns, and (when the caller owns the conversation)
  a compact "% of daily budget" tail that turns amber then red as the
  per-user cap approaches. Cache-hit chip appears only when the provider
  reports cache accounting AND the hit rate is above 10% — otherwise
  it's dead pixels for the vast majority of users.

  Tooltip surface breaks the totals down (prompt vs completion, cache
  read/create, last vs average context, org budget usage). Hover-only,
  no click target — the bar itself is passive.
-->
<script lang="ts">
	import type { ChatUsage } from '$lib/services/chat.service';

	let { usage }: { usage: ChatUsage | null } = $props();

	function fmt(n: number): string {
		if (n < 1000) return `${n}`;
		if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
		return `${(n / 1_000_000).toFixed(1)}M`;
	}

	function pct(used: number, budget: number): number {
		if (!budget) return 0;
		return Math.min(100, Math.round((used / budget) * 100));
	}

	// Cache hit rate — cached / (cached + fresh input). Only meaningful
	// when the provider actually reports cache reads; else we render 0
	// and hide the chip.
	const cacheHitRate = $derived.by<number>(() => {
		if (!usage) return 0;
		const cached = usage.cache_read_tokens_total;
		const fresh = usage.prompt_tokens_total;
		const denom = cached + fresh;
		if (denom <= 0) return 0;
		return Math.round((cached / denom) * 100);
	});

	const dailyPctUser = $derived.by<number>(() => {
		if (!usage?.daily) return 0;
		return pct(usage.daily.user_used, usage.daily.user_budget);
	});

	// Colour ramps for the daily-budget indicator. Kept as class strings
	// so Tailwind's JIT sees them at build time.
	const dailyTone = $derived.by<string>(() => {
		if (dailyPctUser >= 90) return 'text-destructive';
		if (dailyPctUser >= 70) return 'text-amber-600 dark:text-amber-400';
		return 'text-muted-foreground';
	});

	// Tooltip payload — a multi-line string, rendered via native `title`
	// so we don't pull in a Popover. Analysts asked for "give me the
	// numbers when I want them, don't chew screen space by default."
	const tooltip = $derived.by<string>(() => {
		if (!usage) return '';
		const lines = [
			`Prompt tokens: ${usage.prompt_tokens_total.toLocaleString()}`,
			`Completion tokens: ${usage.completion_tokens_total.toLocaleString()}`,
			`Cache read: ${usage.cache_read_tokens_total.toLocaleString()}`,
			`Cache create: ${usage.cache_creation_tokens_total.toLocaleString()}`,
			`Last context: ${usage.last_context_size.toLocaleString()} tokens`,
			`Avg context: ${usage.avg_context_size.toLocaleString()} tokens`,
			`Turns: ${usage.turn_count}`
		];
		if (usage.daily) {
			lines.push('');
			lines.push(
				`Today user: ${usage.daily.user_used.toLocaleString()} / ${usage.daily.user_budget.toLocaleString()}`
			);
			lines.push(
				`Today org:  ${usage.daily.org_used.toLocaleString()} / ${usage.daily.org_budget.toLocaleString()}`
			);
		}
		return lines.join('\n');
	});
</script>

{#if usage && usage.turn_count > 0}
	<div
		class="flex shrink-0 items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-2xs text-muted-foreground"
		title={tooltip}
		role="status"
		aria-label="Conversation token usage"
	>
		<span class="font-medium text-foreground/80">
			{fmt(usage.total_tokens)}
		</span>
		<span>tokens</span>
		<span class="text-muted-foreground/60">·</span>
		<span>
			avg ctx <span class="font-medium text-foreground/80">{fmt(usage.avg_context_size)}</span>
		</span>
		<span class="text-muted-foreground/60">·</span>
		<span>
			{usage.turn_count}
			{usage.turn_count === 1 ? 'turn' : 'turns'}
		</span>

		{#if cacheHitRate >= 10}
			<span
				class="ml-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
				title={`Prompt-cache hit rate: ${cacheHitRate}%`}
			>
				⚡ {cacheHitRate}% cached
			</span>
		{/if}

		{#if usage.daily && usage.daily.user_budget > 0 && dailyPctUser >= 25}
			<span class="ml-auto {dailyTone}">
				{dailyPctUser}% of daily
			</span>
		{/if}
	</div>
{/if}
