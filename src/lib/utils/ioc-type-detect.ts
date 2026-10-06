/**
 * Best-effort IOC type detection from a raw value, used to pre-select the
 * type when an analyst pastes an indicator. Returns candidate MISP type
 * names, most specific first; the caller picks the first one the instance
 * actually has. The backend still validates the value against the type.
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const PORT = /^\d{1,5}$/;
const HEX = /^[0-9a-f]+$/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const CVE = /^CVE-\d{4}-\d{4,}$/i;
const REGKEY = /^(HKLM|HKCU|HKCR|HKU|HKCC|HKEY_[A-Z_]+)\\/i;
const BTC = /^(bc1[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const ASN = /^AS\d{1,10}$/i;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9_]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;

const HASH_BY_LENGTH: Record<number, string> = {
	32: 'md5',
	40: 'sha1',
	56: 'sha224',
	64: 'sha256',
	96: 'sha384',
	128: 'sha512'
};

const isIpv6 = (value: string): boolean => {
	if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return false;
	try {
		return new URL(`http://[${value}]/`).hostname.length > 2;
	} catch {
		return false;
	}
};

const isIp = (value: string): boolean => IPV4.test(value) || isIpv6(value);

export const detectIocTypeCandidates = (raw: string): string[] => {
	const value = raw.trim();
	if (!value || /\s/.test(value)) return [];

	if (isIp(value)) return ['ip-any', 'ip-dst', 'ip-src'];

	const portSep = value.lastIndexOf(':');
	if (portSep > 0 && IPV4.test(value.slice(0, portSep)) && PORT.test(value.slice(portSep + 1))) {
		return ['ip-dst|port', 'ip-src|port'];
	}

	if (URL_SCHEME.test(value)) return ['url', 'uri', 'link'];
	if (EMAIL.test(value)) return ['email', 'email-src', 'email-dst'];
	if (MAC.test(value)) return ['mac-address'];
	if (CVE.test(value)) return ['vulnerability'];
	if (REGKEY.test(value)) return ['regkey'];
	if (HEX.test(value) && HASH_BY_LENGTH[value.length]) return [HASH_BY_LENGTH[value.length]];
	if (BTC.test(value)) return ['btc'];
	if (ASN.test(value)) return ['AS'];
	if (DOMAIN.test(value)) return ['domain', 'hostname'];
	return [];
};

/** First candidate the instance knows (type names compared case-insensitively). */
export const detectIocType = <T extends { type_id: number; type_name: string }>(
	raw: string,
	types: T[]
): T | null => {
	const byName = new Map(types.map((t) => [t.type_name.toLowerCase(), t]));
	for (const name of detectIocTypeCandidates(raw)) {
		const match = byName.get(name.toLowerCase());
		if (match) return match;
	}
	return null;
};
