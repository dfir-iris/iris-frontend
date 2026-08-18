import {
	AtSignIcon,
	CodeIcon,
	DatabaseIcon,
	FileIcon,
	GlobeIcon,
	HashIcon,
	Link as LinkIcon,
	ServerIcon,
	ShieldIcon,
	UserIcon
} from 'lucide-svelte';

/**
 * Resolves an IOC type name to its glyph. Shared by the list row and the
 * detail header so an IOC looks the same wherever it appears.
 */
export const getIocTypeIcon = (typeName: string | undefined | null) => {
	const type = (typeName ?? '').toLowerCase();

	if (type.includes('ip')) return GlobeIcon;
	if (type.includes('email')) return AtSignIcon;
	if (type.includes('domain') || type.includes('hostname')) return GlobeIcon;
	if (type.includes('url')) return LinkIcon;
	if (type.includes('hash') || type.includes('md5') || type.includes('sha')) return HashIcon;
	if (type.includes('file')) return FileIcon;
	if (type.includes('account') || type.includes('user')) return UserIcon;
	if (type.includes('registry')) return DatabaseIcon;
	if (type.includes('mutex')) return CodeIcon;
	if (type.includes('server')) return ServerIcon;

	return ShieldIcon;
};
