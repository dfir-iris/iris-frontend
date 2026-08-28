import { AccessLevel } from '$lib/services/access-control.service';

export const ACCESS_OPTIONS = [
	{
		value: String(AccessLevel.DENY_ALL),
		label: 'Deny All'
	},
	{
		value: String(AccessLevel.READ_ONLY),
		label: 'Read Only'
	},
	{
		value: String(AccessLevel.FULL_ACCESS),
		label: 'Full Access'
	}
];
