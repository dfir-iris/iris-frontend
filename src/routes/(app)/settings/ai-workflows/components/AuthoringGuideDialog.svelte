<!--
  The authoring guide: how to write a workflow or a block as JSON, for a
  person or an LLM. Copy it into a prompt, or download it with the
  example documents.
-->
<script lang="ts">
	import { BookOpenIcon, CopyIcon, DownloadIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import { AiWorkflowsService, type AiAuthoringGuide } from '$lib/services/ai-workflows.service';
	import { describeApiError, downloadJson } from '../helpers/ui';

	type Props = { open: boolean };

	let { open = $bindable() }: Props = $props();

	let guide = $state<AiAuthoringGuide | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function load() {
		loading = true;
		error = null;
		const res = await AiWorkflowsService.authoringGuide();
		loading = false;
		if (!res.ok) {
			error = describeApiError(res.data, res.error?.message ?? 'Failed to load the guide');
			return;
		}
		guide = res.data as AiAuthoringGuide;
	}

	async function copy() {
		if (!guide) return;
		try {
			await navigator.clipboard.writeText(guide.markdown);
			toast({ title: 'Guide copied', variant: 'success' });
		} catch {
			toast({ title: 'The clipboard is not available', variant: 'destructive' });
		}
	}

	function download() {
		if (!guide) return;
		const blob = new Blob([guide.markdown], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'iris-ai-workflows-authoring-guide.md';
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	$effect(() => {
		if (open && !guide && !loading) load();
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-[900px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<BookOpenIcon size={14} /> Writing workflows as JSON
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				The format of workflow and block documents, every node and the template language. Give it to
				an LLM with what the workflow should do, then import the JSON it writes.
			</Dialog.Description>
		</Dialog.Header>
		{#if error}
			<ApiError {error} onRetry={load} />
		{:else if loading || !guide}
			<p class="p-3 text-xs text-muted-foreground">Loading…</p>
		{:else}
			<div class="flex flex-wrap items-center gap-1.5">
				<Button size="sm" class="h-7" onclick={copy} data-testid="wf-guide-copy">
					<CopyIcon size={12} class="mr-1" /> Copy the guide
				</Button>
				<Button variant="outline" size="sm" class="h-7" onclick={download}>
					<DownloadIcon size={12} class="mr-1" /> Download (Markdown)
				</Button>
				{#each guide.examples as example (example.file)}
					<Button
						variant="outline"
						size="sm"
						class="h-7"
						title={`Example ${example.kind}`}
						onclick={() => downloadJson(example.file, example.document)}
					>
						<DownloadIcon size={12} class="mr-1" />
						{example.name}
					</Button>
				{/each}
			</div>
			<pre
				class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-2xs"
				data-testid="wf-guide-markdown">{guide.markdown}</pre>
		{/if}
	</Dialog.Content>
</Dialog.Root>
