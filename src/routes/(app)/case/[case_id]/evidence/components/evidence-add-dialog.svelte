<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { EvidenceType } from '$lib/types/resources/evidence';
	import { toast } from '$lib/stores/toast.store';
	import { EvidenceTypesService } from '$lib/services/evidence-types.service';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import EvidenceForm, { type EvidenceFormData } from './evidence-form.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let evidenceTypes = $state<EvidenceType[]>([]);
	let isSaving = $state(false);

	let formData = $state<EvidenceFormData>({
		filename: '',
		file_description: '',
		type_id: undefined,
		file_hash: undefined,
		file_size: undefined,
		acquisition_date: undefined
	});

	const reset = () => {
		isSaving = false;
		formData = {
			filename: '',
			file_description: '',
			type_id: undefined,
			file_hash: undefined,
			file_size: undefined,
			acquisition_date: undefined
		};
	};

	const close = () => onOpenChange(false);

	const loadOptions = async () => {
		const typesRes = await EvidenceTypesService.list();

		if (typesRes.ok && Array.isArray(typesRes.data)) {
			evidenceTypes = typesRes.data;
		}
	};

	const updateField = (field: string, value: string | number) => {
		if (field === 'filename' && typeof value === 'string') {
			formData.filename = value;
			return;
		}

		if (field === 'file_description' && typeof value === 'string') {
			formData.file_description = value;
			return;
		}

		if (field === 'file_hash' && typeof value === 'string') {
			formData.file_hash = value;
			return;
		}

		if (field === 'acquisition_date' && typeof value === 'string') {
			formData.acquisition_date = value;
			return;
		}

		if (field === 'type_id') {
			formData.type_id = typeof value === 'number' ? value : undefined;
			return;
		}

		if (field === 'file_size') {
			formData.file_size = typeof value === 'number' && Number.isFinite(value) ? value : undefined;
		}
	};

	const save = async () => {
		if (!formData.filename.trim()) {
			toast({
				title: 'Missing required fields',
				description: 'Filename is required.',
				variant: 'destructive'
			});

			return;
		}

		isSaving = true;

		try {
			const created = await caseEvidences.createEvidence(
				{
					filename: formData.filename.trim(),
					file_description: formData.file_description,
					type_id: formData.type_id,
					file_hash: formData.file_hash,
					file_size: formData.file_size,
					acquisition_date: formData.acquisition_date
				},
				{ fetch }
			);

			if (!created) throw new Error('Failed to create evidence');

			toast({ title: 'Evidence created', variant: 'success' });

			close();

			await goto(`/case/${caseId}/evidence/${created.id}`, { replaceState: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating the evidence. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (open) {
			loadOptions();
		} else {
			reset();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			close();
		}
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-[780px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add Evidence</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
			<EvidenceForm
				{formData}
				{evidenceTypes}
				onUpdateField={updateField}
				onSave={save}
			/>
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>
			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Add Evidence
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
