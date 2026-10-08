<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import X from 'lucide-svelte/icons/x';
	import Minimize2 from 'lucide-svelte/icons/minimize-2';
	import Maximize2 from 'lucide-svelte/icons/maximize-2';
	import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
	import GraduationCap from 'lucide-svelte/icons/graduation-cap';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { tutorial } from '$lib/stores/tutorial.store.svelte';
	import { fillElement, findAnchor, findFirstAnchor } from '$lib/tutorials/dom';
	import { interpolate, normalisePath, parseInline } from '$lib/tutorials/logic';
	import type { TutorialFill } from '$lib/tutorials/types';

	/**
	 * Guided-tutorial chrome: a docked panel with the current step and a
	 * ring around the element the step is about. Neither blocks the page —
	 * the ring ignores the pointer and the panel is the only thing that
	 * takes clicks — so the user works on the real UI, dialogs included.
	 * `data-tutorial-ui` keeps dialogs open while the panel is used (see
	 * `dialog-content.svelte`).
	 *
	 * `?tutorial=<id>` on any app URL starts a tutorial (links in docs,
	 * the e2e suite).
	 */

	type Rect = { top: number; left: number; width: number; height: number };

	const RING_PADDING = 6;

	let target = $state<Rect | null>(null);
	let pathname = $state('');
	let scrolledFor = '';

	const run = $derived(tutorial.run);
	const current = $derived(tutorial.tutorial);
	const step = $derived(tutorial.step);
	const vars = $derived(tutorial.vars);
	const total = $derived(current?.steps.length ?? 0);
	const index = $derived(run?.step ?? 0);
	const isLast = $derived(index === total - 1);
	const segments = $derived(step ? parseInline(interpolate(step.body, vars)) : []);
	const goTo = $derived(step?.goTo ? interpolate(step.goTo, vars) : null);
	const showGoTo = $derived(
		!!goTo && !goTo.includes('{') && normalisePath(goTo) !== normalisePath(pathname)
	);
	// Keep the panel clear of a target sitting in the bottom-right corner.
	const dockLeft = $derived(
		!!target &&
			target.left + target.width > window.innerWidth - 440 &&
			target.top + target.height > window.innerHeight - 340
	);

	const sameRect = (a: Rect | null, b: Rect | null) =>
		a === b ||
		(!!a &&
			!!b &&
			a.top === b.top &&
			a.left === b.left &&
			a.width === b.width &&
			a.height === b.height);

	const locate = (): Element | null => {
		if (!step?.anchor) return null;
		const anchors = (Array.isArray(step.anchor) ? step.anchor : [step.anchor]).map((a) =>
			interpolate(a, vars)
		);
		return anchors.length > 1
			? findFirstAnchor(anchors)
			: findAnchor(anchors[0], { visibleOnly: true });
	};

	const tick = () => {
		pathname = window.location.pathname;
		tutorial.observe(pathname);
		const el = run ? locate() : null;
		let next: Rect | null = null;
		if (el) {
			const r = el.getBoundingClientRect();
			next = {
				top: Math.round(r.top) - RING_PADDING,
				left: Math.round(r.left) - RING_PADDING,
				width: Math.round(r.width) + RING_PADDING * 2,
				height: Math.round(r.height) + RING_PADDING * 2
			};
			const key = `${run?.tutorialId}:${index}`;
			if (scrolledFor !== key) {
				scrolledFor = key;
				el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		}
		if (!sameRect(target, next)) target = next;
	};

	onMount(() => {
		tutorial.hydrate();

		const requested = page.url.searchParams.get('tutorial');
		if (requested) {
			tutorial.start(requested);
			const url = new URL(page.url);
			url.searchParams.delete('tutorial');
			void goto(`${url.pathname}${url.search}${url.hash}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}

		let frame = requestAnimationFrame(function loop() {
			tick();
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	});

	const fill = (item: TutorialFill) => {
		const el = findAnchor(interpolate(item.anchor, vars));
		const value = typeof item.value === 'string' ? interpolate(item.value, vars) : item.value;
		if (!el || !fillElement(el, value)) {
			toast({
				title: `"${item.label}" is not on screen`,
				description: 'Open the form this step is about, then try again.',
				variant: 'warning'
			});
		}
	};

	const displayValue = (item: TutorialFill) =>
		typeof item.value === 'boolean' ? (item.value ? 'on' : 'off') : interpolate(item.value, vars);
</script>

{#if run && current && step}
	{#if target && !tutorial.minimised}
		<div
			aria-hidden="true"
			data-testid="tutorial-spotlight"
			class="pointer-events-none fixed z-[200] rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200 motion-safe:animate-pulse"
			style:top="{target.top}px"
			style:left="{target.left}px"
			style:width="{target.width}px"
			style:height="{target.height}px"
		></div>
	{/if}

	<section
		data-tutorial-ui
		data-testid="tutorial-panel"
		aria-label="Tutorial: {current.title}"
		aria-live="polite"
		class="shadow-elevation-3 pointer-events-auto fixed bottom-4 z-[210] w-[min(400px,calc(100vw-2rem))] rounded-xl border border-border/60 bg-card text-card-foreground"
		class:right-4={!dockLeft}
		class:left-4={dockLeft}
	>
		<header class="flex items-center gap-2 px-4 pt-3">
			<GraduationCap class="size-4 shrink-0 text-primary" />
			<span class="min-w-0 grow truncate text-xs font-medium text-muted-foreground">
				{current.title} · {index + 1}/{total}
			</span>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				aria-label={tutorial.minimised ? 'Expand tutorial' : 'Minimise tutorial'}
				onclick={() => (tutorial.minimised = !tutorial.minimised)}
			>
				{#if tutorial.minimised}<Maximize2 />{:else}<Minimize2 />{/if}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				aria-label="Exit tutorial"
				data-testid="tutorial-exit"
				onclick={() => tutorial.exit()}
			>
				<X />
			</Button>
		</header>

		<div class="mx-4 mt-2 h-1 overflow-hidden rounded-full bg-muted">
			<div
				class="h-full bg-primary transition-all duration-300"
				style:width="{((index + 1) / total) * 100}%"
			></div>
		</div>

		{#if !tutorial.minimised}
			<div class="space-y-3 px-4 pb-4 pt-3">
				<h2 class="text-sm font-semibold" data-testid="tutorial-step-title">{step.title}</h2>
				<p class="text-sm leading-relaxed text-muted-foreground">
					{#each segments as segment, i (i)}
						{#if segment.kind === 'strong'}
							<strong class="font-semibold text-foreground">{segment.text}</strong>
						{:else if segment.kind === 'code'}
							<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
								>{segment.text}</code
							>
						{:else}
							{segment.text}
						{/if}
					{/each}
				</p>

				{#if step.fills?.length}
					<ul class="space-y-1.5">
						{#each step.fills as item (item.anchor)}
							<li class="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
								<div class="min-w-0 grow">
									<div class="text-xs text-muted-foreground">{item.label}</div>
									<code class="block truncate font-mono text-xs">{displayValue(item)}</code>
								</div>
								<Button
									variant="outline"
									size="xs"
									data-testid="tutorial-fill-{item.anchor}"
									onclick={() => fill(item)}
								>
									<WandSparkles />
									Fill
								</Button>
							</li>
						{/each}
					</ul>
				{/if}

				<footer class="flex items-center gap-2 pt-1">
					{#if showGoTo && goTo}
						<Button
							variant="link"
							size="sm"
							class="px-0"
							data-testid="tutorial-go-to"
							onclick={() => goto(goTo)}
						>
							Take me there
						</Button>
					{/if}
					<span class="grow"></span>
					{#if index > 0 && !step.waitFor}
						<Button variant="ghost" size="sm" onclick={() => tutorial.back()}>Back</Button>
					{/if}
					{#if step.waitFor}
						<span
							class="flex items-center gap-2 text-xs text-muted-foreground"
							data-testid="tutorial-waiting"
						>
							<span class="size-2 rounded-full bg-primary motion-safe:animate-pulse"></span>
							Waiting for you…
						</span>
					{:else}
						<Button size="sm" data-testid="tutorial-next" onclick={() => tutorial.next()}>
							{isLast ? 'Finish' : 'Next'}
						</Button>
					{/if}
				</footer>
			</div>
		{:else}
			<div class="h-3"></div>
		{/if}
	</section>
{/if}
