<!--
  Three-step case import.

    1. upload   — hand the archive to `/import/inspect`. Nothing is written;
                  we get back a staging token and a report of what the bundle
                  holds. An encrypted archive comes back as a specific error,
                  which flips the passphrase field on and lets us retry.
    2. resolve  — every user in the bundle that this instance doesn't already
                  know has to be dealt with, and any reference data that will
                  be created is shown before it is.
    3. confirm  — customer, optional group grants, then apply.

  The staging token is a capability: it is what turns the inspection into a
  case. Backing out of the wizard discards it rather than leaving a decrypted
  copy of someone's case on the server until the TTL sweeps it.
-->
<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		AlertTriangleIcon,
		ArrowLeftIcon,
		CheckCircle2Icon,
		CheckIcon,
		FileArchiveIcon,
		InfoIcon,
		LockIcon,
		RefreshCwIcon,
		UploadIcon,
		UserRoundIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select } from '$lib/components/ui/select';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import CustomerPicker from '$lib/components/common/selects/CustomerPicker.svelte';
	import { toast } from '$lib/stores/toast.store';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { CaseTransferService } from '$lib/services/case-transfer.service';
	import { UsersService, type MentionableUser } from '$lib/services/users.service';
	import { GroupsService, type Group } from '$lib/services/groups.service';
	import { CaseStatesService } from '$lib/services/case-states.service';
	import { AnalysisStatusService } from '$lib/services/analysis-status.service';
	import type {
		BundleInspection,
		BundleLookupEntry,
		BundlePrincipal,
		BundleRef,
		CaseAclGrant,
		LookupDecision,
		PrincipalAction,
		PrincipalDecision
	} from '$lib/types/resources/case-transfer';

	const userCtx = getContext<UserCtx>(USER_CTX);
	// Minting accounts through an upload is an administrator's call, and the
	// API rejects the action for anyone else — so don't offer it. Listing
	// groups happens to need the same permission, but for its own reason.
	const canCreatePlaceholders = $derived(userCtx?.can('server_administrator') ?? false);
	const canListGroups = $derived(userCtx?.can('server_administrator') ?? false);

	type Step = 'upload' | 'resolve' | 'confirm';
	let step = $state<Step>('upload');
	let busy = $state(false);

	// ------------------------------------------------------------------
	// Step 1 — upload
	// ------------------------------------------------------------------
	let files = $state<FileList | undefined>(undefined);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
	let passphrase = $state('');
	let passphraseRequired = $state(false);
	let uploadError = $state<string | null>(null);

	const selectedFile = $derived(files?.[0] ?? null);

	const onDrop = (event: DragEvent) => {
		event.preventDefault();
		dragging = false;
		if (busy) return;

		const dropped = event.dataTransfer?.files;
		if (!dropped?.length) return;
		// Feed the hidden input too, so "click to choose a different file" opens
		// the picker already pointing at what was dropped.
		if (fileInput) fileInput.files = dropped;
		files = dropped;
		uploadError = null;
	};

	let inspection = $state<BundleInspection | null>(null);

	const inspectArchive = async () => {
		const file = selectedFile;
		if (!file || busy) return;

		busy = true;
		uploadError = null;
		try {
			const result = await CaseTransferService.inspect(file, passphrase || undefined);

			if (!result.ok) {
				// `encrypted` means "sealed, and you gave us nothing to open it
				// with" — a different situation from a passphrase that didn't
				// work, and the operator deserves to be told which is which.
				if (result.error.encrypted) {
					passphraseRequired = true;
					uploadError = 'This archive is encrypted. Enter the passphrase it was sealed with.';
				} else {
					uploadError = result.error.message;
				}
				return;
			}

			inspection = result.value;
			seedDecisions(result.value);
			// The passphrase has done its job: the staged copy on the server is
			// already decrypted. Nothing is served by keeping it around.
			passphrase = '';
			step = 'resolve';
		} catch (err) {
			uploadError = (err as Error).message;
		} finally {
			busy = false;
		}
	};

	// ------------------------------------------------------------------
	// Step 2 — resolve principals and reference data
	// ------------------------------------------------------------------
	let principalDecisions = $state<Record<BundleRef, PrincipalDecision>>({});
	let lookupDecisions = $state<Record<BundleRef, LookupDecision>>({});

	const seedDecisions = (report: BundleInspection) => {
		const seeded: Record<BundleRef, PrincipalDecision> = {};
		for (const principal of report.principals) {
			seeded[principal.ref] = principal.matched_user_id
				? { action: 'map', target_user_id: principal.matched_user_id }
				: { action: 'importer' };
		}
		principalDecisions = seeded;
		lookupDecisions = {};
	};

	const unresolved = $derived(
		(inspection?.principals ?? []).filter((p) => p.matched_user_id === null)
	);
	const autoMatched = $derived(
		(inspection?.principals ?? []).filter((p) => p.matched_user_id !== null)
	);

	const lookupRows = $derived.by(() => {
		const rows: Array<{ lookup: string; entry: BundleLookupEntry }> = [];
		for (const [lookup, entries] of Object.entries(inspection?.lookups ?? {})) {
			for (const entry of entries) rows.push({ lookup, entry });
		}
		return rows;
	});

	const willCreate = $derived(lookupRows.filter((r) => r.entry.will_create));
	const needsDecision = $derived(lookupRows.filter((r) => r.entry.requires_decision));

	// Every principal the operator chose to `map` needs a real target, and
	// every reference row the server refuses to invent needs a choice.
	const resolveComplete = $derived(
		unresolved.every((p) => {
			const decision = principalDecisions[p.ref];
			return decision?.action !== 'map' || Boolean(decision.target_user_id);
		}) && needsDecision.every((r) => Boolean(lookupDecisions[r.entry.ref]?.target_id))
	);

	const setPrincipalAction = (ref: BundleRef, action: PrincipalAction) => {
		const current = principalDecisions[ref];
		principalDecisions = {
			...principalDecisions,
			[ref]: action === 'map' ? { action, target_user_id: current?.target_user_id } : { action }
		};
	};

	const setPrincipalTarget = (ref: BundleRef, targetUserId: number) => {
		principalDecisions = {
			...principalDecisions,
			[ref]: { action: 'map', target_user_id: targetUserId }
		};
	};

	const setLookupTarget = (ref: BundleRef, targetId: number) => {
		lookupDecisions = { ...lookupDecisions, [ref]: { action: 'map', target_id: targetId } };
	};

	// Directory for the "map to an existing user" pickers. `mentionable` rather
	// than the admin user list — an analyst importing a case has to be able to
	// attribute rows without holding server-admin rights.
	let directory = $state<MentionableUser[]>([]);

	const loadDirectory = async () => {
		const res = await UsersService.listMentionable('');
		const body = res.ok ? (res.data as { data?: MentionableUser[] } | null) : null;
		directory = Array.isArray(body?.data) ? body.data : [];
	};

	// Options for the reference rows the backend will not create on its own.
	// Only the tables that expose a listing endpoint can be offered as a
	// picker; anything else has to be created on this instance by hand first.
	let lookupOptions = $state<Record<string, Array<{ id: number; name: string }>>>({});

	const loadLookupOptions = async () => {
		const loaded: Record<string, Array<{ id: number; name: string }>> = {};

		// The legacy /manage endpoints wrap their payload in
		// `{status, message, data}` while v2 returns the array raw, so accept
		// either — same unwrap the cases context does for these tables.
		const unwrap = <T,>(body: unknown): T[] => {
			if (Array.isArray(body)) return body as T[];
			const inner = (body as { data?: T[] } | null)?.data;
			return Array.isArray(inner) ? inner : [];
		};

		const states = await CaseStatesService.list();
		loaded.case_state = unwrap<{ state_id: number; state_name: string }>(states.data).map((s) => ({
			id: s.state_id,
			name: s.state_name
		}));

		const statuses = await AnalysisStatusService.list();
		loaded.analysis_status = unwrap<{ id: number; name: string }>(statuses.data).map((s) => ({
			id: s.id,
			name: s.name
		}));

		lookupOptions = loaded;
	};

	$effect(() => {
		if (step !== 'resolve') return;
		void loadDirectory();
		void loadLookupOptions();
	});

	// ------------------------------------------------------------------
	// Step 3 — confirm
	// ------------------------------------------------------------------
	let customerId = $state('');
	let customerLabel = $state('');
	let grants = $state<CaseAclGrant[]>([]);
	let groups = $state<Group[]>([]);
	let applyError = $state<string | null>(null);

	// Mirrors CaseAccessLevel in models/authorization.py.
	const ACCESS_LEVELS = [
		{ value: '2', label: 'Read only' },
		{ value: '4', label: 'Full access' }
	];
	// A select needs *some* value for "nothing chosen"; the empty string is
	// indistinguishable from an unset select in bits-ui, so use a sentinel.
	const NO_ACCESS = 'none';

	const loadGroups = async () => {
		const res = await GroupsService.list();
		if (!res.ok) {
			// Not fatal: grants are optional, and the importer already has full
			// access to the case they are about to create.
			groups = [];
			return;
		}
		// The endpoint answers with the paginated envelope, but the declared
		// type is the bare array — accept either rather than trusting one.
		const body = res.data as { data?: Group[] } | Group[] | null;
		const list = Array.isArray(body) ? body : (body?.data ?? []);
		groups = Array.isArray(list) ? list : [];
	};

	$effect(() => {
		if (step !== 'confirm') return;
		if (!canListGroups) return;
		void loadGroups();
	});

	const toggleGrant = (groupId: number, accessLevel: number | null) => {
		const without = grants.filter((g) => g.group_id !== groupId);
		grants =
			accessLevel === null
				? without
				: [...without, { group_id: groupId, access_level: accessLevel }];
	};

	const grantFor = (groupId: number) => grants.find((g) => g.group_id === groupId) ?? null;

	const applyImport = async () => {
		if (!inspection || busy) return;
		busy = true;
		applyError = null;
		try {
			const response = await CaseTransferService.apply({
				staging_token: inspection.staging_token,
				principal_mapping: principalDecisions,
				lookup_decisions: lookupDecisions,
				...(customerId ? { customer_id: Number(customerId) } : {}),
				...(grants.length ? { acl_grants: grants } : {})
			});

			if (!response.ok) {
				// ApiService still parses the body of a non-2xx, and for these
				// endpoints that body is `{message, data?}` — the server's own
				// message is far more useful than the status code.
				const body = response.data as unknown;
				const reported =
					typeof body === 'object' && body !== null
						? (body as { message?: unknown }).message
						: undefined;
				applyError =
					(typeof reported === 'string' ? reported : undefined) ??
					response.error?.message ??
					`Import failed (HTTP ${response.status})`;
				return;
			}

			const imported = response.data;
			if (imported === null || typeof imported === 'string') {
				applyError = 'The import was accepted but the server returned an unexpected response.';
				return;
			}
			const report = imported.import_report;
			// The staging directory is consumed by a successful apply, so
			// there's nothing left to discard on the way out.
			inspection = null;

			const created = report?.principals?.filter((p) => p.created).length ?? 0;
			toast({
				title: `Imported case #${imported.case_id}`,
				description: [
					`${report?.blobs_restored ?? 0} Datastore file(s) restored`,
					created ? `${created} placeholder user(s) created` : null,
					report?.created_lookups?.length
						? `${report.created_lookups.length} reference row(s) created`
						: null
				]
					.filter(Boolean)
					.join(' · ')
			});

			await goto(`/case/${imported.case_id}`);
		} catch (err) {
			applyError = (err as Error).message;
		} finally {
			busy = false;
		}
	};

	// ------------------------------------------------------------------
	// Leaving the wizard
	// ------------------------------------------------------------------
	// Fire-and-forget: the operator is already on their way out, and the
	// staging directory expires on its own if this never lands.
	const discardStaged = () => {
		const token = inspection?.staging_token;
		if (token) void CaseTransferService.discard(token);
	};

	const startOver = () => {
		discardStaged();
		inspection = null;
		principalDecisions = {};
		lookupDecisions = {};
		customerId = '';
		customerLabel = '';
		grants = [];
		applyError = null;
		uploadError = null;
		passphrase = '';
		passphraseRequired = false;
		files = undefined;
		if (fileInput) fileInput.value = '';
		dragging = false;
		step = 'upload';
	};

	// Leaving the page unmounts this component, so the teardown below does the
	// discarding — no need to do it twice.
	const cancel = () => {
		void goto('/cases');
	};

	// Navigating away mid-wizard (Cancel, browser back, a sidebar click) should
	// not leave a decrypted copy of the case staged on the server.
	onDestroy(discardStaged);

	const displayName = (principal: BundlePrincipal) =>
		principal.source.name || principal.source.login || principal.ref;

	const countEntries = $derived(
		Object.entries(inspection?.counts ?? {})
			.filter(([, count]) => count > 0)
			.sort(([a], [b]) => a.localeCompare(b))
	);

	const STEPS: Array<{ key: Step; label: string }> = [
		{ key: 'upload', label: 'Upload' },
		{ key: 'resolve', label: 'Resolve' },
		{ key: 'confirm', label: 'Confirm' }
	];
