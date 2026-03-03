import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const getTotal = (value: unknown): number => {
	const total = (value as { data?: { total?: unknown } })?.data?.total;
	return typeof total === 'number' ? total : 0;
};

export const getInitials = (s: string): string =>
	s
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0]!.toUpperCase())
		.join('');
