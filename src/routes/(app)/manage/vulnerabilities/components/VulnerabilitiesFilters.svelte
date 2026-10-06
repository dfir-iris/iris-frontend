<!--
  Filter bar for the vulnerability catalogue. Same contract as the asset
  registry's: every control writes into the bound page state and calls
  `onSubmit`, which pushes the URL and re-runs the query.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import SearchSelect from '$lib/components/common/selects/SearchSelect.svelte';
	import {
		VULNERABILITY_KINDS,
		VULNERABILITY_SEVERITIES,
		type VulnerabilityKind,
		type VulnerabilitySeverity
	} from '$lib/services/vulnerabilities.service';
	import { KIND_LABELS, SEVERITY_LABELS } from '$lib/components/vulnerabilities/labels';

	type Props = {
		search: string;
		severity: VulnerabilitySeverity[];
		kind: VulnerabilityKind[];
		kev: boolean | null;
		isPrivate: boolean | null;
		affected: boolean;
		loading?: boolean;
		hasActiveFilters?: boolean;
		onSubmit: () => void;
		onClear: () => void;
	};

	let {
		search = $bindable(''),
		severity = $bindable([]),
		kind = $bindable([]),
		kev = $bindable(null),
		isPrivate = $bindable(null),
		affected = $bindable(false),
		loading = false,
		hasActiveFilters = false,
		onSubmit,
		onClear
	}: Props = $props();

	const TRISTATE = [
		{ label: 'Any', value: null },
		{ label: 'Yes', value: true },
		{ label: 'No', value: false }
	];

	const SEVERITY_OPTIONS = VULNERABILITY_SEVERITIES.map((value) => ({
		value,
		label: SEVERITY_LABELS[value]
	}));
	const KIND_OPTIONS = VULNERABILITY_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }));

	const many = (value: string | string[]) => (Array.isArray(value) ? value : value ? [value] : []);

	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault();
			onSubmit();
		}
	};
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2 lg:flex-row lg:items-stretch">
		<Input
			bind:value={search}
			onkeydown={onKey}
			placeholder="Search by identifier, alias, title or tag…"
			class="flex-1"
			aria-label="Search vulnerabilities"
		/>
		<Button onclick={onSubmit} disabled={loading}>
			{loading ? 'Searching…' : 'Search'}
		</Button>
	</div>

	<div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Severity</span>
			<div class="w-40">
				<SearchSelect
					value={severity}
					options={SEVERITY_OPTIONS}
					multiple
					placeholder="Any"
					searchPlaceholder="Search severities…"
					size="sm"
					onChange={(value) => {
						severity = many(value) as VulnerabilitySeverity[];
						onSubmit();
					}}
				/>
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			<span class="text-muted-foreground">Kind</span>
			<div class="w-44">
				<SearchSelect
					value={kind}
					options={KIND_OPTIONS}
					multiple
					placeholder="Any"
					searchPlaceholder="Search kinds…"
					size="sm"
					onChange={(value) => {
						kind = many(value) as VulnerabilityKind[];
						onSubmit();
					}}
				/>
			</div>
		</div>

		{#each [{ label: 'KEV', get: () => kev, set: (v: boolean | null) => (kev = v) }, { label: 'Private', get: () => isPrivate, set: (v: boolean | null) => (isPrivate = v) }] as group (group.label)}
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

		<button
			type="button"
			aria-pressed={affected}
			title="Only entries with an open finding in a case you can access"
			onclick={() => {
				affected = !affected;
				onSubmit();
			}}
			class="rounded-md border px-2 py-1 text-xs transition-colors {affected
				? 'border-primary/40 bg-primary/10 text-foreground'
				: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
		>
			Affected only
		</button>

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
