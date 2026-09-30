/**
 * Module-scoped rune store for the user's display timezone.
 *
 * Every date the SPA renders goes through `$lib/utils/time-formatter`,
 * which reads the zone from here. The preference lives on the user row
 * (`preferences.timezone` in `/me/context`) and is pushed in by the user
 * context once it loads, and again whenever the profile page changes it.
 * Because the value is `$state`, any template or `$derived` that formats
 * a date re-renders when it changes.
 *
 * `browser` (the default) defers to the timezone of the browser the user
 * is on; anything else is an IANA name (`UTC`, `Europe/Paris`, ...).
 *
 * Only ever written from the browser: this module is shared across SSR
 * requests, so a server-side write would leak one user's zone into
 * another user's render.
 */
export const TIMEZONE_BROWSER = 'browser';

/** True when `Intl` can render in `zone`. */
export const isSupportedTimeZone = (zone: string): boolean => {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
};

/** The IANA name of the browser's own timezone. */
export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

const state = $state<{ preference: string }>({ preference: TIMEZONE_BROWSER });

export const timezone = {
	/** The raw preference: `browser` or an IANA name. */
	get preference(): string {
		return state.preference;
	},
	/** The IANA name dates are actually rendered in. */
	get zone(): string {
		return state.preference === TIMEZONE_BROWSER ? browserTimeZone() : state.preference;
	},
	/**
	 * Unknown or unsupported values (a stale name the browser's ICU
	 * doesn't ship, a hand-edited preference) fall back to `browser`
	 * rather than making every formatter throw.
	 */
	set(preference: string | null | undefined): void {
		state.preference =
			preference && preference !== TIMEZONE_BROWSER && isSupportedTimeZone(preference)
				? preference
				: TIMEZONE_BROWSER;
	}
};
