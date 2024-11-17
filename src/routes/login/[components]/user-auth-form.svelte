<script lang="ts">
	import { Icons } from "$lib/components/ui/icons/index.js";
    import { LoadingButton } from "$lib/components/ui/loading-button";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { cn } from "$lib/utils.js";
    import { AuthService, type LoginCredentials } from '$lib/services/auth.service';


	let className: string | undefined | null = undefined;
	export { className as class };
    let showPassword = false;
    let username = "";
    let password = "";
    let error = "";

	let isLoading = false;
	async function onSubmit() {
		isLoading = true;

		setTimeout(() => {
			isLoading = false;
		}, 3000);
	}

    async function handleSubmit() {
        isLoading = true;
        error = "";
        
        try {
            const credentials: LoginCredentials = { username, password };
            const response = await AuthService.login(credentials);
            localStorage.setItem('token', response.token);
            window.location.href = '/';
        } catch (err) {
            console.error(err);
            error = 'Login failed. Please check your credentials.';
        } finally {
            isLoading = false;
        }
    }
</script>

<div class={cn("grid gap-6", className)} {...$$restProps}>
    <div class="flex flex-col space-y-2 text-center">
        <h1 class="text-2xl font-semibold tracking-tight">Login</h1>
        <p class="text-muted-foreground text-sm">
            Login
        </p>
    </div>
    {#if error}
        <div class="p-3 text-sm text-destructive bg-destructive/10 rounded-md text-center">
            {error}
        </div>
    {/if}
    <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div class="space-y-2">
          <Label for="username">Username</Label>
          <div class="relative">
            <Input
              id="username"
              type="text"
              bind:value={username}
              required
              class="pr-10"
            />
            <Icons.user
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5"
            />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="password">Password</Label>
          <div class="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
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
                <Icons.eye class="h-5 w-5" />
              {:else}
                <Icons.eye class="h-5 w-5" />
              {/if}
            </button>
          </div>
        </div>

        <LoadingButton 
            type="submit"
            loading={isLoading}
            class="w-full bg-[#0a1e47] hover:bg-[#152a5c]">
          Sign In
        </LoadingButton>
      </form>
      <p class="text-muted-foreground px-8 text-center text-sm">
        By clicking Sign In, you agree to DFIR-IRIS
        <a href="/terms" class="hover:text-primary underline underline-offset-4">
            Terms of Service
        </a>.
    </p>
	<!-- <div class="relative">
		<div class="absolute inset-0 flex items-center">
			<span class="w-full border-t" />
		</div>
		<div class="relative flex justify-center text-xs uppercase">
			<span class="bg-background text-muted-foreground px-2"> Or continue with </span>
		</div>
	</div> -->
</div>