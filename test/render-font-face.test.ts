import type { FontFaceData } from 'unifont';

import { describe, expect, it } from 'vitest';

import { renderFontFace } from '../src/server/resolve.js';

describe('renderFontFace', () => {
	it('renders a url source with format, weight, and style', () => {
		const css = renderFontFace('Inter', {
			src: [{ format: 'woff2', url: '/inter.woff2' }],
			style: 'normal',
			weight: 400,
		} satisfies FontFaceData);
		expect(css).toBe(
			'@font-face { font-family: "Inter"; src: url("/inter.woff2") format("woff2"); font-display: swap; font-weight: 400; font-style: normal; }',
		);
	});

	it('renders local() sources and joins a variable weight range', () => {
		const css = renderFontFace('Inter', {
			src: [{ name: 'Inter' }],
			weight: [400, 700],
		} satisfies FontFaceData);
		expect(css).toContain('src: local("Inter")');
		expect(css).toContain('font-weight: 400 700');
	});

	it('omits weight/style/unicode-range when absent and includes them when present', () => {
		expect(renderFontFace('Inter', { src: [{ url: '/a.woff2' }] } satisfies FontFaceData)).toBe(
			'@font-face { font-family: "Inter"; src: url("/a.woff2"); font-display: swap; }',
		);
		expect(
			renderFontFace('Inter', {
				src: [{ url: '/a.woff2' }],
				unicodeRange: ['U+0000-00FF', 'U+0131'],
			} satisfies FontFaceData),
		).toContain('unicode-range: U+0000-00FF, U+0131');
	});
});
