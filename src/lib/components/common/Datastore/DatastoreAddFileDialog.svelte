<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, UploadIcon, FileIcon } from 'lucide-svelte';
	import { page } from '$app/state';
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

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const datastore = getContext<CaseDatastoreContext>(CASE_DATASTORE_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let selectedFile = $state<File | null>(null);
	let filename = $state('');
	let description = $state('');
	let tags = $state('');
	let password = $state('');
	let isIoc = $state(false);
	let isEvidence = $state(false);
	let isSaving = $state(false);

	const close = () => onOpenChange(false);

	const targetFolderId = $derived(datastore.ui.selectedFolderId ?? datastore.tree.rootId);

	const onFileChange = (event: Event) => {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0] ?? null;
		selectedFile = file;
		if (file && !filename) filename = file.name;
	};

	const reset = () => {
		selectedFile = null;
		filename = '';
		description = '';
		tags = '';
		password = '';
		isIoc = false;
		isEvidence = false;
		isSaving = false;
	};

	const save = async () => {
		if (!selectedFile) {
			toast({ title: 'No file selected', variant: 'destructive' });
			return;
		}
		if (targetFolderId == null) {
			toast({ title: 'No target folder', variant: 'destructive' });
			return;
		}
		if (!filename.trim()) {
			toast({ title: 'Filename is required', variant: 'destructive' });
			return;
		}

		isSaving = true;
		try {
			const created = await datastore.uploadFile(
				targetFolderId,
				{
					file_original_name: filename.trim(),
					file_description: description,
					file_tags: tags,
					file_password: password || undefined,
					file_is_ioc: isIoc,
					file_is_evidence: isEvidence
				},
				selectedFile
			);
			if (!created) throw new Error('Upload failed');
			toast({ title: 'File uploaded', variant: 'success' });
			// Make sure the side panel is showing so the user sees the new file
			// land in the tree right after the dialog closes.
			void caseId;
			close();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			toast({ title: 'Upload failed', description: message, variant: 'destructive' });
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (!open) reset();
	});
</script>

<Dialog.Root bind:open onOpenChange={(next) => (!next ? close() : null)}>
	<Dialog.Content class="flex max-h-[90vh] max-w-[640px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add File</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 space-y-4 overflow-auto px-6 py-5">
			<div class="rounded-lg border border-dashed bg-muted/30 p-4">
				<label class="flex cursor-pointer flex-col items-center gap-2">
					<UploadIcon size={24} class="text-muted-foreground" />
					<span class="text-sm font-medium">
						{selectedFile ? selectedFile.name : 'Choose a file to upload'}
					</span>
					{#if selectedFile}
						<span class="text-xs text-muted-foreground">
							{(selectedFile.size / 1024).toFixed(1)} KB
						</span>
					{/if}
					<input type="file" class="hidden" onchange={onFileChange} />
					<span class="text-xs text-muted-foreground underline">
						{selectedFile ? 'Choose another' : 'Browse…'}
					</span>
				</label>
			</div>

			<div>
				<label for="ds-file-name" class="text-sm font-medium">Filename</label>
				<Input id="ds-file-name" bind:value={filename} class="mt-1" />
			</div>

			<div>
				<label for="ds-file-desc" class="text-sm font-medium">Description</label>
				<Textarea
					id="ds-file-desc"
					bind:value={description}
					placeholder="Optional file description…"
					class="mt-1"
				/>
			</div>

			<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
				<div>
					<label for="ds-file-tags" class="text-sm font-medium">Tags</label>
					<Input id="ds-file-tags" bind:value={tags} placeholder="comma,separated" class="mt-1" />
				</div>
				<div>
					<label for="ds-file-password" class="text-sm font-medium">Encryption password</label>
					<Input
						id="ds-file-password"
						bind:value={password}
						placeholder="(optional)"
						type="text"
						class="mt-1"
					/>
				</div>
			</div>

			<div class="flex flex-wrap items-center gap-4">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={isIoc} />
					<span>
						<FileIcon size={12} class="mr-1 inline opacity-60" />
						Mark as IOC (auto-encrypted)
					</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={isEvidence} />
					<span>
						<FileIcon size={12} class="mr-1 inline opacity-60" />
						Mark as Evidence
					</span>
				</label>
			</div>

			<p class="text-xs text-muted-foreground">
				Will be uploaded to folder #{targetFolderId ?? '—'}.
			</p>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>
			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Uploading...
				{:else}
					<UploadIcon class="h-4 w-4" />
					Upload
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
