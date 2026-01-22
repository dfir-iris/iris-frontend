<script lang="ts">
	export let collapsed: boolean;
	export let label: string;

	export let href: string | null = null;
	export let target: string | null = null;
	export let onClick: (() => void | Promise<void>) | null = null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export let icon: any | null = null;
	export let iconSize: number = 18;

	export let liClass = '';
</script>

<li class={`my-1 flex w-full ${liClass}`}>
	{#if href}
		<a class="flex w-full items-center" {href} {target}>
			{#if icon}
				<svelte:component this={icon} size={iconSize} />
			{/if}
			<span
				class={`ml-2 overflow-hidden whitespace-nowrap transition-all ${collapsed ? 'max-w-0' : 'max-w-96'}`}
			>
				{label}
			</span>
		</a>
	{:else}
		<button class="flex w-full items-center" on:click={() => onClick?.()}>
			{#if icon}
				<svelte:component this={icon} size={iconSize} />
			{/if}
			<span
				class={`ml-2 overflow-hidden whitespace-nowrap transition-all ${collapsed ? 'max-w-0' : 'max-w-96'}`}
			>
				{label}
			</span>
		</button>
	{/if}
</li>
