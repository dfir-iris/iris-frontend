<script lang="ts">
	import Label from '$lib/components/ui/label/label.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { UserIcon } from 'lucide-svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { AuthService } from '$lib/services/auth.service';

	let isLoading = false;
	let error: string | null = null;
	let token = '';

	async function onSubmit() {
		error = null;
		isLoading = true;

		try {
			await AuthService.verifyMfa(token);

			const redirectTo = $page.url.searchParams.get('redirectTo') ?? '/';
			await goto(redirectTo, { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>MFA Verify | DFIR-IRIS</title>
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
		<h1 class="text-2xl font-semibold tracking-tight">Verify MFA</h1>

		{#if error}
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		{/if}

		<form class="flex flex-col gap-y-4" on:submit|preventDefault={onSubmit}>
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
				disabled={isLoading}
			>
				{isLoading ? 'Verifying…' : 'Submit'}
			</button>
		</form>
	</div>
</div>
