/**
 * Module-scoped rune store for the user's clock format.
 *
 * `$lib/utils/time-formatter` applies it to every formatter that renders
 * an hour, overriding whatever `hour12` / `hourCycle` the caller asked
 * for, so the whole UI shows one clock. The preference lives on the user
 * row (`preferences.time_format` in `/me/context`) and is pushed in by the
 * user context, exactly like the timezone store next door.
 *
 * `24h` (the default) and `12h` force the clock; `locale` lets the
 * browser locale decide (en-US reads 12h, most others 24h).
 *
 * Only ever written from the browser: this module is shared across SSR
 * requests, so a server-side write would leak one user's format into
 * another user's render.
 */
export const TIME_FORMAT_24H = '24h';
export const TIME_FORMAT_12H = '12h';
export const TIME_FORMAT_LOCALE = 'locale';

export type TimeFormat =
	| typeof TIME_FORMAT_24H
	| typeof TIME_FORMAT_12H
	| typeof TIME_FORMAT_LOCALE;

export const TIME_FORMATS: readonly TimeFormat[] = [
	TIME_FORMAT_24H,
	TIME_FORMAT_12H,
	TIME_FORMAT_LOCALE
];

const isTimeFormat = (value: unknown): value is TimeFormat =>
	TIME_FORMATS.includes(value as TimeFormat);

const state = $state<{ preference: TimeFormat }>({ preference: TIME_FORMAT_24H });

export const timeFormat = {
	get preference(): TimeFormat {
		return state.preference;
	},
	/** `hourCycle` to force on formatters, or `undefined` to follow the locale. */
	get hourCycle(): 'h23' | 'h12' | undefined {
		if (state.preference === TIME_FORMAT_24H) return 'h23';
		if (state.preference === TIME_FORMAT_12H) return 'h12';
		return undefined;
	},
	/** Unknown values fall back to the default. */
	set(preference: string | null | undefined): void {
		state.preference = isTimeFormat(preference) ? preference : TIME_FORMAT_24H;
	}
};
