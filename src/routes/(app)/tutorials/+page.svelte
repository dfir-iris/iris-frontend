<!--
	Guided tutorials catalogue. Starting one opens the tutorial panel
	(TutorialOverlay, mounted in the app layout); the steps then run on
	the real pages. Completion comes from the `tutorials` user preference.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import GraduationCap from 'lucide-svelte/icons/graduation-cap';
	import CircleCheck from 'lucide-svelte/icons/circle-check';
	import { Button } from '$lib/components/ui/button';
	import { tutorial } from '$lib/stores/tutorial.store.svelte';
	import { TUTORIALS } from '$lib/tutorials';

	onMount(() => {
		void tutorial.loadCompleted();
	});
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
	<div>
		<h1 class="flex items-center gap-2 text-lg font-semibold">
			<GraduationCap class="size-5 text-primary" /> Tutorials
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Step-by-step walkthroughs that run on this instance. You do every step yourself on the real
			pages; a panel explains what to do and moves on once it's done. They create real data, so use
			a test customer.
		</p>
	</div>

	<ul class="flex flex-col gap-3">
		{#each TUTORIALS as item (item.id)}
			{@const completedAt = tutorial.completed[item.id]}
			{@const running = tutorial.run?.tutorialId === item.id}
			<li
				class="flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4"
				data-testid="tutorial-card-{item.id}"
			>
				<div class="min-w-0 grow">
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold">{item.title}</h2>
						{#if completedAt}
							<span
								class="flex items-center gap-1 text-xs text-muted-foreground"
								title={new Date(completedAt).toLocaleString()}
							>
								<CircleCheck class="size-3.5 text-primary" /> Completed
							</span>
						{/if}
					</div>
					<p class="mt-1 text-sm text-muted-foreground">{item.summary}</p>
					<p class="mt-2 text-xs text-muted-foreground">
						{item.steps.length} steps · {item.duration}
					</p>
				</div>
				<Button
					size="sm"
					variant={completedAt ? 'outline' : 'default'}
					disabled={running}
					data-testid="tutorial-start-{item.id}"
					onclick={() => tutorial.start(item.id)}
				>
					{running ? 'In progress' : completedAt ? 'Start again' : 'Start'}
				</Button>
			</li>
		{/each}
	</ul>
</div>
