<!--
  Server Settings page.

  Single-form layout (no master/detail — there's only one server) with
  sections for the legacy `manage_srv_settings.html` groups:
    • Versions     — read-only strip at the top.
    • Proxy        — HTTP / HTTPS module proxies.
    • Post-init    — whether the boot routine re-registers defaults.
    • Password policy.
    • Auth         — enforce MFA.
    • Confirmation — prompt before delete.
    • Database backup — POST trigger + log viewer.

  Save sends only the fields the admin actually changed (`dirty`
  tracking + `Object.entries` diff at submit time) so toggling one
  switch doesn't reset every other value in concurrent admin sessions.
  Mirrors the legacy /manage/settings page 1:1.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DatabaseIcon,
		KeyRoundIcon,
		PowerIcon,
		RefreshCwIcon,
		SaveIcon,
		ServerCogIcon,
		ShieldAlertIcon,
		WifiIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Switch } from '$lib/components/ui/switch';
	import { toast } from '$lib/components/ui/toast';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		ServerSettingsService,
		type ServerSettings,
		type ServerSettingsResponse,
		type ServerSettingsUpdateBody
	} from '$lib/services/server-settings.service';

	let payload = $state<ServerSettingsResponse | null>(null);
	let loading = $state(false);
	let saveError = $state<string | null>(null);
	let saving = $state(false);

	// Working copy of the settings the form mutates. Diffed against
	// `payload.settings` on save so only changed fields hit the wire.
	let form = $state<Partial<ServerSettings>>({});

	// Backup state
	let backupBusy = $state(false);
	let backupLogs = $state<string[] | null>(null);
	let backupError = $state<string | null>(null);

	// Shared confirmation dialog (used for the destructive-ish Run
	// backup button — it's long-running and writes to disk so a
	// confirm prompt is worth the friction).
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<() => Promise<void> | void>(() => {});

	const showError = (msg: string, fallback = 'Operation failed') =>
		toast({ title: msg || fallback, variant: 'destructive' });
	const showSuccess = (msg: string) => toast({ title: msg, variant: 'success' });

	const load = async () => {
		loading = true;
		try {
			const res = await ServerSettingsService.get();
			if (res.ok && res.data && typeof res.data !== 'string') {
				payload = res.data as ServerSettingsResponse;
				// Snapshot the row into the editable form so each
				// individual <Switch>/<Input> binds to a local copy
				// rather than the server's row directly.
				form = { ...payload.settings };
			} else {
				showError(res.error?.message ?? 'Failed to load server settings');
			}
		} finally {
			loading = false;
		}
	};

	onMount(load);

	const fieldChanged = <K extends keyof ServerSettings>(key: K): boolean => {
		if (payload == null) return false;
		const original = (payload.settings as ServerSettings)[key];
		const current = (form as Partial<ServerSettings>)[key];
		// Compare with `!==` after normalising null/undefined since
		// the schema marshals empty strings as null on the wire.
		return (original ?? null) !== (current ?? null);
	};

	const isDirty = $derived.by<boolean>(() => {
		if (payload == null) return false;
		const settings = payload.settings as ServerSettings;
		return (Object.keys(settings) as Array<keyof ServerSettings>).some((k) =>
			fieldChanged(k)
		);
	});

	const buildPatch = (): ServerSettingsUpdateBody => {
		if (payload == null) return {};
		const patch: ServerSettingsUpdateBody = {};
		const settings = payload.settings as ServerSettings;
		for (const key of Object.keys(settings) as Array<keyof ServerSettings>) {
			if (fieldChanged(key)) {
				// Cast through `any` — TS can't track the per-key
				// shape across the Object.keys() loop, but we know
				// each key matches its slot on both sides of the assign.
				(patch as Record<string, unknown>)[key] = (form as Record<string, unknown>)[key];
			}
		}
		return patch;
	};

	const save = async () => {
		const patch = buildPatch();
		if (Object.keys(patch).length === 0) return;
		saving = true;
		saveError = null;
		try {
			const res = await ServerSettingsService.update(patch);
			if (res.ok && res.data && typeof res.data !== 'string') {
				// Backend echoes the full row — update our snapshot
				// so `isDirty` flips back to false.
				if (payload != null) {
					payload = {
						...payload,
						settings: res.data as ServerSettings
					};
				}
				form = { ...(res.data as ServerSettings) };
				showSuccess('Server settings updated');
			} else {
				const data = res.data as { message?: string; data?: unknown } | null;
				saveError = data?.message ?? res.error?.message ?? 'Save failed';
			}
		} catch (e) {
			saveError = (e as Error).message;
		} finally {
			saving = false;
		}
	};

	const discard = () => {
		if (payload == null) return;
		form = { ...payload.settings };
		saveError = null;
	};

	const runBackup = () => {
		confirmTitle = 'Run database backup now?';
		confirmMessage =
			'Streams a full Postgres dump to the configured BACKUP_PATH. Synchronous — the request stays open until the dump finishes. Safe to run at any time.';
		confirmAction = async () => {
			backupBusy = true;
			backupError = null;
			backupLogs = null;
			try {
				const res = await ServerSettingsService.backupDb();
				if (res.ok && res.data && typeof res.data !== 'string') {
					backupLogs = (res.data as { logs: string[] }).logs ?? [];
					showSuccess('Database backup complete');
				} else {
					const data = res.data as { message?: string; data?: string[] } | null;
					backupError = data?.message ?? res.error?.message ?? 'Backup failed';
					if (Array.isArray(data?.data)) backupLogs = data.data;
				}
			} catch (e) {
				backupError = (e as Error).message;
			} finally {
				backupBusy = false;
			}
		};
		confirmOpen = true;
	};

	const runConfirm = async () => {
		await confirmAction();
	};
