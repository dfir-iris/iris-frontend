import type { Position } from 'cytoscape';

export interface TooltipPlacement {
	left: number;
	top: number;
	/** CSS transform flipping the box to the other side of the pointer. */
	transform: string;
}

/**
 * Place a hover tooltip next to the pointer (container coordinates), flipped
 * left / up when it would overflow the right / bottom edge of the canvas.
 */
export const tooltipPlacement = (
	pointer: Position,
	container: { width: number; height: number },
	offset = 12,
	maxWidth = 288
): TooltipPlacement => {
	const flipX = pointer.x + offset + maxWidth > container.width && pointer.x > container.width / 2;
	const flipY = pointer.y > container.height * 0.6;
	return {
		left: pointer.x + (flipX ? -offset : offset),
		top: pointer.y + (flipY ? -offset : offset),
		transform: `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`
	};
};
