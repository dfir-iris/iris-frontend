<!--
  Compact pager for the scope lists: "101–200 of 2,345 assets" and
  previous / next. Hidden when everything fits on one page.
-->
<script lang="ts">
	import { ChevronLeft, ChevronRight } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { pageCount } from './helpers';

	type Props = {
		page: number;
		perPage: number;
		total: number;
		/** Plural noun of the counted items. */
		noun: string;
		onPage: (page: number) => void;
		testId?: string;
	};

	let { page, perPage, total, noun, onPage, testId = 'scope-pager' }: Props = $props();

	const last = $derived(pageCount(total, perPage));
	const from = $derived(total === 0 ? 0 : (page - 1) * perPage + 1);
	const to = $derived(Math.min(total, page * perPage));
	const fmt = (n: number) => n.toLocaleString();
</script>

{#if total > perPage || page > 1}
	<nav
		class="flex items-center justify-end gap-2 text-2xs text-muted-foreground"
		aria-label={`Pages of ${noun}`}
		data-testid={testId}
	>
		<span class="tabular-nums">{fmt(from)}–{fmt(to)} of {fmt(total)} {noun}</span>
		<Button
			variant="outline"
			size="icon"
			class="h-7 w-7"
			disabled={page <= 1}
			onclick={() => onPage(page - 1)}
			aria-label="Previous page"
		>
			<ChevronLeft class="h-3.5 w-3.5" />
		</Button>
		<span class="tabular-nums">{page} / {last}</span>
		<Button
			variant="outline"
			size="icon"
			class="h-7 w-7"
			disabled={page >= last}
			onclick={() => onPage(page + 1)}
			aria-label="Next page"
		>
			<ChevronRight class="h-3.5 w-3.5" />
		</Button>
	</nav>
{/if}
