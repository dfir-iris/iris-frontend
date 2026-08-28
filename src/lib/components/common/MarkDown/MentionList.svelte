<script lang="ts">
	import {
		UserIcon,
		BoxIcon,
		ShieldAlertIcon,
		FileTextIcon,
		ClipboardListIcon,
		DatabaseIcon,
		UsersIcon
	} from 'lucide-svelte';

	export type MentionKind = 'user' | 'team' | 'asset' | 'ioc' | 'note' | 'task' | 'datastore';

	export type MentionItem = {
		id: number | string;
		label: string;
		sublabel?: string;
		kind: MentionKind;
	};

	const iconFor = (kind: MentionKind) => {
		if (kind === 'team') return UsersIcon;
		if (kind === 'asset') return BoxIcon;
		if (kind === 'ioc') return ShieldAlertIcon;
		if (kind === 'note') return FileTextIcon;
		if (kind === 'task') return ClipboardListIcon;
		if (kind === 'datastore') return DatabaseIcon;
		return UserIcon;
	};

	let { items, selectedIndex, onSelect } = $props<{
		items: MentionItem[];
		selectedIndex: number;
		onSelect: (item: MentionItem) => void;
	}>();
</script>

<div
	class="z-50 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm shadow-md"
>
	{#if items.length === 0}
		<div class="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>
	{:else}
		{#each items as item, i (item.kind + ':' + item.id)}
			{@const Icon = iconFor(item.kind)}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors {i ===
				selectedIndex
					? 'bg-accent text-accent-foreground'
					: 'hover:bg-accent/60'}"
				onclick={() => onSelect(item)}
			>
				<Icon size="12" class="shrink-0 text-muted-foreground" />
				<span class="flex flex-col overflow-hidden">
					<span class="truncate font-medium">{item.label}</span>
					{#if item.sublabel}
						<span class="truncate text-2xs text-muted-foreground">{item.sublabel}</span>
					{/if}
				</span>
			</button>
		{/each}
	{/if}
</div>
