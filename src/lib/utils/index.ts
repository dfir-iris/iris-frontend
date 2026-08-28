import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines multiple class names into a single className string
 * This is useful for conditionally applying classes
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
