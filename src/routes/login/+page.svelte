<script lang="ts">
	import UserAuthForm from "./[components]/user-auth-form.svelte";
	import { Button } from "$lib/components/ui/button/index.js";
</script>

<div
	class="container relative flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 min-h-screen"
>
	<div class="relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#013479] to-[#011d40]">
        <div class="hidden lg:flex flex-col items-center justify-center h-full">
            <div class="w-80">
              <img src="/logo/logo-white.png" alt="IRIS Logo" class="w-full" />
            </div>
        </div>
	</div>
	<div class="lg:p-8">
		<div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
			<UserAuthForm />
		</div>
	</div>
</div>