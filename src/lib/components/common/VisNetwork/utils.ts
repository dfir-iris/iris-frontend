import iocSvg from 'lucide-static/icons/link.svg?raw';

export const svgToDataUrl = (svg: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const withStroke = (svg: string, color: string) =>
	svg.replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/<svg /, '<svg fill="none" ');

export const makeIocIcon = (strokeColor: string) => svgToDataUrl(withStroke(iocSvg, strokeColor));

export const applyAssetImageTheme = (image: string, isDark: boolean) => {
	const theme = isDark ? 'dark' : 'light';
	const separator = image.includes('?') ? '&' : '?';
	return `${image}${separator}theme=${theme}`;
};
