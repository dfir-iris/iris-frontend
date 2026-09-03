/**
 * Shared "pivot alerts by IOC/asset" link builder for the relationship graphs.
 *
 * The alerts list resolves `alert_iocs` / `alert_assets` server-side against
 * `Ioc.ioc_value` and `CaseAssets.asset_name` — an exact match on the *value*
 * column, never on a primary key. Both graphs used to derive the param from the
 * vis-network node id instead, and each got it wrong in its own way:
 *
 *   - the cluster correlation graph builds ids as `ioc_<ioc_id>` /
 *     `asset_<asset_id>`, so it pivoted on a numeric key and matched nothing;
 *   - the alert-detail related graph embeds the value in the id
 *     (`ioc_<ioc_value>`), but split it on the first underscore — so
 *     `evil_domain.com` pivoted as `evil`.
 *
 * Both graphs already carry the exact value the filter wants in `node.label`,
 * so that is the single source this builder takes.
 */
export type AlertPivotGroup = 'ioc' | 'asset';

/**
 * Returns the alerts-list href that filters on `label`, or `null` when there is
 * no value to pivot on (callers should stay put rather than navigate to an
 * unfiltered list).
 *
 * Pivoting from within the alerts list keeps the filters already in the URL and
 * only swaps the ioc/asset term; pivoting from anywhere else starts clean.
 *
 * `label` is passed through verbatim — `URLSearchParams` handles the encoding,
 * so pre-encoding here would double-escape it.
 */
export function buildAlertPivotHref(
	group: AlertPivotGroup,
	label: string | null | undefined,
	currentHref: string
): string | null {
	const value = String(label ?? '').trim();
	if (value === '') return null;

	const url = new URL(currentHref);
	const onAlertsList = url.pathname === '/alerts' || url.pathname === '/alerts/';

	if (!onAlertsList) {
		url.pathname = '/alerts/';
		url.search = '';
	}

	url.searchParams.set(group === 'asset' ? 'alert_assets' : 'alert_iocs', value);

	return `${url.pathname}?${url.searchParams.toString()}`;
}
