<!-- Compact single-choice button group. -->
<script lang="ts" module>
	// Lets ESLint's `no-undef` see the name; the real `T` comes from the
	// `generics` attribute below (same shim as TaskKanbanBoard.svelte).
	type T = string;
</script>

<script lang="ts" generics="T extends string">
	type Props = {
		options: { value: T; label: string; title?: string }[];
		value: T;
		onChange?: (value: T) => void;
		ariaLabel?: string;
	};

	let { options, value = $bindable(), onChange, ariaLabel }: Props = $props();
</script>

<div class="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label={ariaLabel}>
	{#each options as option (option.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === option.value}
			title={option.title}
			class={`h-[26px] rounded px-2.5 text-xs transition-colors ${
				value === option.value
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'
			}`}
			onclick={() => {
				value = option.value;
				onChange?.(option.value);
			}}
		>
			{option.label}
		</button>
	{/each}
</div>
