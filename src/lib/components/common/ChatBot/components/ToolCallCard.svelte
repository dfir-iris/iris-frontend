<!--
  Collapsible card for one auto-executed tool call.

  Shows the tool name + a chevron; expanding reveals the arguments +
  the result (or error). Kept intentionally low-signal — the analyst
  reads the assistant's summary above, drills into the raw call only
  when curious.
-->
<script lang="ts">
	import { ChevronDownIcon, ChevronRightIcon, WrenchIcon } from 'lucide-svelte';

	let {
		toolUseId,
		toolName,
		argsData = {},
		result = undefined,
		error = undefined
	}: {
		toolUseId: string;
		toolName: string;
		argsData?: Record<string, unknown>;
		result?: unknown;
		error?: string;
	} = $props();

	let expanded = $state(false);
</script>

<!--
  `data-tool-use-id` echoes the LLM's tool_use_id so DOM inspection can
  correlate a rendered card with the on-wire event stream. Consumed by
  no live code path; kept as a debugging affordance.
-->
<div class="rounded border bg-background text-2xs" data-tool-use-id={toolUseId}>
	<button
		type="button"
		class="flex w-full items-center gap-1 rounded px-2 py-1 text-left hover:bg-muted"
		onclick={() => (expanded = !expanded)}
	>
		{#if expanded}
			<ChevronDownIcon size={10} />
		{:else}
			<ChevronRightIcon size={10} />
		{/if}
		<WrenchIcon size={10} class="text-muted-foreground" />
		<code class="font-mono text-2xs">{toolName}</code>
		{#if error}
			<span class="ml-auto text-destructive">error</span>
		{/if}
	</button>
	{#if expanded}
		<div class="border-t px-2 py-1">
			<div class="mb-1 text-muted-foreground">args</div>
			<pre
				class="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-2xs"
			>{JSON.stringify(argsData, null, 2)}</pre>
			{#if error}
				<div class="mt-1 text-destructive">error: {error}</div>
			{:else if result !== undefined}
				<div class="mt-1 text-muted-foreground">result</div>
				<pre
					class="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-2xs"
				>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
			{/if}
		</div>
	{/if}
</div>
