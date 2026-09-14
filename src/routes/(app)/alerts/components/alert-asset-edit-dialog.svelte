<!--
  Edits one of an alert's assets, before any case exists. Same reasoning
  as `alert-ioc-edit-dialog` — see the note there.
-->
<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import type { UpdateAlertAssetBody } from '$lib/services/alerts.service';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import TagInput from '$lib/components/common/tag/TagInput.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import {
		alertAssetChanges,
		alertAssetForm,
		parseEnrichment,
		type AlertAssetForm
	} from '../helpers/alert-observables';

	type Props = {
		open: boolean;
		asset: Asset;
		saving?: boolean;
		onClose: () => void;
		onSave: (changes: UpdateAlertAssetBody) => void;
	};

	let { open = $bindable(), asset, saving = false, onClose, onSave }: Props = $props();

	// See the IOC dialog: the effect below only runs after first render.
	// eslint-disable-next-line svelte/valid-compile
	let form = $state<AlertAssetForm>(alertAssetForm(asset));
	let assetTypes = $state<AssetType[]>([]);
	let optionsLoaded = $state(false);

	$effect(() => {
		const current = asset;

		if (open) form = alertAssetForm(current);
	});

	// Fetched on first open, not on mount — see the IOC dialog.
	$effect(() => {
		if (!open || optionsLoaded) return;

		optionsLoaded = true;

		void (async () => {
			const response = await AssetTypesService.list();

			assetTypes = (response.data as AssetType[]) ?? [];
		})();
	});

	const assetTypeOptions = $derived<SelectOption[]>(
		assetTypes.map((type) => ({ value: String(type.asset_id), label: type.asset_name }))
	);

	const nameIsValid = $derived(form.asset_name.trim().length > 0);
	const enrichment = $derived(parseEnrichment(form.asset_enrichment));
	const canSave = $derived(nameIsValid && enrichment.ok && !saving);

	const save = () => {
		if (!enrichment.ok) return;

		const changes = alertAssetChanges(
			asset,
			{ ...form, asset_name: form.asset_name.trim() },
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
			<Dialog.Title class="text-base font-medium">Edit asset #{asset.asset_id}</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto px-6 py-5">
			<div class="space-y-5">
				<div class="space-y-2">
					<Label for="alert-asset-name" class="block text-sm font-medium">Name</Label>
					<input
						id="alert-asset-name"
						type="text"
						class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
						placeholder="Asset name"
						aria-invalid={!nameIsValid}
						bind:value={form.asset_name}
					/>
					{#if !nameIsValid}
						<p class="text-xs text-destructive">A name is required.</p>
					{/if}
				</div>

				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label class="block text-sm font-medium">Type</Label>

						<SearchSelect
							value={form.asset_type_id != null ? String(form.asset_type_id) : ''}
							options={assetTypeOptions}
							placeholder="Select type"
							searchPlaceholder="Search type..."
							onChange={(value) => (form.asset_type_id = value ? Number(value) : null)}
						/>
					</div>

					<div class="space-y-2">
						<Label for="alert-asset-ip" class="block text-sm font-medium">IP</Label>
						<input
							id="alert-asset-ip"
							type="text"
							class="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
							placeholder="10.0.0.1"
							bind:value={form.asset_ip}
						/>
					</div>

					<div class="space-y-2">
						<Label for="alert-asset-domain" class="block text-sm font-medium">Domain</Label>
						<input
							id="alert-asset-domain"
							type="text"
							class="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-0 placeholder:text-muted-foreground focus:border-ring"
							placeholder="corp.example.com"
							bind:value={form.asset_domain}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="alert-asset-description" class="block text-sm font-medium">Description</Label>
					<Textarea
						id="alert-asset-description"
						class="min-h-28 w-full"
						placeholder="What is this asset, and what did you find out about it?"
						bind:value={form.asset_description}
					/>
				</div>

				<div class="space-y-2">
					<Label for="alert-asset-tags" class="block text-sm font-medium">Tags</Label>

					<TagInput
						bind:tags={form.asset_tags}
						outputFormat="string"
						placeholder="Add tags..."
						maxTags={20}
					/>
				</div>

				<div class="space-y-2">
					<Label for="alert-asset-enrichment" class="block text-sm font-medium">Enrichment</Label>
					<Textarea
						id="alert-asset-enrichment"
						class="min-h-32 w-full font-mono text-xs"
						placeholder={'{\n  "source": "value"\n}'}
						aria-invalid={!enrichment.ok}
						bind:value={form.asset_enrichment}
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
