<!--
  Import an IRIS JSON graph export or a STIX 2.1 bundle into the case: file
  or pasted text, format auto-detected (or forced), preview of what will be
  sent, then the result (created objects / relations, skipped entries).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { CheckCircle2Icon, FileUpIcon, LoaderCircleIcon, TriangleAlertIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import SegmentedSelect from '$lib/components/ui/segmented-select/segmented-select.svelte';
	import { CaseGraphService } from '$lib/services/case-graph.service';
	import { apiErrorMessage } from '$lib/utils/error-handler';
	import type { GraphImportFormat, GraphImportResult } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { importSummary, parseImport } from '../../lib/exchange';

	interface Props {
		open: boolean;
		graph: CaseGraphState;
		caseId: number;
	}

	let { open = $bindable(), graph, caseId }: Props = $props();

	/** Files above this are not loaded in a textarea, only read. */
	const MAX_FILE_BYTES = 50 * 1024 * 1024;

	let text = $state('');
	let fileName = $state<string | null>(null);
	let format = $state<'auto' | GraphImportFormat>('auto');
	let importing = $state(false);
	let error = $state<string | null>(null);
	let result = $state<GraphImportResult | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			text = '';
			fileName = null;
			format = 'auto';
			error = null;
			result = null;
		});
	});

	const plan = $derived(text.trim() ? parseImport(text, format === 'auto' ? null : format) : null);
	const planError = $derived(plan && 'error' in plan ? plan.error : null);
	const ready = $derived(plan && !('error' in plan) ? plan : null);

	const onFile = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) {
			error = `The file is too large (${Math.round(file.size / 1024 / 1024)} MB).`;
			return;
		}
		error = null;
		result = null;
		fileName = file.name;
		text = await file.text();
	};

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!ready || importing) return;
		importing = true;
		error = null;
		try {
			const res = await CaseGraphService.importGraph(caseId, {
				format: ready.format,
				content: ready.content
			});
			if (!res.ok || !res.data || typeof res.data !== 'object') {
				throw new Error(apiErrorMessage(res, 'The import failed.'));
			}
			result = res.data;
			if (res.data.nodes_created || res.data.edges_created) await graph.refresh();
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			importing = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Import into the graph</Dialog.Title>
			<Dialog.Description>
				An IRIS graph export (JSON) or a STIX 2.1 bundle. Objects are matched to the existing assets
				and IOCs of the case or created; relations are added as stored edges.
			</Dialog.Description>
		</Dialog.Header>

		{#if result}
			<div class="space-y-3" role="status">
				<p class="flex items-center gap-2 text-sm">
					<CheckCircle2Icon class="h-4 w-4 text-green-600 dark:text-green-400" />
					{importSummary(result)}
				</p>
				{#if result.skipped_details.length}
					<div>
						<p class="mb-1 text-xs font-medium text-muted-foreground">
							Skipped{result.skipped > result.skipped_details.length
								? ` (first ${result.skipped_details.length} of ${result.skipped})`
								: ''}
						</p>
						<ul
							class="max-h-48 list-disc space-y-0.5 overflow-y-auto rounded border bg-muted/40 py-1.5 pl-6 pr-2 text-xs"
						>
							{#each result.skipped_details as d, i (i)}
								<li class="break-words">{d}</li>
							{/each}
						</ul>
					</div>
				{/if}
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (result = null)}>Import another</Button>
					<Button onclick={() => (open = false)}>Close</Button>
				</Dialog.Footer>
			</div>
		{:else}
			<form class="space-y-3" onsubmit={submit}>
				<div class="flex items-center gap-2">
					<input
						bind:this={fileInput}
						type="file"
						accept=".json,application/json"
						class="hidden"
						onchange={onFile}
					/>
					<Button type="button" variant="outline" size="sm" onclick={() => fileInput?.click()}>
						<FileUpIcon class="mr-1.5 h-4 w-4" />Choose a file…
					</Button>
					<span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
						{fileName ?? 'or paste the JSON below'}
					</span>
				</div>
				<Textarea
					bind:value={
						() => text,
						(v) => {
							text = v;
							fileName = null;
						}
					}
					rows={8}
					class="font-mono text-xs"
					placeholder={'{"type": "bundle", "objects": [...]}'}
					aria-label="Content to import"
					spellcheck={false}
				/>
				<div class="flex items-center gap-2 text-xs">
					<span class="text-muted-foreground">Format</span>
					<SegmentedSelect
						class="[&>button]:px-2 [&>button]:py-1 [&>button]:text-xs"
						options={[
							{ value: 'auto', label: 'Detect' },
							{ value: 'json', label: 'IRIS JSON' },
							{ value: 'stix', label: 'STIX 2.1' }
						]}
						value={format}
						onChange={(v) => (format = v as typeof format)}
					/>
				</div>
				{#if ready}
					<p class="text-xs text-muted-foreground">
						{ready.format === 'stix' ? 'STIX bundle' : 'IRIS graph'}:
						{Object.entries(ready.counts)
							.sort((a, b) => b[1] - a[1])
							.map(([k, n]) => `${n} ${k}`)
							.join(', ')}
					</p>
				{:else if planError}
					<p class="flex items-center gap-1.5 text-xs text-destructive">
						<TriangleAlertIcon class="h-3.5 w-3.5" />{planError}
					</p>
				{/if}
				{#if error}
					<p class="text-sm text-destructive" role="alert">{error}</p>
				{/if}
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button type="submit" disabled={!ready || importing}>
						{#if importing}<LoaderCircleIcon class="mr-1.5 h-4 w-4 animate-spin" />{/if}
						Import
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
