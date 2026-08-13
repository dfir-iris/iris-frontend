<!--
  One entry of the change log.

  Shared by the per-asset tab and the registry-wide dialog so the two
  never drift into rendering the same record differently. `showAsset`
  is on for the registry-wide view, where the entry has to say which
  asset it is about — including assets that no longer exist, which is
  what `asset_name_snapshot` is for.
-->
<script lang="ts">
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import type {
		ManagedAssetAuditAction,
		ManagedAssetAuditEntry
	} from '$lib/types/resources/managed-asset';

	type Props = { entry: ManagedAssetAuditEntry; showAsset?: boolean };
	let { entry, showAsset = false }: Props = $props();

	const ACTION_STYLE: Record<ManagedAssetAuditAction, string> = {
		create: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
		update: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
		delete: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
		import: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300'
	};

	const formatDate = (iso: string | null | undefined) => {
		if (!iso) return '—';
		const parsed = new Date(iso);
		return Number.isNaN(parsed.getTime()) ? iso : mediumDateTimeFormatter(parsed);
	};

	const actionStyle = (action: string) =>
		ACTION_STYLE[action as ManagedAssetAuditAction] ??
		'border-border bg-muted text-muted-foreground';

	/** `{"criticality": {"from": "low", "to": "critical"}}` → rows. */
	const changes = $derived(
		Object.entries(entry.changes ?? {}).map(([field, change]) => ({
			field,
			from: change?.from,
			to: change?.to
		}))
	);

	const display = (value: unknown) => {
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	};
</script>

<li class="rounded-md border p-3">
	<div class="flex items-start justify-between gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="inline-flex items-center rounded-md border px-2 py-0.5 text-2xs font-medium uppercase tracking-wide {actionStyle(
					entry.action
				)}"
			>
				{entry.action}
			</span>
			{#if showAsset}
				<span class="text-xs font-medium">{entry.asset_name_snapshot}</span>
			{/if}
			<span class="text-xs">{entry.user_login ?? 'unknown user'}</span>
			<span class="text-2xs uppercase tracking-wide text-muted-foreground">
				via {entry.source}
			</span>
		</div>
		<span class="shrink-0 text-2xs tabular-nums text-muted-foreground">
			{formatDate(entry.occurred_at)}
		</span>
	</div>

	{#if changes.length > 0}
		<div class="mt-2 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-2xs">
			{#each changes as change (change.field)}
				<span class="text-muted-foreground">{change.field}</span>
				<span class="break-all">
					<span class="text-muted-foreground line-through">{display(change.from)}</span>
					<span class="mx-1 text-muted-foreground">→</span>
					<span>{display(change.to)}</span>
				</span>
			{/each}
		</div>
	{:else if entry.action === 'update'}
		<p class="mt-1 text-2xs text-muted-foreground">No field-level changes recorded.</p>
	{/if}

	{#if entry.managed_asset_id === null}
		<p class="mt-1 text-2xs text-muted-foreground">
			Recorded against “{entry.asset_name_snapshot}”, which no longer exists.
		</p>
	{/if}
</li>
