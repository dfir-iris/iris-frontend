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
	export let active: boolean = false;

	const baseClass = 'flex items-center py-2 px-3 rounded-lg text-[13px] font-medium transition-all duration-150';
	const inactiveClass = 'text-sidebar-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground';
	const activeClass = 'bg-iris-blue text-white shadow-sm';
</script>

<li class={`my-1 flex w-full justify-center ${liClass}`}>
	{#if href}
		<a
			class={`${baseClass} ${active ? activeClass : inactiveClass} ${collapsed ? 'w-auto' : 'w-full'}`}
			{href}
			{target}
		>
			{#if icon}
				<svelte:component this={icon} size={iconSize} />
			{/if}

			<span
				class={`overflow-hidden whitespace-nowrap transition-all ${collapsed ? 'ml-0 max-w-0' : 'ml-2 max-w-96'}`}
			>
				{label}
			</span>
		</a>
	{:else}
		<button class={`${baseClass} ${collapsed ? 'w-auto' : 'w-full'}`} on:click={() => onClick?.()}>
			{#if icon}
				<svelte:component this={icon} size={iconSize} />
			{/if}

			<span
				class={`overflow-hidden whitespace-nowrap transition-all ${collapsed ? 'ml-0 max-w-0' : 'ml-2 max-w-96'}`}
			>
				{label}
			</span>
		</button>
	{/if}
</li>
