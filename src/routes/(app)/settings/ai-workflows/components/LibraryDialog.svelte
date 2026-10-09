<!--
  The workflow library: the workflows shipped with IRIS, by category.
  Each one can be read or edited as JSON, then added as an inactive copy
  the user owns; the shipped workflow itself never changes.
-->
<script lang="ts">
	import { mode } from 'mode-watcher';
	import {
		BracesIcon,
		CircleAlertIcon,
		KeyRoundIcon,
		LibraryIcon,
		PlusIcon,
		SparklesIcon,
		WrenchIcon
	} from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import ApiError from '$lib/components/ui/api-error.svelte';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import {
		AiWorkflowsService,
		type AiImportResult,
		type AiLibraryEntry,
		type AiWorkflow
	} from '$lib/services/ai-workflows.service';
	import { describeApiError, describeWarnings, TRIGGER_LABELS, triggerDetail } from '../helpers/ui';

	type Props = {
		open: boolean;
		canWrite: boolean;
		/** The copy was created; `warnings` says what it still needs. */
		onAdded: (workflow: AiWorkflow | undefined, name: string, warnings: string) => void;
	};

	let { open = $bindable(), canWrite, onAdded }: Props = $props();

	let entries = $state<AiLibraryEntry[] | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let selectedId = $state<string | null>(null);
	let editing = $state(false);
	let text = $state('');
	let jsonError = $state<string | null>(null);
	let adding = $state(false);

	const selected = $derived(entries?.find((e) => e.id === selectedId) ?? null);
	const categories = $derived.by(() => {
		const groups: { name: string; entries: AiLibraryEntry[] }[] = [];
		for (const entry of entries ?? []) {
			const group = groups.find((g) => g.name === entry.category);
			if (group) group.entries.push(entry);
			else groups.push({ name: entry.category, entries: [entry] });
		}
		return groups;
	});

	async function load() {
		loading = true;
		error = null;
		const res = await AiWorkflowsService.library();
		loading = false;
		if (!res.ok || !Array.isArray(res.data)) {
			error = describeApiError(res.data, res.error?.message ?? 'Failed to load the library');
			return;
		}
		entries = res.data;
		if (!selectedId && entries.length) select(entries[0]);
	}

	function select(entry: AiLibraryEntry) {
		selectedId = entry.id;
		editing = false;
		text = JSON.stringify(entry.document, null, 2);
		jsonError = null;
	}

	async function add() {
		if (!selected) return;
		let document: unknown;
		try {
			document = JSON.parse(text);
		} catch (e) {
			jsonError = `Invalid JSON: ${(e as Error).message}`;
			editing = true;
			return;
		}
		adding = true;
		const res = await AiWorkflowsService.importWorkflow(document);
		adding = false;
		if (!res.ok) {
			jsonError = describeApiError(res.data, res.error?.message ?? 'The workflow was not added');
			return;
		}
		const result = res.data as AiImportResult<AiWorkflow>;
		open = false;
		onAdded(
			result.workflow,
			result.workflow?.name ?? selected.name,
			describeWarnings(result.warnings)
		);
	}

	$effect(() => {
		if (open && !entries && !loading) load();
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex h-[85vh] max-h-[90vh] flex-col sm:max-w-[1100px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-sm">
				<LibraryIcon size={14} /> Workflow library
			</Dialog.Title>
			<Dialog.Description class="text-xs">
				Workflows shipped with IRIS. Adding one creates an inactive copy you own: adapt it (its JSON
				can be edited before adding it), fill in what it needs, then activate it.
			</Dialog.Description>
		</Dialog.Header>
		{#if error}
			<ApiError {error} onRetry={load} />
		{:else if loading || !entries}
			<p class="p-3 text-xs text-muted-foreground">Loading…</p>
		{:else if entries.length === 0}
			<p class="p-3 text-xs text-muted-foreground">The library is empty.</p>
		{:else}
			<div class="flex min-h-0 flex-1 gap-3">
				<nav class="w-64 shrink-0 overflow-y-auto border-r pr-2" data-testid="wf-library-list">
					{#each categories as group (group.name)}
						<p
							class="mb-1 mt-2 px-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0"
						>
							{group.name}
						</p>
						{#each group.entries as entry (entry.id)}
							<button
								type="button"
								class={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs ${entry.id === selectedId ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
								onclick={() => select(entry)}
								data-testid={`wf-library-${entry.id}`}
							>
								<span class="min-w-0 flex-1 truncate">{entry.name}</span>
								{#if entry.warnings.length}
									<CircleAlertIcon size={11} class="shrink-0 text-amber-600" />
								{/if}
							</button>
						{/each}
					{/each}
				</nav>

				{#if selected}
					<section class="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
						<div class="flex flex-wrap items-center gap-1.5">
							<h2 class="mr-1 text-sm font-semibold">{selected.name}</h2>
							<span class="rounded bg-muted px-1.5 py-0.5 text-2xs">
								{TRIGGER_LABELS[selected.trigger_type] ?? selected.trigger_type}
							</span>
							{#if triggerDetail(selected.trigger_type, selected.trigger_config)}
								<span class="font-mono text-2xs text-muted-foreground">
									{triggerDetail(selected.trigger_type, selected.trigger_config)}
								</span>
							{/if}
							{#if selected.uses_ai}
								<span
									class="flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-2xs text-violet-700 dark:text-violet-300"
									title="Has AI agent nodes: needs the AI provider configured"
								>
									<SparklesIcon size={10} /> AI
								</span>
							{/if}
						</div>
						<p class="whitespace-pre-line text-xs text-muted-foreground">{selected.description}</p>

						{#if selected.requirements.keystore.length || selected.requirements.tools.length}
							<div class="flex flex-col gap-1 text-2xs">
								{#if selected.requirements.keystore.length}
									<p class="flex flex-wrap items-center gap-1">
										<KeyRoundIcon size={11} class="text-muted-foreground" /> Keystore entries:
										{#each selected.requirements.keystore as name (name)}
											<code class="rounded bg-muted px-1">{name}</code>
										{/each}
									</p>
								{/if}
								{#if selected.requirements.tools.length}
									<p class="flex flex-wrap items-center gap-1">
										<WrenchIcon size={11} class="text-muted-foreground" /> Tools:
										{#each selected.requirements.tools as name (name)}
											<code class="rounded bg-muted px-1">{name}</code>
										{/each}
									</p>
								{/if}
							</div>
						{/if}

						{#if selected.warnings.length}
							<ul
								class="flex flex-col gap-0.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-2xs"
								data-testid="wf-library-warnings"
							>
								{#each selected.warnings as warning, i (i)}
									<li class="flex gap-1">
										<CircleAlertIcon size={11} class="mt-0.5 shrink-0 text-amber-600" />
										{warning.node_id ? `${warning.node_id}: ` : ''}{warning.message}
									</li>
								{/each}
							</ul>
						{/if}

						<div class="flex flex-wrap items-center gap-1.5">
							<Button
								variant="outline"
								size="sm"
								class="h-7"
								onclick={() => (editing = !editing)}
								data-testid="wf-library-json"
							>
								<BracesIcon size={12} class="mr-1" />
								{editing ? 'Hide the JSON' : canWrite ? 'View / edit the JSON' : 'View the JSON'}
							</Button>
							{#if canWrite}
								<Button
									size="sm"
									class="h-7"
									onclick={add}
									disabled={adding}
									data-testid="wf-library-add"
								>
									<PlusIcon size={12} class="mr-1" />
									{adding ? 'Adding…' : 'Add to my workflows'}
								</Button>
							{/if}
							{#if text !== JSON.stringify(selected.document, null, 2)}
								<span class="text-2xs text-amber-600">Edited: the copy gets your changes</span>
								<Button
									variant="ghost"
									size="sm"
									class="h-7"
									onclick={() => {
										text = JSON.stringify(selected.document, null, 2);
										jsonError = null;
									}}
								>
									Reset
								</Button>
							{/if}
						</div>
						{#if jsonError}
							<p class="text-2xs text-destructive" data-testid="wf-library-error">{jsonError}</p>
						{/if}
						{#if editing}
							{#key selected.id}
								<JsonEditor
									bind:value={text}
									onInput={() => (jsonError = null)}
									minLines={20}
									maxLines={60}
									readOnly={!canWrite}
									theme={$mode === 'dark' ? 'dark' : 'light'}
								/>
							{/key}
						{/if}
					</section>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
