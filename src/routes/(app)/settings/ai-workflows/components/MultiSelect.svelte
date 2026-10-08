<!--
  Searchable multi-select: a trigger button summarising the choice and a
  popover of checkable rows. Rows may carry a description and a badge
  (e.g. a tool's read / write classification).
-->
<script lang="ts" module>
	export type MultiSelectItem = {
		value: string;
		label: string;
		description?: string;
		badge?: string;
		badgeClass?: string;
	};
</script>

<script lang="ts">
	import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		items: MultiSelectItem[];
		values: string[];
		placeholder?: string;
		onChange?: (values: string[]) => void;
		disabled?: boolean;
		testId?: string;
		/** Show the selection as removable chips under the trigger. */
		chips?: boolean;
	};

	let {
		items,
		values = $bindable(),
		placeholder = 'Select…',
		onChange,
		disabled = false,
		testId,
		chips = true
	}: Props = $props();

	let open = $state(false);
	let search = $state('');

	const filtered = $derived(
		items.filter((i) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return (
				i.label.toLowerCase().includes(q) ||
				i.value.toLowerCase().includes(q) ||
				(i.description ?? '').toLowerCase().includes(q)
			);
		})
	);

	const selected = $derived(new Set(values));

	const summary = $derived.by(() => {
		if (values.length === 0) return placeholder;
		if (values.length <= 2) {
			return values.map((v) => items.find((i) => i.value === v)?.label ?? v).join(', ');
		}
		return `${values.length} selected`;
	});

	function set(next: string[]) {
		values = next;
		onChange?.(next);
	}

	function toggle(value: string) {
		set(selected.has(value) ? values.filter((v) => v !== value) : [...values, value]);
	}
</script>

<div class="flex min-w-0 flex-col gap-1.5" data-testid={testId}>
	<Popover.Root bind:open>
		<Popover.Trigger {disabled}>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="outline"
					class="h-8 w-full justify-between gap-2 text-xs font-normal"
					{disabled}
				>
					<span class={`truncate ${values.length === 0 ? 'text-muted-foreground' : ''}`}>
						{summary}
					</span>
					<ChevronsUpDownIcon size={12} class="shrink-0 opacity-60" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="z-[80] w-[min(420px,90vw)] p-0" align="start">
			<div class="border-b p-2">
				<input
					class="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
					placeholder="Search…"
					bind:value={search}
				/>
			</div>
			<div class="max-h-72 overflow-y-auto p-1">
				{#each filtered as item (item.value)}
					<button
						type="button"
						class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
						onclick={() => toggle(item.value)}
					>
						<span
							class={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-sm border ${selected.has(item.value) ? 'border-primary bg-primary text-primary-foreground' : ''}`}
						>
							{#if selected.has(item.value)}<CheckIcon size={10} />{/if}
						</span>
						<span class="min-w-0 flex-1">
							<span class="flex items-center gap-1.5">
								<span class="truncate font-mono">{item.label}</span>
								{#if item.badge}
									<span class={`rounded px-1 text-2xs ${item.badgeClass ?? 'bg-muted'}`}>
										{item.badge}
									</span>
								{/if}
							</span>
							{#if item.description}
								<span class="line-clamp-2 text-2xs text-muted-foreground">{item.description}</span>
							{/if}
						</span>
					</button>
				{:else}
					<p class="px-2 py-3 text-center text-2xs text-muted-foreground">Nothing matches.</p>
				{/each}
			</div>
			{#if values.length > 0}
				<div class="flex justify-end border-t p-1.5">
					<button
						type="button"
						class="text-2xs text-muted-foreground hover:text-foreground"
						onclick={() => set([])}
					>
						Clear selection
					</button>
				</div>
			{/if}
		</Popover.Content>
	</Popover.Root>

	{#if chips && values.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each values as value (value)}
				{@const item = items.find((i) => i.value === value)}
				<span
					class="inline-flex items-center gap-1 rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-2xs"
				>
					{item?.label ?? value}
					{#if item?.badge}
						<span class={`rounded px-1 ${item.badgeClass ?? 'bg-muted'}`}>{item.badge}</span>
					{/if}
					{#if !disabled}
						<button
							type="button"
							class="text-muted-foreground hover:text-destructive"
							aria-label={`Remove ${item?.label ?? value}`}
							onclick={() => toggle(value)}
						>
							<XIcon size={10} />
						</button>
					{/if}
				</span>
			{/each}
		</div>
	{/if}
</div>
