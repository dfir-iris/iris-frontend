/**
 * Tailwind palette names (the convention of `asset_flag.color` and the graph
 * relation types) resolved to hex for canvas rendering. Light mode uses the
 * 600 shade, dark mode the 400 shade, so strokes keep enough contrast on both
 * backgrounds.
 */
const PALETTE: Record<string, { light: string; dark: string }> = {
	slate: { light: '#475569', dark: '#94a3b8' },
	gray: { light: '#4b5563', dark: '#9ca3af' },
	zinc: { light: '#52525b', dark: '#a1a1aa' },
	neutral: { light: '#525252', dark: '#a3a3a3' },
	stone: { light: '#57534e', dark: '#a8a29e' },
	red: { light: '#dc2626', dark: '#f87171' },
	orange: { light: '#ea580c', dark: '#fb923c' },
	amber: { light: '#d97706', dark: '#fbbf24' },
	yellow: { light: '#ca8a04', dark: '#facc15' },
	lime: { light: '#65a30d', dark: '#a3e635' },
	green: { light: '#16a34a', dark: '#4ade80' },
	emerald: { light: '#059669', dark: '#34d399' },
	teal: { light: '#0d9488', dark: '#2dd4bf' },
	cyan: { light: '#0891b2', dark: '#22d3ee' },
	sky: { light: '#0284c7', dark: '#38bdf8' },
	blue: { light: '#2563eb', dark: '#60a5fa' },
	indigo: { light: '#4f46e5', dark: '#818cf8' },
	violet: { light: '#7c3aed', dark: '#a78bfa' },
	purple: { light: '#9333ea', dark: '#c084fc' },
	fuchsia: { light: '#c026d3', dark: '#e879f9' },
	pink: { light: '#db2777', dark: '#f472b6' },
	rose: { light: '#e11d48', dark: '#fb7185' }
};

export const PALETTE_NAMES = Object.keys(PALETTE);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Hex colour for a palette name (`red`, `sky`…). A hex value passes through;
 * anything unknown falls back to `fallback` (slate by default).
 */
export const paletteHex = (
	name: string | null | undefined,
	isDark: boolean,
	fallback = 'slate'
): string => {
	const value = (name ?? '').trim().toLowerCase();
	if (HEX_RE.test(value)) return value;
	const entry = PALETTE[value] ?? PALETTE[fallback] ?? PALETTE.slate;
	return isDark ? entry.dark : entry.light;
};

/** Common TLP names → colour. */
export const tlpHex = (tlp: string | null | undefined, isDark: boolean): string | null => {
	const v = (tlp ?? '').toLowerCase().replace(/^tlp[:\s-]*/, '');
	if (!v) return null;
	if (v.startsWith('red')) return paletteHex('red', isDark);
	if (v.startsWith('amber')) return paletteHex('amber', isDark);
	if (v.startsWith('green')) return paletteHex('green', isDark);
	if (v.startsWith('clear') || v.startsWith('white')) return isDark ? '#f8fafc' : '#94a3b8';
	return null;
};
