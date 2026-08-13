<!--
  Three-step import: choose file → read the dry-run report → apply.

  The middle step is the point of the whole dialog. Inspect stages the
  upload and reports what it *would* do without writing anything, so an
  operator can see per-row errors before committing. Backing out
  discards the staged file rather than leaving it on the server until
  the TTL sweeps it.

  The customer is chosen here and pinned to the staged upload. A
  `client_name` column in the file is informational only — a file that
  could retarget itself would make the access check at inspect
  meaningless. Access is re-checked at apply, because group membership
  can be revoked between the two calls.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { toast } from '$lib/components/ui/toast';
	import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-svelte';
	import SearchSelect from '$lib/components/common/selects/SearchSelect.svelte';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import type { Customer } from '$lib/services/customers.service';
	import type {
		ImportConflictPolicy,
		ManagedAssetImportReport,
		TransferFormat
	} from '$lib/types/resources/managed-asset';

	type Props = {
		open: boolean;
		customers: Customer[];
		/** Called after a successful apply so the list can refresh. */
		onImported: () => void;
	};

	let { open = $bindable(false), customers, onImported }: Props = $props();

	type Step = 'upload' | 'review' | 'done';

	let step = $state<Step>('upload');
	let file = $state<File | null>(null);
	let clientId = $state<number | null>(null);
	let format = $state<TransferFormat>('csv');
	let onConflict = $state<ImportConflictPolicy>('skip');
	let report = $state<ManagedAssetImportReport | null>(null);
	let result = $state<ManagedAssetImportReport | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	const customerOptions = $derived(
		customers.map((customer) => ({
			value: String(customer.customer_id),
			label: customer.customer_name
		}))
	);

	const reset = () => {
		step = 'upload';
		file = null;
		clientId = customers.length === 1 ? customers[0].customer_id : null;
		format = 'csv';
		onConflict = 'skip';
		report = null;
		result = null;
		error = null;
	};

	$effect(() => {
		if (open) reset();
	});

	const onFileChange = (event: Event) => {
		const picked = (event.target as HTMLInputElement).files?.[0] ?? null;
		file = picked;
		// Guess from the extension; the operator can still override, and the
		// server validates the content either way.
		if (picked?.name.toLowerCase().endsWith('.json')) format = 'json';
		else if (picked?.name.toLowerCase().endsWith('.csv')) format = 'csv';
	};

	const inspect = async () => {
		error = null;
		if (!file) {
			error = 'Choose a file to import.';
			return;
		}
		if (clientId === null) {
			error = 'Choose the customer these assets belong to.';
			return;
		}

		busy = true;
		try {
			const res = await ManagedAssetsService.importInspect(file, clientId, format);
			if (!res.ok) {
				error = res.error.message;
				return;
			}
			report = res.value;
			step = 'review';
		} finally {
			busy = false;
		}
	};

	const apply = async () => {
		if (!report?.staging_token) return;
		error = null;
		busy = true;
		try {
			const res = await ManagedAssetsService.importApply({
				staging_token: report.staging_token,
				on_conflict: onConflict
			});
			if (!res.ok || !res.data || typeof res.data === 'string') {
				error = res.error?.message ?? 'The import could not be applied.';
				return;
			}
			result = res.data;
			step = 'done';
			onImported();
		} finally {
			busy = false;
		}
	};

	/** Throw the staged upload away rather than waiting for the TTL. */
	const discardAndClose = async () => {
		const token = report?.staging_token;
		report = null;
		open = false;
		if (!token) return;
		const res = await ManagedAssetsService.importDiscard(token);
		if (!res.ok) {
			toast({ title: 'The staged file will expire on its own.', variant: 'warning' });
		}
	};

	const counts = $derived(report?.counts ?? { create: 0, update: 0, error: 0 });
	const rows = $derived(report?.rows ?? []);
	const errorRows = $derived(rows.filter((row) => row.action === 'error'));
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		// Closing from the backdrop or Esc while a file is staged should
		// clean up just like the Back button does.
		if (!next && report?.staging_token) void discardAndClose();
	}}
