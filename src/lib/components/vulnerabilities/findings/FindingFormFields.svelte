<!--
  The editable fields of a vulnerability finding: statuses (with the
  reason / VEX-justification rules), dates, component and versions,
  owner, notes. Shared by every finding dialog; the scope-specific bits
  (catalogue entry, assets, linked evidence) are rendered by the host.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import {
		Select,
		SelectContent,
		SelectGroup,
		SelectGroupHeading,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import { UsersService, type MentionableUser } from '$lib/services/users.service';
	import {
		FINDING_DISMISSED_STATUSES,
		FINDING_EXPLOITATION_STATUSES,
		FINDING_FIXED_STATUSES,
		FINDING_OPEN_STATUSES,
		NOT_AFFECTED_JUSTIFICATIONS,
		remediationNeedsReason,
		type ExploitationStatus,
		type NotAffectedJustification,
		type RemediationStatus
	} from '$lib/services/vulnerabilities.service';
	import {
		EXPLOITATION_STATUS_LABELS,
		NOT_AFFECTED_JUSTIFICATION_LABELS,
		REMEDIATION_STATUS_LABELS,
		labelOf
	} from '../labels';
	import {
		EXPLOITED_AT_STATUSES,
		type FindingFormErrors,
		type FindingFormState
	} from './finding-form';

	let {
		form = $bindable(),
		errors = {},
		disabled = false,
		ownerName = null,
		idPrefix = 'finding'
	}: {
		form: FindingFormState;
		errors?: FindingFormErrors;
		disabled?: boolean;
		/** Label of the current owner, shown before the user list loads. */
		ownerName?: string | null;
		idPrefix?: string;
	} = $props();

	const STATUS_GROUPS = [
		{ label: 'Open', statuses: FINDING_OPEN_STATUSES },
		{ label: 'Fixed', statuses: FINDING_FIXED_STATUSES },
		{ label: 'Dismissed', statuses: FINDING_DISMISSED_STATUSES }
	];

	let users = $state<MentionableUser[]>([]);

	onMount(async () => {
		const res = await UsersService.listMentionable();
		const inner = (res?.data as { data?: MentionableUser[] } | null)?.data;
		users = Array.isArray(inner) ? inner : [];
	});

	const ownerItems = $derived.by(() => {
		const items = users.map((u) => ({ value: String(u.user_id), label: u.user_name }));
		if (form.owner_id !== null && !items.some((i) => i.value === String(form.owner_id))) {
			items.unshift({ value: String(form.owner_id), label: ownerName ?? `User #${form.owner_id}` });
		}
		return [{ value: '', label: 'No owner' }, ...items];
	});

	const needsReason = $derived(remediationNeedsReason(form.remediation_status));
	const notAffected = $derived(form.remediation_status === 'not-affected');
	const showExploitedAt = $derived(EXPLOITED_AT_STATUSES.includes(form.exploitation_status));
	const showVerification = $derived(
		form.remediation_status === 'verified' || form.remediation_status === 'patched'
	);
	const id = (field: string) => `${idPrefix}-${field}`;
</script>

{#snippet fieldError(message: string | undefined)}
	{#if message}
		<p class="text-2xs text-destructive">{message}</p>
	{/if}
{/snippet}

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
	<div class="flex flex-col gap-1.5">
		<Label for={id('remediation')} class="text-xs">Remediation status</Label>
		<Select
			type="single"
			value={form.remediation_status}
			onValueChange={(v) => (form.remediation_status = v as RemediationStatus)}
			{disabled}
		>
			<SelectTrigger id={id('remediation')} class="h-9">
				{labelOf(REMEDIATION_STATUS_LABELS, form.remediation_status)}
			</SelectTrigger>
			<SelectContent>
				{#each STATUS_GROUPS as group (group.label)}
					<SelectGroup>
						<SelectGroupHeading>{group.label}</SelectGroupHeading>
						{#each group.statuses as status (status)}
							<SelectItem value={status} label={REMEDIATION_STATUS_LABELS[status]} />
						{/each}
					</SelectGroup>
				{/each}
			</SelectContent>
		</Select>
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('exploitation')} class="text-xs">Exploitation status</Label>
		<Select
			type="single"
			value={form.exploitation_status}
			onValueChange={(v) => (form.exploitation_status = v as ExploitationStatus)}
			{disabled}
		>
			<SelectTrigger id={id('exploitation')} class="h-9">
				{labelOf(EXPLOITATION_STATUS_LABELS, form.exploitation_status)}
			</SelectTrigger>
			<SelectContent>
				{#each FINDING_EXPLOITATION_STATUSES as status (status)}
					<SelectItem value={status} label={EXPLOITATION_STATUS_LABELS[status]} />
				{/each}
			</SelectContent>
		</Select>
	</div>

	{#if notAffected}
		<div class="flex flex-col gap-1.5 sm:col-span-2">
			<Label for={id('justification')} class="text-xs">
				Justification (VEX) <span class="text-muted-foreground">— or give a reason below</span>
			</Label>
			<Select
				type="single"
				value={form.not_affected_justification}
				onValueChange={(v) =>
					(form.not_affected_justification = v as NotAffectedJustification | '')}
				{disabled}
			>
				<SelectTrigger
					id={id('justification')}
					class="h-9"
					aria-invalid={errors.not_affected_justification ? 'true' : undefined}
				>
					{form.not_affected_justification
						? NOT_AFFECTED_JUSTIFICATION_LABELS[form.not_affected_justification]
						: 'No justification'}
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="" label="No justification" />
					{#each NOT_AFFECTED_JUSTIFICATIONS as justification (justification)}
						<SelectItem
							value={justification}
							label={NOT_AFFECTED_JUSTIFICATION_LABELS[justification]}
						/>
					{/each}
				</SelectContent>
			</Select>
			{@render fieldError(errors.not_affected_justification)}
		</div>
	{/if}

	<div class="flex flex-col gap-1.5 sm:col-span-2">
		<Label for={id('reason')} class="text-xs">
			Status reason
			{#if needsReason}<span class="text-destructive">*</span>{/if}
		</Label>
		<Textarea
			id={id('reason')}
			rows={2}
			bind:value={form.status_reason}
			placeholder={needsReason
				? 'Why is this accepted / a false positive?'
				: 'Optional context for the status'}
			aria-invalid={errors.status_reason ? 'true' : undefined}
			{disabled}
		/>
		{@render fieldError(errors.status_reason)}
	</div>

	{#if showExploitedAt}
		<div class="flex flex-col gap-1.5">
			<Label for={id('exploited-at')} class="text-xs">Exploited at (UTC)</Label>
			<Input
				id={id('exploited-at')}
				type="datetime-local"
				class="h-9"
				bind:value={form.exploited_at}
				{disabled}
			/>
			{@render fieldError(errors.exploited_at)}
		</div>
	{/if}

	<div class="flex flex-col gap-1.5">
		<Label for={id('due-date')} class="text-xs">Due date</Label>
		<Input id={id('due-date')} type="date" class="h-9" bind:value={form.due_date} {disabled} />
		{@render fieldError(errors.due_date)}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('detected-at')} class="text-xs">Detected at (UTC)</Label>
		<Input
			id={id('detected-at')}
			type="datetime-local"
			class="h-9"
			bind:value={form.detected_at}
			{disabled}
		/>
		{@render fieldError(errors.detected_at)}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('detection-source')} class="text-xs">Detection source</Label>
		<Input
			id={id('detection-source')}
			class="h-9"
			placeholder="Scanner, EDR, analyst…"
			bind:value={form.detection_source}
			{disabled}
		/>
		{@render fieldError(errors.detection_source)}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('owner')} class="text-xs">Owner</Label>
		<SearchableSelect
			id={id('owner')}
			items={ownerItems}
			value={form.owner_id === null ? '' : String(form.owner_id)}
			placeholder="No owner"
			searchPlaceholder="Search users…"
			onValueChange={(v) => (form.owner_id = v ? Number(v) : null)}
			{disabled}
		/>
	</div>

	<div class="flex flex-col gap-1.5 sm:col-span-2">
		<Label for={id('component')} class="text-xs">Component</Label>
		<Input
			id={id('component')}
			class="h-9"
			placeholder="Affected package, service or product"
			bind:value={form.component}
			{disabled}
		/>
		{@render fieldError(errors.component)}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('installed-version')} class="text-xs">Installed version</Label>
		<Input
			id={id('installed-version')}
			class="h-9"
			bind:value={form.installed_version}
			{disabled}
		/>
		{@render fieldError(errors.installed_version)}
	</div>

	<div class="flex flex-col gap-1.5">
		<Label for={id('fixed-version')} class="text-xs">Fixed version</Label>
		<Input id={id('fixed-version')} class="h-9" bind:value={form.fixed_version} {disabled} />
		{@render fieldError(errors.fixed_version)}
	</div>

	{#if showVerification}
		<div class="flex flex-col gap-1.5 sm:col-span-2">
			<Label for={id('verification')} class="text-xs">Verification method</Label>
			<Textarea
				id={id('verification')}
				rows={2}
				placeholder="How the fix was confirmed (rescan, manual check…)"
				bind:value={form.verification_method}
				{disabled}
			/>
			{@render fieldError(errors.verification_method)}
		</div>
	{/if}

	<div class="flex flex-col gap-1.5 sm:col-span-2">
		<Label for={id('notes')} class="text-xs">Notes</Label>
		<Textarea id={id('notes')} rows={3} bind:value={form.notes} {disabled} />
		{@render fieldError(errors.notes)}
	</div>
</div>
