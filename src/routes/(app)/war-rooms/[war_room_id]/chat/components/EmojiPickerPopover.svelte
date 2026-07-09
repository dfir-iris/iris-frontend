<!--
  Standalone popover wrapper around <emoji-picker>.

  Externally controlled: the caller decides when to open/close via
  `open` + `onOpenChange`. Positions itself absolutely relative to
  its offset parent, so the caller is responsible for wrapping the
  trigger + this component in a `position: relative` container.

  Loads the picker bundle lazily on first open. The web component is
  registered globally after the first import, so subsequent instances
  mount synchronously.
-->
<script lang="ts">
	type Props = {
		open: boolean;
		onOpenChange: (v: boolean) => void;
		/** Emoji chosen by the user (unicode). */
		onPick: (emoji: string) => void;
		/**
		 * Element that toggles this popover. Clicks inside it are
		 * ignored by the outside-click handler so the trigger's own
		 * onclick doesn't fight this component's dismiss logic.
		 */
		anchor?: HTMLElement | null;
	};

	let { open, onOpenChange, onPick, anchor }: Props = $props();

	let pickerLoaded = $state(false);

	// Kick off the lazy import whenever the popover is asked to open
	// and hasn't been loaded yet. Doing this in an effect (rather
	// than at construction) means chats with no reactions never pay
	// the ~50KB bundle cost.
	$effect(() => {
		if (open && !pickerLoaded) {
			void import('emoji-picker-element').then(() => {
				pickerLoaded = true;
			});
		}
	});

	let pickerEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (!pickerEl) return;
		const handler = (ev: Event) => {
			const detail = (ev as CustomEvent).detail as {
				unicode?: string;
				emoji?: { unicode?: string };
			};
			const chosen = detail?.unicode ?? detail?.emoji?.unicode;
			if (chosen) {
				onPick(chosen);
				onOpenChange(false);
			}
		};
		pickerEl.addEventListener('emoji-click', handler);
		return () => pickerEl?.removeEventListener('emoji-click', handler);
	});

	$effect(() => {
		if (!open) return;
		const onClick = (ev: MouseEvent) => {
			const target = ev.target as Node;
			if (pickerEl?.contains(target) || anchor?.contains(target)) return;
			onOpenChange(false);
		};
		// Defer one frame so the click that opened the popover doesn't
		// immediately close it.
		const raf = requestAnimationFrame(() =>
			document.addEventListener('click', onClick)
		);
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener('click', onClick);
		};
	});
</script>

{#if open && pickerLoaded}
	<!--
	  `data-source` overrides the library's default of jsdelivr.net
	  (blocked by our CSP `connect-src 'self'`). The JSON file lives
	  in /static/emoji/ and ships with the bundle, so the picker
	  fetches from same-origin. The library caches it in IndexedDB
	  on first load — subsequent opens are effectively free.
	-->
	<div class="absolute bottom-full right-0 z-50 mb-2 shadow-lg">
		<emoji-picker bind:this={pickerEl} data-source="/emoji/data.json"></emoji-picker>
	</div>
{/if}

<style>
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
