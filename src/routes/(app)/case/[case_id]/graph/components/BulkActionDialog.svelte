<!--
  Bulk actions on a multi-selection: create a task, add tags, set an asset
  flag. Every action goes through the graph state, so it is undoable.
-->
<script lang="ts" module>
	export type BulkAction = 'task' | 'tag' | 'flag';
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { assetFlagDotClass } from '$lib/services/asset-flags.service';
	import type { GraphNode } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';

	interface Props {
		open: boolean;
		action: BulkAction;
		nodes: GraphNode[];
		graph: CaseGraphState;
		refs: GraphReferenceData;
		onDone?: (message: string) => void;
	}

	let { open = $bindable(), action, nodes, graph, refs, onDone }: Props = $props();

	let title = $state('');
	let statusId = $state<number | null>(null);
	let description = $state('');
	let tags = $state('');
	let flagId = $state<number | null>(null);
	let reason = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	const assets = $derived(nodes.filter((n) => n.kind === 'asset'));
	const taggable = $derived(nodes.filter((n) => n.kind === 'asset' || n.kind === 'ioc'));
	/** Flags needing an analyst decision are set from the asset page. */
	const flags = $derived(refs.assetFlags.filter((f) => !f.requires_decision));
	const flag = $derived(flags.find((f) => f.id === flagId) ?? null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			error = null;
			if (action === 'task') {
				void refs.ensureTaskStatuses();
				title =
					nodes.length === 1
						? `Investigate ${nodes[0].label}`
						: `Investigate ${nodes.length} objects`;
				description = '';
				tags = '';
				statusId = null;
			} else if (action === 'tag') {
				tags = '';
			} else {
				void refs.ensureAssetFlags();
				flagId = null;
				reason = '';
			}
		});
	});

	$effect(() => {
		if (open && action === 'task' && statusId === null && refs.taskStatuses.length) {
			const todo = refs.taskStatuses.find((s) => /to ?do/i.test(s.status_name));
			statusId = (todo ?? refs.taskStatuses[0]).id;
		}
	});

	const valid = $derived.by(() => {
		if (action === 'task') return !!title.trim() && statusId !== null && nodes.length > 0;
		if (action === 'tag') return !!tags.trim() && taggable.length > 0;
		return flag !== null && assets.length > 0 && (!flag.requires_reason || !!reason.trim());
	});

	const heading = $derived(
		action === 'task' ? 'Create a task' : action === 'tag' ? 'Add tags' : 'Flag assets'
	);

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!valid || saving) return;
		saving = true;
		error = null;
		try {
			let message: string;
			if (action === 'task') {
				await graph.createTask(
					nodes.map((n) => n.key),
					{
						title: title.trim(),
						statusId: statusId as number,
						description,
						tags: tags.trim() || undefined
					}
				);
				message = 'Task created.';
			} else if (action === 'tag') {
				const n = await graph.addTags(
					taggable.map((x) => x.key),
					tags.split(',')
				);
				message = n ? `Tagged ${n} object(s).` : 'Every object already had these tags.';
			} else {
				const n = await graph.flagAssets(
					assets.map((x) => x.key),
					flagId as number,
					reason.trim() || null
				);
				message = n ? `Flagged ${n} asset(s).` : 'Every asset already had this flag.';
			}
			onDone?.(message);
			open = false;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	};

	const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{heading}</Dialog.Title>
			<Dialog.Description>
				{#if action === 'task'}
					One task referencing the {nodes.length} selected object(s).
				{:else if action === 'tag'}
					Applies to {taggable.length} asset(s) / IOC(s){nodes.length > taggable.length
						? ` — ${nodes.length - taggable.length} other object(s) skipped`
						: ''}.
				{:else}
					Applies to {assets.length} asset(s){nodes.length > assets.length
						? ` — ${nodes.length - assets.length} other object(s) skipped`
						: ''}.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={submit}>
			{#if action === 'task'}
				<label class="block space-y-1 text-xs font-medium">
					<span>Title</span>
					<Input bind:value={title} required />
				</label>
				<div class="grid grid-cols-2 gap-2">
					<label class="block space-y-1 text-xs font-medium">
						<span>Status</span>
						<select class={selectClass} bind:value={statusId} required>
							{#each refs.taskStatuses as s (s.id)}
								<option value={s.id}>{s.status_name}</option>
							{/each}
						</select>
					</label>
					<label class="block space-y-1 text-xs font-medium">
						<span>Tags</span>
						<Input bind:value={tags} placeholder="comma separated" />
					</label>
				</div>
				<label class="block space-y-1 text-xs font-medium">
					<span>Description</span>
					<Textarea bind:value={description} rows={3} />
				</label>
			{:else if action === 'tag'}
				<label class="block space-y-1 text-xs font-medium">
					<span>Tags <span class="font-normal text-muted-foreground">(comma separated)</span></span>
					<Input bind:value={tags} required placeholder="c2, phishing" />
				</label>
			{:else}
				<div class="grid gap-1" role="radiogroup" aria-label="Flag">
					{#each flags as f (f.id)}
						<button
							type="button"
							role="radio"
							aria-checked={flagId === f.id}
							class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm {flagId ===
							f.id
								? 'border-primary bg-primary/10'
								: 'hover:bg-accent'}"
							onclick={() => (flagId = f.id)}
						>
							<span class="h-2.5 w-2.5 rounded-full {assetFlagDotClass(f.color)}"></span>
							<span class="flex-1">{f.name}</span>
							{#if f.requires_reason}
								<span class="text-[10px] uppercase text-muted-foreground">reason</span>
							{/if}
						</button>
					{:else}
						<p class="text-sm text-muted-foreground">No asset flag can be set in bulk.</p>
					{/each}
				</div>
				{#if flag?.requires_reason}
					<label class="block space-y-1 text-xs font-medium">
						<span>Reason</span>
						<Textarea bind:value={reason} rows={2} required />
					</label>
				{/if}
			{/if}
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={!valid || saving}>
					{saving ? 'Working…' : 'Apply'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
