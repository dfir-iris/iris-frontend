<!--
  Thinking indicator — a shimmer bar that plays under the assistant
  avatar while the model is running but no text has streamed yet.

  Two situations trigger it:
    1. Initial latency after `send` — the request is in flight but the
       provider hasn't emitted its first text delta.
    2. Between a tool_result and the next TextDelta — the model is
       reasoning on the tool output.

  Kept as CSS-only (no JS animation loop) so it costs nothing when
  offscreen. Uses the existing `--muted` + `--muted-foreground` design
  tokens for light/dark parity.
-->
<script lang="ts">
	let { label = 'Yuki is thinking' }: { label?: string } = $props();
</script>

<div class="flex gap-2 text-xs" aria-live="polite">
	<div
		class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
	>
		<!-- Empty avatar circle. The sparkle icon lives in the header,
		     using it here would compete with the shimmer for attention. -->
	</div>
	<div class="flex min-w-[220px] max-w-[80%] flex-col gap-1.5 rounded-md bg-muted px-3 py-2">
		<span class="text-2xs italic text-muted-foreground">{label}…</span>
		<div class="shimmer-bar" aria-hidden="true"></div>
	</div>
</div>

<style>
	/* A 100%-wide gradient stripe that translates left→right forever.
	   `background-size: 200%` puts the transparent tails outside the
	   visible area at each end so the animation never shows a hard
	   edge. `background-clip: padding-box` isn't needed — the bar has
	   no border. */
	.shimmer-bar {
		height: 6px;
		width: 100%;
		border-radius: 3px;
		background: linear-gradient(
			90deg,
			hsl(var(--muted-foreground) / 0.08) 0%,
			hsl(var(--muted-foreground) / 0.28) 50%,
			hsl(var(--muted-foreground) / 0.08) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
</style>
