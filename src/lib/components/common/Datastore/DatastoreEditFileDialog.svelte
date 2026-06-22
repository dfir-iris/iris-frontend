<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon, UploadIcon } from 'lucide-svelte';
	import {
		CASE_DATASTORE_CTX,
		type CaseDatastoreContext
	} from '$lib/contexts/case-datastore.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { toast } from '$lib/stores/toast.store';
	import type { DataStoreFile } from '$lib/types/resources/datastore';

	type Props = {
		open: boolean;
		file: DataStoreFile | null;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), file, onOpenChange }: Props = $props();

	const datastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);

	let filename = $state('');
	let description = $state('');
	let tags = $state('');
	let password = $state('');
	let isIoc = $state(false);
	let isEvidence = $state(false);
	let replaceFile = $state<File | null>(null);
	let isSaving = $state(false);

	const close = () => onOpenChange(false);

	$effect(() => {
		if (open && file) {
			filename = file.file_original_name;
			description = file.file_description ?? '';
			tags = file.file_tags ?? '';
			password = file.file_password ?? '';
			isIoc = !!file.file_is_ioc;
			isEvidence = !!file.file_is_evidence;
			replaceFile = null;
		}
		if (!open) isSaving = false;
	});

	const save = async () => {
		if (!file) return;
		if (!filename.trim()) {
			toast({ title: 'Filename is required', variant: 'destructive' });
			return;
		}

		isSaving = true;
		try {
			const updated = await datastore.updateFile(
				file.file_id,
				{
					file_original_name: filename.trim(),
					file_description: description,
					file_tags: tags,
					file_password: password,
					file_is_ioc: isIoc,
					file_is_evidence: isEvidence
				},
				replaceFile ?? undefined
			);
			if (!updated) throw new Error('Save failed');
			toast({ title: 'File updated', variant: 'success' });
			close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			toast({ title: 'Save failed', description: message, variant: 'destructive' });
		} finally {
			isSaving = false;
		}
	};
</script>

<Dialog.Root bind:open onOpenChange={(next) => (!next ? close() : null)}>
	<Dialog.Content class="flex max-h-[90vh] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Edit file metadata</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-5">
			<div>
				<label for="ds-edit-name" class="text-sm font-medium">Filename</label>
				<Input id="ds-edit-name" bind:value={filename} class="mt-1" />
			</div>

			<div>
				<label for="ds-edit-desc" class="text-sm font-medium">Description</label>
				<Textarea id="ds-edit-desc" bind:value={description} class="mt-1" />
			</div>

			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div>
					<label for="ds-edit-tags" class="text-sm font-medium">Tags</label>
					<Input id="ds-edit-tags" bind:value={tags} placeholder="comma,separated" class="mt-1" />
				</div>
				<div>
					<label for="ds-edit-password" class="text-sm font-medium">Encryption password</label>
					<Input id="ds-edit-password" bind:value={password} class="mt-1" />
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-4 text-sm">
				<label class="flex items-center gap-2">
					<Checkbox bind:checked={isIoc} />
					<span>Mark as IOC</span>
				</label>
				<label class="flex items-center gap-2">
					<Checkbox bind:checked={isEvidence} />
					<span>Mark as Evidence</span>
				</label>
			</div>

			<div class="rounded-lg border border-dashed bg-muted/30 p-3">
				<label class="flex cursor-pointer items-center gap-2 text-sm">
					<UploadIcon size={14} class="text-muted-foreground" />
					<input
						type="file"
						class="hidden"
						onchange={(e) =>
							(replaceFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
					/>
					<span class="text-muted-foreground">
						{replaceFile ? `Replacement: ${replaceFile.name}` : 'Optionally replace file contents'}
					</span>
					<span class="ml-auto text-xs underline">Choose</span>
				</label>
			</div>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>
			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Save changes
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
