<!-- Name / description (and sharing on creation) of a saved graph view. -->
<script lang="ts" module>
	export interface SaveViewValues {
		name: string;
		description: string | null;
		is_shared: boolean;
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { validateViewName, VIEW_NAME_MAX } from '../../lib/saved-views';

	interface Props {
		open: boolean;
		mode: 'create' | 'rename';
		initial?: Partial<SaveViewValues>;
		onSubmit: (values: SaveViewValues) => void | Promise<void>;
	}

	let { open = $bindable(), mode, initial = {}, onSubmit }: Props = $props();

	let name = $state('');
	let description = $state('');
	let shared = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			name = initial.name ?? '';
			description = initial.description ?? '';
			shared = initial.is_shared ?? false;
			error = null;
		});
	});

	const nameError = $derived(name ? validateViewName(name) : null);

	const submit = async (e: SubmitEvent) => {
		e.preventDefault();
		const invalid = validateViewName(name);
		if (invalid) {
			error = invalid;
			return;
		}
		if (saving) return;
		saving = true;
		error = null;
		try {
			await onSubmit({
				name: name.trim(),
				description: description.trim() || null,
				is_shared: shared
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
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{mode === 'create' ? 'Save the view' : 'Rename the view'}</Dialog.Title>
			<Dialog.Description>
				{mode === 'create'
					? 'Positions, viewport, filters, hidden and pinned objects, extra data and time range are saved.'
					: 'Change the name and description of the view.'}
			</Dialog.Description>
		</Dialog.Header>
		<form class="space-y-3" onsubmit={submit}>
			<label class="block space-y-1 text-xs font-medium">
				<span>Name</span>
				<Input
					bind:value={name}
					maxlength={VIEW_NAME_MAX}
					required
					placeholder="Lateral movement from WS01"
					aria-invalid={!!nameError}
				/>
				{#if nameError}
					<span class="text-destructive">{nameError}</span>
				{/if}
			</label>
			<label class="block space-y-1 text-xs font-medium">
				<span>Description <span class="font-normal text-muted-foreground">(optional)</span></span>
				<Textarea bind:value={description} rows={3} />
			</label>
			{#if mode === 'create'}
				<label class="flex items-center justify-between gap-3 text-sm">
					<span>
						Share with the case team
						<span class="block text-xs text-muted-foreground">
							Everyone with access to the case can load and update it.
						</span>
					</span>
					<Switch bind:checked={shared} />
				</label>
			{/if}
			{#if error}
				<p class="text-xs text-destructive" role="alert">{error}</p>
			{/if}
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={saving || !name.trim()}>
					{mode === 'create' ? 'Save' : 'Rename'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
