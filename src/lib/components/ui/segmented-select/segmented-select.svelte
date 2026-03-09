<script lang="ts">
	export type SegmentedSelectOption = {
		value: string | number;
		label: string;
	};

	type Props = {
		options: SegmentedSelectOption[];
		value?: string | number | null;
		onChange?: (value: string | number) => void;
		class?: string;
	};

	let { options, value = null, onChange, class: className = '' }: Props = $props();
</script>

<div class={`flex flex-wrap ${className}`}>
	{#each options as option}
		<button
			type="button"
			class={`border px-4 py-2 text-sm first:rounded-l last:rounded-r ${
				value === option.value
					? 'border-primary bg-accent text-foreground'
					: 'border-input bg-background text-muted-foreground hover:bg-accent'
			}`}
			onclick={() => onChange?.(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>
