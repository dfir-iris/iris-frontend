<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = {
		open: boolean;
		onSubmit: (value: string) => void;
		onCancel: () => void;
	};

	let { open = $bindable(), onSubmit, onCancel }: Props = $props();

	let value = $state('');
	let submitting = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let wasOpen = $state(false);

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
			value = '';
			wasOpen = false;

			return;
		}

		if (!wasOpen) {
			value = '';
			wasOpen = true;

			focusInput();
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
					Name the new folder
				</Dialog.Title>

				<Dialog.Description class="text-lg text-muted-foreground">
					Enter a new name for the folder
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
					Create
				</Button>
			</Dialog.Footer>
		</div>
	</Dialog.Content>
</Dialog.Root>
