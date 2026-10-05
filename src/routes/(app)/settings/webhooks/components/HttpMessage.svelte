<!--
  An HTTP request or response as text: a start line, headers, body.
  Used by the live preview, the test result and the delivery detail.
-->
<script lang="ts">
	import { ClipboardCopy } from '$lib/components/ui/clipboard-copy';
	import { prettyBody } from '../helpers/webhook-form';

	type Props = {
		startLine: string;
		headers?: Record<string, string> | null;
		body?: string | null;
		emptyBody?: string;
		maxHeight?: string;
	};

	let {
		startLine,
		headers = null,
		body = null,
		emptyBody = 'No body',
		maxHeight = 'max-h-96'
	}: Props = $props();

	const pretty = $derived(prettyBody(body));
	const headerEntries = $derived(Object.entries(headers ?? {}));

	/** A request line splits into a method badge and the URL. */
	const request = $derived.by(() => {
		const match = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (.*)$/.exec(startLine);
		return match ? { method: match[1], url: match[2] } : null;
	});

	const METHOD_COLORS: Record<string, string> = {
		GET: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		POST: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		PUT: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		PATCH: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		DELETE: 'bg-red-500/15 text-red-700 dark:text-red-300'
	};
</script>

<div class="overflow-hidden rounded-md border bg-muted/20 font-mono text-2xs">
	<div class="flex items-start gap-2 border-b bg-background/60 px-3 py-2">
		{#if request}
			<span
				class={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${METHOD_COLORS[request.method] ?? 'bg-muted'}`}
				>{request.method}</span
			>
			<span class="min-w-0 break-all py-0.5">{request.url}</span>
		{:else}
			<span class="break-all font-semibold">{startLine}</span>
		{/if}
	</div>
	{#if headerEntries.length > 0}
		<dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b px-3 py-2">
			{#each headerEntries as [name, value] (name)}
				<dt class="text-muted-foreground">{name}</dt>
				<dd class="break-all">{value}</dd>
			{/each}
		</dl>
	{/if}
	<div class="group relative">
		{#if pretty}
			<div class="absolute right-1.5 top-1.5">
				<ClipboardCopy value={pretty} size={12} tooltipText="Copy body" />
			</div>
			<pre
				class={`${maxHeight} overflow-auto whitespace-pre-wrap break-all px-3 py-2`}>{pretty}</pre>
		{:else}
			<p class="px-3 py-2 italic text-muted-foreground">{emptyBody}</p>
		{/if}
	</div>
</div>
