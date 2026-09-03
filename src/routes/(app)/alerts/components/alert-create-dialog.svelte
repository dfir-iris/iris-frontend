<!--
	Manual alert creation.

	Alerts normally arrive from a feed, but not every signal does: a call
	to the SOC hotline, an out-of-band report from a colleague, a walk-up.
	Those used to be reachable only through the API, which is not a
	realistic ask for someone whose job is done in the browser.

	The form deliberately mirrors the fields the edit dialog exposes, so
	an alert raised by hand is the same object as an ingested one — no
	second-class "manual alert" shape to reason about later.
-->
<script lang="ts">
	import type { CreateAlertBody } from '$lib/services/alerts.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
	import type { CaseClassification } from '$lib/services/case-classifications.service';
	import type { Customer } from '$lib/services/customers.service';
	import type { Severity } from '$lib/services/severities.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import { alertEventTimeForApi } from '../helpers/alert-event-time';

	type Props = {
		open: boolean;
		onClose: () => void;
		onCreate: (body: CreateAlertBody) => void | Promise<void>;
		saving?: boolean;
		alertStatuses: AlertStatus[];
		caseClassifications: CaseClassification[];
		severities: Severity[];
		customers: Customer[];
	};

	let {
		open = $bindable(),
		onClose,
		onCreate,
		saving = false,
		alertStatuses,
		caseClassifications,
		severities,
		customers
	}: Props = $props();

	let title = $state('');
	let description = $state('');
	let customerId = $state('');
	let severityId = $state('');
	let statusId = $state('');
	let classificationId = $state('');
	let source = $state('');
	let sourceRef = $state('');
	let sourceLink = $state('');
	let eventTimeLocal = $state('');
	let note = $state('');
	let tags = $state('');

	const customerOptions = $derived.by<SelectOption[]>(() =>
		customers.map((customer) => ({
			value: String(customer.customer_id),
			label: customer.customer_name
		}))
	);

	const severityOptions = $derived.by<SelectOption[]>(() =>
		severities.map((severity) => ({
			value: String(severity.severity_id),
			label: severity.severity_name
		}))
	);

	const statusOptions = $derived.by<SelectOption[]>(() =>
		alertStatuses.map((status) => ({
			value: String(status.status_id),
			label: status.status_name
		}))
	);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		caseClassifications.map((classification) => ({
			value: String(classification.id),
			label: classification.name_expanded
		}))
	);

	// Title, customer and severity are what the API refuses to create an
	// alert without, so the Create button stays disabled until all three
	// are answered rather than round-tripping to collect a 400.
	const canSubmit = $derived(
		title.trim().length > 0 && customerId !== '' && severityId !== '' && !saving
	);

	const reset = () => {
		title = '';
		description = '';
		customerId = '';
		severityId = '';
		statusId = '';
		classificationId = '';
		source = '';
		sourceRef = '';
		sourceLink = '';
		eventTimeLocal = '';
		note = '';
		tags = '';
	};

	// Seeded once per opening rather than on mount: the dialog is kept
	// mounted by the page, so a fresh set of defaults has to be applied
	// each time it is reopened.
	$effect(() => {
		if (!open) return;

		if (customerId === '' && customers.length === 1) {
			customerId = String(customers[0].customer_id);
		}
	});

	const close = () => {
		open = false;
		reset();
		onClose();
	};

	const submit = async () => {
		if (!canSubmit) return;

		// Classification is typed as required but the column is nullable,
		// and "not classified yet" is the honest answer for something
		// phoned in before anyone has looked at it. Omitted entirely
		// rather than sent as a placeholder id.
		const body = {
			alert_title: title.trim(),
			alert_severity_id: Number(severityId),
			alert_customer_id: Number(customerId),
			...(classificationId !== '' && { alert_classification_id: Number(classificationId) })
		} as CreateAlertBody;

		if (statusId !== '') body.alert_status_id = Number(statusId);
		if (description.trim() !== '') body.alert_description = description.trim();
		if (source.trim() !== '') body.alert_source = source.trim();
		if (sourceRef.trim() !== '') body.alert_source_ref = sourceRef.trim();
		if (sourceLink.trim() !== '') body.alert_source_link = sourceLink.trim();
		if (note.trim() !== '') body.alert_note = note.trim();
		if (tags.trim() !== '') body.alert_tags = tags.trim();

		const eventTime = alertEventTimeForApi(eventTimeLocal);
		if (eventTime) body.alert_source_event_time = eventTime;

		await onCreate(body);
	};
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			reset();
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[85vh] max-w-[980px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">New alert</Dialog.Title>
			<Dialog.Description class="text-sm text-muted-foreground">
				Raise an alert by hand — a hotline call, an out-of-band report, anything that did not come
				in through a feed.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<Label for="new-alert-title" class="block text-sm font-medium">Title *</Label>
					<input
						id="new-alert-title"
						type="text"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						placeholder="What happened?"
						bind:value={title}
					/>
				</div>

				<div class="space-y-2">
					<Label for="new-alert-description" class="block text-sm font-medium">Description</Label>
					<textarea
						id="new-alert-description"
						class="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						placeholder="Who reported it, what they saw, anything already checked."
						bind:value={description}
					></textarea>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Customer *</Label>
						<SearchSelect
							value={customerId}
							options={customerOptions}
							placeholder="Customer"
							searchPlaceholder="Search customer..."
							onChange={(value) => (customerId = value as string)}
						/>
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">Severity *</Label>
						<SearchSelect
							value={severityId}
							options={severityOptions}
							placeholder="Severity"
							searchPlaceholder="Search severity..."
							onChange={(value) => (severityId = value as string)}
						/>
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">Status</Label>
						<SearchSelect
							value={statusId}
							options={statusOptions}
							placeholder="Status"
							searchPlaceholder="Search status..."
							onChange={(value) => (statusId = value as string)}
						/>
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">Classification</Label>
						<SearchSelect
							value={classificationId}
							options={classificationOptions}
							placeholder="Classification"
							searchPlaceholder="Search classification..."
							onChange={(value) => (classificationId = value as string)}
						/>
					</div>

					<div class="space-y-2">
						<Label for="new-alert-source" class="block text-sm font-medium">Source</Label>
						<input
							id="new-alert-source"
							type="text"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
							placeholder="e.g. SOC hotline"
							bind:value={source}
						/>
					</div>

					<div class="space-y-2">
						<Label for="new-alert-event-time" class="block text-sm font-medium">Event time</Label>
						<input
							id="new-alert-event-time"
							type="datetime-local"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-ring"
							bind:value={eventTimeLocal}
						/>
						<p class="text-xs text-muted-foreground">
							When it happened. Defaults to now if left empty.
						</p>
					</div>

					<div class="space-y-2">
						<Label for="new-alert-source-ref" class="block text-sm font-medium">
							Source reference
						</Label>
						<input
							id="new-alert-source-ref"
							type="text"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
							placeholder="Ticket or call reference"
							bind:value={sourceRef}
						/>
					</div>

					<div class="space-y-2">
						<Label for="new-alert-source-link" class="block text-sm font-medium">Source link</Label>
						<input
							id="new-alert-source-link"
							type="url"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
							placeholder="https://…"
							bind:value={sourceLink}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label class="block text-sm font-medium">Tags</Label>
					<TagInput bind:tags outputFormat="string" placeholder="Add tags..." maxTags={20} />
				</div>

				<div class="space-y-2">
					<Label for="new-alert-note" class="block text-sm font-medium">Note</Label>
					<textarea
						id="new-alert-note"
						class="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						bind:value={note}
					></textarea>
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" onclick={close}>Cancel</Button>
			<Button disabled={!canSubmit} onclick={submit}>
				{saving ? 'Creating…' : 'Create alert'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
