<!--
  Filter bar for the asset registry.

  The lookup pickers are `SearchSelect`, the same control the case asset
  forms use: a deployment with hundreds of customers is unusable as a
  native `<select>`, and typing to filter is the behaviour operators
  already know from the rest of the app. Every control writes straight
  into the bound page state and calls `onSubmit`, which is what pushes
  the URL and re-runs the query — the URL is the single source of truth
  for a shared view.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import SearchSelect from '$lib/components/common/selects/SearchSelect.svelte';
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { Customer } from '$lib/services/customers.service';
	import type { AssetCriticality, AssetEnvironment } from '$lib/types/resources/managed-asset';

	type Props = {
		search: string;
		clientId: number | null;
		assetTypeId: number | null;
		criticality: AssetCriticality | null;
		environment: AssetEnvironment | null;
		tag: string;
		owner: string;
		isActive: boolean | null;
		hasSightings: boolean | null;
		compromised: boolean | null;
		customers: Customer[];
		assetTypes: AssetType[];
		loading?: boolean;
		hasActiveFilters?: boolean;
		onSubmit: () => void;
		onClear: () => void;
	};

	let {
		search = $bindable(''),
		clientId = $bindable(null),
		assetTypeId = $bindable(null),
		criticality = $bindable(null),
		environment = $bindable(null),
		tag = $bindable(''),
		owner = $bindable(''),
		isActive = $bindable(null),
		hasSightings = $bindable(null),
		compromised = $bindable(null),
		customers,
		assetTypes,
		loading = false,
		hasActiveFilters = false,
		onSubmit,
		onClear
	}: Props = $props();

	const CRITICALITIES: AssetCriticality[] = ['critical', 'high', 'medium', 'low', 'unknown'];
	const ENVIRONMENTS: AssetEnvironment[] = [
		'production',
		'staging',
		'development',
		'test',
		'dr',
		'unknown'
	];

	// Tri-state pills: null = "no opinion", which is what the backend
	// sees when the parameter is simply absent.
	const TRISTATE = [
		{ label: 'Any', value: null },
		{ label: 'Yes', value: true },
		{ label: 'No', value: false }
	];

	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			onSubmit();
		}
	};

	const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

	// `SearchSelect` types its callback for the multi-select case as well;
	// every picker here is single-select, so the value is always a string.
	// `''` is the "Any" row, which maps back to a filter that is simply
	// absent from the query string.
	const single = (value: string | string[]) => {
		const raw = Array.isArray(value) ? (value[0] ?? '') : value;
		return raw === '' ? null : raw;
	};

	const ANY = { value: '', label: 'Any' };

	const customerOptions = $derived([
		ANY,
		...customers.map((customer) => ({
			value: String(customer.customer_id),
			label: customer.customer_name
		}))
	]);
	const assetTypeOptions = $derived([
		ANY,
		...assetTypes.map((type) => ({ value: String(type.asset_id), label: type.asset_name }))
	]);
	const CRITICALITY_OPTIONS = [
		ANY,
		...CRITICALITIES.map((value) => ({ value, label: titleCase(value) }))
	];
	const ENVIRONMENT_OPTIONS = [
		ANY,
		...ENVIRONMENTS.map((value) => ({ value, label: titleCase(value) }))
	];
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
		<Input
			bind:value={search}
			onkeydown={onKey}
			placeholder="Search by name, IP, domain or description…"
			class="flex-1"
			aria-label="Search assets"
		/>
		<Button onclick={onSubmit} disabled={loading}>
			{loading ? 'Searching…' : 'Search'}
		</Button>
	</div>

	<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Customer</span>
			<div class="w-44">
				<SearchSelect
					value={clientId === null ? '' : String(clientId)}
					options={customerOptions}
					placeholder="Any"
					searchPlaceholder="Search customers…"
					size="sm"
					onChange={(value) => {
						const raw = single(value);
						clientId = raw === null ? null : Number(raw);
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Type</span>
			<div class="w-44">
				<SearchSelect
					value={assetTypeId === null ? '' : String(assetTypeId)}
					options={assetTypeOptions}
					placeholder="Any"
					searchPlaceholder="Search asset types…"
					size="sm"
					onChange={(value) => {
						const raw = single(value);
						assetTypeId = raw === null ? null : Number(raw);
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Criticality</span>
			<div class="w-32">
				<SearchSelect
					value={criticality ?? ''}
					options={CRITICALITY_OPTIONS}
					placeholder="Any"
					searchPlaceholder="Search criticalities…"
					size="sm"
					onChange={(value) => {
						criticality = single(value) as AssetCriticality | null;
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Environment</span>
			<div class="w-36">
				<SearchSelect
					value={environment ?? ''}
					options={ENVIRONMENT_OPTIONS}
					placeholder="Any"
					searchPlaceholder="Search environments…"
					size="sm"
					onChange={(value) => {
						environment = single(value) as AssetEnvironment | null;
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<label class="text-muted-foreground" for="assets-owner">Owner</label>
			<input
				id="assets-owner"
				bind:value={owner}
				onkeydown={onKey}
				onblur={onSubmit}
				placeholder="Any"
				class="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
			/>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<label class="text-muted-foreground" for="assets-tag">Tag</label>
			<input
				id="assets-tag"
				bind:value={tag}
				onkeydown={onKey}
				onblur={onSubmit}
				placeholder="Any"
				class="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
			/>
		</div>

		{#each [{ label: 'Active', get: () => isActive, set: (v: boolean | null) => (isActive = v) }, { label: 'Seen', get: () => hasSightings, set: (v: boolean | null) => (hasSightings = v) }, { label: 'Compromised', get: () => compromised, set: (v: boolean | null) => (compromised = v) }] as group (group.label)}
			<div class="flex items-center gap-1.5 text-xs">
				<span class="text-muted-foreground">{group.label}:</span>
				{#each TRISTATE as choice (String(choice.value))}
					{@const active = group.get() === choice.value}
					<button
						type="button"
						aria-pressed={active}
						onclick={() => {
							group.set(choice.value);
							onSubmit();
						}}
						class="rounded-md border px-2 py-1 transition-colors {active
							? 'border-primary/40 bg-primary/10 text-foreground'
							: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
					>
						{choice.label}
					</button>
				{/each}
			</div>
		{/each}

		{#if hasActiveFilters}
			<button
				type="button"
				class="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={onClear}
			>
				Clear all filters
			</button>
		{/if}
	</div>
</div>
