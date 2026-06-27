/**
 * Hex-color guard used at every site that interpolates a server-supplied
 * color into an inline `style="…"` attribute.
 *
 * The backend already rejects non-hex values on write (see
 * `_validate_color` in `business/war_rooms.py` and `case_timelines.py`),
 * but enforcing the same shape on render keeps us safe if a column ever
 * gets seeded by an older migration or a misbehaving plugin, and
 * provides defense in depth against a CSS-injection style attribute
 * write.
 */
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export function isHexColor(value: string | null | undefined): value is string {
	return typeof value === 'string' && HEX_RE.test(value);
}

export function safeHexColor(value: string | null | undefined): string | null {
	return isHexColor(value) ? value : null;
}
