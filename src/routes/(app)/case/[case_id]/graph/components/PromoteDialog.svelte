<!--
  Promote a free node to an asset or an IOC. The backend fills name /
  description from the node; only the object type (and TLP) are asked.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import type { GraphNode, PromoteFreeNodeBody } from '$lib/types/resources/case-graph';
	import { detectIocType } from '$lib/utils/ioc-type-detect';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';

	interface Props {
		open: boolean;
		node: GraphNode | null;
		refs: GraphReferenceData;
		onSubmit: (body: PromoteFreeNodeBody) => void | Promise<void>;
	}

	let { open = $bindable(), node, refs, onSubmit }: Props = $props();

	let kind = $state<'asset' | 'ioc'>('ioc');
	let assetTypeId = $state<number | null>(null);
	let iocTypeId = $state<number | null>(null);
	let tlpId = $state<number | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			void refs.ensureObjectTypes();
			kind = node?.type === 'infrastructure' || node?.type === 'account' ? 'asset' : 'ioc';
			assetTypeId = null;
			iocTypeId = null;
			tlpId = null;
			error = null;
		});
	});

	$effect(() => {
		if (open && iocTypeId === null && node && refs.iocTypes.length) {
			iocTypeId = detectIocType(node.label, refs.iocTypes)?.type_id ?? null;
		}
		if (open && tlpId === null && refs.defaultTlpId !== null) tlpId = refs.defaultTlpId;
	});

	const valid = $derived(
		kind === 'asset' ? assetTypeId !== null : iocTypeId !== null && tlpId !== null
	);

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!valid || saving) return;
		saving = true;
		error = null;
		try {
			await onSubmit(
				kind === 'asset'
					? { kind: 'asset', asset_type_id: assetTypeId }
					: { kind: 'ioc', ioc_type_id: iocTypeId, ioc_tlp_id: tlpId }
			);
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
			<Dialog.Title>Promote “{node?.label ?? ''}”</Dialog.Title>
			<Dialog.Description>
				Creates a case asset or IOC from this node and moves its relations onto it. This cannot be
				undone from the graph.
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={submit}>
			<div class="flex gap-1 rounded-md bg-muted p-1 text-xs" role="radiogroup" aria-label="Kind">
				{#each [['ioc', 'IOC'], ['asset', 'Asset']] as [id, label] (id)}
					<button
						type="button"
						role="radio"
						aria-checked={kind === id}
						class="flex-1 rounded px-2 py-1 font-medium {kind === id
							? 'bg-background shadow-sm'
							: 'text-muted-foreground'}"
						onclick={() => (kind = id as typeof kind)}
					>
						{label}
					</button>
				{/each}
			</div>
			{#if kind === 'asset'}
				<label class="block space-y-1 text-xs font-medium">
					<span>Asset type</span>
					<select class={selectClass} bind:value={assetTypeId} required>
						<option value={null} disabled>Select…</option>
						{#each refs.assetTypes as t (t.asset_id)}
							<option value={t.asset_id}>{t.asset_name}</option>
						{/each}
					</select>
				</label>
			{:else}
				<div class="grid grid-cols-2 gap-2">
					<label class="block space-y-1 text-xs font-medium">
						<span>IOC type</span>
						<select class={selectClass} bind:value={iocTypeId} required>
							<option value={null} disabled>Select…</option>
							{#each refs.iocTypes as t (t.type_id)}
								<option value={t.type_id}>{t.type_name}</option>
							{/each}
						</select>
					</label>
					<label class="block space-y-1 text-xs font-medium">
						<span>TLP</span>
						<select class={selectClass} bind:value={tlpId} required>
							{#each refs.tlps as t (t.tlp_id)}
								<option value={t.tlp_id}>{t.tlp_name}</option>
							{/each}
						</select>
					</label>
				</div>
			{/if}
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={!valid || saving}>
					{saving ? 'Promoting…' : 'Promote'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
