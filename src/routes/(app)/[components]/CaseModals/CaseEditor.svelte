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
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';
	import type { UpdateCaseBody } from '$lib/services/case.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
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
	let closingNote = $state('');

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
	// Candidates for the Owner / Reviewer pickers. Sourced from
	// `GET /cases/{id}/access/users` (auth-gated + per-case check) rather
	// than `/manage/users`, which is server_administrator-only — otherwise
	// a non-admin analyst gets a 403 and both dropdowns render empty, so
	// they can't reassign a case they otherwise have full access to.
	// `CaseService.listUsers` already narrows to full_access (4), which is
	// the right set here: an owner/reviewer has to be able to work the case.
	let users = $state<CaseAccessUserRow[]>([]);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		caseClassifications.map((c) => ({ value: String(c.id), label: c.name_expanded }))
	);

	// The current owner may have lost case access since being assigned; keep
	// them in the list so the select still renders a name instead of going
	// blank (and so saving doesn't silently drop the value).
	const userOptions = $derived.by<SelectOption[]>(() => {
		const options = users.map((u) => ({ value: String(u.user_id), label: u.user_name }));
		for (const current of [currentCase?.owner, currentCase?.reviewer]) {
			if (!current?.id) continue;
			const key = String(current.id);
			if (options.some((o) => o.value === key)) continue;
			options.push({ value: key, label: current.user_name ?? `User #${key}` });
		}
		return options;
	});

	const stateOptions = $derived.by<SelectOption[]>(() =>
		caseStates.map((s) => ({ value: String(s.state_id), label: s.state_name }))
	);

	const outcomeOptions = $derived.by<SelectOption[]>(() =>
		OUTCOMES.map((o) => ({ value: String(o.id), label: o.label }))
	);

	const customerOptions = $derived.by<SelectOption[]>(() =>
		customers.map((c) => ({ value: String(c.customer_id), label: c.customer_name }))
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

		customers = (await CustomersService.list()).data;

		const severitiesResponse = (await SeveritiesService.list()).data as unknown as RequestResponse<
			Severity[]
		>;

		severities = severitiesResponse.data as Severity[];
	});

	// Keyed on the case id rather than folded into `onMount` — the modal is
	// kept mounted while the user switches case from the context, so the
	// candidate list has to follow.
	$effect(() => {
		const caseId = currentCase?.case_id;
		if (!caseId) return;
		void CaseService.listUsers(caseId).then((rows) => {
			users = rows;
		});
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
		closingNote = currentCase.closing_note ?? '';

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
			// `null` rather than `''` so emptying the box actually clears the
			// column — an empty string would keep every "has a closing note?"
			// check truthy and render a blank section.
			closing_note: closingNote.trim() === '' ? null : closingNote,

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
		closingNote = currentCase.closing_note ?? '';

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
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Case name</span
			>
			<Input class="h-8 text-xs" bind:value={caseName} autocomplete="off" />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">SOC ID</span>
			<Input class="h-8 text-xs" bind:value={socId} autocomplete="off" />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Classification</span
			>
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
				options={userOptions}
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
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Outcome</span
			>
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
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Customer</span
			>
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
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Reviewer</span
			>
			<SearchSelect
				size="sm"
				value={reviewerId}
				options={userOptions}
				placeholder="Reviewer"
				searchPlaceholder="Search reviewer..."
				onChange={(value) => (reviewerId = value as string)}
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Severity</span
			>
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

		<label class="flex flex-col gap-1 sm:col-span-2">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
				Closing note
			</span>
			<Textarea
				bind:value={closingNote}
				rows={4}
				class="text-xs"
				placeholder="Why was this case closed? Outcome, impact, follow-up actions…"
			/>
			<span class="text-2xs text-muted-foreground">Supports markdown.</span>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Case ID</span
			>
			<Input class="h-8 text-xs" value={currentCase?.case_id} autocomplete="off" readonly />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">UUID</span>
			<Input
				class="h-8 font-mono text-xs"
				value={currentCase?.case_uuid}
				autocomplete="off"
				readonly
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Open date</span
			>
			<Input class="h-8 text-xs" value={currentCase?.open_date} autocomplete="off" readonly />
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
				>Opening user</span
			>
			<Input class="h-8 text-xs" value={currentCase?.user_id} autocomplete="off" readonly />
		</label>
	</div>

	<div class="flex items-center justify-between pt-2">
		<div class="flex gap-2">
			<Button variant="destructive" size="sm" onclick={onDelete}>Delete case</Button>

			{#if currentCase?.state?.state_name === 'Closed'}
				<Button size="sm" onclick={async () => await cases.reopen(currentCase?.case_id)}>
					Reopen case
				</Button>
			{:else}
				<Button variant="secondary" size="sm" onclick={onClose}>Close case</Button>
			{/if}
		</div>

		<div class="flex gap-2">
			<Button variant="ghost" size="sm" onclick={cancel}>Cancel</Button>
			<Button type="submit" size="sm">Save</Button>
		</div>
	</div>
</form>
