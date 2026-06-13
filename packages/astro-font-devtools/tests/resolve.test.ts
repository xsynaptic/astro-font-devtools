import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FontFaceData } from 'unifont';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderName } from '../src/shared/types.js';

import { createResolveHandler, parseResolveQuery, renderFontFace } from '../src/server/resolve.js';

const { resolveFont } = vi.hoisted(() => ({ resolveFont: vi.fn() }));

vi.mock('unifont', () => ({
	createUnifont: () => Promise.resolve({ resolveFont }),
	providers: {
		bunny: () => ({}),
		fontshare: () => ({}),
		fontsource: () => ({}),
		google: () => ({}),
	},
}));

const configured: Array<ProviderName> = ['google', 'fontsource'];

function fakeExchange(url: string) {
	let resolveDone: () => void;
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	const res = {
		body: '',
		end(chunk?: string) {
			res.body = chunk ?? '';
			resolveDone();
		},
		headers: {} as Record<string, string>,
		setHeader(key: string, value: string) {
			res.headers[key] = value;
		},
		statusCode: 200,
	};

	return {
		done,
		req: { url } as unknown as IncomingMessage,
		res,
		serverResponse: res as unknown as ServerResponse,
	};
}

beforeEach(() => {
	resolveFont.mockReset();
});

describe('renderFontFace', () => {
	it('renders url sources with format/weight/style and omits or adds optional fields', () => {
		expect(
			renderFontFace('Inter', {
				src: [{ format: 'woff2', url: '/inter.woff2' }],
				style: 'normal',
				weight: 400,
			} satisfies FontFaceData),
		).toBe(
			'@font-face { font-family: "Inter"; src: url("/inter.woff2") format("woff2"); font-display: swap; font-weight: 400; font-style: normal; }',
		);
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

	it('renders local() sources and joins a variable weight range', () => {
		const css = renderFontFace('Inter', {
			src: [{ name: 'Inter' }],
			weight: [400, 700],
		} satisfies FontFaceData);
		expect(css).toContain('src: local("Inter")');
		expect(css).toContain('font-weight: 400 700');
	});
});

describe('parseResolveQuery', () => {
	it('returns undefined when family is missing', () => {
		expect(parseResolveQuery('/resolve', configured)).toBeUndefined();
	});

	it('applies default weights and styles', () => {
		expect(parseResolveQuery('/resolve?family=Inter', ['fontsource'])).toEqual({
			family: 'Inter',
			scoped: ['fontsource'],
			styles: ['normal', 'italic'],
			weights: ['400', '700'],
		});
	});

	it('parses custom weights and drops style values that are not real font styles', () => {
		expect(
			parseResolveQuery('/resolve?family=Inter&weights=300,600&styles=normal,bogus', [
				'fontsource',
			]),
		).toMatchObject({ styles: ['normal'], weights: ['300', '600'] });
	});

	it('scopes to a single provider when the query names a configured one', () => {
		expect(parseResolveQuery('/resolve?family=Inter&provider=google', configured)?.scoped).toEqual([
			'google',
		]);
	});

	it('falls back to all providers for an unknown or unconfigured provider', () => {
		expect(parseResolveQuery('/resolve?family=Inter&provider=nope', configured)?.scoped).toEqual(
			configured,
		);
		expect(parseResolveQuery('/resolve?family=Inter&provider=bunny', configured)?.scoped).toEqual(
			configured,
		);
	});
});

describe('createResolveHandler', () => {
	it('returns 400 when family is missing', async () => {
		const exchange = fakeExchange('/resolve');

		createResolveHandler(['fontsource'])(exchange.req, exchange.serverResponse, vi.fn());
		await exchange.done;

		expect(exchange.res.statusCode).toBe(400);
		expect(exchange.res.body).toContain('missing family');
		expect(resolveFont).not.toHaveBeenCalled();
	});

	it('renders resolved fonts as CSS with text/css and no-store', async () => {
		resolveFont.mockResolvedValue({ fonts: [{ src: [{ url: '/inter.woff2' }] }] });
		const exchange = fakeExchange('/resolve?family=Inter');

		createResolveHandler(['fontsource'])(exchange.req, exchange.serverResponse, vi.fn());
		await exchange.done;

		expect(exchange.res.statusCode).toBe(200);
		expect(exchange.res.headers['content-type']).toBe('text/css');
		expect(exchange.res.headers['cache-control']).toBe('no-store');
		expect(exchange.res.body).toContain('@font-face');
	});

	it('returns 502 when resolution fails', async () => {
		resolveFont.mockRejectedValue(new Error('upstream down'));
		const exchange = fakeExchange('/resolve?family=Inter');

		createResolveHandler(['fontsource'])(exchange.req, exchange.serverResponse, vi.fn());
		await exchange.done;

		expect(exchange.res.statusCode).toBe(502);
		expect(exchange.res.body).toContain('resolve failed');
	});
});
