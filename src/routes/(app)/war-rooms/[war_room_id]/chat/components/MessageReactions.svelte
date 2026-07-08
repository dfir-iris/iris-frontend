<!--
  Reactions strip under a chat message. Renders one pill per unique
  emoji with its running total; pills the current user reacted with
  get a highlighted ring. Clicking a pill toggles the user's own
  reaction on that emoji (via the shared backend toggle endpoint).

  A trailing `+` button opens the emoji picker in a popover — same
  toggle path with whatever emoji the user picks.

  The picker is loaded lazily on first open so the ~50KB
  `emoji-picker-element` bundle doesn't hit initial page paint on
  chats where nobody reacts. The web component is registered
  globally the first time we import it; subsequent instances mount
  synchronously.
-->
<script lang="ts">
	import { SmilePlusIcon } from 'lucide-svelte';
	import type { ChatReaction } from '$lib/services/war-room-chat.service';

	type Props = {
		reactions: ChatReaction[];
		currentUserId: number | null;
		onToggle: (emoji: string) => void;
	};

	let { reactions, currentUserId, onToggle }: Props = $props();

	let pickerOpen = $state(false);
	let pickerLoaded = $state(false);
	let pickerAnchor = $state<HTMLButtonElement | null>(null);

	const openPicker = async () => {
		if (!pickerLoaded) {
			// Lazy-import so the picker bundle only lands when a user
			// actually goes to react. First-open latency is ~100ms on
			// a warm cache; subsequent opens are synchronous.
			await import('emoji-picker-element');
			pickerLoaded = true;
		}
		pickerOpen = !pickerOpen;
	};

	const closePicker = () => {
		pickerOpen = false;
	};

	// The picker fires a `emoji-click` CustomEvent. We can't put the
	// listener directly in the Svelte template because the element
	// isn't a Svelte component — bind:this + $effect wires it once
	// the picker is in the DOM.
	let pickerEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!pickerEl) return;
		const handler = (ev: Event) => {
			// The event payload is `{ detail: { unicode, emoji, ... } }`
			const detail = (ev as CustomEvent).detail as {
				unicode?: string;
				emoji?: { unicode?: string };
			};
			const chosen = detail?.unicode ?? detail?.emoji?.unicode;
			if (chosen) {
				onToggle(chosen);
				closePicker();
			}
		};
		pickerEl.addEventListener('emoji-click', handler);
		return () => pickerEl?.removeEventListener('emoji-click', handler);
	});

	// Close the popover on any click outside the picker or the anchor.
	// The picker element and its shadow root count as "inside"; a click
	// on either the anchor button (which toggles the popover itself) or
	// the picker's own controls should NOT close it.
	$effect(() => {
		if (!pickerOpen) return;
		const onClick = (ev: MouseEvent) => {
			const target = ev.target as Node;
			if (
				pickerEl?.contains(target) ||
				pickerAnchor?.contains(target)
			) {
				return;
			}
			closePicker();
		};
		// Defer one tick so the click that opened the picker doesn't
		// immediately close it.
		const raf = requestAnimationFrame(() =>
			document.addEventListener('click', onClick)
		);
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('click', onClick);
		};
	});

	const isReactedByMe = (r: ChatReaction): boolean =>
		currentUserId != null && r.user_ids.includes(currentUserId);
</script>

<div class="mt-1 flex flex-wrap items-center gap-1">
	{#each reactions as r (r.emoji)}
		{@const mine = isReactedByMe(r)}
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors {mine
				? 'border-primary/60 bg-primary/15 text-primary hover:bg-primary/20'
				: 'border-border/60 bg-muted/40 text-foreground hover:bg-muted'}"
			onclick={() => onToggle(r.emoji)}
			title={`${r.count} ${r.count === 1 ? 'reaction' : 'reactions'}`}
		>
			<span class="text-sm leading-none">{r.emoji}</span>
			<span class="tabular-nums">{r.count}</span>
		</button>
	{/each}

	<div class="relative">
		<button
			type="button"
			bind:this={pickerAnchor}
			class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-border/50 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
			onclick={openPicker}
			aria-label="Add reaction"
			title="Add reaction"
		>
			<SmilePlusIcon class="h-3.5 w-3.5" />
		</button>

		{#if pickerOpen && pickerLoaded}
			<!--
			  Rendered adjacent to the anchor. `<emoji-picker>` is a
			  standalone web component — no framework binding, just an
			  `emoji-click` event we listen for above. Absolutely
			  positioned bottom-full so it doesn't push message
			  content down.
			-->
			<div class="absolute bottom-full left-0 z-50 mb-2 shadow-lg">
				<emoji-picker bind:this={pickerEl}></emoji-picker>
			</div>
		{/if}
	</div>
</div>

<style>
	/*
	  emoji-picker-element renders inside a shadow root, so most of its
	  styling is opt-in via CSS custom properties on the host element.
	  Tone down its default palette to sit closer to the app theme.
	*/
	:global(emoji-picker) {
		--background: hsl(var(--card));
		--border-color: hsl(var(--border));
		--input-border-color: hsl(var(--border));
		--indicator-color: hsl(var(--primary));
		--input-font-color: hsl(var(--foreground));
		--input-placeholder-color: hsl(var(--muted-foreground));
		--category-emoji-size: 1rem;
		--emoji-size: 1.1rem;
		--num-columns: 8;
		width: 320px;
		height: 380px;
	}
</style>
