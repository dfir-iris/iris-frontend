<!--
  "My profile" — the Svelte equivalent of the legacy
  app/blueprints/pages/profile/templates/profile.html page. Shows the
  current user's identity (read-only), exposes the API key with a renew
  flow, and surfaces the same two preference toggles (theme +
  delete-confirmation) the old UI exposed. All writes go through
  `PUT /api/v2/me` except the renew / refresh-permissions actions which
  have their own dedicated v2 endpoints under /me.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		EyeIcon,
		EyeOffIcon,
		KeyRoundIcon,
		MailIcon,
		MoonIcon,
		RefreshCcwIcon,
		ShieldCheckIcon,
		SunIcon,
		UserIcon,
		HashIcon,
		FingerprintIcon,
		LockIcon,
		MessageSquareOffIcon,
		MessageSquareIcon,
		ListFilterIcon
	} from 'lucide-svelte';
	import { setMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import SegmentedSelect from '$lib/components/ui/segmented-select/segmented-select.svelte';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import { toast } from '$lib/components/ui/toast';
	import { AlertsFiltersService, type SavedFilter } from '$lib/services/alerts-filters.service';
	import {
		ALERTS_DEFAULT_VIEW,
		ALERTS_DEFAULT_VIEW_OPTIONS,
		loadAlertsDefaultView,
		saveAlertsDefaultView,
		type AlertsDefaultView
	} from '$lib/utils/alerts-default-view';
	import { ProfileService, type Profile } from '$lib/services/profile.service';
	import { AvatarsService } from '$lib/services/avatars.service';
	import { avatarStore } from '$lib/services/avatar-cache';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import ApiKeysCard from './components/ApiKeysCard.svelte';
	import ChangePasswordDialog from './components/ChangePasswordDialog.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { demoLocksCredentials } from '$lib/services/user-context.service';

	const userCtx = getContext<UserCtx>(USER_CTX);
	// Demo accounts are shared and their passwords are published, so a
	// rotation here locks out the next visitor. The API refuses it too.
	const passwordLocked = $derived(demoLocksCredentials(userCtx.ctx));

	let profile = $state<Profile | null>(null);
	let loading = $state(true);
	let renewing = $state(false);
	let refreshingPerms = $state(false);
	let showChangePwd = $state(false);
	let apiKeyVisible = $state(false);

	// Avatar upload state. `avatarVersion` is a cache-bust seed for the
	// preview — bumped after every successful upload / delete so the
	// `<UserAvatar>` re-fetches the bytes without us having to wire
	// `avatar_updated_at` through the Profile shape.
	let avatarVersion = $state<string | null>(null);
	let avatarBusy = $state(false);
	let avatarInput = $state<HTMLInputElement | null>(null);

	// --- Default alerts view ---------------------------------------------
	//
	// Which view the Alerts page opens on when it is reached without a
	// filter of its own. The saved presets are offered alongside the
	// built-in modes so a user who already curated one can make it their
	// landing view; a user without permission to list them (or an
	// instance with none) just gets the built-ins.
	const PRESET_PREFIX = 'preset:';

	const viewToSelectValue = (view: AlertsDefaultView) =>
		view.mode === 'preset' ? `${PRESET_PREFIX}${view.filter_id}` : view.mode;

	let alertPresets = $state<SavedFilter[]>([]);
	// Bound to the select, so it moves as soon as the user picks. The
	// last value the server acknowledged is kept alongside it, which is
	// what a failed save (or a re-pick of the current entry, which the
	// select reports as a clear) is restored from.
	let alertsDefaultViewValue = $state(viewToSelectValue(ALERTS_DEFAULT_VIEW));
	let savedDefaultViewValue = viewToSelectValue(ALERTS_DEFAULT_VIEW);

	const alertsDefaultViewItems = $derived([
		...ALERTS_DEFAULT_VIEW_OPTIONS.map((option) => ({
			value: option.mode,
			label: option.label
		})),
		...alertPresets.map((preset) => ({
			value: `${PRESET_PREFIX}${preset.filter_id}`,
			label: `Preset — ${preset.filter_name}`
		}))
	]);

	// The expression behind the `query` view. Kept alongside the select
	// because picking that entry is only half the choice — an empty
	// expression is not a view, so nothing is saved until it is typed.
	let alertsDefaultQuery = $state('');
	let savedDefaultQuery = '';

	const loadAlertsDefaults = async () => {
		const view = await loadAlertsDefaultView();
		savedDefaultViewValue = viewToSelectValue(view);
		alertsDefaultViewValue = savedDefaultViewValue;
		savedDefaultQuery = view.query ?? '';
		alertsDefaultQuery = savedDefaultQuery;

		const res = await AlertsFiltersService.list();
		if (res.ok && Array.isArray(res.data)) {
			alertPresets = res.data;
		}
	};

	/** Write a view, restoring the last acknowledged choice if it does not land. */
	const commitAlertsDefaultView = async (next: AlertsDefaultView, selectValue: string) => {
		alertsDefaultViewValue = selectValue;

		if (await saveAlertsDefaultView(next)) {
			savedDefaultViewValue = selectValue;
			savedDefaultQuery = next.query ?? '';
			return;
		}

		alertsDefaultViewValue = savedDefaultViewValue;
		alertsDefaultQuery = savedDefaultQuery;
		toast({
			title: 'Failed to save the default alerts view',
			variant: 'destructive'
		});
	};

	const setAlertsDefaultView = async (value: string) => {
		// Picking the current entry again clears the select. There is no
		// "no default" state, so put the choice straight back.
		if (value === '' || value === savedDefaultViewValue) {
			alertsDefaultViewValue = savedDefaultViewValue;
			return;
		}

		if (value === 'query') {
			// Reveal the expression field and wait for it. Saving `query`
			// with nothing in it would store a view that resolves to the
			// open queue anyway, and look like it had been accepted.
			alertsDefaultViewValue = value;
			if (alertsDefaultQuery.trim() !== '') await saveAlertsDefaultQuery();
			return;
		}

		const next: AlertsDefaultView = value.startsWith(PRESET_PREFIX)
			? { mode: 'preset', filter_id: Number(value.slice(PRESET_PREFIX.length)) }
			: { mode: value as AlertsDefaultView['mode'] };

		await commitAlertsDefaultView(next, value);
	};

	const saveAlertsDefaultQuery = async () => {
		const expression = alertsDefaultQuery.trim();

		if (expression === '') {
			// Emptying the field is a way out of this mode, not a new view.
			alertsDefaultViewValue = savedDefaultViewValue;
			alertsDefaultQuery = savedDefaultQuery;
			return;
		}

		if (expression === savedDefaultQuery && savedDefaultViewValue === 'query') return;

		await commitAlertsDefaultView({ mode: 'query', query: expression }, 'query');
	};

	const load = async () => {
		void loadAlertsDefaults();

		const res = await ProfileService.get();
		if (res.ok && res.data && typeof res.data !== 'string') {
			profile = res.data as Profile;
		} else {
			toast({
				title: 'Could not load profile',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
		}
		loading = false;
	};

	onMount(load);

	const renewApiKey = async () => {
		if (!confirm('Are you sure? The current API key will be revoked and cannot be used anymore.'))
			return;

		renewing = true;
		try {
			const res = await ProfileService.renewApiKey();
			if (res.ok && res.data && typeof res.data !== 'string') {
				profile = res.data as Profile;
				toast({ title: 'API key renewed', variant: 'success' });
			} else {
				toast({
					title: 'Failed to renew API key',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			renewing = false;
		}
	};

	const refreshPermissions = async () => {
		refreshingPerms = true;
		try {
			const res = await ProfileService.refreshPermissions();
			if (res.ok) {
				toast({ title: 'Access control refreshed', variant: 'success' });
			} else {
				toast({
					title: 'Failed to refresh access',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			refreshingPerms = false;
		}
	};

	// `setMode` from mode-watcher persists locally; we also push the choice
	// to the backend so other clients of the same user (or a fresh tab)
	// reload with the preference applied. Failures don't roll back the
	// local toggle — the user gets a toast instead.
	const setTheme = async (dark: boolean) => {
		setMode(dark ? 'dark' : 'light');
		if (!profile) return;
		profile.in_dark_mode = dark;

		const res = await ProfileService.update({ in_dark_mode: dark });
		if (!res.ok) {
			toast({
				title: 'Failed to save theme preference',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const setDeletionPrompt = async (val: boolean) => {
		if (!profile) return;
		profile.has_deletion_confirmation = val;

		const res = await ProfileService.update({ has_deletion_confirmation: val });
		if (!res.ok) {
			toast({
				title: 'Failed to save preference',
				description: res.error?.message,
				variant: 'destructive'
			});
		}
	};

	const onAvatarPicked = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		// Reset the input value immediately so re-selecting the same
		// file in a row still fires `change`.
		input.value = '';
		if (!file) return;

		avatarBusy = true;
		try {
			const res = await AvatarsService.uploadMyAvatar(file);
			if (res.ok && res.data && typeof res.data !== 'string') {
				avatarVersion = res.data.avatar_updated_at ?? new Date().toISOString();
				// Drop every cached entry for this user across all
				// versions so the side bar / comment authors / case
				// contributors that already mounted with a stale
				// (userId, null) cache key re-fetch on their next
				// render. Without this, only the preview card on
				// this page picks up the new bytes.
				if (profile) avatarStore.bumpUser(profile.user_id);
				toast({ title: 'Avatar updated', variant: 'success' });
			} else {
				toast({
					title: 'Avatar upload failed',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			avatarBusy = false;
		}
	};

	const removeAvatar = async () => {
		avatarBusy = true;
		try {
			const res = await AvatarsService.removeMyAvatar();
			if (res.ok) {
				// Bump the version so the cached image is bypassed and
				// the fallback kicks in on the resulting 404.
				avatarVersion = new Date().toISOString();
				// Same as upload: invalidate every cached
				// `(userId, *)` entry so other components fall back
				// to initials immediately.
				if (profile) avatarStore.bumpUser(profile.user_id);
				toast({ title: 'Avatar removed', variant: 'success' });
			} else {
				toast({
					title: 'Could not remove avatar',
					description: res.error?.message,
					variant: 'destructive'
				});
			}
		} finally {
			avatarBusy = false;
		}
	};

	const themeOptions = [
		{ value: 'false', label: '☼ Light' },
		{ value: 'true', label: '☾ Dark' }
	];

	const promptOptions = [
		{ value: 'false', label: 'Off' },
		{ value: 'true', label: 'On' }
	];
</script>

<svelte:head>
	<title>My profile</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
	<header class="flex items-center gap-3">
		<UserIcon size={28} class="!stroke-2" />
		<h1>My profile</h1>
	</header>

	{#if loading}
		<Card.Root class="p-8">
			<p class="text-sm text-muted-foreground">Loading…</p>
		</Card.Root>
	{:else if profile}
		<Card.Root>
			<Card.Header>
				<Card.Title>Identity</Card.Title>
				<Card.Description>Read-only fields managed by your administrator.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<Label class="flex items-center gap-1.5"><UserIcon size={14} /> Name</Label>
					<Input value={profile.user_name} readonly />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label class="flex items-center gap-1.5"><UserIcon size={14} /> Username</Label>
					<Input value={profile.user_login} readonly />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label class="flex items-center gap-1.5"><MailIcon size={14} /> Email</Label>
					<Input value={profile.user_email} readonly />
				</div>
				<div class="flex flex-col gap-1.5">
					<Label class="flex items-center gap-1.5"><HashIcon size={14} /> #ID</Label>
					<Input value={String(profile.user_id)} readonly />
				</div>
				<div class="flex flex-col gap-1.5 md:col-span-2">
					<Label class="flex items-center gap-1.5"><FingerprintIcon size={14} /> #UUID</Label>
					<Input value={profile.uuid} readonly />
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Avatar</Card.Title>
				<Card.Description>
					Used wherever you appear in the app — comments, mentions, case contributors, alert
					assignments, the side bar profile menu.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
				<UserAvatar
					userId={profile.user_id}
					name={profile.user_name}
					updatedAt={avatarVersion}
					size="size-20"
					class="ring-2 ring-border/40"
				/>
				<div class="flex flex-col gap-2">
					<p class="text-sm text-muted-foreground">
						PNG, JPG, or WEBP up to 4 MB. Uploads are centre-cropped and resized to 256×256
						server-side, so non-square images are fine.
					</p>
					<div class="flex flex-wrap gap-2">
						<Button onclick={() => avatarInput?.click()} disabled={avatarBusy}>
							{avatarBusy ? 'Working…' : 'Upload new avatar'}
						</Button>
						<Button variant="outline" onclick={removeAvatar} disabled={avatarBusy}>
							Remove avatar
						</Button>
					</div>
					<!--
					  Hidden file input so the visible buttons own the
					  styling. Reset to '' inside the change handler so
					  re-picking the same file fires `change` again.
					-->
					<input
						bind:this={avatarInput}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/gif"
						class="hidden"
						onchange={onAvatarPicked}
					/>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>API key</Card.Title>
				<Card.Description>
					Use this key to authenticate API requests. Renewing immediately revokes the previous key.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-col gap-1.5">
					<Label class="flex items-center gap-1.5"><KeyRoundIcon size={14} /> Key</Label>
					<div class="flex items-stretch gap-2">
						<!--
						  Masked by default so a casual shoulder-glance / screen share
						  can't leak it. The eye button toggles a temporary reveal —
						  the real value still flows to the clipboard button so
						  users can paste it without ever displaying it.
						-->
						<div class="relative flex-1">
							<Input
								value={apiKeyVisible
									? (profile.user_api_key ?? '')
									: profile.user_api_key
										? '•'.repeat(40)
										: ''}
								readonly
								class="w-full pr-9 font-mono text-xs tracking-widest"
							/>
							<button
								type="button"
								class="absolute inset-y-0 right-2 inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
								aria-label={apiKeyVisible ? 'Hide API key' : 'Show API key'}
								aria-pressed={apiKeyVisible}
								onclick={() => (apiKeyVisible = !apiKeyVisible)}
							>
								{#if apiKeyVisible}
									<EyeOffIcon size={16} />
								{:else}
									<EyeIcon size={16} />
								{/if}
							</button>
						</div>
						<ClipboardCopy value={profile.user_api_key ?? ''} alwaysVisible />
						<Button variant="outline" onclick={renewApiKey} disabled={renewing}>
							<RefreshCcwIcon size={14} class="mr-1.5" />
							{renewing ? 'Renewing…' : 'Renew'}
						</Button>
					</div>
					<p class="mt-2 text-2xs text-muted-foreground">
						This is the legacy account-wide key. For MCP clients and CI scripts prefer a named,
						scope-restricted key from the
						<span class="font-medium">Named API keys</span> section below — it can be revoked without
						rotating this one.
					</p>
				</div>
			</Card.Content>
		</Card.Root>

		<ApiKeysCard />

		<Card.Root>
			<Card.Header>
				<Card.Title>Preferences</Card.Title>
				<Card.Description>Personal UI choices, saved to your account.</Card.Description>
			</Card.Header>
			<Card.Content class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label class="flex items-center gap-1.5">
						{#if profile.in_dark_mode}
							<MoonIcon size={14} />
						{:else}
							<SunIcon size={14} />
						{/if}
						IRIS theme
					</Label>
					<SegmentedSelect
						options={themeOptions}
						value={profile.in_dark_mode ? 'true' : 'false'}
						onChange={(value) => setTheme(value === 'true')}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label class="flex items-center gap-1.5">
						{#if profile.has_deletion_confirmation}
							<MessageSquareIcon size={14} />
						{:else}
							<MessageSquareOffIcon size={14} />
						{/if}
						Confirm before deleting
					</Label>
					<SegmentedSelect
						options={promptOptions}
						value={profile.has_deletion_confirmation ? 'true' : 'false'}
						onChange={(value) => setDeletionPrompt(value === 'true')}
					/>
				</div>

				<div class="flex flex-col gap-2 md:col-span-2">
					<Label class="flex items-center gap-1.5">
						<ListFilterIcon size={14} />
						Default alerts view
					</Label>
					<SearchableSelect
						items={alertsDefaultViewItems}
						bind:value={alertsDefaultViewValue}
						placeholder="Select a default view"
						searchPlaceholder="Search views..."
						emptyMessage="No views found."
						aria-label="Default alerts view"
						onValueChange={setAlertsDefaultView}
					/>
					{#if alertsDefaultViewValue === 'query'}
						<Input
							bind:value={alertsDefaultQuery}
							placeholder="is:open owner:me severity:>=High"
							aria-label="Default alerts search expression"
							onblur={saveAlertsDefaultQuery}
							onkeydown={(event: KeyboardEvent) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									void saveAlertsDefaultQuery();
								}
							}}
						/>
					{/if}
					<p class="text-2xs text-muted-foreground">
						Applied when you open Alerts from the side bar. Links that already carry filters — a
						bookmark, a shared URL, or the filter bar after you clear it — are left alone.
					</p>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Security</Card.Title>
				<Card.Description>
					{#if passwordLocked}
						Refresh your access if a group / permission was just changed.
					{:else}
						Refresh your access if a group / permission was just changed, or rotate your password.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={refreshPermissions} disabled={refreshingPerms}>
					<ShieldCheckIcon size={14} class="mr-1.5" />
					{refreshingPerms ? 'Refreshing…' : 'Refresh access'}
				</Button>

				{#if !passwordLocked}
					<Button onclick={() => (showChangePwd = true)}>
						<LockIcon size={14} class="mr-1.5" />
						Change password
					</Button>
				{:else}
					<p class="basis-full text-xs text-muted-foreground">
						Password changes are disabled in demo mode — the credentials for this instance are
						published and shared with every visitor.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<ChangePasswordDialog bind:open={showChangePwd} />
