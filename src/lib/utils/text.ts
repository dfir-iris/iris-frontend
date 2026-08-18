/**
 * Flattens markdown into a single line of plain text for list rows.
 *
 * Not a parser: it strips the syntax that would otherwise surface as literal
 * `#`, `*` or `[]()` noise once a description is squeezed onto one line. Rich
 * rendering still goes through MarkDownPreview in the detail panes.
 */
export const toPlainSnippet = (markdown: string, max = 120): string => {
	const text = markdown
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s*[-*+]\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/[*_~]{1,3}/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};
