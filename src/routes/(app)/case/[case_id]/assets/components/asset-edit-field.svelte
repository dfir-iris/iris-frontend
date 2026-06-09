<script lang="ts">
	import { ServerIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';

	type IconComponent = typeof ServerIcon;

	type Props = {
		label: string;
		field: string;
		value?: string | number;
		Icon: IconComponent;
		placeholder?: string;
		onChange: (field: string, value: string) => void;
	};

	let { label, field, value = '', Icon, placeholder = '', onChange }: Props = $props();
</script>

<div class="rounded-lg bg-card/40 p-4">
	<div class="flex items-start gap-3">
		<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
			<Icon class="h-4 w-4" />
		</div>

		<div class="min-w-0 flex-1">
			<p class="text-sm font-medium text-muted-foreground">{label}</p>

			<Input
				{value}
				{placeholder}
				class="mt-1"
				onchange={(e) => onChange(field, (e.target as HTMLInputElement).value)}
			/>
		</div>
	</div>
</div>
