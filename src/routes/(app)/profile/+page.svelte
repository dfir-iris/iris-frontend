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
	import { onMount } from 'svelte';
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
		MessageSquareIcon
	} from 'lucide-svelte';
	import { setMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import SegmentedSelect from '$lib/components/ui/segmented-select/segmented-select.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { ProfileService, type Profile } from '$lib/services/profile.service';
	import ChangePasswordDialog from './components/ChangePasswordDialog.svelte';

	let profile = $state<Profile | null>(null);
	let loading = $state(true);
	let renewing = $state(false);
	let refreshingPerms = $state(false);
	let showChangePwd = $state(false);
	let apiKeyVisible = $state(false);

	const load = async () => {
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
		if (
			!confirm(
				'Are you sure? The current API key will be revoked and cannot be used anymore.'
			)
		)
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
	<title>My profile | DFIR-IRIS</title>
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
				<Card.Title>API key</Card.Title>
				<Card.Description>
					Use this key to authenticate API requests. Renewing immediately revokes the previous
					key.
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
				</div>
			</Card.Content>
		</Card.Root>

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
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Security</Card.Title>
				<Card.Description>
					Refresh your access if a group / permission was just changed, or rotate your password.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={refreshPermissions} disabled={refreshingPerms}>
					<ShieldCheckIcon size={14} class="mr-1.5" />
					{refreshingPerms ? 'Refreshing…' : 'Refresh access'}
				</Button>

				<Button onclick={() => (showChangePwd = true)}>
					<LockIcon size={14} class="mr-1.5" />
					Change password
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<ChangePasswordDialog bind:open={showChangePwd} />
