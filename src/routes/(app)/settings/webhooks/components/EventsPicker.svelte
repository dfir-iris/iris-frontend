<!--
  What fires the webhook. Two independent parts:
  - automatic events: "every event", or a searchable list grouped by
    object with per-group select-all;
  - manual triggers: an entry in the menu of the chosen objects, sent
    on demand. Never covered by "every event" — each is opted into.
-->
<script lang="ts">
	import { MousePointerClickIcon, SearchIcon } from 'lucide-svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import type { WebhookEvent } from '$lib/services/webhooks.service';
	import { groupEvents, isManualEvent } from '../helpers/webhook-form';
	import FormSection from './FormSection.svelte';

	type Props = {
		catalogue: WebhookEvent[];
		allEvents: boolean;
		selected: string[];
		manualLabel: string;
		/** Shown when the menu label is left empty: the webhook name. */
		labelFallback: string;
		error?: string[];
		labelError?: string[];
	};

	let {
		catalogue,
		allEvents = $bindable(),
		selected = $bindable(),
		manualLabel = $bindable(),
		labelFallback,
		error = [],
		labelError = []
	}: Props = $props();

	let query = $state('');
	const automatic = $derived(catalogue.filter((e) => !e.manual));
	const manual = $derived(catalogue.filter((e) => e.manual));
	const groups = $derived(groupEvents(automatic, query));
	const selectedSet = $derived(new Set(selected));
	const automaticCount = $derived(selected.filter((n) => !isManualEvent(n)).length);
	const manualCount = $derived(selected.filter(isManualEvent).length);

	function toggle(name: string, on: boolean) {
		selected = on ? [...selected, name] : selected.filter((n) => n !== name);
	}

	function groupState(names: string[]): 'all' | 'some' | 'none' {
		const count = names.filter((n) => selectedSet.has(n)).length;
		if (count === 0) return 'none';
		return count === names.length ? 'all' : 'some';
	}

	function toggleGroup(names: string[]) {
		if (groupState(names) === 'all') {
			selected = selected.filter((n) => !names.includes(n));
		} else {
			selected = [...new Set([...selected, ...names])];
		}
	}
</script>

<FormSection
	title="Automatic events"
	description="Sent in the background when something changes in IRIS."
	testId="webhook-automatic-events"
>
	{#snippet actions()}
		<label class="flex cursor-pointer items-center gap-2 text-xs font-medium">
			<Switch checked={allEvents} onCheckedChange={(v: boolean) => (allEvents = v)} />
			All events
		</label>
	{/snippet}

	{#each error as message (message)}
		<p class="text-xs text-destructive">{message}</p>
	{/each}

	{#if allEvents}
		<p class="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
			Every event IRIS emits, including the ones future versions add. Narrow it down with a
			condition if needed.
		</p>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="relative w-72 max-w-full">
				<SearchIcon
					size={12}
					class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
				/>
				<Input class="h-8 pl-7 text-xs" placeholder="Filter events" bind:value={query} />
			</div>
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				<span data-testid="events-selected-count">{automaticCount} selected</span>
				{#if automaticCount > 0}
					<button
						type="button"
						class="underline-offset-2 hover:text-foreground hover:underline"
						onclick={() => (selected = selected.filter(isManualEvent))}
					>
						Clear
					</button>
				{/if}
			</div>
		</div>

		{#if groups.length === 0}
			<p class="py-4 text-center text-xs text-muted-foreground">No event matches "{query}".</p>
		{:else}
			<div class="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
				{#each groups as group (group.objectType)}
					{@const names = group.events.map((e) => e.name)}
					{@const state = groupState(names)}
					<div class="flex flex-col gap-0.5">
						<label class="flex cursor-pointer items-center gap-2 px-2 py-1">
							<Checkbox
								checked={state === 'all'}
								indeterminate={state === 'some'}
								onCheckedChange={() => toggleGroup(names)}
								aria-label={`All ${group.label} events`}
							/>
							<span class="text-xs font-semibold">{group.label}</span>
						</label>
						<ul class="ml-[15px] flex flex-col border-l pl-2">
							{#each group.events as event (event.name)}
								<li>
									<label
										class="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-muted/50"
										title={event.name}
									>
										<Checkbox
											class="mt-0.5"
											checked={selectedSet.has(event.name)}
											onCheckedChange={(v) => toggle(event.name, v === true)}
										/>
										<span class="flex min-w-0 flex-col">
											<span class="text-xs">{event.label}</span>
											{#if event.description}
												<span class="truncate text-2xs text-muted-foreground">
													{event.description}
												</span>
											{/if}
										</span>
									</label>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</FormSection>

{#if manual.length > 0}
	<FormSection
		title="Manual triggers"
		description="Adds an entry to the menu of the chosen objects. Picking it sends that object to this webhook right away; the condition still applies."
		testId="webhook-manual-triggers"
	>
		{#snippet actions()}
			<span class="text-xs text-muted-foreground">{manualCount} selected</span>
		{/snippet}

		<div class="flex flex-wrap gap-2">
			{#each manual as event (event.name)}
				{@const on = selectedSet.has(event.name)}
				<label
					class={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
						on ? 'border-primary/60 bg-primary/5' : 'hover:bg-muted/50'
					}`}
					title={event.name}
				>
					<Checkbox checked={on} onCheckedChange={(v) => toggle(event.name, v === true)} />
					{event.object_label}
				</label>
			{/each}
		</div>

		{#if manualCount > 0}
			<div class="flex max-w-md flex-col gap-1">
				<label class="text-xs font-medium" for="webhook-manual-label">Menu entry</label>
				<div class="relative">
					<MousePointerClickIcon
						size={12}
						class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id="webhook-manual-label"
						class="h-8 pl-7 text-xs"
						maxlength={255}
						placeholder={labelFallback || 'The webhook name'}
						bind:value={manualLabel}
					/>
				</div>
				{#each labelError as message (message)}
					<p class="text-xs text-destructive">{message}</p>
				{/each}
				<p class="text-2xs text-muted-foreground">
					The text of the menu entry. Left empty, the webhook name is shown.
				</p>
			</div>
		{/if}
	</FormSection>
{/if}
