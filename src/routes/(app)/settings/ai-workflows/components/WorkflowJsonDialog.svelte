<!--
  The workflow being edited, as JSON. Applying it replaces the settings
  and the canvas; nothing is stored until the workflow is saved. The
  text is taken from the editor each time the dialog opens.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import { BracesIcon, CopyIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';

	type Props = {
		open: boolean;
		/** The current workflow as JSON, read when the dialog opens. */
		source: () => string;
		readOnly?: boolean;
		/** Returns why the JSON cannot be applied, or null once it is. */
		onApply: (text: string) => string | null;
	};

	let { open = $bindable(), source, readOnly = false, onApply }: Props = $props();

	let text = $state('');
	let seed = $state(0);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			text = source();
			error = null;
			seed += 1;
		});
	});

	function apply() {
		error = onApply(text);
		if (!error) open = false;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			toast({ title: 'JSON copied', variant: 'success' });
		} catch {
			toast({ title: 'The clipboard is not available', variant: 'destructive' });
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-[900px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<BracesIcon size={14} /> Workflow JSON
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				{#if readOnly}
					The workflow as JSON, with its unsaved changes.
				{:else}
					Edit the settings and the graph directly. Apply replaces what the editor shows; the
					workflow is stored when you save it. An exported document can be pasted as it is.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<div class="min-h-0 flex-1 overflow-auto" data-testid="wf-json-editor">
			{#key seed}
				<JsonEditor
					bind:value={text}
					onInput={() => (error = null)}
					minLines={20}
					maxLines={40}
					{readOnly}
					theme={$mode === 'dark' ? 'dark' : 'light'}
				/>
			{/key}
		</div>
		{#if error}
			<p class="text-2xs text-destructive" data-testid="wf-json-error">{error}</p>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" size="sm" class="mr-auto h-7" onclick={copy}>
				<CopyIcon size={12} class="mr-1" /> Copy
			</Button>
			<Button variant="outline" size="sm" class="h-7" onclick={() => (open = false)}>
				{readOnly ? 'Close' : 'Cancel'}
			</Button>
			{#if !readOnly}
				<Button size="sm" class="h-7" onclick={apply} data-testid="wf-json-apply">Apply</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
