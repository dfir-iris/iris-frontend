import {
	Server,
	Globe,
	Laptop,
	Network,
	Shield,
	Database,
	HardDrive,
	Smartphone,
	Printer,
	Router,
	Cpu,
	Cloud,
	Users,
	Mail,
	FileText,
	Lock,
	Cog,
	HelpCircle
} from 'lucide-svelte';

const assetTypeIcons = {
	server: Server,
	domain: Globe,
	website: Globe,
	workstation: Laptop,
	// IRIS ships its types as "<OS> - <kind>" ("Windows - Computer",
	// "Mac - Computer", "Phone - Android"), so the kind has to be a key too or
	// every workstation falls through to the question-mark glyph.
	computer: Laptop,
	laptop: Laptop,
	desktop: Laptop,
	network: Network,
	firewall: Shield,
	waf: Shield,
	vpn: Lock,
	database: Database,
	storage: HardDrive,
	mobile: Smartphone,
	phone: Smartphone,
	android: Smartphone,
	ios: Smartphone,
	printer: Printer,
	router: Router,
	switch: Router,
	iot: Cpu,
	cloud: Cloud,
	account: Users,
	email: Mail,
	document: FileText,
	application: Cog,
	security: Lock
} as const;

/**
 * Resolves an asset type name to its glyph. Shared by the list row and the
 * detail header so an asset looks the same wherever it appears.
 */
export const getAssetTypeIcon = (typeName: string | undefined | null) => {
	const normalized = (typeName ?? '').trim().toLowerCase();

	if (!normalized) return HelpCircle;

	if (normalized in assetTypeIcons) {
		return assetTypeIcons[normalized as keyof typeof assetTypeIcons];
	}

	for (const [key, icon] of Object.entries(assetTypeIcons)) {
		if (normalized.includes(key)) {
			return icon;
		}
	}

	return HelpCircle;
};
