<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Tag } from '$lib/types/resources/tag';
	import { stringToTags, tagsToString } from '$lib/utils/tags';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import type { CreateCaseIocBody } from '$lib/services/case-iocs.service';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import IocAddForm, { type IocAddData } from './ioc-add-form.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let iocTypes = $state<IocType[]>([]);
	let tlps = $state<TlpItem[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);

	let addData = $state<IocAddData>({
		ioc_value: '',
		ioc_description: '',
		ioc_type_id: undefined,
		ioc_tlp_id: undefined,
		ioc_tags: ''
	});

	const reset = () => {
		currentTags = [];
		isSaving = false;

		addData = {
			ioc_value: '',
			ioc_description: '',
			ioc_type_id: undefined,
			ioc_tlp_id: undefined,
			ioc_tags: ''
		};
	};

	const close = () => onOpenChange(false);

	const loadOptions = async () => {
		const [iocTypesRes, tlpRes] = await Promise.all([IocTypesService.list(), TlpService.list()]);

		iocTypes = iocTypesRes.data as IocType[];
		tlps = tlpRes.data as TlpItem[];
	};

	const updateField = (field: string, value: string | number | Tag[]) => {
		if (field === 'ioc_tags') {
			if (Array.isArray(value)) {
				currentTags = [...value];
				addData.ioc_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				addData.ioc_tags = value;
			}

			return;
		}

		if (field === 'ioc_value' && typeof value === 'string') addData.ioc_value = value;
		if (field === 'ioc_description' && typeof value === 'string') addData.ioc_description = value;
		if (field === 'ioc_type_id' && typeof value === 'number') addData.ioc_type_id = value;
		if (field === 'ioc_tlp_id' && typeof value === 'number') addData.ioc_tlp_id = value;
	};

	const save = async () => {
		const iocValue = addData.ioc_value.trim();

		if (!iocValue || !addData.ioc_type_id || !addData.ioc_tlp_id) {
			toast({
				title: 'Missing required fields',
				description: 'IOC value, type, and TLP are required.',
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			const payload: CreateCaseIocBody = {
				ioc_value: iocValue,
				ioc_type_id: addData.ioc_type_id,
				ioc_tlp_id: addData.ioc_tlp_id,
				ioc_description: addData.ioc_description,
				ioc_tags: tagsToString(currentTags)
			};

			const created = await caseIocs.createIoc(payload, { fetch });

			if (!created) {
				throw new Error(`Failed to create IOC "${iocValue}"`);
			}

			toast({
				title: 'IOC created',
				description: 'IOC created successfully.',
				variant: 'success'
			});

			close();

			await goto(`/case/${caseId}/ioc/${created.ioc_id}`, { replaceState: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating IOC. Error: ${message}`,
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
		if (!nextOpen) close();
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add IOC</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
			<IocAddForm {addData} {currentTags} {iocTypes} {tlps} onUpdateField={updateField} />
		</div>

		<div class="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>

			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Add IOC
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
