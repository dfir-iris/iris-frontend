<script lang="ts">
	import { get } from 'svelte/store';

	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { EyeIcon, EyeOffIcon, UserIcon } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.store';
	import { page } from '$app/stores';
	import { AuthService, type LoginResponse } from '$lib/services/auth.service';

	import * as OTPAuth from 'otpauth';
	import * as QRCode from 'qrcode';

	let isLoading = false;
	let showPassword = false;
	let error: string | null = null;
	let success: string | null = null;

	let password = '';
	let token = '';

	let mfaSecret = '';
	let otpUri = '';
	let qrDataUrl = '';

	const MFA_SECRET_KEY = 'iris_mfa_secret_pending';

	async function buildMfaArtifacts(user: LoginResponse) {
		const issuer = 'IRIS';

		error = null;
		success = null;

		const label = user.user_email;

		const existing = localStorage.getItem(MFA_SECRET_KEY);
		if (existing && existing.length > 0) {
			mfaSecret = existing;
		} else {
			const secret = new OTPAuth.Secret();
			mfaSecret = secret.base32;
			localStorage.setItem(MFA_SECRET_KEY, mfaSecret);
		}

		const secretObj = OTPAuth.Secret.fromBase32(mfaSecret);

		const totp = new OTPAuth.TOTP({
			issuer,
			label,
			secret: secretObj
		});

		otpUri = totp.toString();

		qrDataUrl = await QRCode.toDataURL(otpUri, {
			type: 'image/png',
			errorCorrectionLevel: 'M',
			margin: 1,
			scale: 6
		});
	}

	function validateTotp(code: string): boolean {
		if (!mfaSecret) return false;

		const clean = code.replace(/\s+/g, '');
		if (!/^\d{6}$/.test(clean)) return false;

		const secretObj = OTPAuth.Secret.fromBase32(mfaSecret);

		const totp = new OTPAuth.TOTP({
			algorithm: 'SHA1',
			digits: 6,
			period: 30,
			secret: secretObj
		});

		const delta = totp.validate({ token: clean, window: 1 });
		return delta !== null;
	}

	async function onSubmit() {
		error = null;
		success = null;
		isLoading = true;

		try {
			if (!validateTotp(token)) {
				throw new Error('Invalid token. Check authenticator time and try again.');
			}

			// A2: persist secret + setup_complete via API
			await AuthService.setupMfa(password, token, mfaSecret);

			// secret no longer needed client-side after setup step
			localStorage.removeItem(MFA_SECRET_KEY);

			success = 'MFA setup complete.';

			const redirectTo = $page.url.searchParams.get('redirectTo');
			await goto(
				redirectTo
					? `/login/mfa-verify?redirectTo=${encodeURIComponent(redirectTo)}`
					: '/login/mfa-verify',
				{ replaceState: true }
			);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}

	onMount(async () => {
		// Accept the partial-auth state: the login response set tokens +
		// user in the store, but on a hard refresh of this page the user
		// may not be hydrated yet. If tokens are present and still valid,
		// pull the profile via whoami before bouncing back to /login.
		let user = get(auth).user;

		// No access token is in memory after a hard refresh of this page, so
		// the refresh window is the only usable signal that a session exists.
		if (!user && !auth.isRefreshTokenExpired()) {
			try {
				user = await auth.loadAuth(fetch);
			} catch {
				user = null;
			}
		}

		if (user) {
			buildMfaArtifacts(user).catch((e: unknown) => {
				error = e instanceof Error ? e.message : String(e);
			});
			return;
		}

		const redirectTo = $page.url.searchParams.get('redirectTo');
		goto(redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login', {
			replaceState: true
		});
	});
</script>

<svelte:head>
	<title>MFA Setup</title>
</svelte:head>

<div
	class="container relative min-h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0"
>
	<div
		class="relative hidden h-full flex-col bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#013479] to-[#011d40] p-10 text-white dark:border-r lg:flex"
	>
		<div class="hidden h-full flex-col items-center justify-center lg:flex">
			<h1 class="mb-3 text-2xl text-white">Setup MFA</h1>
			<!-- QR -->
			<div class="w-full space-y-2">
				{#if qrDataUrl}
					<div class="flex justify-center rounded-md border p-3">
						<img src={qrDataUrl} alt="MFA QR code" class="h-72 w-72" />
					</div>

					<div class="space-y-1 text-center text-sm">{mfaSecret}</div>
				{:else}
					<div class="rounded-md border p-3 text-sm text-muted-foreground">Generating QR…</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Content -->
	<div class="mx-auto flex flex-col items-center space-y-6 sm:w-[350px] lg:p-8">
		<h1 class="text-2xl font-semibold tracking-tight">Your Organisation requires to setup MFA</h1>
		<p class="text-sm text-muted-foreground">
			Scan the QR code with your authenticator app and enter the 6-digit token and your password.
		</p>

		{#if error}
			<Alert variant="destructive" class="w-full">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		{/if}

		{#if success}
			<Alert class="w-full">
				<AlertDescription>{success}</AlertDescription>
			</Alert>
		{/if}

		<!-- Setup form -->
		<form class="flex w-full flex-col gap-y-4" on:submit|preventDefault={onSubmit}>
			<!-- Password field -->
			<div class="group space-y-2">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input
						id="password"
						type={showPassword ? 'text' : 'password'}
						name="password"
						bind:value={password}
						required
						class="pr-10"
					/>

					<button
						type="button"
						class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						on:click={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOffIcon class="h-5 w-5" />
						{:else}
							<EyeIcon class="h-5 w-5" />
						{/if}
					</button>
				</div>
			</div>

			<!-- Token field -->
			<div class="group space-y-2">
				<Label for="token">Token</Label>
				<div class="relative">
					<Input id="token" type="text" name="token" bind:value={token} required class="pr-10" />
					<UserIcon
						class="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
					/>
				</div>
			</div>

			<button
				type="submit"
				class="w-full rounded-md bg-primary p-2 text-primary-foreground"
				disabled={isLoading || !qrDataUrl}
			>
				{isLoading ? 'Setting up…' : 'Submit'}
			</button>
		</form>
	</div>
</div>
