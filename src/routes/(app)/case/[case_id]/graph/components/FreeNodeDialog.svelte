<!--
  Create / edit a free node (actor, account, infrastructure… that is not a
  case object yet): label, type, icon, colour, description.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { lucideIcon, paletteHex, PALETTE_NAMES } from '$lib/components/common/CytoscapeGraph';
	import {
		FREE_NODE_TYPES,
		type CreateFreeNodeBody,
		type FreeNodeType,
		type GraphNode
	} from '$lib/types/resources/case-graph';
	import { FREE_NODE_ICON_NAMES, FREE_NODE_ICONS, FREE_NODE_TYPE_ICON } from '../lib/icons';

	interface Props {
		open: boolean;
		/** Edited node; creation when absent. */
		node?: GraphNode | null;
		onSubmit: (body: CreateFreeNodeBody) => void | Promise<void>;
	}

	let { open = $bindable(), node = null, onSubmit }: Props = $props();

	const TYPE_LABEL: Record<FreeNodeType, string> = {
		actor: 'Threat actor',
		account: 'Account',
		infrastructure: 'Infrastructure',
		malware: 'Malware',
		note: 'Note',
		group: 'Group',
		other: 'Other'
	};

	let label = $state('');
	let nodeType = $state<FreeNodeType>('other');
	let icon = $state<string | null>(null);
	let color = $state<string | null>(null);
	let description = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	const isDark = $derived($mode === 'dark');

	$effect(() => {
		if (!open) return;
		untrack(() => {
			label = node?.label ?? '';
			nodeType = (FREE_NODE_TYPES as readonly string[]).includes(node?.type ?? '')
				? (node?.type as FreeNodeType)
				: 'other';
			icon = node?.icon && FREE_NODE_ICONS[node.icon] ? node.icon : null;
			color = node?.color ?? null;
			description = node?.description ?? '';
			error = null;
		});
	});

	const previewIcon = $derived(icon ?? FREE_NODE_TYPE_ICON[nodeType]);
	const previewHex = $derived(paletteHex(color ?? 'slate', isDark));

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		if (!label.trim() || saving) return;
		saving = true;
		error = null;
		try {
			await onSubmit({
				label: label.trim(),
				node_type: nodeType,
				icon,
				color,
				description: description.trim() || null
			});
			open = false;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{node ? 'Edit node' : 'New free node'}</Dialog.Title>
			<Dialog.Description>
				A graph-only object (actor, account, infrastructure…). It can be promoted to an asset or an
				IOC later.
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={submit}>
			<div class="grid grid-cols-[1fr_10rem] gap-2">
				<label class="space-y-1 text-xs font-medium">
					<span>Label</span>
					<Input bind:value={label} required placeholder="APT-X operator" />
				</label>
				<label class="space-y-1 text-xs font-medium">
					<span>Type</span>
					<select
						class="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
						bind:value={nodeType}
					>
						{#each FREE_NODE_TYPES as t (t)}
							<option value={t}>{TYPE_LABEL[t]}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="space-y-1">
				<div class="flex items-center justify-between text-xs font-medium">
					<span>Icon</span>
					<button
						type="button"
						class="text-xs text-muted-foreground hover:text-foreground"
						onclick={() => (icon = null)}
						disabled={icon === null}
					>
						Use the type icon
					</button>
				</div>
				<div class="grid max-h-32 grid-cols-10 gap-1 overflow-y-auto rounded-md border p-1">
					{#each FREE_NODE_ICON_NAMES as name (name)}
						<button
							type="button"
							title={name}
							aria-label={name}
							aria-pressed={previewIcon === name}
							class="flex h-8 items-center justify-center rounded {previewIcon === name
								? 'bg-primary/15 ring-1 ring-primary'
								: 'hover:bg-accent'}"
							onclick={() => (icon = name)}
						>
							<img src={lucideIcon(FREE_NODE_ICONS[name], previewHex)} alt="" class="h-5 w-5" />
						</button>
					{/each}
				</div>
			</div>

			<div class="space-y-1">
				<span class="text-xs font-medium">Colour</span>
				<div class="flex flex-wrap gap-1.5">
					<button
						type="button"
						title="Default"
						aria-label="Default colour"
						aria-pressed={color === null}
						class="h-6 w-6 rounded-full border-2 bg-muted {color === null
							? 'border-foreground'
							: 'border-transparent'}"
						onclick={() => (color = null)}
					></button>
					{#each PALETTE_NAMES as name (name)}
						<button
							type="button"
							title={name}
							aria-label={name}
							aria-pressed={color === name}
							class="h-6 w-6 rounded-full border-2 {color === name
								? 'border-foreground'
								: 'border-transparent'}"
							style="background: {paletteHex(name, isDark)}"
							onclick={() => (color = name)}
						></button>
					{/each}
				</div>
			</div>

			<label class="block space-y-1 text-xs font-medium">
				<span>Description</span>
				<Textarea bind:value={description} rows={3} />
			</label>
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="ghost" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={!label.trim() || saving}>
					{saving ? 'Saving…' : node ? 'Save' : 'Create node'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
