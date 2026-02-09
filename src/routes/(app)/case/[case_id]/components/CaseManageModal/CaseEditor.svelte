<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import type { Case } from '$lib/types/resources/case';
	import type { RequestResponse } from '$lib/services/api.service';
	import {
		CaseClassificationsService,
		type CaseClassification
	} from '$lib/services/case-classifications.service';
	import { CaseStatesService, type CaseState } from '$lib/services/case-states.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import Ace from '$lib/components/common/Ace/Ace.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { normalizeTags } from './utils';
	import { UsersService, type User } from '$lib/services/users.service';

	type Outcome = {
		id: number;
		label: string;
	};

	const OUTCOMES: Outcome[] = [
		{ id: 0, label: 'Unknown' },
		{ id: 1, label: 'False Positive' },
		{ id: 2, label: 'True Positive with impact' },
		{ id: 4, label: 'True Positive without impact' },
		{ id: 5, label: 'Legitimate' },
		{ id: 3, label: 'Not applicable' }
	];

	type CaseEditorProps = {
		onDelete?: () => void;
		onClose?: () => void;
		onCancel?: () => void;
		onSave?: (body: UpdateCaseBody) => void | Promise<void>;
	};

	let { onDelete, onClose, onCancel, onSave }: CaseEditorProps = $props();

	const cases = getContext<CasesContext>(CASES_CTX);
	const currentCase = cases.currentCase as unknown as Case;

	let caseName = $state('');
	let socId = $state('');
	let tagsCsv = $state('');
	let description = $state('');

	let ownerId = $state('');
	let caseClassificationId = $state('');
	let caseStateId = $state('');
	let statusId = $state('');
	let customerId = $state('');
	let reviewerId = $state('');
	let severityId = $state('');

	let caseClassifications = $state<CaseClassification[]>([]);
	let caseStates = $state<CaseState[]>([]);
	let severities = $state<Severity[]>([]);
	let customers = $state<Customer[]>([]);
	let users = $state<User[]>([]);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		caseClassifications.map((c) => ({ value: String(c.id), label: c.name_expanded }))
	);

	const ownerOptions = $derived.by<SelectOption[]>(() =>
		users.map((u) => ({ value: String(u.user_id), label: u.user_name }))
	);

	const stateOptions = $derived.by<SelectOption[]>(() =>
		caseStates.map((s) => ({ value: String(s.state_id), label: s.state_name }))
	);

	const outcomeOptions = $derived.by<SelectOption[]>(() =>
		OUTCOMES.map((o) => ({ value: String(o.id), label: o.label }))
	);

	const customerOptions = $derived.by<SelectOption[]>(() =>
		customers.map((c) => ({ value: String(c.customer_id), label: c.customer_name }))
	);

	const reviewerOptions = $derived.by<SelectOption[]>(() =>
		users.map((u) => ({ value: String(u.user_id), label: u.user_name }))
	);

	const severityOptions = $derived.by<SelectOption[]>(() =>
		severities.map((s) => ({ value: String(s.severity_id), label: s.severity_name }))
	);

	onMount(async () => {
		const caseClassificationsResponse = (await CaseClassificationsService.list())
			.data as unknown as RequestResponse<CaseClassification[]>;

		caseClassifications = caseClassificationsResponse.data as CaseClassification[];

		const caseStatesResponse = (await CaseStatesService.list()).data as unknown as RequestResponse<
			CaseState[]
		>;

		caseStates = caseStatesResponse.data as CaseState[];

		const customersResponse = (await CustomersService.list()).data as unknown as RequestResponse<
			Customer[]
		>;

		customers = customersResponse.data as Customer[];

		const severitiesResponse = (await SeveritiesService.list()).data as unknown as RequestResponse<
			Severity[]
		>;

		severities = severitiesResponse.data as Severity[];

		const usersResponse = (await UsersService.list()).data as unknown as RequestResponse<User[]>;

		users = usersResponse.data as User[];
	});

	$effect(() => {
		if (!currentCase) return;

		caseName = currentCase.case_name;
		socId = currentCase.case_soc_id;
		tagsCsv = (currentCase.tags ?? []).map((t) => t.tag_title).join(', ');
		description = currentCase.case_description ?? '';

		caseClassificationId = String(currentCase.classification_id);
		ownerId = String(currentCase.owner?.id);
		caseStateId = String(currentCase.state?.state_id);
		statusId = String(currentCase.status_id);
		customerId = String(currentCase.case_customer?.customer_id);
		reviewerId = String(currentCase.reviewer_id);
		severityId = String(currentCase.severity?.severity_id);
	});

	const save = async () => {
		const body: UpdateCaseBody = {
			case_name: caseName,
			case_soc_id: socId,
			case_tags: normalizeTags(tagsCsv).join(','),
			case_description: description,

			...(caseClassificationId !== '' ? { classification_id: Number(caseClassificationId) } : {}),
			...(ownerId !== '' ? { owner_id: Number(ownerId) } : {}),
			...(caseStateId !== '' ? { state_id: Number(caseStateId) } : {}),
			...(statusId !== '' ? { status_id: Number(statusId) } : {}),
			...(customerId !== '' ? { case_customer_id: Number(customerId) } : {}),
			...(reviewerId !== '' ? { reviewer_id: Number(reviewerId) } : {}),
			...(severityId !== '' ? { severity_id: Number(severityId) } : {})
		};

		await onSave?.(body);
	};

	const cancel = () => {
		if (!currentCase) return;

		caseName = currentCase.case_name ?? '';
		socId = currentCase.case_soc_id ?? '';
		tagsCsv = (currentCase.tags ?? []).map((t) => t.tag_title).join(', ');
		description = currentCase.case_description ?? '';

		caseClassificationId = String(currentCase.classification_id);
		ownerId = String(currentCase.owner?.id);
		caseStateId = String(currentCase.state.state_id);
		statusId = String(currentCase.status_id);
		customerId = String(currentCase.case_customer.customer_id);
		reviewerId = String(currentCase.reviewer_id);
		severityId = String(currentCase.severity?.severity_id);

		onCancel?.();
	};

	const onSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		await save();
	};
