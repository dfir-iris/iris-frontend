<!--
  "Push to cases" — copy one or more objects into attached cases. Warns
  before submit when the sources and targets span several customers, then
  shows the per-case outcome returned by the server.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Loader2, Send } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import type { ScopeCase } from '$lib/services/war-room-scope.service';
	import ScopeCasePicker from './scope-case-picker.svelte';
	import ScopeCustomerWarning from './scope-customer-warning.svelte';
	import ScopeOutcomes from './scope-outcomes.svelte';
	import { distinctCustomers, type ScopeOutcome } from './helpers';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		cases: ScopeCase[];
		/** Customers of the objects being pushed, for the cross-customer warning. */
		sourceCustomers?: { customer_id: number | null; customer_name: string | null }[];
		initialCaseIds?: number[];
		disabledIds?: number[];
		disabledNote?: string;
		submitLabel?: string;
		/** Most target cases the action accepts (no limit when unset). */
		maxCases?: number;
		onSubmit: (caseIds: number[]) => Promise<ScopeOutcome[] | null>;
		onDone?: () => void;
	};

	let {
		open = $bindable(),
		title,
		description,
		cases,
		sourceCustomers = [],
		initialCaseIds = [],
		disabledIds = [],
		disabledNote,
		submitLabel = 'Push',
		maxCases,
		onSubmit,
		onDone
	}: Props = $props();

	let selected = $state<number[]>([]);
	let submitting = $state(false);
	let outcomes = $state<ScopeOutcome[] | null>(null);

	// Re-seed every time the dialog opens; prop changes while it is open
	// must not clobber the operator's ticks.
	$effect(() => {
		if (open) {
			untrack(() => {
				const disabled = new Set(disabledIds);
				selected = initialCaseIds.filter((id) => !disabled.has(id)).slice(0, maxCases);
				outcomes = null;
				submitting = false;
			});
		}
	});

	const customers = $derived.by(() => {
		const picked = new Set(selected);
		return distinctCustomers([...sourceCustomers, ...cases.filter((c) => picked.has(c.case_id))]);
	});

	const caseNames = $derived(Object.fromEntries(cases.map((c) => [c.case_id, c.case_name])));

	const submit = async () => {
		if (selected.length === 0 || submitting) return;
		submitting = true;
		const res = await onSubmit([...selected]);
		submitting = false;
		if (res) outcomes = res;
	};

	const close = () => {
		const hadResults = outcomes !== null;
		open = false;
		if (hadResults) onDone?.();
	};
</script>

<Dialog
	bind:open
	onOpenChange={(v) => {
		if (!v && outcomes !== null) onDone?.();
	}}
>
	<DialogContent class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
		<DialogHeader class="border-b px-6 py-4">
			<DialogTitle>{title}</DialogTitle>
			{#if description}
				<DialogDescription>{description}</DialogDescription>
			{/if}
		</DialogHeader>

		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
			{#if outcomes}
				<ScopeOutcomes rows={outcomes} {caseNames} />
			{:else}
				<ScopeCasePicker
					{cases}
					{selected}
					onChange={(next) => (selected = next)}
					{disabledIds}
					{disabledNote}
					max={maxCases}
					idPrefix="scope-push-target"
				/>
				<ScopeCustomerWarning {customers} />
				<p class="text-2xs text-muted-foreground">
					Objects already present in a target case are skipped. Cases where you lack write access
					are reported as denied.
				</p>
			{/if}
		</div>

		<DialogFooter class="border-t px-6 py-3">
			{#if outcomes}
				<Button onclick={close}>Done</Button>
			{:else}
				<Button variant="ghost" onclick={() => (open = false)} disabled={submitting}>Cancel</Button>
				<Button onclick={submit} disabled={submitting || selected.length === 0} class="gap-1.5">
					{#if submitting}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<Send class="h-3.5 w-3.5" />
					{/if}
					{submitLabel}
					{selected.length > 1 ? `to ${selected.length} cases` : ''}
				</Button>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
