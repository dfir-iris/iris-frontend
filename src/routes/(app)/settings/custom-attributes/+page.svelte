<!--
  Custom Attributes admin page — Svelte port of the legacy
  /manage/attributes list + edit modal from iris-web.

  Custom Attributes let admins extend the default fields of the eight
  IRIS object types (case, IOC, asset, task, note, evidence, event,
  client) with extra tabs and fields that show up on analyst detail
  pages. Rows are fixture-seeded (one per object type) — the SPA edits
  them but never creates or deletes.

  Layout: two-pane master/detail, matching /settings/customers —
    • LEFT (basis-1/3): the eight rows as a divide-y list. Row
      selection loads the detail into the right pane.
    • RIGHT (basis-2/3): metadata (display name / description) +
      the JSON schema editor (Ace via JsonEditor.svelte) +
      a live client-side preview built from the same renderer
      analyst-side detail pages will use later.

  Saves route through /api/v2/manage/custom-attributes/<id> PUT.
  Three save flavors trigger `update_all_attributes` on the server
  with different back-fill semantics — see the buttons below.

  Access is admin-only (server_administrator). The parent /settings
  layout is admin-gated in the sidebar; the backend enforces the
  Permission on the PUT / validate routes so we rely on 403s from
  api.service to surface permission errors.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AlertTriangleIcon,
		CheckCircle2Icon,
		EyeIcon,
		Loader2Icon,
		RefreshCwIcon,
		SaveIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import JsonEditor from '$lib/components/common/editors/JsonEditor.svelte';
	import CustomAttributeRenderer from '$lib/components/common/CustomAttributes/CustomAttributeRenderer.svelte';
	import {
		CustomAttributesService,
		type CustomAttribute,
		type CustomAttributeSchema
	} from '$lib/services/custom-attributes.service';
	import { invalidateCustomAttributeSchema } from '$lib/stores/custom-attributes.store.svelte';

	// The fixture-seeded object types — helper text mapped to the legacy
	// `attribute_for` value on each row. Used only for a friendly
	// subtitle in the list (the rows themselves come from the API).
	const OBJECT_TYPE_LABEL: Record<string, string> = {
		case: 'Case',
		ioc: 'Indicator of Compromise',
		asset: 'Asset',
		task: 'Task',
		note: 'Note',
		evidence: 'Evidence',
		event: 'Timeline event',
		client: 'Customer',
		// The registry entry behind Manage ▸ Assets, as opposed to
		// `asset`, which is the per-case observation.
		managed_asset: 'Managed asset'
	};

	// ────────────────────────────────────────────────────────────────
	// List state
	// ────────────────────────────────────────────────────────────────

	let items = $state<CustomAttribute[]>([]);
	let listLoading = $state(false);
	let listError = $state<string | null>(null);

	// ────────────────────────────────────────────────────────────────
	// Detail / edit state
	//
	// `selected` is the row as it exists on the server. `draft` is the
	// currently-edited copy — display name, description and the raw
	// JSON string in the Ace editor. `draftSchema` is the last valid
	// parse of `draftJson` (drives the live preview panel).
	// ────────────────────────────────────────────────────────────────

	let selected = $state<CustomAttribute | null>(null);
	let detailLoading = $state(false);

	let draftDisplayName = $state('');
	let draftDescription = $state('');
	let draftJson = $state('');
	let draftSchema = $state<CustomAttributeSchema>({});
	let jsonValid = $state(true);
	let jsonError = $state<string | null>(null);

	// Client-side schema validation via /validate. The backend returns
	// a list of `Tab -> Field ...` strings — safe to surface 1:1. We
	// also debounce it so the admin gets live feedback while typing
	// without hammering the endpoint.
	let validationLogs = $state<string[]>([]);
	let validating = $state(false);
	let validateTimer: ReturnType<typeof setTimeout> | null = null;

	// Save state
	let saving = $state(false);
	// One shared confirmation modal, re-purposed for the two overwrite
	// buttons. Complete overwrite is destructive (wipes existing data),
	// partial overwrite drops removed tabs/fields — both are worth a
	// second click.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const isDirty = $derived.by(() => {
		if (!selected) return false;
		const originalJson = JSON.stringify(selected.attribute_content ?? {}, null, 2);
		return (
			draftDisplayName !== selected.attribute_display_name ||
			draftDescription !== selected.attribute_description ||
			draftJson !== originalJson
		);
	});

	// ────────────────────────────────────────────────────────────────
	// Loaders
	// ────────────────────────────────────────────────────────────────

	const loadList = async () => {
		listLoading = true;
		listError = null;
		const res = await CustomAttributesService.list();
		listLoading = false;
		if (!res.ok || !Array.isArray(res.data)) {
			listError = res.error?.message ?? 'Failed to load custom attributes.';
			return;
		}
		items = res.data;
		// Auto-select the first row on initial load — mirrors the customers
		// admin page ergonomics. Skips if the user already picked one.
		if (!selected && items.length > 0) {
			selectRow(items[0].attribute_id);
		}
	};

	const selectRow = async (attributeId: number) => {
		if (isDirty) {
			// Prevent silent loss of edits when switching rows. The user
			// can either confirm (dropping the draft) or cancel.
			openConfirm({
				title: 'Discard unsaved changes?',
				message: 'You have unsaved edits on this attribute. Switching will discard them.',
				action: () => loadDetail(attributeId)
			});
			return;
		}
		await loadDetail(attributeId);
	};

	const loadDetail = async (attributeId: number) => {
		detailLoading = true;
		const res = await CustomAttributesService.get(attributeId);
		detailLoading = false;
		if (!res.ok || !res.data || typeof res.data === 'string') {
			toast({
				title: 'Failed to load attribute',
				description: res.error?.message ?? 'Please try again.',
				variant: 'destructive'
			});
			return;
		}
		selected = res.data;
		draftDisplayName = selected.attribute_display_name;
		draftDescription = selected.attribute_description;
		draftJson = JSON.stringify(selected.attribute_content ?? {}, null, 2);
		draftSchema = selected.attribute_content ?? {};
		jsonValid = true;
		jsonError = null;
		validationLogs = [];
	};

	// ────────────────────────────────────────────────────────────────
	// JSON editor callback — runs on every keystroke.
	//
	// Local parse gives us `jsonValid` for immediate button-disable +
	// preview refresh. When the JSON is syntactically valid, we also
	// ping /validate (debounced) to surface schema-level errors —
	// missing `mandatory`, unknown `type`, etc. — before the admin
	// commits and triggers the expensive back-fill migration.
	// ────────────────────────────────────────────────────────────────

	const onJsonInput = (next: string, isValid: boolean, error: string | null) => {
		draftJson = next;
		jsonValid = isValid;
		jsonError = error;

		if (isValid && next.trim() !== '') {
			try {
				draftSchema = JSON.parse(next) as CustomAttributeSchema;
			} catch {
				// Guard for the trim === '' edge case above; a truly
				// unparseable payload trips isValid=false already.
				draftSchema = {};
			}
			queueValidate(draftSchema);
		} else {
			draftSchema = {};
			validationLogs = [];
			if (validateTimer) {
				clearTimeout(validateTimer);
				validateTimer = null;
			}
		}
	};

	const queueValidate = (schema: CustomAttributeSchema) => {
		if (validateTimer) clearTimeout(validateTimer);
		validateTimer = setTimeout(async () => {
			validating = true;
			const res = await CustomAttributesService.validate(schema);
			validating = false;
			if (!res.ok || !res.data || typeof res.data === 'string') {
				// Silently drop — the admin still gets full validation
				// on Save when the same helper runs server-side.
				validationLogs = [];
				return;
			}
			validationLogs = res.data.logs ?? [];
		}, 400);
	};

	// ────────────────────────────────────────────────────────────────
	// Save flows.
	//
	// Three flavors:
	//   • save():                additive merge — new tabs/fields are
	//                            added to existing objects; nothing is
	//                            dropped. Safe default.
	//   • partialOverwrite():    resets tabs/fields that WERE in the
	//                            previous schema, then re-applies. Drops
	//                            tabs/fields removed by this edit.
	//   • completeOverwrite():   replaces the JSON on every existing
	//                            row wholesale — wipes analyst-entered
	//                            values in those tabs. Destructive.
	//
	// All three route through PUT with different `partial_overwrite` /
	// `complete_overwrite` flags — the server's `update_all_attributes`
	// dispatches.
	// ────────────────────────────────────────────────────────────────

	const commitSave = async (opts: {
		partial_overwrite?: boolean;
		complete_overwrite?: boolean;
	}) => {
		if (!selected) return;
		if (!jsonValid) {
			toast({
				title: 'Fix the JSON first',
				description: jsonError ?? 'Editor contains invalid JSON.',
				variant: 'destructive'
			});
			return;
		}
		if (validationLogs.length > 0) {
			toast({
				title: 'Schema has errors',
				description: 'Resolve the listed errors before saving.',
				variant: 'destructive'
			});
			return;
		}
		saving = true;
		const res = await CustomAttributesService.update(selected.attribute_id, {
			attribute_content: draftSchema,
			attribute_display_name: draftDisplayName.trim() || undefined,
			attribute_description: draftDescription.trim() || undefined,
			partial_overwrite: opts.partial_overwrite,
			complete_overwrite: opts.complete_overwrite
		});
		saving = false;

		if (!res.ok || !res.data || typeof res.data === 'string') {
			const logs =
				res.data && typeof res.data === 'object' && 'data' in res.data
					? (res.data as { data?: string[] }).data
					: undefined;
			toast({
				title: 'Save failed',
				description: (logs && logs.length ? logs.join('\n') : res.error?.message) ?? 'Please try again.',
				variant: 'destructive'
			});
			return;
		}

		const saved: CustomAttribute = res.data;
		selected = saved;
		draftDisplayName = saved.attribute_display_name;
		draftDescription = saved.attribute_description;
		draftJson = JSON.stringify(saved.attribute_content ?? {}, null, 2);
		draftSchema = saved.attribute_content ?? {};
		validationLogs = [];
		// Keep the list row's name/description in sync so the master
		// pane doesn't lie.
		items = items.map((r) => (r.attribute_id === saved.attribute_id ? { ...saved } : r));
		// Drop the cached schema so any detail view opened after this
		// save re-fetches the fresh one from the backend.
		invalidateCustomAttributeSchema(saved.attribute_for);
		toast({
			title: 'Custom attribute saved',
			description: opts.complete_overwrite
				? 'Schema saved and every existing record was overwritten.'
				: opts.partial_overwrite
					? 'Schema saved and existing records were back-filled (removed fields dropped).'
					: 'Schema saved and existing records were back-filled additively.',
			variant: 'success'
		});
	};

	const save = () => commitSave({});

	const partialOverwrite = () => {
		openConfirm({
			title: 'Partial overwrite?',
			message:
				'Tabs and fields present in the previous schema will be reset on every existing record. Fields removed by this edit will be dropped from those records too. Continue?',
			action: () => commitSave({ partial_overwrite: true })
		});
	};

	const completeOverwrite = () => {
		openConfirm({
			title: 'Complete overwrite?',
			message:
				'This replaces the custom-attribute JSON on every existing record of this object type. Analyst-entered values in the previous schema will be lost. Continue?',
			action: () => commitSave({ complete_overwrite: true })
		});
	};

	// ────────────────────────────────────────────────────────────────

	const openConfirm = (opts: {
		title: string;
		message: string;
		action: () => Promise<void> | void;
	}) => {
		confirmTitle = opts.title;
		confirmMessage = opts.message;
		confirmAction = opts.action;
		confirmOpen = true;
	};

	const runConfirmed = async () => {
		confirmOpen = false;
		await confirmAction();
	};

	const refresh = async () => {
		await loadList();
		if (selected) {
			// Reload the currently-open row too so the editor picks up
			// any out-of-band change (e.g. another admin edited it).
			await loadDetail(selected.attribute_id);
		}
	};

	onMount(loadList);
