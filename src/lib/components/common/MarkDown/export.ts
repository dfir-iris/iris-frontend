/**
 * Convert stored note markdown to a "clean" download-ready markdown by
 * stripping the HTML representation of mention chips down to a plain
 * `@label` / `#label` text.
 *
 * Stored chips look like:
 *
 *   <span data-mention data-kind="user" data-id="42" data-label="John Doe"
 *         class="mention-chip ..." role="button">
 *     <svg ...>...</svg><span class="mention-chip-label">John Doe</span>
 *   </span>
 *
 * For downloads we want just `@John Doe` (or `#Asset Name` for case objects)
 * so the resulting .md is readable in any editor and roughly matches what
 * the user typed.
 */
export const stripMentionChipsForExport = (markdown: string): string => {
	if (!markdown) return markdown;

	// Walk the string forward, finding each `<span ... data-mention ...>` and
	// matching it with its true closing `</span>` by counting nested spans.
	// A regex like /<span.*?<\/span>/ would match the FIRST `</span>` it sees,
	// which is wrong: chips contain inner spans (icon + label), so the naive
	// match closes too early and leaves a dangling `</span>` behind.
	const openRe = /<span\b[^>]*\bdata-mention\b[^>]*>/i;
	const anySpanRe = /<\/?span\b[^>]*>/gi;

	let out = '';
	let i = 0;

	while (i < markdown.length) {
		const slice = markdown.slice(i);
		const openMatch = slice.match(openRe);
		if (!openMatch || openMatch.index === undefined) {
			out += slice;
			break;
		}

		const chipStart = i + openMatch.index;
		const openTag = openMatch[0];
		out += markdown.slice(i, chipStart);

		// Scan from just after the opening tag, tracking span nesting depth.
		anySpanRe.lastIndex = chipStart + openTag.length;
		let depth = 1;
		let chipEnd = -1;

		let tag: RegExpExecArray | null;
		while ((tag = anySpanRe.exec(markdown))) {
			if (tag[0][1] === '/') {
				depth--;
				if (depth === 0) {
					chipEnd = tag.index + tag[0].length;
					break;
				}
			} else {
				depth++;
			}
		}

		if (chipEnd === -1) {
			// Malformed: no matching close. Drop the opening tag and continue
			// past it so we don't loop forever.
			i = chipStart + openTag.length;
			continue;
		}

		const chipHtml = markdown.slice(chipStart, chipEnd);
		const kind = readAttr(openTag, 'data-kind') ?? 'user';
		const label = readAttr(openTag, 'data-label') ?? stripInnerText(chipHtml);
		const prefix = kind === 'user' ? '@' : '#';
		out += `${prefix}${label}`;

		i = chipEnd;
	}

	return out;
};

const readAttr = (html: string, name: string): string | null => {
	const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
	const m = html.match(re);
	return m ? m[1] : null;
};

// Fallback when data-label is missing: pull the visible text out by stripping
// every HTML tag inside the chip. Handles older or hand-written chips.
const stripInnerText = (chipHtml: string): string => {
	const inner = chipHtml.replace(/^<span\b[^>]*>/i, '').replace(/<\/span>$/i, '');
	return inner
		.replace(/<[^>]+>/g, '')
		.replace(/^[@#]/, '')
		.trim();
};
