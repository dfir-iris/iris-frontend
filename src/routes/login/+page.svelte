<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { EyeIcon, EyeOffIcon, UserIcon } from 'lucide-svelte';
	import { LoadingButton } from '$lib/components/ui/loading-button';
	import { enhance } from '$app/forms';

	const { form } = $props();

	const error = null;

	let isLoading = $state(false);
	let showPassword = $state(false);
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

		<form method="POST" class="flex w-full flex-col gap-y-4" use:enhance>
			<!-- Error alert -->
			{#if form?.error}
				<ErrorAlert>{form.error}</ErrorAlert>
			{/if}

			<!-- Username field -->
			<div class="group space-y-2">
				<Label for="username">Username</Label>
				<div class="relative">
					<Input
						id="username"
						type="text"
						name="username"
						value={form?.username}
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

			<LoadingButton type="submit" loading={isLoading} class="w-full">Log In</LoadingButton>
		</form>
	</div>
</div>
