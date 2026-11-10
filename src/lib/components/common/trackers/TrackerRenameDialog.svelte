<!--
  Rename a tracker row: the label of a free-text row (required), or the
  custom label of an item row (optional: empty shows the item's name).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';

	type Props = {
		open: boolean;
		/** Name of the item of the row; null for a free-text row. */
		itemName: string | null;
		/** Current label (free text) or custom label (item row). */
		label: string | null;
		/** Saves the new label (null resets an item row); true when saved. */
		onSave: (label: string | null) => Promise<boolean>;
	};

	let { open = $bindable(), itemName, label, onSave }: Props = $props();

	let value = $state('');
	let busy = $state(false);

	const isItem = $derived(itemName !== null);
	const next = $derived(value.trim() || null);
	const changed = $derived(next !== (label || null));
	const valid = $derived(isItem || next !== null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			value = label ?? '';
			busy = false;
		});
	});

	const save = async (target: string | null) => {
		if (busy) return;
		busy = true;
		try {
			if (await onSave(target)) open = false;
		} finally {
			busy = false;
		}
	};

	const submit = (e: SubmitEvent) => {
		e.preventDefault();
		if (valid && changed) void save(next);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Rename the row</Dialog.Title>
			<Dialog.Description>
				{#if isItem}
					Give this row of <span class="font-medium text-foreground">{itemName}</span> its own label.
					Leave it empty to show the item's name.
				{:else}
					Change the text of this row.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<form class="flex flex-col gap-1" onsubmit={submit} id="tracker-rename-form">
			<label
				for="tracker-rename-label"
				class="text-2xs uppercase tracking-wide text-muted-foreground"
			>
				{isItem ? 'Custom label' : 'Label'}
			</label>
			<Input
				id="tracker-rename-label"
				bind:value
				maxlength={512}
				placeholder={itemName ?? ''}
				disabled={busy}
				data-testid="tracker-rename-input"
			/>
		</form>

		<Dialog.Footer class="pt-3">
			{#if isItem && label}
				<Button
					variant="ghost"
					class="mr-auto"
					disabled={busy}
					onclick={() => void save(null)}
					data-testid="tracker-rename-reset"
				>
					Use the item's name
				</Button>
			{/if}
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button
				type="submit"
				form="tracker-rename-form"
				disabled={busy || !valid || !changed}
				data-testid="tracker-rename-submit"
			>
				{busy ? 'Saving…' : 'Save'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
