import Showdown from 'showdown';

export const converter = new Showdown.Converter({
	tables: true,
	strikethrough: true,
	tasklists: true,
	simplifiedAutoLink: true,
	openLinksInNewWindow: true,
	parseImgDimensions: true,
	// Single newlines inside a paragraph become `<br>` rather than being
	// collapsed to a space. Analyst content (scanner exports, host lists,
	// `key: value` blocks) relies on every typed newline being kept.
	simpleLineBreaks: true,
	extensions: [
		{
			// TipTap serializes a hard break as a trailing backslash before the
			// newline (`"line one\\\nline two"`). That's valid CommonMark, but
			// not a syntax showdown knows — it leaves the backslash in the
			// output as a literal `\` right before the `<br>`. Since
			// `simpleLineBreaks` above already turns a bare newline into a
			// `<br>`, we can just drop the backslash.
			//
			// The `[^\\]` guard keeps an escaped backslash at end-of-line
			// (`\\` + newline — the user wants a literal `\`) from being eaten.
			type: 'lang',
			filter: (text: string) => text.replace(/(^|[^\\])\\\n/g, '$1\n')
		}
	]
});
