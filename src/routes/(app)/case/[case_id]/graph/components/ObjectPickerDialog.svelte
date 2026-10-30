<!--
  Searchable node picker with inline asset / IOC creation. Used to add an
  existing object to the canvas, to pick the other end of a relation, and
  to pick path-finder endpoints.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { PlusIcon, SearchIcon } from 'lucide-svelte';
	import type { GraphNode } from '$lib/types/resources/case-graph';
	import { searchNodes } from '../lib/search';
	import { KIND_LABEL } from '../lib/model';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';
	import CreateObjectForm from './CreateObjectForm.svelte';
	import NodeKindIcon from './NodeKindIcon.svelte';

	interface Props {
		open: boolean;
		caseId: number;
		title: string;
		description?: string;
		nodes: GraphNode[];
		refs: GraphReferenceData;
		/** Keys shown with an "on canvas" hint. */
		onCanvas?: Set<string>;
		allowCreate?: boolean;
		/** Tab shown when the dialog opens (creation shortcuts of the menus). */
		initialTab?: 'existing' | 'asset' | 'ioc';
		confirmLabel?: string;
		onPick: (key: string, created: boolean) => void | Promise<void>;
	}

	let {
		open = $bindable(),
		caseId,
		title,
		description,
		nodes,
		refs,
		onCanvas = new Set(),
		allowCreate = true,
		initialTab = 'existing',
		confirmLabel = 'Add',
		onPick
	}: Props = $props();

	let query = $state('');
	let tab = $state<'existing' | 'asset' | 'ioc'>('existing');
	let active = $state(0);
	let busy = $state(false);

	const LIMIT = 200;

	const results = $derived.by(() => {
		const sorted = [...nodes].sort(
			(a, b) =>
				Number(onCanvas.has(a.key)) - Number(onCanvas.has(b.key)) ||
				a.kind.localeCompare(b.kind) ||
				(a.label ?? '').localeCompare(b.label ?? '')
		);
		const keys = searchNodes(sorted, query);
		const list = keys ? sorted.filter((n) => keys.includes(n.key)) : sorted;
		return list.slice(0, LIMIT);
	});

	$effect(() => {
		if (open) {
			query = '';
			tab = untrack(() => (allowCreate ? initialTab : 'existing'));
			active = 0;
		}
	});

	$effect(() => {
		if (active >= results.length) active = Math.max(0, results.length - 1);
	});

	const pick = async (key: string, created = false) => {
		if (busy) return;
		busy = true;
		try {
			await onPick(key, created);
			open = false;
		} finally {
			busy = false;
		}
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(results.length - 1, active + 1);
			document.getElementById(`picker-row-${active}`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
			document.getElementById(`picker-row-${active}`)?.scrollIntoView({ block: 'nearest' });
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const n = results[active];
			if (n) void pick(n.key);
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			{#if description}
				<Dialog.Description>{description}</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if allowCreate}
			<div class="flex gap-1 rounded-md bg-muted p-1 text-xs" role="tablist">
				{#each [['existing', 'Existing'], ['asset', 'New asset'], ['ioc', 'New IOC']] as [id, label] (id)}
					<button
						type="button"
						role="tab"
						aria-selected={tab === id}
						class="flex-1 rounded px-2 py-1 font-medium {tab === id
							? 'bg-background shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (tab = id as typeof tab)}
					>
						{label}
					</button>
				{/each}
			</div>
		{/if}

		{#if tab === 'existing'}
			<div class="relative">
				<SearchIcon
					class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
				/>
				<Input
					class="pl-8"
					placeholder="Search — kind:ioc type:ip tag:c2 or free text"
					bind:value={query}
					onkeydown={onKeydown}
					aria-label="Search objects"
				/>
			</div>
			<div class="max-h-80 overflow-y-auto rounded-md border" role="listbox" aria-label={title}>
				{#each results as n, i (n.key)}
					<button
						id="picker-row-{i}"
						type="button"
						role="option"
						aria-selected={i === active}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent {i ===
						active
							? 'bg-accent'
							: ''}"
						onmouseenter={() => (active = i)}
						onclick={() => pick(n.key)}
						disabled={busy}
					>
						<NodeKindIcon kind={n.kind} color={n.kind === 'node' ? n.color : null} />
						<span class="min-w-0 flex-1">
							<span class="block truncate font-medium">{n.label}</span>
							<span class="block truncate text-xs text-muted-foreground">
								{KIND_LABEL[n.kind]}{n.type ? ` · ${n.type}` : ''}{n.subtitle
									? ` · ${n.subtitle}`
									: ''}
							</span>
						</span>
						{#if onCanvas.has(n.key)}
							<span class="text-[10px] uppercase text-muted-foreground">on canvas</span>
						{/if}
					</button>
				{:else}
					<div
						class="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-muted-foreground"
					>
						<span>No matching object.</span>
						{#if allowCreate && query.trim()}
							<div class="flex gap-2">
								<Button size="xs" variant="outline" onclick={() => (tab = 'asset')}>
									<PlusIcon class="mr-1 h-3 w-3" />Asset “{query.trim()}”
								</Button>
								<Button size="xs" variant="outline" onclick={() => (tab = 'ioc')}>
									<PlusIcon class="mr-1 h-3 w-3" />IOC “{query.trim()}”
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if results.length === LIMIT}
				<p class="text-xs text-muted-foreground">
					Showing the first {LIMIT} objects — refine the search.
				</p>
			{/if}
			<p class="text-xs text-muted-foreground">
				↑ ↓ to move, Enter to {confirmLabel.toLowerCase()}.
			</p>
		{:else}
			<CreateObjectForm
				{caseId}
				kind={tab}
				{refs}
				initial={query.trim()}
				onCreated={(key) => pick(key, true)}
				onCancel={() => (tab = 'existing')}
			/>
		{/if}
	</Dialog.Content>
</Dialog.Root>
