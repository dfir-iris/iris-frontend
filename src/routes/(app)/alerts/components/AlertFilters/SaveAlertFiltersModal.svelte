<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Label from '$lib/components/ui/label/label.svelte';

	type SaveMeta = {
		name: string;
		description: string;
		isPrivate: boolean;
	};

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;

		value: SaveMeta;
		onChange: (next: SaveMeta) => void;

		disabled?: boolean;
		onSave: () => void;
	};

	let { open, onOpenChange, value, onChange, disabled = false, onSave }: Props = $props();

	const submit = (e: Event) => {
		e.preventDefault();
		if (disabled) return;
		onSave();
	};

	const setName = (name: string) => onChange({ ...value, name });
	const setDescription = (description: string) => onChange({ ...value, description });
	const setPrivate = (isPrivate: boolean) => onChange({ ...value, isPrivate });
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="max-w-lg">
		<form onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>Save Filter</Dialog.Title>
			</Dialog.Header>

			<div class="mt-4 space-y-4">
				<div class="space-y-2">
					<Label>Filter Name *</Label>
					<Input
						value={value.name}
						placeholder="Filter name"
						autofocus
						{disabled}
						oninput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
					/>
				</div>

				<div class="space-y-2">
					<Label>Filter Description</Label>
					<Input
						value={value.description}
						placeholder="Filter description"
						{disabled}
						oninput={(e) => setDescription((e.currentTarget as HTMLInputElement).value)}
					/>
				</div>

				<div class="flex items-center gap-2">
					<Checkbox
						checked={value.isPrivate}
						{disabled}
						onCheckedChange={(v) => setPrivate(Boolean(v))}
					/>
					<Label>Private Filter</Label>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<Button type="button" variant="outline" {disabled} onclick={() => onOpenChange(false)}>
					Cancel
				</Button>

				<Button type="submit" disabled={disabled || value.name.trim() === ''}>Save Filter</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
