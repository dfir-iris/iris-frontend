<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { EyeIcon, EyeOffIcon, UserIcon, RefreshCcwIcon } from 'lucide-svelte';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { enhance } from '$app/forms';
	import { isServerReachable } from '$lib/utils/server-health';
	import { API_BASE_URL } from '$lib/config/api.config';
	import { onMount } from 'svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { AuthService } from '$lib/services/auth.service';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.store';

	let isLoading = false;
	let showPassword = false;
	let serverStatus: 'checking' | 'online' | 'offline' = 'checking';
	let serverCheckMessage = 'Checking server connectivity...';
	let error: string | null = null;

	// Check server health on mount
	onMount(async () => {
		await checkServerHealth();
		// Check if the user is already logged in
		if (auth.isRefreshTokenExpired()) {
			// Redirect to login page if the refresh token is expired
			goto('/login');
		} else {
			// Redirect to dashboard if the user is already logged in
			goto('/');
		}
	});

	async function checkServerHealth() {
		serverStatus = 'checking';
		serverCheckMessage = 'Checking server connectivity...';
		
		const isReachable = await isServerReachable();
		serverStatus = isReachable ? 'online' : 'offline';
		
		if (isReachable) {
			serverCheckMessage = `Server is online at ${API_BASE_URL}`;
		} else {
			serverCheckMessage = `Cannot connect to server at ${API_BASE_URL}`;
		}
	}

	async function handleLogin(event: SubmitEvent) {
		event.preventDefault();
		isLoading = true;
		error = null;

		try {
			const formData = new FormData(event.currentTarget as HTMLFormElement);
			const username = formData.get('username') as string;
			const password = formData.get('password') as string;

			if (!AuthService || typeof AuthService.login !== 'function') {
				console.error('Auth service or login method is not available', AuthService);
				error = 'Authentication service unavailable';
				isLoading = false;
				return;
			}

			const response = await AuthService.login({ username, password });
			
			// Check if we need to redirect
			if (response && response.success) {
				// Get redirect URL from query params or default to dashboard
				const urlParams = new URLSearchParams(window.location.search);
				const redirectUrl = urlParams.get('redirect') || '/';
				
				// Redirect to the appropriate page
				goto(redirectUrl);
			}
			
		} catch (err: any) {
			console.error('Login error:', err);
			error = err.message || 'Authentication failed. Please check your credentials.';
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Log In | DFIR-IRIS</title>
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
				<img src="/logo/logo-white.png" alt="IRIS Logo" class="w-full" />
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
					<div class="flex justify-between items-center">
						<span>{serverCheckMessage}</span>
						<button 
							class="p-1 rounded-full hover:bg-background/20" 
							onclick={checkServerHealth}
							type="button"
						>
							<RefreshCcwIcon class="h-4 w-4" />
						</button>
					</div>
					<div class="text-xs">
						Please ensure the API server is running and accessible.
					</div>
				</AlertDescription>
			</Alert>
		{/if}

		{#if error}
			<div class="bg-destructive/15 text-destructive p-4 rounded-md text-sm">
				{error}
			</div>
		{/if}

		<form class="flex w-full flex-col gap-y-4" onsubmit={handleLogin}>
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
	</div>
</div>
