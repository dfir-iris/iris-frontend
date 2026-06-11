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
	import { UsersService, type User } from '$lib/services/users.service';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { TagInput } from '$lib/components/common/tag';
	import type { Tag } from '$lib/types/resources/tag';
	import { normalizeTags as normalizeTagsArray, tagsToString } from '$lib/utils/tags';

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
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let caseName = $state('');
	let socId = $state('');
	let currentTags = $state<Tag[]>([]);
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
		// Flatten to CSV first so stringToTags can hand back proper Tag objects
		// with synthetic ids (see CaseGeneralInfo for the rationale).
		currentTags = normalizeTagsArray(
			(currentCase.tags ?? [])
				.map((t) => (typeof t === 'string' ? t : t.tag_title))
				.filter(Boolean)
				.join(',')
		);
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
			case_tags: tagsToString(currentTags),
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
		// Flatten to CSV first so stringToTags can hand back proper Tag objects
		// with synthetic ids (see CaseGeneralInfo for the rationale).
		currentTags = normalizeTagsArray(
			(currentCase.tags ?? [])
				.map((t) => (typeof t === 'string' ? t : t.tag_title))
				.filter(Boolean)
				.join(',')
		);
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

<form class="space-y-4" onsubmit={onSubmit}>
	<div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Case name</span>
			<Input class="h-8 text-xs" bind:value={caseName} autocomplete="off" />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">SOC ID</span>
			<Input class="h-8 text-xs" bind:value={socId} autocomplete="off" />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Classification</span>
			<SearchSelect
				size="sm"
				value={caseClassificationId}
				options={classificationOptions}
				placeholder="Classification"
				searchPlaceholder="Search classification..."
				onChange={(value) => (caseClassificationId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Owner</span>
			<SearchSelect
				size="sm"
				value={ownerId}
				options={ownerOptions}
				placeholder="Owner"
				searchPlaceholder="Search owner..."
				onChange={(value) => (ownerId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">State</span>
			<SearchSelect
				size="sm"
				value={caseStateId}
				options={stateOptions}
				placeholder="State"
				searchPlaceholder="Search state..."
				onChange={(value) => (caseStateId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Outcome</span>
			<SearchSelect
				size="sm"
				value={statusId}
				options={outcomeOptions}
				placeholder="Outcome"
				searchPlaceholder="Search outcome..."
				onChange={(value) => (statusId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Customer</span>
			<SearchSelect
				size="sm"
				value={customerId}
				options={customerOptions}
				placeholder="Customer"
				searchPlaceholder="Search customer..."
				onChange={(value) => (customerId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Reviewer</span>
			<SearchSelect
				size="sm"
				value={reviewerId}
				options={reviewerOptions}
				placeholder="Reviewer"
				searchPlaceholder="Search reviewer..."
				onChange={(value) => (reviewerId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Severity</span>
			<SearchSelect
				size="sm"
				value={severityId}
				options={severityOptions}
				placeholder="Severity"
				searchPlaceholder="Search severity..."
				onChange={(value) => (severityId = value as string)}
			/>
		</label>

		<div class="flex flex-col gap-1 sm:col-span-2">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Tags</span>
			<TagInput
				bind:tags={currentTags}
				outputFormat="array"
				placeholder="Add tags…"
				onchange={(tags) => (currentTags = tags as Tag[])}
			/>
		</div>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Case ID</span>
			<Input class="h-8 text-xs" value={currentCase?.case_id} autocomplete="off" readonly />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">UUID</span>
			<Input class="h-8 font-mono text-xs" value={currentCase?.case_uuid} autocomplete="off" readonly />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Open date</span>
			<Input class="h-8 text-xs" value={currentCase?.open_date} autocomplete="off" readonly />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Opening user</span>
			<Input class="h-8 text-xs" value={currentCase?.user_id} autocomplete="off" readonly />
		</label>
	</div>

	<div class="flex items-center justify-between pt-2">
		<div class="flex gap-2">
			<Button variant="destructive" size="sm" onclick={onDelete}>Delete case</Button>

			{#if currentCase?.close_date}
				<Button size="sm" onclick={async () => await cases.reopen(currentCase?.case_id)}>
					Reopen case
				</Button>
			{:else}
				<Button variant="secondary" size="sm" onclick={() => onClose}>Close case</Button>
			{/if}
		</div>

		<div class="flex gap-2">
			<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button>
			<Button type="submit" size="sm">Save</Button>
		</div>
	</div>
</form>
