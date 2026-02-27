import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const getTotal = (value: unknown): number => {
	const total = (value as { data?: { total?: unknown } })?.data?.total;
	return typeof total === 'number' ? total : 0;
};
