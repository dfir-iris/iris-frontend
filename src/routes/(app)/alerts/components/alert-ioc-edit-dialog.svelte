<!--
  Edits one of an alert's IOCs, before any case exists.

  The details an analyst writes here — what the observable is, how
  confidential it is, what it turned out to be, what a module found —
  are what makes the alert triageable, and they follow the IOC into the
  case when the alert is escalated (the same row is handed over).
-->
<script lang="ts">
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { UpdateAlertIocBody } from '$lib/services/alerts.service';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import {
		alertIocChanges,
		alertIocForm,
		parseEnrichment,
		type AlertIocForm
	} from '../helpers/alert-observables';

	type Props = {
		open: boolean;
		ioc: Ioc;
		saving?: boolean;
		onClose: () => void;
		onSave: (changes: UpdateAlertIocBody) => void;
	};

	let { open = $bindable(), ioc, saving = false, onClose, onSave }: Props = $props();

	// Seeded here as well as in the effect below: the effect only runs
	// after the first render, and the dialog is mounted already open.
	// eslint-disable-next-line svelte/valid-compile
	let form = $state<AlertIocForm>(alertIocForm(ioc));
	let iocTypes = $state<IocType[]>([]);
	let tlps = $state<TlpItem[]>([]);
	let optionsLoaded = $state(false);

	// Re-seed whenever a different IOC is opened, and when the same one
	// is re-opened after a save so the dialog shows what was stored.
	$effect(() => {
		const current = ioc;

		if (open) form = alertIocForm(current);
	});

	// The taxonomies are only needed once the dialog is actually opened —
	// the alert list renders a card per alert and each carries this
	// dialog, so fetching on mount would be one round-trip per row.
	$effect(() => {
		if (!open || optionsLoaded) return;

		optionsLoaded = true;

		void (async () => {
			const [iocTypesResponse, tlpResponse] = await Promise.all([
				IocTypesService.list(),
				TlpService.list()
			]);

			iocTypes = (iocTypesResponse.data as IocType[]) ?? [];
			tlps = (tlpResponse.data as TlpItem[]) ?? [];
		})();
	});

	const iocTypeOptions = $derived<SelectOption[]>(
		iocTypes.map((type) => ({ value: String(type.type_id), label: type.type_name }))
	);

	const tlpOptions = $derived<SelectOption[]>(
		tlps.map((tlp) => ({ value: String(tlp.tlp_id), label: tlp.tlp_name }))
	);

	const valueIsValid = $derived(form.ioc_value.trim().length > 0);
	const enrichment = $derived(parseEnrichment(form.ioc_enrichment));
	const canSave = $derived(valueIsValid && enrichment.ok && !saving);

	const save = () => {
		if (!enrichment.ok) return;

		const changes = alertIocChanges(
			ioc,
			{ ...form, ioc_value: form.ioc_value.trim() },
			enrichment.value
		);

		onSave(changes);
	};
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[85vh] max-w-[900px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Edit IOC #{ioc.ioc_id}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<Label for="alert-ioc-value" class="block text-sm font-medium">Value</Label>
					<input
						id="alert-ioc-value"
						type="text"
						class="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						placeholder="IOC value"
						aria-invalid={!valueIsValid}
						bind:value={form.ioc_value}
					/>
					{#if !valueIsValid}
						<p class="text-xs text-destructive">A value is required.</p>
					{/if}
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Type</Label>

						<SearchSelect
							value={form.ioc_type_id != null ? String(form.ioc_type_id) : ''}
							options={iocTypeOptions}
							placeholder="Select type"
							searchPlaceholder="Search type..."
							onChange={(value) => (form.ioc_type_id = value ? Number(value) : null)}
						/>
					</div>

					<div class="space-y-2">
						<Label class="block text-sm font-medium">TLP</Label>

						<SearchSelect
							value={form.ioc_tlp_id != null ? String(form.ioc_tlp_id) : ''}
							options={tlpOptions}
							placeholder="Select TLP"
							searchPlaceholder="Search TLP..."
							onChange={(value) => (form.ioc_tlp_id = value ? Number(value) : null)}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="alert-ioc-description" class="block text-sm font-medium">Description</Label>
					<Textarea
						id="alert-ioc-description"
						class="min-h-28 w-full"
						placeholder="What is this observable, and what did you find out about it?"
						bind:value={form.ioc_description}
					/>
				</div>

				<div class="space-y-2">
					<Label for="alert-ioc-tags" class="block text-sm font-medium">Tags</Label>

					<TagInput
						bind:tags={form.ioc_tags}
						outputFormat="string"
						placeholder="Add tags..."
						maxTags={20}
					/>
				</div>

				<div class="space-y-2">
					<Label for="alert-ioc-enrichment" class="block text-sm font-medium">Enrichment</Label>
					<!--
					  Enrichment is normally written by a module, but it is
					  editable here too: analysts paste the verdict they got
					  out-of-band, and there is no other way to correct a
					  payload a module got wrong.
					-->
					<Textarea
						id="alert-ioc-enrichment"
						class="min-h-32 w-full font-mono text-xs"
						placeholder={'{\n  "source": "value"\n}'}
						aria-invalid={!enrichment.ok}
						bind:value={form.ioc_enrichment}
					/>
					{#if !enrichment.ok}
						<p class="text-xs text-destructive">{enrichment.error}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							A JSON object, or empty to drop the enrichment.
						</p>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button
				variant="outline"
				onclick={() => {
					open = false;

					onClose();
				}}>Cancel</Button
			>
			<Button disabled={!canSave} onclick={save}>{saving ? 'Saving…' : 'Save'}</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