</script>

<svelte:head>
	<title>Custom Attributes · Settings</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<WaypointsIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Custom Attributes</h1>
				<p class="text-2xs text-muted-foreground">
					Extend the default fields of cases, IOCs, assets, tasks, notes, evidence, timeline
					events and customers.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={refresh}
				disabled={listLoading || detailLoading}
			>
				<RefreshCwIcon
					size={12}
					class={`mr-1 ${listLoading || detailLoading ? 'animate-spin' : ''}`}
				/>
				Refresh
			</Button>
		</div>
	</header>

	<div class="flex flex-1 gap-3 overflow-hidden p-4">
		<!-- Master: list of the eight rows -->
		<section
			class="flex min-h-0 flex-1 basis-1/3 flex-col overflow-hidden rounded-md border"
		>
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Object types
				</h2>
				<span class="text-2xs text-muted-foreground tabular-nums">
					{items.length}
				</span>
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if listLoading && items.length === 0}
					<div class="space-y-1 p-3">
						{#each Array(8) as _}
							<Skeleton class="h-9 w-full" />
						{/each}
					</div>
				{:else if listError}
					<p class="px-3 py-6 text-center text-xs text-destructive">
						{listError}
					</p>
				{:else if items.length === 0}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						No custom attribute schemas found. This is unusual — the eight rows are
						fixture-seeded on install.
					</p>
				{:else}
					<ul class="divide-y">
						{#each items as row (row.attribute_id)}
							{@const active = row.attribute_id === selected?.attribute_id}
							<li>
								<button
									type="button"
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors {active
										? 'bg-primary/10 font-medium text-foreground'
										: 'hover:bg-muted/40'}"
									onclick={() => selectRow(row.attribute_id)}
								>
									<div class="min-w-0 flex-1">
										<div class="truncate">{row.attribute_display_name}</div>
										<div class="truncate text-2xs text-muted-foreground">
											{OBJECT_TYPE_LABEL[row.attribute_for] ?? row.attribute_for}
										</div>
									</div>
									<span class="font-mono text-2xs text-muted-foreground">
										#{row.attribute_id}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</section>

		<!-- Detail: metadata + JSON editor + preview -->
		<section
			class="flex min-h-0 flex-1 basis-2/3 flex-col overflow-hidden rounded-md border"
		>
			<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
				<div class="flex items-baseline gap-2">
					<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Schema editor
					</h2>
					{#if selected}
						<span class="text-2xs text-muted-foreground">
							{selected.attribute_display_name} · {selected.attribute_for}
						</span>
					{/if}
				</div>

				{#if selected}
					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={save}
							disabled={saving || !jsonValid || validationLogs.length > 0 || !isDirty}
						>
							{#if saving}
								<Loader2Icon size={12} class="mr-1 animate-spin" />
							{:else}
								<SaveIcon size={12} class="mr-1" />
							{/if}
							Save
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7"
							onclick={partialOverwrite}
							disabled={saving || !jsonValid || validationLogs.length > 0}
							title="Reset previously-defined tabs/fields on existing records and re-apply."
						>
							Partial overwrite
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="h-7 text-destructive hover:text-destructive"
							onclick={completeOverwrite}
							disabled={saving || !jsonValid || validationLogs.length > 0}
							title="Replace the schema on every existing record — destructive."
						>
							Complete overwrite
						</Button>
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if detailLoading}
					<div class="space-y-3 p-4">
						<Skeleton class="h-8 w-1/2" />
						<Skeleton class="h-24 w-full" />
						<Skeleton class="h-64 w-full" />
					</div>
				{:else if !selected}
					<p class="px-3 py-6 text-center text-xs text-muted-foreground">
						Select an object type on the left to edit its schema.
					</p>
				{:else}
					<div class="flex flex-col gap-4 p-4">
						<!-- Metadata -->
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div class="flex flex-col gap-1">
								<label
									for="ca-display-name"
									class="text-2xs uppercase tracking-wide text-muted-foreground"
								>
									Display name
								</label>
								<Input
									id="ca-display-name"
									class="h-8 text-xs"
									bind:value={draftDisplayName}
									disabled={saving}
								/>
							</div>
							<div class="flex flex-col gap-1">
								<label
									for="ca-description"
									class="text-2xs uppercase tracking-wide text-muted-foreground"
								>
									Description
								</label>
								<Input
									id="ca-description"
									class="h-8 text-xs"
									bind:value={draftDescription}
									disabled={saving}
								/>
							</div>
						</div>

						<!-- Schema JSON -->
						<div class="flex flex-col gap-1.5">
							<div class="flex items-center justify-between">
								<span class="text-2xs uppercase tracking-wide text-muted-foreground">
									Schema JSON
								</span>
								<div class="flex items-center gap-2 text-2xs text-muted-foreground">
									{#if validating}
										<Loader2Icon size={11} class="animate-spin" />
										Validating…
									{:else if !jsonValid}
										<AlertTriangleIcon size={11} class="text-destructive" />
										Invalid JSON
									{:else if validationLogs.length > 0}
										<AlertTriangleIcon size={11} class="text-destructive" />
										{validationLogs.length} schema
										{validationLogs.length === 1 ? 'error' : 'errors'}
									{:else}
										<CheckCircle2Icon size={11} class="text-emerald-600" />
										Valid schema
									{/if}
								</div>
							</div>

							<JsonEditor
								bind:value={draftJson}
								onInput={onJsonInput}
								minLines={16}
								maxLines={40}
							/>

							{#if validationLogs.length > 0}
								<div
									class="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-2"
								>
									<p class="text-2xs font-semibold text-destructive">Schema errors</p>
									<ul class="mt-1 list-disc space-y-0.5 pl-4">
										{#each validationLogs as line}
											<li class="text-2xs text-destructive">{line}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</div>

						<!-- Taxonomy help. Mirrors the "Attributes taxonomy" copy
						     from the legacy left-column help card so admins have
						     the field-type reference next to the editor. -->
						<details class="rounded-md border bg-muted/20 p-3 text-xs">
							<summary class="cursor-pointer font-medium">Field-type reference</summary>
							<div class="mt-2 space-y-1 text-muted-foreground">
								<p>
									<span class="font-mono">input_string</span> — single-line text
									(<span class="font-mono">value: string</span>,
									<span class="font-mono">mandatory: bool</span>).
								</p>
								<p>
									<span class="font-mono">input_textfield</span> — multi-line text (same shape as
									<span class="font-mono">input_string</span>).
								</p>
								<p>
									<span class="font-mono">input_checkbox</span> — boolean
									(<span class="font-mono">value: bool</span>).
								</p>
								<p>
									<span class="font-mono">input_select</span> — dropdown
									(<span class="font-mono">value: string</span>, requires
									<span class="font-mono">options: string[]</span>).
								</p>
								<p>
									<span class="font-mono">input_date</span> /
									<span class="font-mono">input_datetime</span> — date pickers
									(<span class="font-mono">value: string</span>).
								</p>
								<p>
									<span class="font-mono">raw</span> — read-only field label; no input rendered.
								</p>
								<p>
									<span class="font-mono">html</span> — trusted HTML string, sanitised
									server-side.
								</p>
							</div>
						</details>

						<!-- Preview -->
						<div class="flex flex-col overflow-hidden rounded-md border">
							<div
								class="flex items-center gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
							>
								<EyeIcon size={12} />
								Analyst preview
							</div>
							<div class="min-h-[16rem] max-h-[32rem] overflow-auto">
								<CustomAttributeRenderer schema={draftSchema} readonly />
							</div>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Continue"
	onConfirm={runConfirmed}
/>