>
	<Dialog.Content class="flex max-h-[90vh] flex-col overflow-y-auto p-0 sm:max-w-2xl">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Import assets</Dialog.Title>
			<Dialog.Description class="text-xs">
				{#if step === 'upload'}
					CSV or JSON. Nothing is written until you confirm the report.
				{:else if step === 'review'}
					Nothing has been written yet. Review what the import would do.
				{:else}
					Import applied.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4 px-6 py-5">
			{#if step === 'upload'}
				<div class="flex flex-col gap-1.5">
					<Label>Customer</Label>
					<SearchSelect
						value={clientId === null ? '' : String(clientId)}
						options={customerOptions}
						placeholder="Select a customer…"
						searchPlaceholder="Search customers…"
						onChange={(value) => {
							const raw = Array.isArray(value) ? (value[0] ?? '') : value;
							clientId = raw === '' ? null : Number(raw);
						}}
					/>
					<p class="text-2xs text-muted-foreground">
						Every row is imported for this customer, whatever the file says.
					</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="import-file">File</Label>
					<input
						id="import-file"
						type="file"
						accept=".csv,.json,text/csv,application/json"
						onchange={onFileChange}
						class="rounded-md border border-input bg-background p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
					/>
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="import-format">Format</Label>
					<select
						id="import-format"
						bind:value={format}
						class="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
					>
						<option value="csv">CSV</option>
						<option value="json">JSON</option>
					</select>
				</div>

				<p class="text-2xs text-muted-foreground">
					Archives are not accepted. Imports only ever write to the asset registry — no case or
					alert data is created.
				</p>
			{:else if step === 'review'}
				<div class="grid grid-cols-3 gap-3 text-center">
					<div class="rounded-md border p-3">
						<div class="text-lg font-medium tabular-nums">{counts.create}</div>
						<div class="text-2xs uppercase tracking-wide text-muted-foreground">to create</div>
					</div>
					<div class="rounded-md border p-3">
						<div class="text-lg font-medium tabular-nums">{counts.update}</div>
						<div class="text-2xs uppercase tracking-wide text-muted-foreground">existing</div>
					</div>
					<div
						class="rounded-md border p-3 {counts.error > 0
							? 'border-destructive/40 bg-destructive/5'
							: ''}"
					>
						<div class="text-lg font-medium tabular-nums">{counts.error}</div>
						<div class="text-2xs uppercase tracking-wide text-muted-foreground">in error</div>
					</div>
				</div>

				<p class="text-xs text-muted-foreground">
					{report?.total_rows ?? 0} row(s) read.
					{#if report?.rows_truncated}
						Only the first {rows.length} are listed below; the counts cover all of them.
					{/if}
				</p>

				{#if errorRows.length > 0}
					<div class="rounded-md border border-destructive/40 bg-destructive/5 p-3">
						<div class="mb-2 flex items-center gap-2 text-xs font-medium text-destructive">
							<AlertTriangleIcon size={14} />
							Rows that will be skipped
						</div>
						<ul class="max-h-48 space-y-1 overflow-y-auto text-2xs">
							{#each errorRows as row (row.row)}
								<li>
									<span class="tabular-nums text-muted-foreground">Line {row.row}</span>
									<span class="mx-1">·</span>
									<span>{row.name ?? '(no name)'}</span>
									<span class="mx-1">—</span>
									<span class="text-destructive">{row.errors.join('; ')}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="flex flex-col gap-1.5">
					<Label for="import-conflict">Assets that already exist</Label>
					<select
						id="import-conflict"
						bind:value={onConflict}
						class="h-9 w-56 rounded-md border border-input bg-background px-2 text-sm"
					>
						<option value="skip">Leave them unchanged</option>
						<option value="update">Update them from the file</option>
					</select>
				</div>
			{:else if result}
				<div class="flex items-center gap-2 text-sm">
					<CheckCircle2Icon size={16} class="text-emerald-600" />
					<span>Import complete.</span>
				</div>
				<div class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 rounded-md border p-3 text-xs">
					<span class="text-muted-foreground">Created</span>
					<span class="tabular-nums">{result.created ?? 0}</span>
					<span class="text-muted-foreground">Updated</span>
					<span class="tabular-nums">{result.updated ?? 0}</span>
					<span class="text-muted-foreground">Skipped</span>
					<span class="tabular-nums">{result.skipped ?? 0}</span>
					<span class="text-muted-foreground">Unchanged</span>
					<span class="tabular-nums">{result.unchanged ?? 0}</span>
					<span class="text-muted-foreground">In error</span>
					<span class="tabular-nums">{result.errors ?? 0}</span>
				</div>
			{/if}

			{#if error}
				<p class="text-xs text-destructive">{error}</p>
			{/if}
		</div>

		<div class="flex justify-end gap-2 border-t px-6 py-4">
			{#if step === 'upload'}
				<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
				<Button onclick={inspect} disabled={busy || !file}>
					{busy ? 'Reading…' : 'Inspect file'}
				</Button>
			{:else if step === 'review'}
				<Button variant="outline" onclick={discardAndClose} disabled={busy}>Discard</Button>
				<Button onclick={apply} disabled={busy || counts.create + counts.update === 0}>
					{busy ? 'Importing…' : `Import ${counts.create + counts.update} asset(s)`}
				</Button>
			{:else}
				<Button onclick={() => (open = false)}>Close</Button>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
