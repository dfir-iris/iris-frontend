<!--
  Paste free text: the backend extracts the indicators, creates the missing
  IOCs and optionally links each one to `link_to`.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import type {
		GraphNode,
		GraphPasteBody,
		GraphPasteResult,
		GraphRelationType
	} from '$lib/types/resources/case-graph';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';
	import { KIND_LABEL } from '../lib/model';

	interface Props {
		open: boolean;
		refs: GraphReferenceData;
		/** Candidate `link_to` targets. */
		nodes: GraphNode[];
		relationTypes: GraphRelationType[];
		/** Pre-selected link target (node context menu). */
		linkTo?: string | null;
		onSubmit: (body: GraphPasteBody) => Promise<GraphPasteResult>;
	}

	let { open = $bindable(), refs, nodes, relationTypes, linkTo = null, onSubmit }: Props = $props();

	const MAX_INDICATORS = 1000;

	let text = $state('');
	let tlpId = $state<number | null>(null);
	let target = $state<string>('');
	let relation = $state('related_to');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let result = $state<GraphPasteResult | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			void refs.ensureObjectTypes();
			text = '';
			target = linkTo ?? '';
			relation = relationTypes.some((r) => r.name === 'related_to')
				? 'related_to'
				: (relationTypes[0]?.name ?? 'related_to');
			tlpId = null;
			error = null;
			result = null;
		});
	});

	$effect(() => {
		if (open && tlpId === null && refs.defaultTlpId !== null) tlpId = refs.defaultTlpId;
	});

	const targets = $derived(
		[...nodes]
			.filter((n) => n.kind !== 'case')
			.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label))
	);

	const lineCount = $derived(text.split(/\s+/).filter(Boolean).length);

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!text.trim() || saving) return;
		saving = true;
		error = null;
		try {
			const body: GraphPasteBody = { text };
			if (tlpId !== null) body.ioc_tlp_id = tlpId;
			if (target) {
				body.link_to = target;
				body.relation = relation;
			}
			result = await onSubmit(body);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	};

	const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-xl">
		<Dialog.Header>
			<Dialog.Title>Paste indicators</Dialog.Title>
			<Dialog.Description>
				IPs, domains, URLs, e-mails and hashes are extracted from the text. Missing IOCs are
				created; existing ones are reused (at most {MAX_INDICATORS} per paste).
			</Dialog.Description>
		</Dialog.Header>
		{#if result}
			<div class="space-y-2 text-sm">
				<p>
					<strong>{result.created.length}</strong> IOC(s) created,
					<strong>{result.existing.length}</strong> already in the case,
					<strong>{result.edges.length}</strong> relation(s) added.
				</p>
				{#if result.ignored.length}
					<details class="rounded-md border p-2 text-xs">
						<summary class="cursor-pointer">{result.ignored.length} ignored</summary>
						<ul class="mt-1 max-h-32 overflow-y-auto font-mono">
							{#each result.ignored as i, idx (idx)}
								<li class="truncate">{i}</li>
							{/each}
						</ul>
					</details>
				{/if}
				<Dialog.Footer>
					<Button size="sm" variant="ghost" onclick={() => (result = null)}>Paste more</Button>
					<Button size="sm" onclick={() => (open = false)}>Done</Button>
				</Dialog.Footer>
			</div>
		{:else}
			<form class="space-y-3" onsubmit={submit}>
				<Textarea
					bind:value={text}
					rows={8}
					class="font-mono text-xs"
					placeholder={'203.0.113.7\nevil.example.com\nhxxps://evil.example.com/payload\n44d88612fea8a8f36de82e1278abb02f'}
					aria-label="Text to import"
				/>
				<div class="grid grid-cols-3 gap-2">
					<label class="block space-y-1 text-xs font-medium">
						<span>TLP of new IOCs</span>
						<select class={selectClass} bind:value={tlpId}>
							{#each refs.tlps as t (t.tlp_id)}
								<option value={t.tlp_id}>{t.tlp_name}</option>
							{/each}
						</select>
					</label>
					<label class="col-span-2 block space-y-1 text-xs font-medium">
						<span>Link each indicator to</span>
						<select class={selectClass} bind:value={target}>
							<option value="">— nothing —</option>
							{#each targets as n (n.key)}
								<option value={n.key}>{KIND_LABEL[n.kind]} · {n.label}</option>
							{/each}
						</select>
					</label>
				</div>
				{#if target}
					<label class="block space-y-1 text-xs font-medium">
						<span>Relation</span>
						<select class={selectClass} bind:value={relation}>
							{#each relationTypes as r (r.id)}
								<option value={r.name}>{r.label}</option>
							{/each}
						</select>
					</label>
				{/if}
				{#if error}
					<p class="text-xs text-destructive" role="alert">{error}</p>
				{/if}
				<Dialog.Footer>
					<span class="mr-auto self-center text-xs text-muted-foreground">
						{lineCount} token(s)
					</span>
					<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={!text.trim() || saving}>
						{saving ? 'Importing…' : 'Import'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
