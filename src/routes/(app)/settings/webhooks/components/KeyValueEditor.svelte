<!--
  Rows of name / value pairs for headers and query parameters. A row
  marked secret is encrypted server-side and never sent back: when the
  server holds a value the input stays empty with a "stored" hint, and
  leaving it empty keeps that value.
-->
<script lang="ts">
	import { EyeIcon, EyeOffIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { newEntry, type FormEntry } from '../helpers/webhook-form';

	type Props = {
		entries: FormEntry[];
		namePlaceholder?: string;
		valuePlaceholder?: string;
		addLabel?: string;
		/** Read-only rows the server adds itself, shown for context. */
		implicit?: { name: string; value: string }[];
		error?: string[];
		testId?: string;
	};

	let {
		entries = $bindable(),
		namePlaceholder = 'Name',
		valuePlaceholder = 'Value — {{ variables }} allowed',
		addLabel = 'Add',
		implicit = [],
		error = [],
		testId = 'kv'
	}: Props = $props();

	let revealed = $state<Record<number, boolean>>({});
	let showImplicit = $state(false);

	function add() {
		entries = [...entries, newEntry()];
	}

	function remove(key: number) {
		entries = entries.filter((e) => e.key !== key);
	}

	function toggleSecret(entry: FormEntry) {
		entry.secret = !entry.secret;
		// A stored secret turned public has to be typed again.
		if (!entry.secret) entry.stored = false;
	}
</script>

<div class="flex flex-col gap-1.5" data-testid={testId}>
	{#if showImplicit}
		{#each implicit as row (row.name)}
			<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5">
				<div
					class="truncate rounded-md border border-dashed px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
				>
					{row.name}
				</div>
				<div
					class="truncate rounded-md border border-dashed px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
				>
					{row.value}
				</div>
				<span class="w-[68px] text-center text-2xs text-muted-foreground">auto</span>
			</div>
		{/each}
	{/if}

	{#each entries as entry (entry.key)}
		<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1.5">
			<Input
				class="h-8 font-mono text-xs"
				placeholder={namePlaceholder}
				bind:value={entry.name}
				aria-label="Name"
			/>
			<div class="relative">
				<Input
					class={`h-8 font-mono text-xs ${entry.secret ? 'pr-7' : ''}`}
					type={entry.secret && !revealed[entry.key] ? 'password' : 'text'}
					autocomplete="off"
					placeholder={entry.secret
						? entry.stored
							? '•••••• stored — type to replace'
							: 'Secret value'
						: valuePlaceholder}
					bind:value={entry.value}
					aria-label="Value"
				/>
				{#if entry.secret}
					<button
						type="button"
						class="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						aria-label={revealed[entry.key] ? 'Hide value' : 'Show value'}
						onclick={() => (revealed[entry.key] = !revealed[entry.key])}
					>
						{#if revealed[entry.key]}<EyeOffIcon size={12} />{:else}<EyeIcon size={12} />{/if}
					</button>
				{/if}
			</div>
			<div class="flex w-[68px] items-center justify-end gap-0.5">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class={`h-8 w-8 ${entry.secret ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
					title={entry.secret
						? 'Secret: encrypted at rest, masked in logs. Click to make it plain.'
						: 'Mark as secret (encrypted at rest, masked in logs, sent as typed — no {{ variables }})'}
					aria-pressed={entry.secret}
					aria-label="Secret"
					onclick={() => toggleSecret(entry)}
				>
					<KeyRoundIcon size={12} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="h-8 w-8 text-muted-foreground hover:text-destructive"
					aria-label="Remove"
					onclick={() => remove(entry.key)}
				>
					<Trash2Icon size={12} />
				</Button>
			</div>
		</div>
	{/each}

	{#each error as message (message)}
		<p class="text-xs text-destructive">{message}</p>
	{/each}

	<div class="flex items-center gap-3">
		<Button type="button" variant="outline" size="sm" class="h-8 text-xs" onclick={add}>
			<PlusIcon size={12} class="mr-1" />
			{addLabel}
		</Button>
		{#if implicit.length > 0}
			<button
				type="button"
				class="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				aria-expanded={showImplicit}
				onclick={() => (showImplicit = !showImplicit)}
			>
				{showImplicit ? 'Hide' : 'Show'} the {implicit.length} added by IRIS
			</button>
		{/if}
	</div>
</div>
