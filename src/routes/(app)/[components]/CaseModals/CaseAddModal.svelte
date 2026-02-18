<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { CreateCaseBody } from '$lib/services/case.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import {
		CaseClassificationsService,
		type CaseClassification
	} from '$lib/services/case-classifications.service';
	import type { RequestResponse } from '$lib/services/api.service';

	type CaseAddModalProps = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open, onOpenChange }: CaseAddModalProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);

	let customers = $state<Customer[]>([]);
	let classifications = $state<CaseClassification[]>([]);

	let customerId = $state('');
	let caseName = $state('');
	let caseTemplateId = $state('');
	let classificationId = $state('');
	let shortDescription = $state('');
	let socTicketId = $state('');

	let submitting = $state(false);
	let error = $state<string | null>(null);

	const customerOptions = $derived.by<SelectOption[]>(() =>
		customers.map((c) => ({ value: String(c.customer_id), label: c.customer_name }))
	);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		classifications.map((c) => ({ value: String(c.id), label: c.name_expanded }))
	);

	const templateOptions = $derived.by<SelectOption[]>(() => []);

	onMount(async () => {
		const customersResponse = (await CustomersService.list()).data as unknown as RequestResponse<
			Customer[]
		>;

		customers = (customersResponse.data ?? []) as Customer[];

		const classificationsResponse = (await CaseClassificationsService.list())
			.data as unknown as RequestResponse<CaseClassification[]>;

		classifications = (classificationsResponse.data ?? []) as CaseClassification[];
	});

	$effect(() => {
		if (open) return;

		customerId = '';
		caseName = '';
		caseTemplateId = '';
		classificationId = '';
		shortDescription = '';
		socTicketId = '';
		error = null;
		submitting = false;
	});

	const onSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		if (submitting) return;

		error = null;

		const cid = Number(customerId);
		if (!Number.isFinite(cid) || cid <= 0) {
			error = 'Customer is required';
			return;
		}

		const name = caseName.trim();
		if (name === '') {
			error = 'Case name is required';
			return;
		}

		const desc = shortDescription.trim();
		if (desc === '') {
			error = 'Short description is required';
			return;
		}

		const body: CreateCaseBody = {
			case_name: name,
			case_description: desc,
			case_customer_id: cid,
			case_soc_id: socTicketId.trim()
		};

		if (caseTemplateId !== '') body.case_template_id = Number(caseTemplateId);
		if (classificationId !== '') body.classification_id = Number(classificationId);

		const created = await cases.create(body);

		if (!created) {
			error = 'Faled to create case';

			return;
		}

		onOpenChange(false);

		await goto(`/case/${created.case_id}`);
	};
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100dvw-2rem)] flex-col overflow-auto p-0"
	>
		<Dialog.Header class="border-b px-8 py-6">
			<Dialog.Title class="text-xl font-semibold">Create a new case</Dialog.Title>
		</Dialog.Header>

		<div class="flex w-full flex-col px-8">
			<p class="text-sm text-muted-foreground">Fields with an asterisk are required.</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Access to the case can be granted to other users once the case is created. Users pertaining
				to the customer will be able to see the case by default.
			</p>

			<form class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" onsubmit={onSubmit}>
				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">Case name *</div>
					<Input class="text-sm" autocomplete="off" bind:value={caseName} />
				</div>

				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">SOC ticket ID</div>
					<Input
						class="bg-background text-sm outline-none"
						autocomplete="off"
						bind:value={socTicketId}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">Case template</div>
					<SearchSelect
						value={caseTemplateId}
						options={templateOptions}
						placeholder="Select case template"
						searchPlaceholder="Search template..."
						onChange={(value) => (caseTemplateId = value as string)}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">Classification</div>
					<SearchSelect
						value={classificationId}
						options={classificationOptions}
						placeholder="Select classification"
						searchPlaceholder="Search classification..."
						onChange={(value) => (classificationId = value as string)}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">Customer *</div>
					<SearchSelect
						value={customerId}
						options={customerOptions}
						placeholder="Select customer"
						searchPlaceholder="Search customer..."
						onChange={(value) => (customerId = value as string)}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<div class="text-sm font-medium">Short description *</div>
					<Input class="text-sm" autocomplete="off" bind:value={shortDescription} />
				</div>

				{#if error}
					<div
						class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:col-span-2"
					>
						{error}
					</div>
				{/if}

				<div class="mb-6 mt-2 flex justify-end sm:col-span-2">
					<Button type="submit">Create</Button>
				</div>
			</form>
		</div>
	</Dialog.Content>
</Dialog.Root>