</script>

<svelte:head>
	<title>Import case</title>
</svelte:head>

<!--
  Same chrome as the other list pages (alert clusters, cases): the app's
  muted background carries a single white workspace panel, with the header
  and step indicator pinned and only the wizard body scrolling.
-->
<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class="shadow-elevation-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card"
	>
		<!-- ==================== Header ==================== -->
		<div class="flex shrink-0 flex-col gap-5 border-b px-6 py-5">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 class="text-xl font-semibold tracking-tight">Import case</h1>
				<span class="text-xs text-muted-foreground">
					Rebuild a case exported from this or another IRIS instance
				</span>
			</div>

			<!--
			  The three phases drawn as a flow rather than three loose chips —
			  an import is a sequence, and the operator should be able to see
			  how far along they are and what is still coming.
			-->
			<ol class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
				{#each STEPS as s, i (s.key)}
					{@const current = STEPS.findIndex((x) => x.key === step)}
					{@const done = current > i}
					{@const active = current === i}
					<li class="flex items-center gap-2">
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tabular-nums transition-colors {done
								? 'border-primary bg-primary text-primary-foreground'
								: active
									? 'border-primary text-primary'
									: 'border-border text-muted-foreground'}"
						>
							{#if done}
								<CheckIcon size={13} />
							{:else}
								{i + 1}
							{/if}
						</span>
						<span
							class="text-xs font-medium {active || done
								? 'text-foreground'
								: 'text-muted-foreground'}"
						>
							{s.label}
						</span>
						{#if i < STEPS.length - 1}
							<span
								class="ml-1 hidden h-px w-10 rounded-full sm:block {done
									? 'bg-primary'
									: 'bg-border'}"
							></span>
						{/if}
					</li>
				{/each}
			</ol>
		</div>

		<!-- ==================== Wizard body ==================== -->
		<!-- `items-center` is what centres each panel; the panels carry their
		     own max width so a step with a table can breathe wider than the
		     upload form without the column jumping around. -->
		<div class="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-6 py-6">
			{#if step === 'upload'}
				<!-- Nothing else is on screen at this point, so let the panel sit
				     in the middle of the workspace rather than clinging to the top. -->
				<div class="my-auto w-full max-w-xl">
					<p class="text-center text-sm text-muted-foreground">
						Drop in an archive exported from this or another IRIS instance. Nothing is written until
						you confirm on the last step.
					</p>

					<!-- The real input stays hidden and this button drives it, so the
					     drop target is a proper interactive element for keyboard and
					     screen-reader users rather than a decorated <div>. -->
					<input
						bind:this={fileInput}
						bind:files
						type="file"
						accept=".iris,.enc"
						class="sr-only"
						tabindex="-1"
						aria-hidden="true"
					/>
					<button
						type="button"
						disabled={busy}
						onclick={() => fileInput?.click()}
						ondragover={(event) => {
							event.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						ondrop={onDrop}
						class="mt-5 flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 {dragging
							? 'border-primary bg-primary/5'
							: 'border-border hover:border-primary/50 hover:bg-muted/40'}"
					>
						<span
							class="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
						>
							<FileArchiveIcon size={20} />
						</span>

						{#if selectedFile}
							<span class="flex flex-col gap-0.5">
								<span class="text-sm font-medium">{selectedFile.name}</span>
								<span class="text-xs text-muted-foreground">
									{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · click to choose a different file
								</span>
							</span>
						{:else}
							<span class="flex flex-col gap-0.5">
								<span class="text-sm font-medium">Drop a .iris archive here</span>
								<span class="text-xs text-muted-foreground">or click to browse</span>
							</span>
						{/if}
					</button>

					{#if passphraseRequired}
						<div class="mt-4 flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-4">
							<Label for="import-passphrase" class="flex items-center gap-1.5 text-xs">
								<LockIcon size={12} />
								Passphrase
							</Label>
							<Input
								id="import-passphrase"
								type="password"
								autocomplete="off"
								bind:value={passphrase}
								disabled={busy}
							/>
							<p class="text-xs text-muted-foreground">
								This archive was sealed on export. Without the passphrase it cannot be read.
							</p>
						</div>
					{/if}

					{#if uploadError}
						<div
							class="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
						>
							<AlertTriangleIcon size={14} class="mt-0.5 shrink-0" />
							<span>{uploadError}</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if step !== 'upload' && inspection}
				<div class="w-full max-w-4xl rounded-lg border p-5">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2 class="text-base font-semibold">{inspection.case.name ?? 'Unnamed case'}</h2>
						<span class="text-xs text-muted-foreground">
							{inspection.manifest.source_organisation ?? 'Unknown source'}
							{#if inspection.manifest.source_iris_version}
								· IRIS {inspection.manifest.source_iris_version}
							{/if}
							{#if inspection.manifest.exported_by}
								· exported by {inspection.manifest.exported_by}
							{/if}
							{#if inspection.manifest.exported_at}
								· {inspection.manifest.exported_at}
							{/if}
						</span>
					</div>

					<div class="mt-4 flex flex-wrap gap-1.5">
						{#each countEntries as [entity, count] (entity)}
							<span class="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
								<span class="font-medium tabular-nums">{count}</span>
								<span class="text-muted-foreground">{entity.replace(/_/g, ' ')}</span>
							</span>
						{/each}
						<span class="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
							<span class="font-medium tabular-nums">{inspection.datastore_blobs}</span>
							<span class="text-muted-foreground">Datastore blobs</span>
						</span>
					</div>

					{#each inspection.warnings as warning (warning)}
						<div
							class="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200"
						>
							<AlertTriangleIcon size={14} class="mt-0.5 shrink-0" />
							<span>{warning}</span>
						</div>
					{/each}
				</div>
			{/if}

			{#if step === 'resolve' && inspection}
				<div class="w-full max-w-4xl rounded-lg border p-5">
					<h2 class="text-base font-semibold">Users</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Rows in the bundle are attributed to users on the instance it came from. Anyone this
						instance already recognises has been matched automatically; the rest need a decision.
					</p>

					{#if unresolved.length === 0}
						<div
							class="mt-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400"
						>
							<CheckCircle2Icon size={15} />
							Every user in the bundle matched an account on this instance.
						</div>
					{:else}
						<ul class="mt-4 flex flex-col divide-y">
							{#each unresolved as principal (principal.ref)}
								{@const decision = principalDecisions[principal.ref]}
								<li class="flex flex-col gap-3 py-4 first:pt-0">
									<div class="flex flex-wrap items-baseline gap-2">
										<UserRoundIcon size={14} class="shrink-0 opacity-70" />
										<span class="font-medium">{displayName(principal)}</span>
										{#if principal.source.login}
											<span class="text-xs text-muted-foreground">@{principal.source.login}</span>
										{/if}
										{#if principal.source.email}
											<span class="text-xs text-muted-foreground">{principal.source.email}</span>
										{/if}
										<span class="ml-auto text-xs text-muted-foreground">
											{principal.reference_count} reference{principal.reference_count === 1
												? ''
												: 's'}
										</span>
									</div>

									<div class="flex flex-wrap items-center gap-2">
										<Select
											type="single"
											value={decision?.action ?? 'importer'}
											onValueChange={(value) =>
												setPrincipalAction(principal.ref, value as PrincipalAction)}
										>
											<SelectTrigger class="w-56">
												{#if decision?.action === 'map'}
													Map to an existing user
												{:else if decision?.action === 'placeholder'}
													Create a placeholder
												{:else}
													Attribute to me
												{/if}
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="map">Map to an existing user</SelectItem>
												{#if canCreatePlaceholders}
													<SelectItem value="placeholder">Create a placeholder</SelectItem>
												{/if}
												<SelectItem value="importer">Attribute to me</SelectItem>
											</SelectContent>
										</Select>

										{#if decision?.action === 'map'}
											<Select
												type="single"
												value={decision.target_user_id ? String(decision.target_user_id) : ''}
												onValueChange={(value) => setPrincipalTarget(principal.ref, Number(value))}
											>
												<SelectTrigger class="w-64">
													{directory.find((u) => u.user_id === decision.target_user_id)
														?.user_name ?? 'Choose a user'}
												</SelectTrigger>
												<SelectContent>
													{#each directory as user (user.user_id)}
														<SelectItem value={String(user.user_id)}>
															{user.user_name} (@{user.user_login})
														</SelectItem>
													{/each}
												</SelectContent>
											</Select>
										{/if}
									</div>

									{#if decision?.action === 'placeholder'}
										<p class="text-xs text-muted-foreground">
											Creates an inactive account that cannot log in, so the case keeps its original
											attribution. A later import from the same instance will reuse it.
										</p>
									{:else if decision?.action === 'importer'}
										<p class="text-xs text-muted-foreground">
											Their rows will be attributed to you. The original login is recorded in the
											imported case's history.
										</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if autoMatched.length > 0}
						<details class="mt-4 text-sm">
							<summary class="cursor-pointer text-muted-foreground">
								{autoMatched.length} user{autoMatched.length === 1 ? '' : 's'} matched automatically
							</summary>
							<ul class="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
								{#each autoMatched as principal (principal.ref)}
									<li>
										{displayName(principal)} → user #{principal.matched_user_id}
										<span class="opacity-70">(matched by {principal.matched_by})</span>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>

				<div class="w-full max-w-4xl rounded-lg border p-5">
					<h2 class="text-base font-semibold">Reference data</h2>

					{#if needsDecision.length === 0 && willCreate.length === 0}
						<p class="mt-1 text-sm text-muted-foreground">
							Everything the bundle refers to already exists on this instance.
						</p>
					{/if}

					{#if willCreate.length > 0}
						<p class="mt-1 text-sm text-muted-foreground">
							These do not exist here yet and will be created:
						</p>
						<ul class="mt-3 flex flex-wrap gap-1.5">
							{#each willCreate as row (row.entry.ref)}
								<li class="rounded-full border border-dashed px-2.5 py-1 text-xs">
									<span class="text-muted-foreground">{row.lookup.replace(/_/g, ' ')}</span>
									<span class="font-medium">{row.entry.name ?? row.entry.ref}</span>
								</li>
							{/each}
						</ul>
					{/if}

					{#if needsDecision.length > 0}
						<div class="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
							<InfoIcon size={14} class="mt-0.5 shrink-0" />
							<span>
								These drive workflow rather than labelling it, so IRIS will not invent them — pick
								the row on this instance that each one corresponds to.
							</span>
						</div>

						<ul class="mt-3 flex flex-col gap-3">
							{#each needsDecision as row (row.entry.ref)}
								{@const options = lookupOptions[row.lookup] ?? []}
								{@const chosen = lookupDecisions[row.entry.ref]?.target_id}
								<li class="flex flex-wrap items-center gap-3">
									<span class="text-sm">
										<span class="text-muted-foreground">{row.lookup.replace(/_/g, ' ')}</span>
										<span class="font-medium">{row.entry.name ?? row.entry.ref}</span>
									</span>
									{#if options.length > 0}
										<Select
											type="single"
											value={chosen ? String(chosen) : ''}
											onValueChange={(value) => setLookupTarget(row.entry.ref, Number(value))}
										>
											<SelectTrigger class="w-56">
												{options.find((o) => o.id === chosen)?.name ?? 'Choose a replacement'}
											</SelectTrigger>
											<SelectContent>
												{#each options as option (option.id)}
													<SelectItem value={String(option.id)}>{option.name}</SelectItem>
												{/each}
											</SelectContent>
										</Select>
									{:else}
										<span class="text-xs text-destructive">
											No equivalent can be listed here — create a {row.lookup.replace(/_/g, ' ')}
											named "{row.entry.name ?? row.entry.ref}" on this instance, then import again.
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if step === 'confirm' && inspection}
				<div class="w-full max-w-4xl rounded-lg border p-5">
					<h2 class="text-base font-semibold">Customer</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Leave this alone to keep the customer named in the bundle — it will be matched by name,
						and created here if it doesn't exist yet.
					</p>
					<div class="mt-3 flex items-center gap-2">
						<CustomerPicker
							value={customerId}
							selectedLabel={customerLabel}
							placeholder="Keep the bundle's customer"
							disabled={busy}
							onChange={(value, label) => {
								customerId = value;
								customerLabel = label;
							}}
						/>
						{#if customerId}
							<Button
								variant="ghost"
								size="sm"
								onclick={() => {
									customerId = '';
									customerLabel = '';
								}}
							>
								Clear
							</Button>
						{/if}
					</div>
				</div>

				<div class="w-full max-w-4xl rounded-lg border p-5">
					<h2 class="text-base font-semibold">Access</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						The source instance's access rules do not travel with the case — they name groups and
						users that mean nothing here. You get full access to the imported case; anyone else only
						if you say so.
					</p>

					{#if canListGroups && groups.length > 0}
						<ul class="mt-4 flex flex-col divide-y">
							{#each groups as group (group.group_id)}
								{@const grant = grantFor(group.group_id)}
								<li class="flex items-center gap-3 py-2">
									<span class="min-w-0 flex-1 truncate text-sm">{group.group_name}</span>
									<Select
										type="single"
										value={grant ? String(grant.access_level) : NO_ACCESS}
										onValueChange={(value) =>
											toggleGrant(group.group_id, value === NO_ACCESS ? null : Number(value))}
									>
										<SelectTrigger class="w-40">
											{ACCESS_LEVELS.find((l) => l.value === String(grant?.access_level))?.label ??
												'No access'}
										</SelectTrigger>
										<SelectContent>
											<SelectItem value={NO_ACCESS}>No access</SelectItem>
											{#each ACCESS_LEVELS as level (level.value)}
												<SelectItem value={level.value}>{level.label}</SelectItem>
											{/each}
										</SelectContent>
									</Select>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-4 text-xs text-muted-foreground">
							Listing groups needs administrator rights, so no grants can be set from here. Share
							the case from its access panel once the import lands.
						</p>
					{/if}
				</div>

				{#if applyError}
					<div
						class="flex w-full max-w-4xl items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
					>
						<AlertTriangleIcon size={14} class="mt-0.5 shrink-0" />
						<span>{applyError}</span>
					</div>
				{/if}
			{/if}
		</div>

		<!-- ==================== Actions ==================== -->
		<!--
		  Pinned rather than trailing the content: the resolve step can run to
		  several screens of users, and "Continue" should never be something the
		  operator has to go looking for.
		-->
		<div class="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-4">
			<div>
				{#if step === 'resolve'}
					<Button variant="ghost" onclick={startOver} disabled={busy}>
						<ArrowLeftIcon size={14} class="mr-2" />
						Choose another archive
					</Button>
				{:else if step === 'confirm'}
					<Button variant="ghost" onclick={() => (step = 'resolve')} disabled={busy}>
						<ArrowLeftIcon size={14} class="mr-2" />
						Back
					</Button>
				{/if}
			</div>

			<div class="flex gap-2">
				<Button variant="outline" onclick={cancel} disabled={busy}>Cancel</Button>
				{#if step === 'upload'}
					<Button onclick={inspectArchive} disabled={!selectedFile || busy}>
						{#if busy}
							<RefreshCwIcon size={14} class="mr-2 animate-spin" />
							Reading archive…
						{:else}
							<UploadIcon size={14} class="mr-2" />
							Inspect archive
						{/if}
					</Button>
				{:else if step === 'resolve'}
					<Button onclick={() => (step = 'confirm')} disabled={!resolveComplete || busy}>
						Continue
					</Button>
				{:else}
					<Button onclick={applyImport} disabled={busy}>
						{#if busy}
							<RefreshCwIcon size={14} class="mr-2 animate-spin" />
							Importing…
						{:else}
							Import case
						{/if}
					</Button>
				{/if}
			</div>
		</div>
	</div>
</div>
