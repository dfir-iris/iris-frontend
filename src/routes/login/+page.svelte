<script lang="ts">
	import { env } from '$env/dynamic/public';
	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { EyeIcon, EyeOffIcon, UserIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { goto } from '$app/navigation';
	import { auth, type TokenInfo } from '$lib/stores/auth.store';
	import { enhance } from '$app/forms';
	import { AuthService, type AuthSettings, type LoginResponse } from '$lib/services/auth.service';
	import { page } from '$app/stores';

	let isLoading = false;
	let showPassword = false;
	let error: string | null = null;

	export let form: { error?: string } | null;
	export let data: {
		authSettings: AuthSettings | null;
		serverStatus: 'online' | 'offline';
		serverCheckMessage: string;
	};

	// Defensive default. The loader normally returns a populated
	// `authSettings`, but a stale client-side navigation or a future
	// loader regression could deliver `null`; treating that as
	// "local auth only" is the right fail-safe so the login form
	// still renders.
	const SAFE_AUTH_SETTINGS: AuthSettings = {
		oidc_enabled: false,
		mfa_enabled: false,
		local_fallback_enabled: true,
		demo_mode: false,
		demo_accounts: []
	};

	let { serverStatus, serverCheckMessage } = data;
	let authSettings: AuthSettings = data.authSettings ?? SAFE_AUTH_SETTINGS;

	let username = '';
	let password = '';

	const demoAccounts = authSettings.demo_accounts ?? [];
	let selectedDemoAccount = demoAccounts[0]?.username ?? '';

	const fillDemoAccount = (accountUsername: string) => {
		const account = demoAccounts.find((a) => a.username === accountUsername);
		if (!account) return;
		username = account.username;
		password = account.password;
	};

	// Pre-fill so a demo visitor can sign in with a single click.
	if (authSettings.demo_mode && selectedDemoAccount) {
		fillDemoAccount(selectedDemoAccount);
	}

	const getRedirectTo = (redirectTo?: string) =>
		redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : '';

	onMount(async () => {
		// When Flask's /oidc-authorize succeeds it redirects the browser
		// to /login?oidc=1 with a one-time OIDC-authenticated session
		// cookie. Trade that cookie for JWT access + refresh tokens
		// exactly once, then fall through to the normal post-login
		// routing (MFA gate, then the app root).
		if ($page.url.searchParams.get('oidc') === '1') {
			try {
				await AuthService.oidcExchange();
				// Strip the ?oidc=1 marker so a refresh of this page
				// doesn't attempt a second exchange (which would 403).
				const clean = new URL($page.url);
				clean.searchParams.delete('oidc');
				history.replaceState({}, '', clean.pathname + clean.search);
			} catch (e) {
				console.error('OIDC exchange failed:', e);
				error = 'SSO sign-in failed. Please try again.';
				auth.clearAuth();
			}
		}

		// `redirectOnFailure = true` makes `loadAuth` throw a SvelteKit
		// `redirect(302, '/login')` when there is no session. We are already on
		// /login, so that is the expected outcome for a first-time visitor —
		// not an error. Letting it propagate aborts `onMount` before the MFA
		// routing below runs and surfaces as an unhandled rejection.
		try {
			await auth.loadAuth(fetch, true);
		} catch {
			// No session. `loadAuth` has cleared auth state; fall through to
			// the checks below, which handle the signed-out case correctly.
		}

		// The refresh token is in an HttpOnly cookie and the access token is
		// only in memory (empty right after a reload), so neither can be
		// probed from here. A non-expired refresh window is what says "there
		// is still a session"; `loadAuth` above has already proven it by
		// getting a user back from /whoami.
		const hasValidTokens = !auth.isRefreshTokenExpired();

		if (auth.getMfaEnabled() && hasValidTokens) {
			if (!auth.getMfaSetupComplete()) {
				console.log('Redirecting to mfa-setup');
				await goto('/login/mfa-setup', { replaceState: true });
				return;
			}

			if (!auth.getMfaVerified()) {
				console.log('Redirecting to mfa-verify');
				await goto('/login/mfa-verify', { replaceState: true });
				return;
			}
		}

		// If already logged in via existing frontend tokens, leave login
		if (!auth.isRefreshTokenExpired() && auth.isAuthenticated()) {
			await goto('/', { replaceState: true });
			return;
		}

		return;
	});
</script>

<svelte:head>
	<title>Log In</title>
	{#if authSettings.demo_mode && env.PUBLIC_PLAUSIBLE_DOMAIN}
		<script
			defer
			data-domain={env.PUBLIC_PLAUSIBLE_DOMAIN}
			src="https://analytics.dfir-iris.org/js/plausible.js"
		></script>
	{/if}
</svelte:head>

<div
	class="container relative min-h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<!-- Branding -->
	<div
		class="relative hidden h-full flex-col bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#013479] to-[#011d40] p-10 text-white dark:border-r lg:flex"
	>
		<div class="hidden h-full flex-col items-center justify-center lg:flex">
			<div class="w-80">
				<img src="/img/logo/logo-white.png" alt="IRIS Logo" class="w-full" />
			</div>
		</div>
	</div>

	<!-- Sign in form -->
	<div class="mx-auto flex flex-col items-center space-y-6 sm:w-[350px] lg:p-8">
		<h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
		<p class="text-sm text-muted-foreground">Please login to continue using DFIR-IRIS.</p>

		<!-- Server status indicator -->
		{#if serverStatus === 'offline'}
			<Alert variant="destructive" class="text-sm">
				<AlertDescription class="flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span>{serverCheckMessage}</span>
					</div>
					<div class="text-xs">Please ensure the API server is running and accessible.</div>
				</AlertDescription>
			</Alert>
		{/if}

		{#if error || form?.error}
			<div class="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
				{error || form?.error}
			</div>
		{/if}

		{#if authSettings.demo_mode}
			<Alert class="text-sm">
				<AlertTitle>Demo instance</AlertTitle>
				<AlertDescription class="flex flex-col gap-2">
					<span>
						This is a shared demonstration instance. Pick an account below — the credentials are
						filled in for you.
					</span>
					{#if demoAccounts.length}
						<select
							class="w-full rounded-md border border-input bg-background p-2 text-sm"
							bind:value={selectedDemoAccount}
							onchange={() => fillDemoAccount(selectedDemoAccount)}
						>
							{#each demoAccounts as account (account.username)}
								<option value={account.username}>{account.username} — {account.role}</option>
							{/each}
						</select>
					{/if}
				</AlertDescription>
			</Alert>
		{/if}

		{#if authSettings.oidc_enabled}
			<a href="/oidc-login" class="w-full">
				<button class="w-full rounded-md bg-primary p-2 text-primary-foreground"
					>OIDC Sign In
				</button></a
			>
		{/if}

		{#if authSettings.oidc_enabled && authSettings.local_fallback_enabled}
			<div class="flex w-full items-center gap-3 text-xs uppercase text-muted-foreground">
				<div class="h-px flex-1 bg-border"></div>
				<span>or</span>
				<div class="h-px flex-1 bg-border"></div>
			</div>
		{/if}

		{#if !authSettings.oidc_enabled || authSettings.local_fallback_enabled}
			<form
				class="flex w-full flex-col gap-y-4"
				method="post"
				use:enhance={() => {
					error = null;
					isLoading = true;

					return async ({ result }) => {
						isLoading = false;

						if (result.type === 'success') {
							const { responseData, tokenInfo, redirectTo } = result.data as {
								responseData: LoginResponse;
								tokenInfo: TokenInfo;
								redirectTo: string;
							};

							// Source of truth for "is MFA required?" is the login
							// response itself (`mfa_required`) — it reflects the
							// current server policy at the moment we authenticated.
							// `authSettings.mfa_enabled` (from a separate
							// /authentication-settings call at page load) is the
							// fallback for older backends that don't yet return the
							// flag inline.
							const mfaRequired = responseData.mfa_required ?? authSettings.mfa_enabled;

							auth.setAuth(responseData, tokenInfo, mfaRequired);

							if (mfaRequired) {
								if (!responseData.mfa_setup_complete) {
									await goto(
										redirectTo
											? `/login/mfa-setup${getRedirectTo(redirectTo)}`
											: '/login/mfa-setup',
										{ replaceState: true }
									);
									return;
								}

								if (!auth.getMfaVerified()) {
									await goto(
										redirectTo
											? `/login/mfa-verify${getRedirectTo(redirectTo)}`
											: '/login/mfa-verify',
										{ replaceState: true }
									);
									return;
								}
							}

							await goto(redirectTo || '/', { replaceState: true });
							return;
						} else if (result.type === 'failure') {
							const { error: err } = result.data as { error: string };

							error = err;
						} else if (result.type === 'error') {
							error = result.error.message;
						}
					};
				}}
			>
				<!-- Username field -->
				<div class="group space-y-2">
					<Label for="username">Username</Label>
					<div class="relative">
						<Input
							id="username"
							type="text"
							name="username"
							required
							class="pr-10"
							bind:value={username}
						/>
						<UserIcon
							class="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
						/>
					</div>
				</div>

				<!-- Password field -->
				<div class="group space-y-2">
					<Label for="password">Password</Label>
					<div class="relative">
						<Input
							id="password"
							type={showPassword ? 'text' : 'password'}
							name="password"
							required
							class="pr-10"
							bind:value={password}
						/>

						<!-- Show/hide password -->
						<button
							type="button"
							class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
							onclick={() => (showPassword = !showPassword)}
						>
							{#if showPassword}
								<EyeOffIcon class="h-5 w-5" />
							{:else}
								<EyeIcon class="h-5 w-5" />
							{/if}
						</button>
					</div>
				</div>

				<button
					type="submit"
					class="w-full rounded-md bg-primary p-2 text-primary-foreground"
					disabled={isLoading}
				>
					{isLoading ? 'Logging in...' : 'Log in'}
				</button>
			</form>
		{/if}
	</div>
</div>
