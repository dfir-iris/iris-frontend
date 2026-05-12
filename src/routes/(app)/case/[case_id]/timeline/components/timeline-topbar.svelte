<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';

	type TimelineView = 'normal' | 'tree';

	type Props = {
		filter: string;
		compact: boolean;
		view: TimelineView;
		onRefresh: () => void;
		onAddEvent: () => void;
		onToggleView: () => void;
		onToggleCompact: () => void;
	};

	let {
		filter = $bindable(),
		compact,
		view,
		onRefresh,
		onAddEvent,
		onToggleView,
		onToggleCompact
	}: Props = $props();
</script>

<div class="flex items-center gap-2 bg-primary px-6 py-3">
	<Input bind:value={filter} placeholder="Filter timeline" class="h-8 max-w-72 text-xs" />

	<Button variant="secondary" size="sm">Apply filter</Button>

	<Button variant="secondary" size="sm" onclick={() => (filter = '')}>Reset</Button>

	<div class="ml-auto flex items-center gap-2">
		<Button variant="secondary" size="sm" onclick={onRefresh}>Refresh</Button>

		<Button variant="secondary" size="sm" onclick={onAddEvent}>Add event</Button>

		<Button variant="secondary" size="sm" onclick={onToggleView}>
			{view === 'normal' ? 'Tree view' : 'Normal view'}
		</Button>

		<Button variant="secondary" size="sm" onclick={onToggleCompact}>
			{compact ? 'Detailed' : 'Compact'}
		</Button>
	</div>
</div>
