export const normalizeTags = (csv: string): string[] =>
	csv
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t.length > 0);
