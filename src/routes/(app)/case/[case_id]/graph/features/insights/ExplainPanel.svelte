<!-- Rail panel: AI narrative of the attack path, which can be saved as a case note. -->
<script lang="ts">
	import {
		CopyIcon,
		ExternalLinkIcon,
		LoaderCircleIcon,
		NotebookPenIcon,
		ScrollTextIcon,
		TriangleAlertIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import SegmentedSelect from '$lib/components/ui/segmented-select/segmented-select.svelte';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import {
		EXPLAIN_NOTES_DIRECTORY,
		EXPLAIN_SCOPE_LABEL,
		type ExplainScope
	} from '../../lib/insights';
	import { getGraphFeatures } from '../context';
	import { notify } from './helpers';

	let { graph }: { graph: CaseGraphState } = $props();

	const { insights, views, canEdit, caseId } = getGraphFeatures();

	const scopes = $derived<{ value: ExplainScope; label: string }[]>([
		{ value: 'case', label: 'Whole graph' },
		{ value: 'canvas', label: 'Drawn' },
		{
			value: 'selection',
			label: `Selection${graph.selection.length ? ` (${graph.selection.length})` : ''}`
		},
		...(views.current ? [{ value: 'view' as const, label: 'View' }] : [])
	]);

	// The loaded view went away: fall back to the whole graph.
	$effect(() => {
		if (insights.explainScope === 'view' && !views.current) insights.explainScope = 'case';
	});

	const ex = $derived(insights.explanation);

	const HINT: Record<ExplainScope, string> = {
		case: 'Every asset, IOC and free node of the case, with their accepted relations.',
		canvas: 'The assets, IOCs and free nodes drawn on the canvas.',
		selection: 'The selected assets, IOCs and free nodes.',
		view: 'What the loaded view includes and does not hide.'
	};

	const copy = async () => {
		if (!ex) return;
		try {
			await navigator.clipboard.writeText(ex.markdown);
			toast({ title: 'Explanation copied', variant: 'success' });
		} catch {
			toast({ title: 'Could not access the clipboard', variant: 'destructive' });
		}
	};

	const save = () =>
		notify(async () => {
			await insights.saveExplanation();
			return `Saved in the “${EXPLAIN_NOTES_DIRECTORY}” notes`;
		});
</script>

<div class="flex flex-col gap-2 p-3">
	<div class="flex items-center gap-2">
		<ScrollTextIcon class="h-4 w-4 text-primary" />
		<h3 class="flex-1 text-sm font-medium">Explain the attack path</h3>
	</div>
	<SegmentedSelect
		class="[&>button]:flex-1 [&>button]:px-1.5 [&>button]:py-1 [&>button]:text-xs"
		options={scopes}
		value={insights.explainScope}
		onChange={(v) => (insights.explainScope = v as ExplainScope)}
	/>
	<p class="text-[11px] text-muted-foreground">
		{HINT[insights.explainScope]}
		{#if insights.explainScope === 'view' && views.current}
			“{views.current.name}”.
		{/if}
	</p>
	<Button
		size="sm"
		variant="outline"
		disabled={insights.explaining}
		onclick={() => insights.explain(views.current?.view_id ?? null)}
	>
		{#if insights.explaining}
			<LoaderCircleIcon class="mr-1.5 h-3.5 w-3.5 animate-spin" />Writing…
		{:else}
			<ScrollTextIcon class="mr-1.5 h-3.5 w-3.5" />{ex ? 'Explain again' : 'Explain'}
		{/if}
	</Button>

	{#if insights.explainError}
		<p
			class="flex gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
			role="alert"
		>
			<TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />{insights.explainError}
		</p>
	{/if}

	{#if ex}
		<div class="mt-1 space-y-2 rounded-md border bg-background p-2">
			<div class="flex items-center gap-1 text-[11px] text-muted-foreground">
				<span class="flex-1">
					{EXPLAIN_SCOPE_LABEL[ex.scope]} · {ex.at.toLocaleTimeString([], {
						hour: '2-digit',
						minute: '2-digit'
					})}
				</span>
				<button
					type="button"
					class="rounded p-1 hover:bg-accent hover:text-foreground"
					title="Copy the Markdown"
					aria-label="Copy the Markdown"
					onclick={copy}
				>
					<CopyIcon class="h-3.5 w-3.5" />
				</button>
			</div>
			{#if ex.left}
				<p class="text-[11px] text-muted-foreground">
					{ex.left} drawn object{ex.left > 1 ? 's' : ''} (events, tasks, notes…) left out: only assets,
					IOCs and free nodes are explained outside a saved view.
				</p>
			{/if}
			<p class="text-[11px] italic text-muted-foreground">
				Written by the AI assistant: check it against the evidence.
			</p>
			<MarkDownPreview markdown={ex.markdown} untrusted class="text-xs" />
			<div class="flex flex-wrap items-center gap-2 border-t pt-2">
				{#if ex.noteId !== null}
					<a
						href={`/case/${caseId}/notes/${ex.noteId}`}
						class="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
					>
						<ExternalLinkIcon class="h-3.5 w-3.5" />Open the note
					</a>
				{:else if canEdit()}
					<Button size="xs" variant="outline" disabled={insights.savingNote} onclick={save}>
						{#if insights.savingNote}
							<LoaderCircleIcon class="mr-1 h-3.5 w-3.5 animate-spin" />
						{:else}
							<NotebookPenIcon class="mr-1 h-3.5 w-3.5" />
						{/if}
						Save as note
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