</script>

<svelte:head>
	<title>Server Settings</title>
</svelte:head>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Page header -->
	<header class="flex items-center justify-between gap-3 border-b px-5 py-3">
		<div class="flex items-center gap-2.5">
			<ServerCogIcon size={18} class="text-muted-foreground" />
			<div class="leading-tight">
				<h1 class="text-sm font-semibold">Server Settings</h1>
				<p class="text-2xs text-muted-foreground">
					Server-wide configuration. Changes apply immediately.
				</p>
			</div>
		</div>

		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={load}
				disabled={loading || saving}
			>
				<RefreshCwIcon
					size={12}
					class={`mr-1 ${loading ? 'animate-spin' : ''}`}
				/>
				Refresh
			</Button>
			<Button
				variant="outline"
				size="sm"
				class="h-7"
				onclick={discard}
				disabled={saving || !isDirty}
			>
				Discard
			</Button>
			<Button size="sm" class="h-7" onclick={save} disabled={saving || !isDirty}>
				<SaveIcon size={12} class="mr-1" />
				{saving ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto p-4">
		{#if loading && payload == null}
			<div class="space-y-2">
				{#each Array(8) as _}
					<Skeleton class="h-10 w-full" />
				{/each}
			</div>
		{:else if payload == null}
			<p class="px-3 py-10 text-center text-xs text-muted-foreground">
				No server settings could be loaded.
			</p>
		{:else}
			<div class="flex flex-col gap-5">
				<!-- Versions strip (read-only) -->
				<section class="rounded-md border">
					<header class="border-b bg-muted/30 px-3 py-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Versions
						</h2>
					</header>
					<dl class="grid grid-cols-2 gap-3 p-3 text-2xs sm:grid-cols-3">
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">IRIS</dt>
							<dd class="font-mono">{payload.versions.iris_version}</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">API min / max</dt>
							<dd class="font-mono">
								{payload.versions.api_min} → {payload.versions.api_max}
							</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">
								Module interface min / max
							</dt>
							<dd class="font-mono">
								{payload.versions.module_interface_min} → {payload.versions.module_interface_max}
							</dd>
						</div>
						<div class="sm:col-span-2">
							<dt class="uppercase tracking-wide text-muted-foreground">DB revision</dt>
							<dd class="font-mono">{payload.versions.db_revision ?? '—'}</dd>
						</div>
						<div>
							<dt class="uppercase tracking-wide text-muted-foreground">
								Updates available
							</dt>
							<dd>
								{#if payload.settings.has_updates_available}
									<span
										class="rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0 text-2xs text-amber-700 dark:text-amber-300"
									>
										Yes — see the changelog
									</span>
								{:else}
									<span class="text-muted-foreground">No</span>
								{/if}
							</dd>
						</div>
					</dl>
				</section>

				<!-- Proxy -->
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<WifiIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Module HTTP / HTTPS proxy
							</h2>
						</div>
					</header>
					<div class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label
								for="srv-http-proxy"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								HTTP proxy
							</label>
							<Input
								id="srv-http-proxy"
								class="h-7 text-xs"
								placeholder="http://proxy:3128"
								value={String(form.http_proxy ?? '')}
								disabled={saving}
								oninput={(e) =>
									(form.http_proxy = (e.currentTarget as HTMLInputElement).value || null)}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="srv-https-proxy"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								HTTPS proxy
							</label>
							<Input
								id="srv-https-proxy"
								class="h-7 text-xs"
								placeholder="http://proxy:3128"
								value={String(form.https_proxy ?? '')}
								disabled={saving}
								oninput={(e) =>
									(form.https_proxy = (e.currentTarget as HTMLInputElement).value || null)}
							/>
						</div>
						<p class="text-2xs text-muted-foreground sm:col-span-2">
							Used by IRIS modules that fetch external resources. Empty leaves the system
							default in place.
						</p>
					</div>
				</section>

				<!-- Post-init -->
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<PowerIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Post-init behaviour
							</h2>
						</div>
					</header>
					<div class="flex flex-col gap-3 p-4 text-xs">
						<label class="flex items-start gap-2">
							<Switch
								checked={!!form.prevent_post_mod_repush}
								onCheckedChange={(v: boolean) => (form.prevent_post_mod_repush = v)}
								disabled={saving}
							/>
							<div>
								<div class="font-medium">Prevent re-registering default modules on boot</div>
								<p class="text-2xs text-muted-foreground">
									Once you've customised an installed module, turn this on to stop the
									boot routine resetting it on the next restart.
								</p>
							</div>
						</label>
						<label class="flex items-start gap-2">
							<Switch
								checked={!!form.prevent_post_objects_repush}
								onCheckedChange={(v: boolean) => (form.prevent_post_objects_repush = v)}
								disabled={saving}
							/>
							<div>
								<div class="font-medium">
									Prevent re-registering default case objects on boot
								</div>
								<p class="text-2xs text-muted-foreground">
									Same for the seeded taxonomies (asset types, IOC types, classifications,
									states, evidence types). Useful when you've pruned the defaults.
								</p>
							</div>
						</label>
						<label class="flex items-start gap-2">
							<Switch
								checked={!!form.enable_updates_check}
								onCheckedChange={(v: boolean) => (form.enable_updates_check = v)}
								disabled={saving}
							/>
							<div>
								<div class="font-medium">Enable periodic update checks</div>
								<p class="text-2xs text-muted-foreground">
									Runs a Celery task on a schedule that polls the IRIS update server. The
									outcome is surfaced in the read-only "Updates available" flag above.
								</p>
							</div>
						</label>
					</div>
				</section>

				<!-- Password policy -->
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<KeyRoundIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Password policy
							</h2>
						</div>
					</header>
					<div class="grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2">
						<div class="flex flex-col gap-1">
							<label
								for="srv-pp-len"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Minimum length
							</label>
							<Input
								id="srv-pp-len"
								type="number"
								min={6}
								max={128}
								class="h-7 text-xs"
								value={String(form.password_policy_min_length ?? '')}
								disabled={saving}
								oninput={(e) => {
									const raw = (e.currentTarget as HTMLInputElement).value.trim();
									form.password_policy_min_length = raw === '' ? 0 : Number(raw);
								}}
							/>
						</div>
						<div class="flex flex-col gap-1">
							<label
								for="srv-pp-chars"
								class="text-2xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								Required special characters
							</label>
							<Input
								id="srv-pp-chars"
								class="h-7 text-xs"
								placeholder="!@#$%^&*"
								value={String(form.password_policy_special_chars ?? '')}
								disabled={saving}
								oninput={(e) =>
									(form.password_policy_special_chars =
										(e.currentTarget as HTMLInputElement).value || null)}
							/>
							<p class="text-2xs text-muted-foreground">
								Empty = no special-char requirement.
							</p>
						</div>
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!form.password_policy_upper_case}
								onCheckedChange={(v: boolean) => (form.password_policy_upper_case = v)}
								disabled={saving}
							/>
							<span class="text-xs">Require at least one uppercase letter</span>
						</label>
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!form.password_policy_lower_case}
								onCheckedChange={(v: boolean) => (form.password_policy_lower_case = v)}
								disabled={saving}
							/>
							<span class="text-xs">Require at least one lowercase letter</span>
						</label>
						<label class="flex items-start gap-2 sm:col-span-2">
							<Switch
								checked={!!form.password_policy_digit}
								onCheckedChange={(v: boolean) => (form.password_policy_digit = v)}
								disabled={saving}
							/>
							<span class="text-xs">Require at least one digit</span>
						</label>
					</div>
				</section>

				<!-- Auth + confirmations -->
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<ShieldAlertIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Authentication &amp; safety
							</h2>
						</div>
					</header>
					<div class="flex flex-col gap-3 p-4 text-xs">
						<label class="flex items-start gap-2">
							<Switch
								checked={!!form.enforce_mfa}
								onCheckedChange={(v: boolean) => (form.enforce_mfa = v)}
								disabled={saving}
							/>
							<div>
								<div class="font-medium">Enforce MFA</div>
								<p class="text-2xs text-muted-foreground">
									Forces every user to register a TOTP / WebAuthn factor at next login.
									Existing sessions stay valid until they expire.
								</p>
							</div>
						</label>
						<label class="flex items-start gap-2">
							<Switch
								checked={!!form.force_confirmation_before_delete}
								onCheckedChange={(v: boolean) =>
									(form.force_confirmation_before_delete = v)}
								disabled={saving}
							/>
							<div>
								<div class="font-medium">Require confirmation before delete</div>
								<p class="text-2xs text-muted-foreground">
									Adds a "type the name to confirm" prompt on every destructive action.
								</p>
							</div>
						</label>
					</div>
				</section>

				<!-- Save error feedback (sits at the bottom so admins
				     don't have to scroll back up after a save). -->
				{#if saveError}
					<p class="whitespace-pre-wrap text-2xs text-destructive">{saveError}</p>
				{/if}

				<!-- DB backup -->
				<section class="rounded-md border">
					<header class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
						<div class="flex items-center gap-2">
							<DatabaseIcon size={14} class="text-muted-foreground" />
							<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
								Database backup
							</h2>
						</div>
						<Button
							size="sm"
							class="h-7"
							onclick={runBackup}
							disabled={backupBusy}
						>
							<DatabaseIcon size={12} class="mr-1" />
							{backupBusy ? 'Running…' : 'Run backup now'}
						</Button>
					</header>
					<div class="flex flex-col gap-2 p-4 text-xs">
						<p class="text-2xs text-muted-foreground">
							Triggers an immediate `pg_dump` of the IRIS database to the path configured
							in `BACKUP_PATH`. The button stays disabled while the dump runs.
						</p>
						{#if backupLogs && backupLogs.length > 0}
							<pre class="max-h-64 overflow-y-auto rounded-md border bg-muted/30 p-2 font-mono text-2xs"
							>{backupLogs.join('\n')}</pre>
						{/if}
						{#if backupError}
							<p class="whitespace-pre-wrap text-2xs text-destructive">{backupError}</p>
						{/if}
					</div>
				</section>
			</div>
		{/if}
	</div>
</div>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Run backup"
	onConfirm={runConfirm}
/>
