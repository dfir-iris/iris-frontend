<!--
  Relation fields shared by the "new relation" dialog and the edge editor:
  relation type, direction, label, confidence, description. `extra` adds
  fields of the caller below them.
-->
<script lang="ts" module>
	export interface RelationFormValues {
		relationTypeId: number | null;
		relationName: string;
		directed: boolean;
		label: string;
		confidence: number | null;
		description: string;
		/** Source and target were swapped by the user. */
		swapped: boolean;
	}

	/** Current state of the form, for the `extra` fields. */
	export interface RelationFormContext {
		from: string;
		to: string;
		relationName: string;
		relationLabel: string;
		directed: boolean;
	}
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { mode } from 'mode-watcher';
	import { ArrowLeftRightIcon, ArrowRightIcon, MinusIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph/palette';
	import type { GraphRelationType } from '$lib/types/resources/case-graph';

	interface Props {
		relationTypes: GraphRelationType[];
		sourceLabel: string;
		targetLabel: string;
		initial?: Partial<RelationFormValues>;
		/** Edge editor: direction can also be reversed. */
		allowSwap?: boolean;
		submitLabel?: string;
		extra?: Snippet<[RelationFormContext]>;
		onSubmit: (values: RelationFormValues) => void | Promise<void>;
		onCancel?: () => void;
	}

	let {
		relationTypes,
		sourceLabel,
		targetLabel,
		initial = {},
		allowSwap = true,
		submitLabel = 'Save',
		extra,
		onSubmit,
		onCancel
	}: Props = $props();

	const isDark = $derived($mode === 'dark');

	let relationTypeId = $state<number | null>(null);
	let directed = $state(false);
	let directionTouched = $state(false);
	let label = $state('');
	let confidence = $state<number | null>(null);
	let description = $state('');
	let swapped = $state(false);
	let filter = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	onMount(() => {
		const byName = relationTypes.find((r) => r.name === (initial.relationName ?? 'connected_to'));
		relationTypeId = initial.relationTypeId ?? byName?.id ?? relationTypes[0]?.id ?? null;
		directed =
			initial.directed ?? relationTypes.find((r) => r.id === relationTypeId)?.directed ?? false;
		directionTouched = initial.directed !== undefined;
		label = initial.label ?? '';
		confidence = initial.confidence ?? null;
		description = initial.description ?? '';
	});

	const selected = $derived(relationTypes.find((r) => r.id === relationTypeId) ?? null);

	const visibleTypes = $derived(
		filter.trim()
			? relationTypes.filter((r) =>
					`${r.label} ${r.name} ${r.description ?? ''}`
						.toLowerCase()
						.includes(filter.trim().toLowerCase())
				)
			: relationTypes
	);

	const chooseType = (r: GraphRelationType) => {
		relationTypeId = r.id;
		if (!directionTouched) directed = r.directed;
	};

	const from = $derived(swapped ? targetLabel : sourceLabel);
	const to = $derived(swapped ? sourceLabel : targetLabel);

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!selected || saving) return;
		if (confidence !== null && (confidence < 0 || confidence > 100)) {
			error = 'Confidence is a percentage between 0 and 100.';
			return;
		}
		saving = true;
		error = null;
		try {
			await onSubmit({
				relationTypeId: selected.id,
				relationName: selected.name,
				directed,
				label: label.trim(),
				confidence,
				description: description.trim(),
				swapped
			});
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	};
</script>

<form class="space-y-3" onsubmit={submit}>
	<div class="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
		<span class="min-w-0 flex-1 truncate text-right font-medium" title={from}>{from}</span>
		<button
			type="button"
			class="rounded p-1 hover:bg-accent"
			title={directed ? 'Directed — click for undirected' : 'Undirected — click for directed'}
			aria-label="Toggle direction"
			onclick={() => {
				directed = !directed;
				directionTouched = true;
			}}
		>
			{#if directed}
				<ArrowRightIcon class="h-4 w-4" />
			{:else}
				<MinusIcon class="h-4 w-4" />
			{/if}
		</button>
		<span class="min-w-0 flex-1 truncate font-medium" title={to}>{to}</span>
		{#if allowSwap}
			<button
				type="button"
				class="rounded p-1 hover:bg-accent"
				title="Swap source and target"
				aria-label="Swap source and target"
				onclick={() => (swapped = !swapped)}
			>
				<ArrowLeftRightIcon class="h-4 w-4" />
			</button>
		{/if}
	</div>

	<div class="space-y-1">
		<div class="flex items-center justify-between text-xs font-medium">
			<span>Relation</span>
			{#if relationTypes.length > 8}
				<input
					class="h-6 w-32 rounded border bg-background px-1.5 text-xs"
					placeholder="Filter…"
					aria-label="Filter relation types"
					bind:value={filter}
				/>
			{/if}
		</div>
		<div
			class="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto"
			role="radiogroup"
			aria-label="Relation"
		>
			{#each visibleTypes as r (r.id)}
				<button
					type="button"
					role="radio"
					aria-checked={r.id === relationTypeId}
					title={r.description ?? r.name}
					class="flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs {r.id ===
					relationTypeId
						? 'border-primary bg-primary/10'
						: 'hover:bg-accent'}"
					onclick={() => chooseType(r)}
				>
					<span
						class="w-4 shrink-0"
						style="border-top: 2px {r.line_style} {paletteHex(r.color, isDark)};"
					></span>
					<span class="truncate">{r.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="grid grid-cols-[1fr_7rem] gap-2">
		<label class="space-y-1 text-xs font-medium">
			<span>Label <span class="font-normal text-muted-foreground">(optional)</span></span>
			<Input bind:value={label} placeholder={selected?.label ?? ''} />
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>Confidence %</span>
			<Input
				type="number"
				min="0"
				max="100"
				value={confidence ?? ''}
				oninput={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					confidence = v === '' ? null : Number(v);
				}}
			/>
		</label>
	</div>
	<label class="block space-y-1 text-xs font-medium">
		<span>Description</span>
		<Textarea bind:value={description} rows={2} />
	</label>
	{#if extra}
		{@render extra({
			from,
			to,
			relationName: selected?.name ?? '',
			relationLabel: label.trim() || selected?.label || '',
			directed
		})}
	{/if}
	{#if error}
		<p class="text-xs text-destructive" role="alert">{error}</p>
	{/if}
	<div class="flex justify-end gap-2">
		{#if onCancel}
			<Button type="button" variant="ghost" size="sm" onclick={onCancel}>Cancel</Button>
		{/if}
		<Button type="submit" size="sm" disabled={!selected || saving}>
			{saving ? 'Saving…' : submitLabel}
		</Button>
	</div>
</form>
