import type { GraphNode } from '$lib/types/resources/case-graph';
import { KIND_LABEL } from './model';

export type GroupingMode = 'type' | 'compromise' | 'subnet' | 'domain';

export const GROUPING_LABEL: Record<GroupingMode, string> = {
	type: 'Type',
	compromise: 'Compromise status',
	subnet: 'Subnet',
	domain: 'Domain'
};

const IPV4 = /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/;
const IPV6_CANDIDATE = /(?:^|[\s,;/[(])([0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})(?=$|[\s,;/\])%])/i;

/** `a.b.c.d` → `a.b.c.0/24`. */
export const ipv4Subnet = (ip: string) => `${ip.split('.').slice(0, 3).join('.')}.0/24`;

/** Expand `::` and return the /64 prefix, or null when not a valid IPv6. */
export const ipv6Subnet = (raw: string): string | null => {
	const ip = raw.toLowerCase();
	if ((ip.match(/::/g) ?? []).length > 1) return null;
	const [head, tail] = ip.includes('::') ? ip.split('::') : [ip, null];
	const h = head ? head.split(':') : [];
	const t = tail !== null && tail ? tail.split(':') : [];
	const missing = 8 - h.length - t.length;
	if (tail === null ? h.length !== 8 : missing < 1) return null;
	const groups = tail === null ? h : [...h, ...Array(missing).fill('0'), ...t];
	if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
	return `${groups
		.slice(0, 4)
		.map((g) => g.replace(/^0+(?=.)/, ''))
		.join(':')}::/64`;
};

/** First IP-ish value of a node: asset subtitle (IP) or IOC value. */
export const nodeSubnet = (node: GraphNode): string | null => {
	const candidates = [node.subtitle, node.label].filter(
		(v): v is string => typeof v === 'string' && !!v
	);
	for (const c of candidates) {
		const v4 = IPV4.exec(c);
		if (v4) return ipv4Subnet(v4[1]);
	}
	for (const c of candidates) {
		const v6 = IPV6_CANDIDATE.exec(c);
		if (v6) {
			const s = ipv6Subnet(v6[1]);
			if (s) return s;
		}
	}
	return null;
};

const MULTI_PART_SUFFIXES = new Set([
	'co.uk',
	'org.uk',
	'gov.uk',
	'ac.uk',
	'com.au',
	'net.au',
	'org.au',
	'co.jp',
	'co.nz',
	'com.br',
	'com.cn',
	'co.in',
	'co.za',
	'com.mx',
	'gouv.fr'
]);

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9-_]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;

/** Registrable-ish domain of a host name (last two labels, three for `co.uk`-style suffixes). */
export const registrableDomain = (host: string): string | null => {
	const h = host.toLowerCase().replace(/\.$/, '');
	if (!HOST_RE.test(h) || IPV4.test(h)) return null;
	const parts = h.split('.');
	const lastTwo = parts.slice(-2).join('.');
	if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) return parts.slice(-3).join('.');
	return lastTwo;
};

/** Host part of a URL, email or bare host value. */
export const hostOf = (value: string): string | null => {
	const v = value.trim();
	const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?([^/:?#\s]+)/i.exec(v);
	if (url) return url[1];
	const email = /^[^@\s/]+@([^@\s/]+)$/.exec(v);
	if (email) return email[1];
	const defanged = v.replace(/\[\.\]/g, '.');
	return HOST_RE.test(defanged) ? defanged : null;
};

/**
 * The contract has no domain field: derive it from the asset name when it is
 * a FQDN, else from an IOC domain / URL / email value.
 */
export const nodeDomain = (node: GraphNode): string | null => {
	if (node.kind !== 'asset' && node.kind !== 'ioc') return null;
	const host = hostOf(node.label);
	return host ? registrableDomain(host) : null;
};

export const groupOf = (node: GraphNode, mode: GroupingMode): string => {
	switch (mode) {
		case 'type':
			return `${KIND_LABEL[node.kind]} · ${node.type || 'Unknown'}`;
		case 'compromise':
			if (node.kind !== 'asset') return KIND_LABEL[node.kind];
			if (node.compromised === true) return 'Compromised';
			if (node.compromised === false) return 'Not compromised';
			return 'Compromise unknown';
		case 'subnet':
			return nodeSubnet(node) ?? 'No IP';
		case 'domain':
			return nodeDomain(node) ?? 'No domain';
	}
};
