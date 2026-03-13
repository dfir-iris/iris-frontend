<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { Loading } from '../loading';

	export let loading = false;
	export let variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' =
		'default';
	export let size: 'default' | 'sm' | 'lg' | 'icon' = 'default';
	export let className: string | undefined = undefined;
	let rest;
	$: ({ loading, variant, size, className, ...rest } = $$props);
</script>

<Button disabled={loading} {variant} {size} class={cn(className)} onclick {...rest}>
	{#if loading}
		<Loading size={12} />
	{/if}
	<slot />
</Button>
