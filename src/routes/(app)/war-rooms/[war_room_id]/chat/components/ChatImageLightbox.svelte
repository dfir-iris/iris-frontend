<!--
  Full-viewport lightbox for a war-room datastore image. The datastore
  content endpoint is bearer-authenticated so we can't just navigate
  the browser to it (that's the "403 authentication required" the
  operator saw when clicking through). Instead we fetch the bytes
  through `WarRoomDatastoreService.fetchFileBlobUrl` — which attaches
  the token — and render an `<img>` off the resulting object URL.

  Interactions: wheel to zoom around the pointer, drag to pan when
  zoomed, double-click to fit / reset, Esc to close. Zoom is clamped
  to [1, 8].
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Download, Maximize2, ZoomIn, ZoomOut } from 'lucide-svelte';
	import { WarRoomDatastoreService } from '$lib/services/war-room-datastore.service';

	type Props = {
		open: boolean;
		warRoomId: number;
		fileId: number;
		filename: string;
		onOpenChange: (v: boolean) => void;
	};
	let { open, warRoomId, fileId, filename, onOpenChange }: Props = $props();

	let blobUrl = $state<string | null>(null);
	let failed = $state(false);
	let currentUrl: string | null = null;

	// Transform state — CSS transform values applied to the <img>.
	let scale = $state(1);
	let tx = $state(0);
	let ty = $state(0);

	// Fetch/reset on open toggle. Skipped when the dialog is closed so
	// we don't pre-fetch large images.
	$effect(() => {
		if (!open) {
			// Reset zoom when closing so a re-open starts fitted.
			scale = 1;
			tx = 0;
			ty = 0;
			return;
		}
		const id = fileId;
		const room = warRoomId;
		let cancelled = false;
		(async () => {
			const url = await WarRoomDatastoreService.fetchFileBlobUrl(room, id);
			if (cancelled) {
				if (url) URL.revokeObjectURL(url);
				return;
			}
			if (currentUrl) URL.revokeObjectURL(currentUrl);
			currentUrl = url;
			blobUrl = url;
			failed = url == null;
		})();
		return () => {
			cancelled = true;
		};
	});

	onDestroy(() => {
		if (currentUrl) URL.revokeObjectURL(currentUrl);
	});

	const clampScale = (s: number) => Math.max(1, Math.min(8, s));

	const zoomAt = (container: HTMLElement, clientX: number, clientY: number, nextScale: number) => {
		const rect = container.getBoundingClientRect();
		// Pointer coords relative to the container centre — same origin
		// the CSS transform is anchored at (translate then scale).
		const px = clientX - (rect.left + rect.width / 2);
		const py = clientY - (rect.top + rect.height / 2);
		const clamped = clampScale(nextScale);
		if (clamped === scale) return;
		// Keep the point under the cursor stationary: solve for the new
		// translation so `(p - t) * s` maps to the same screen coord.
		const ratio = clamped / scale;
		tx = px - (px - tx) * ratio;
		ty = py - (py - ty) * ratio;
		scale = clamped;
	};

	const onWheel = (e: WheelEvent) => {
		if (!blobUrl) return;
		e.preventDefault();
		const container = e.currentTarget as HTMLElement;
		// Wheel-up (`deltaY < 0`) zooms in — matches every other viewer.
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		zoomAt(container, e.clientX, e.clientY, scale * factor);
	};

	const zoomIn = () => {
		scale = clampScale(scale * 1.3);
	};
	const zoomOut = () => {
		const next = clampScale(scale / 1.3);
		if (next === 1) {
			// Snap the translation back to centre when we reach the fit
			// state so the image doesn't stay off-centre.
			tx = 0;
			ty = 0;
		}
		scale = next;
	};
	const resetZoom = () => {
		scale = 1;
		tx = 0;
		ty = 0;
	};

	// --- Pan (drag) ---
	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartTx = 0;
	let dragStartTy = 0;

	const onPointerDown = (e: PointerEvent) => {
		if (scale <= 1) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		dragStartTx = tx;
		dragStartTy = ty;
	};

	const onPointerMove = (e: PointerEvent) => {
		if (!dragging) return;
		tx = dragStartTx + (e.clientX - dragStartX);
		ty = dragStartTy + (e.clientY - dragStartY);
	};

	const onPointerUp = (e: PointerEvent) => {
		if (!dragging) return;
		dragging = false;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// Safari can raise `InvalidStateError` if the capture was
			// implicitly released on drag-out — ignore.
		}
	};

	const downloadHref = $derived(WarRoomDatastoreService.downloadUrl(warRoomId, fileId));
</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content
		class="fixed inset-0 left-0 top-0 z-50 flex h-screen max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background/95 p-0 backdrop-blur-sm sm:rounded-none"
	>
		<Dialog.Title class="sr-only">{filename}</Dialog.Title>

		<!-- Top bar: filename + actions. Sits above the image so it's
		     always reachable regardless of pan/zoom state. -->
		<div class="flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-2">
			<span class="min-w-0 flex-1 truncate text-sm font-medium">
				{filename}
			</span>
			<div class="flex shrink-0 items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					class="h-8 gap-1"
					onclick={zoomOut}
					disabled={scale <= 1}
					title="Zoom out"
				>
					<ZoomOut class="h-4 w-4" />
				</Button>
				<span class="min-w-[3.5rem] text-center text-xs tabular-nums text-muted-foreground">
					{Math.round(scale * 100)}%
				</span>
				<Button
					variant="ghost"
					size="sm"
					class="h-8 gap-1"
					onclick={zoomIn}
					disabled={scale >= 8}
					title="Zoom in"
				>
					<ZoomIn class="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-8 gap-1"
					onclick={resetZoom}
					disabled={scale === 1 && tx === 0 && ty === 0}
					title="Fit to screen"
				>
					<Maximize2 class="h-4 w-4" />
				</Button>
				<a
					href={downloadHref}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					title="Open raw file in a new tab (may require auth)"
				>
					<Download class="h-4 w-4" />
				</a>
			</div>
		</div>

		<!-- Viewport: the wheel/pointer surface. The img inside is
		     transformed rather than the viewport itself so the wheel
		     handler can compute its bounding rect once per gesture. -->
		<div
			class="relative flex flex-1 select-none items-center justify-center overflow-hidden"
			onwheel={onWheel}
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			ondblclick={resetZoom}
			role="presentation"
			style:cursor={scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default'}
		>
			{#if blobUrl}
				<img
					src={blobUrl}
					alt={filename}
					draggable="false"
					class="max-h-full max-w-full object-contain will-change-transform"
					style:transform={`translate(${tx}px, ${ty}px) scale(${scale})`}
					style:transition={dragging ? 'none' : 'transform 120ms ease-out'}
				/>
			{:else if failed}
				<div class="text-sm text-muted-foreground">Could not load image.</div>
			{:else}
				<div class="text-sm text-muted-foreground">Loading…</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
