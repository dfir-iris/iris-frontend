/**
 * A ProseMirror NodeView that wraps the tiptap image in a container with
 * a single bottom-right resize handle. Dragging the handle updates the
 * node's `width` attribute (stored as a CSS width string, e.g. `240px`).
 *
 * We opted for a bare-bones DOM NodeView rather than pulling in a
 * third-party resizer package — the interaction is simple enough that
 * ~80 lines carry their own weight, and it avoids dragging a new
 * dependency into the bundle for what is effectively drag-to-resize.
 */

import type { NodeViewRenderer } from '@tiptap/core';

export const ResizableImageNodeView: NodeViewRenderer = ({ node, editor, getPos }) => {
	const wrapper = document.createElement('span');
	wrapper.className = 'resizable-image-wrapper';
	wrapper.style.position = 'relative';
	wrapper.style.display = 'inline-block';
	wrapper.style.maxWidth = '100%';
	wrapper.style.lineHeight = '0';

	const img = document.createElement('img');
	img.src = node.attrs.src;
	if (node.attrs.alt) img.alt = node.attrs.alt;
	if (node.attrs.title) img.title = node.attrs.title;
	img.style.maxWidth = '100%';
	img.style.height = 'auto';
	img.style.borderRadius = '0.375rem';
	img.style.display = 'block';
	if (node.attrs.width) {
		img.style.width = node.attrs.width;
	}

	const handle = document.createElement('span');
	handle.className = 'resizable-image-handle';
	// Styling lives in a <style global> block alongside the editor so the
	// handle is visible on hover/selection. Inline minimal positioning here.
	handle.style.position = 'absolute';
	handle.style.right = '-4px';
	handle.style.bottom = '-4px';
	handle.style.width = '12px';
	handle.style.height = '12px';
	handle.style.background = 'hsl(var(--primary))';
	handle.style.borderRadius = '2px';
	handle.style.cursor = 'nwse-resize';
	handle.style.opacity = '0';
	handle.style.transition = 'opacity 0.15s';
	handle.setAttribute('contenteditable', 'false');

	wrapper.addEventListener('mouseenter', () => {
		handle.style.opacity = '1';
	});
	wrapper.addEventListener('mouseleave', () => {
		handle.style.opacity = '0';
	});

	// Drag-to-resize. We read the initial width from the rendered image
	// (so unsized images start from their natural display width) and apply
	// the delta live; when the user releases, we commit the new width into
	// the node's attributes so it persists through save/reload.
	handle.addEventListener('pointerdown', (event: PointerEvent) => {
		event.preventDefault();
		event.stopPropagation();

		const startX = event.clientX;
		const startWidth = img.getBoundingClientRect().width;

		const onMove = (moveEvent: PointerEvent) => {
			const delta = moveEvent.clientX - startX;
			// Clamp so the image can't disappear or escape the editor width.
			const next = Math.max(40, Math.min(startWidth + delta, wrapper.parentElement?.clientWidth ?? 2000));
			img.style.width = `${Math.round(next)}px`;
		};

		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);

			const finalWidth = img.style.width;
			if (typeof getPos === 'function') {
				const pos = getPos();
				if (typeof pos === 'number') {
					editor
						.chain()
						.command(({ tr }) => {
							tr.setNodeMarkup(pos, undefined, { ...node.attrs, width: finalWidth });
							return true;
						})
						.run();
				}
			}
		};

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	});

	wrapper.appendChild(img);
	wrapper.appendChild(handle);

	return {
		dom: wrapper,
		update(updatedNode) {
			if (updatedNode.type.name !== 'image') return false;
			if (updatedNode.attrs.src !== img.src) img.src = updatedNode.attrs.src;
			if (updatedNode.attrs.alt !== img.alt) img.alt = updatedNode.attrs.alt ?? '';
			img.style.width = updatedNode.attrs.width ?? '';
			return true;
		}
	};
};
