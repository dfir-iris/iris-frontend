<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon } from 'lucide-svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/stores/toast.store';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const datastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);

	let folderName = $state('');
	let isSaving = $state(false);

	const close = () => onOpenChange(false);

	const parentId = $derived(datastore.ui.selectedFolderId ?? datastore.tree.rootId);

	const save = async () => {
		if (!folderName.trim()) {
			toast({ title: 'Folder name is required', variant: 'destructive' });
			return;
		}
		if (parentId == null) {
			toast({ title: 'No parent folder', variant: 'destructive' });
			return;
		}

		isSaving = true;
		try {
			const created = await datastore.createFolder({
				parent_node: parentId,
				folder_name: folderName.trim()
			});
			if (!created) throw new Error('Failed to create folder');
			toast({ title: 'Folder created', variant: 'success' });
			close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			toast({ title: 'Create failed', description: message, variant: 'destructive' });
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (!open) {
			folderName = '';
			isSaving = false;
		}
	});
</script>

<Dialog.Root bind:open onOpenChange={(next) => (!next ? close() : null)}>
	<Dialog.Content class="max-w-[480px]">
		<Dialog.Header>
			<Dialog.Title>Add Folder</Dialog.Title>
		</Dialog.Header>

		<div class="space-y-3 py-2">
			<div>
				<label for="ds-folder-name" class="text-sm font-medium">Folder name</label>
				<Input id="ds-folder-name" bind:value={folderName} placeholder="New folder" class="mt-1" />
			</div>
			<p class="text-xs text-muted-foreground">
				Will be created under folder #{parentId ?? '—'}.
			</p>
		</div>

		<div class="flex items-center justify-end gap-2 border-t pt-3">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>
			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Create folder
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