</script>

<form class="space-y-6" onsubmit={onSubmit}>
	<div class="grid grid-cols-2 gap-4">
		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Case name</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={caseName}
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">SOC ID</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={socId}
				autocomplete="off"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Classification</span>
			<SearchSelect
				value={caseClassificationId}
				options={classificationOptions}
				placeholder="Classification"
				searchPlaceholder="Search classification..."
				onChange={(v) => (caseClassificationId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Owner</span>
			<SearchSelect
				value={ownerId}
				options={ownerOptions}
				placeholder="Owner"
				searchPlaceholder="Search owner..."
				onChange={(v) => (ownerId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">State</span>
			<SearchSelect
				value={caseStateId}
				options={stateOptions}
				placeholder="State"
				searchPlaceholder="Search state..."
				onChange={(v) => (caseStateId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Outcome</span>
			<SearchSelect
				value={statusId}
				options={outcomeOptions}
				placeholder="Outcome"
				searchPlaceholder="Search outcome..."
				onChange={(v) => (statusId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Customer</span>
			<SearchSelect
				value={customerId}
				options={customerOptions}
				placeholder="Customer"
				searchPlaceholder="Search customer..."
				onChange={(v) => (customerId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Reviewer</span>
			<SearchSelect
				value={reviewerId}
				options={reviewerOptions}
				placeholder="Reviewer"
				searchPlaceholder="Search reviewer..."
				onChange={(v) => (reviewerId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Severity</span>
			<SearchSelect
				value={severityId}
				options={severityOptions}
				placeholder="Severity"
				searchPlaceholder="Search severity..."
				onChange={(v) => (severityId = v)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-semibold">Case tags (comma separated)</span>
			<input
				class="rounded-md border bg-background px-3 py-2"
				bind:value={tagsCsv}
				placeholder="tag1, tag2, tag3"
				autocomplete="off"
			/>
		</label>

		<div>
			<div class="text-sm font-semibold">Case ID</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.case_id}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Case UUID</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.case_uuid}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Open date</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.open_date}</div>
		</div>

		<div>
			<div class="text-sm font-semibold">Opening user</div>
			<div class="rounded-md border bg-muted/20 px-3 py-2">{currentCase?.user_id}</div>
		</div>
	</div>

	<h2 class="text-xl font-bold">Case description</h2>

	<Ace value={description} onChange={(v) => (description = v)} />

	<div class="flex justify-between">
		<div class="flex gap-2">
			<Button type="button" variant="destructive" onclick={onDelete}>Delete case</Button>
			<Button type="button" variant="secondary" onclick={onClose}>Close case</Button>
		</div>

		<div class="flex gap-2">
			<Button type="button" variant="secondary" onclick={cancel}>Cancel</Button>
			<Button type="submit" variant="destructive">Save</Button>
		</div>
	</div>
</form>
