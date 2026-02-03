import Showdown from 'showdown';

export const converter = new Showdown.Converter({
	tables: true,
	strikethrough: true,
	tasklists: true,
	simplifiedAutoLink: true,
	openLinksInNewWindow: true,
	parseImgDimensions: true,
	simpleLineBreaks: true
});
