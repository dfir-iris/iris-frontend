<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { ContextMenuSource } from '../types';

	type Props = {
		open: boolean;
		itemType: ContextMenuSource;
		initialValue?: string;
		onSubmit: (value: string) => void;
		onCancel: () => void;
	};

	let { open = $bindable(), itemType, initialValue = '', onSubmit, onCancel }: Props = $props();

	let value = $state(initialValue);
	let submitting = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let wasOpen = $state(false);

	const title = $derived(`Rename ${itemType}`);
	const description = $derived(`Enter a new name for the ${itemType}`);
	const submitLabel = $derived('Rename');

	const focusInput = async () => {
		await tick();

		inputEl?.focus();
		inputEl?.select();
	};

	const handleSubmit = async () => {
		submitting = true;

		try {
			onSubmit(value.trim());
		} finally {
			submitting = false;
		}
	};

	$effect(() => {
		if (!open) {
			value = initialValue;
			wasOpen = false;
			return;
		}

		if (!wasOpen) {
			value = initialValue;
			wasOpen = true;
			void focusInput();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(open) => {
		if (!open) {
			onCancel();
		}
	}}
>
	<Dialog.Content class="p-0 sm:rounded-2xl">
		<div class="flex flex-col p-4">
			<Dialog.Header class="items-center text-center">
				<Dialog.Title class="text-2xl font-semibold tracking-tight">
					{title}
				</Dialog.Title>

				<Dialog.Description class="text-lg text-muted-foreground">
					{description}
				</Dialog.Description>
			</Dialog.Header>

			<div class="mt-2">
				<Input
					bind:ref={inputEl}
					{value}
					oninput={(event) => (value = event.currentTarget.value)}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							void handleSubmit();
						}
					}}
				/>
			</div>

			<Dialog.Footer class="mt-4 justify-end gap-2">
				<Button variant="outline" onclick={onCancel}>Cancel</Button>

				<Button variant="destructive" disabled={!value.trim() || submitting} onclick={handleSubmit}>
					{submitLabel}
				</Button>
			</Dialog.Footer>
		</div>
	</Dialog.Content>
</Dialog.Root>
