<!--
  Rows of `{name, value}` (http_request headers / query params,
  set_variables). Values are templates. With `secrets`, each row also
  carries a `secret` flag: secret values are rendered with keystore
  access (`key('NAME')`) and masked in the run logs.
-->
<script lang="ts">
	import { LockIcon, LockOpenIcon, PlusIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	type Pair = { name: string; value: string; secret?: boolean };

	type Props = {
		rows: unknown;
		onChange: (rows: Pair[]) => void;
		namePlaceholder?: string;
		valuePlaceholder?: string;
		addLabel?: string;
		readOnly?: boolean;
		testId?: string;
		/** Offer the per-row secret toggle (headers / query params). */
		secrets?: boolean;
	};

	let {
		rows,
		onChange,
		namePlaceholder = 'Name',
		valuePlaceholder = "Value: {{ … }} or {{ key('NAME') }}",
		addLabel = 'Add',
		readOnly = false,
		testId = 'wf-pairs',
		secrets = false
	}: Props = $props();

	const list = $derived(
		(Array.isArray(rows) ? (rows as Partial<Pair>[]) : []).map((r) => {
			const pair: Pair = {
				name: String(r?.name ?? ''),
				value: r?.value === undefined || r?.value === null ? '' : String(r.value)
			};
			if (secrets) pair.secret = r?.secret === true;
			return pair;
		})
	);

	const usesKey = (value: string): boolean => /key\s*\(/.test(value);

	function update(index: number, patch: Partial<Pair>) {
		onChange(list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
	}

	function blank(): Pair {
		return secrets ? { name: '', value: '', secret: false } : { name: '', value: '' };
	}
</script>

<div class="flex flex-col gap-1.5" data-testid={testId}>
	{#each list as row, index (index)}
		<div
			class={`grid items-center gap-1.5 ${secrets ? 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto]' : 'grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]'}`}
		>
			<Input
				class="h-7 font-mono text-xs"
				placeholder={namePlaceholder}
				value={row.name}
				disabled={readOnly}
				oninput={(e) => update(index, { name: (e.currentTarget as HTMLInputElement).value })}
			/>
			<Input
				class="h-7 font-mono text-xs"
				placeholder={valuePlaceholder}
				value={row.value}
				disabled={readOnly}
				oninput={(e) => update(index, { value: (e.currentTarget as HTMLInputElement).value })}
			/>
			{#if secrets}
				<button
					type="button"
					class={`disabled:opacity-40 ${row.secret ? 'text-amber-600' : 'text-muted-foreground hover:text-foreground'}`}
					title={row.secret
						? 'Secret: rendered with keystore access and masked in the logs'
						: 'Mark as secret (needed for key(…))'}
					aria-label={row.secret ? 'Unmark secret' : 'Mark secret'}
					aria-pressed={row.secret}
					disabled={readOnly}
					onclick={() => update(index, { secret: !row.secret })}
				>
					{#if row.secret}<LockIcon size={13} />{:else}<LockOpenIcon size={13} />{/if}
				</button>
			{/if}
			<button
				type="button"
				class="text-muted-foreground hover:text-destructive disabled:opacity-40"
				aria-label="Remove row"
				disabled={readOnly}
				onclick={() => onChange(list.filter((_, i) => i !== index))}
			>
				<Trash2Icon size={13} />
			</button>
		</div>
		{#if secrets && !row.secret && usesKey(row.value)}
			<p class="-mt-1 text-2xs text-amber-600">
				Uses key(…): mark the row secret so the value is resolved and masked in the logs.
			</p>
		{/if}
	{/each}
	{#if !readOnly}
		<Button
			type="button"
			variant="ghost"
			size="sm"
			class="h-7 w-fit gap-1 px-2 text-xs"
			onclick={() => onChange([...list, blank()])}
		>
			<PlusIcon size={12} />
			{addLabel}
		</Button>
	{/if}
</div>
