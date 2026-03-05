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

export const isFiniteNumberString = (v: string) => {
	const n = Number(v);
	return Number.isFinite(n) && v.trim() !== '';
};

export const toApiDate = (v: string | undefined, dayEnd: boolean = false) => {
	if (!v) return undefined;
	if (v.includes('T')) return v;

	return `${v}T${dayEnd ? '23:59:59' : '00:00:00'}`;
};
