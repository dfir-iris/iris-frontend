<!--
  Create / edit dialog for a vulnerability finding, scope-agnostic. The
  host renders what is specific to its scope through the `before` (e.g.
  the case assets to record it on) and `after` (e.g. linked evidence)
  snippets, and does the API call in `onSubmit`, resolving `true` to
  close the dialog.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import FindingFormFields from './FindingFormFields.svelte';
	import VulnerabilityPicker from './VulnerabilityPicker.svelte';
	import {
		emptyFindingForm,
		hasErrors,
		validateChoice,
		validateFindingForm,
		type FindingFormState,
		type VulnerabilityChoice
	} from './finding-form';

	let {
		open = $bindable(false),
		mode,
		title,
		description = null,
		initial,
		initialChoice = null,
		ownerName = null,
		submitLabel,
		extraError = null,
		before,
		after,
		onSubmit
	}: {
		open: boolean;
		mode: 'create' | 'edit';
		title: string;
		description?: string | null;
		initial?: FindingFormState;
		initialChoice?: VulnerabilityChoice | null;
		ownerName?: string | null;
		submitLabel?: string;
		/** A host-side validation error (e.g. no asset selected). */
		extraError?: string | null;
		before?: Snippet;
		after?: Snippet<[FindingFormState]>;
		onSubmit: (args: {
			choice: VulnerabilityChoice | null;
			form: FindingFormState;
		}) => Promise<boolean>;
	} = $props();

	let form = $state<FindingFormState>(emptyFindingForm());
	let choice = $state<VulnerabilityChoice | null>(null);
	let attempted = $state(false);
	let saving = $state(false);
	let wasOpen = false;

	// Reset from the inputs each time the dialog opens, not while it is
	// open: a parent re-render must not wipe what the analyst typed.
	$effect(() => {
		if (open && !wasOpen) {
			form = initial ? structuredClone($state.snapshot(initial)) : emptyFindingForm();
			choice = initialChoice ? structuredClone($state.snapshot(initialChoice)) : null;
			attempted = false;
			saving = false;
		}
		wasOpen = open;
	});

	const errors = $derived(validateFindingForm(form));
	const choiceError = $derived(mode === 'create' ? validateChoice(choice) : null);
	const blocked = $derived(hasErrors(errors) || choiceError !== null || extraError !== null);

	const submit = async (event?: Event) => {
		event?.preventDefault();
		attempted = true;
		if (blocked || saving) return;
		saving = true;
		try {
			const ok = await onSubmit({ choice, form: $state.snapshot(form) as FindingFormState });
			if (ok) open = false;
		} finally {
			saving = false;
		}
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="text-xs">{description}</Dialog.Description>
			{/if}
		</Dialog.Header>

		<form class="flex min-h-0 flex-1 flex-col" onsubmit={submit}>
			<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
				{#if mode === 'create'}
					<section class="flex flex-col gap-2">
						<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Vulnerability
						</h3>
						<VulnerabilityPicker
							bind:choice
							disabled={saving}
							error={attempted ? choiceError : null}
						/>
					</section>
				{/if}

				{@render before?.()}

				<section class="flex flex-col gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{mode === 'create' ? 'Initial status' : 'Status'}
					</h3>
					<FindingFormFields
						bind:form
						errors={attempted ? errors : {}}
						disabled={saving}
						{ownerName}
					/>
				</section>

				{@render after?.(form)}
			</div>

			<Dialog.Footer class="shrink-0 items-center gap-2 border-t px-6 py-3">
				{#if attempted && extraError}
					<p class="mr-auto text-xs text-destructive">{extraError}</p>
				{:else if attempted && blocked}
					<p class="mr-auto text-xs text-destructive">Fix the highlighted fields.</p>
				{/if}
				<Button type="button" variant="outline" size="sm" onclick={() => (open = false)}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={saving || (attempted && blocked)}>
					{saving ? 'Saving…' : (submitLabel ?? (mode === 'create' ? 'Add' : 'Save'))}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
