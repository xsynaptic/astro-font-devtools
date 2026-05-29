import type { Connect } from 'vite';

import * as z from 'zod';

import type { CatalogFont, FontCategory, ProviderName } from './types.js';

// Provider responses are validated at the boundary with Zod. Each font schema covers only the
// fields its adapter consumes (Zod strips the rest); the paired envelope schema validates the
// response wrapper strictly, so structural drift throws instead of slipping through as undefined.
const googleFontSchema = z.object({
	axes: z.array(z.unknown()), // only the length is read (→ variable)
	category: z.string(),
	family: z.string(),
	fonts: z.record(z.string(), z.unknown()), // keyed by weight; keys drive italic + weights
	popularity: z.number(),
	trending: z.number(),
});
const googleMetaSchema = z.object({ familyMetadataList: z.array(z.unknown()) });
type GoogleFont = z.infer<typeof googleFontSchema>;

const bunnyFontSchema = z.object({
	category: z.string(),
	familyName: z.string(),
	isVariable: z.boolean(),
	styles: z.array(z.string()),
	weights: z.array(z.number()),
});
const bunnyListSchema = z.record(z.string(), z.unknown());

const fontshareFontSchema = z.object({
	category: z.string(),
	name: z.string(),
	styles: z.array(
		z.object({
			is_italic: z.boolean(),
			is_variable: z.boolean(),
			weight: z.object({ weight: z.number() }),
		}),
	),
	views: z.number(),
	views_recent: z.number(),
});
const fontsharePageSchema = z.object({ fonts: z.array(z.unknown()), has_more: z.boolean() });
type FontshareFont = z.infer<typeof fontshareFontSchema>;

const fontsourceFontSchema = z.object({
	category: z.string(),
	family: z.string(),
	styles: z.array(z.string()),
	subsets: z.array(z.string()),
	variable: z.boolean(),
	weights: z.array(z.number()),
});
const fontsourceListSchema = z.array(z.unknown());

const KNOWN_CATEGORIES = new Set(['display', 'handwriting', 'monospace', 'sans-serif', 'serif']);

async function bunnyCatalog(): Promise<Array<CatalogFont>> {
	const response = await fetch('https://fonts.bunny.net/list');
	const list = bunnyListSchema.parse(await response.json());
	return parseFonts(Object.values(list), bunnyFontSchema, 'bunny').map((font) => ({
		category: normalizeCategory(font.category),
		family: font.familyName,
		italic: font.styles.includes('italic'),
		providers: ['bunny'],
		variable: font.isVariable,
		weights: font.weights,
	}));
}

function normalizeCategory(raw: string): FontCategory {
	const value = raw.toLowerCase().replaceAll(/\s+/g, '-');
	return KNOWN_CATEGORIES.has(value) ? (value as FontCategory) : 'other';
}

// Validate a provider's list per item: keep the ones that parse, drop the rest with a logged
// count, so a single malformed record never sinks the whole catalog.
function parseFonts<Schema extends z.ZodType>(
	items: Array<unknown>,
	schema: Schema,
	provider: ProviderName,
): Array<z.infer<Schema>> {
	const valid: Array<z.infer<Schema>> = [];
	let dropped = 0;
	for (const item of items) {
		const result = schema.safeParse(item);
		if (result.success) {
			valid.push(result.data);
			continue;
		}
		dropped += 1;
	}
	if (dropped > 0) {
		console.warn(
			`[astro-font-devtools] ${provider}: skipped ${String(dropped)} font(s) with an unexpected shape`,
		);
	}
	return valid;
}

let googleMetaPromise: Promise<Array<GoogleFont>> | undefined;

function fetchGoogleMeta(): Promise<Array<GoogleFont>> {
	googleMetaPromise ??= fetch('https://fonts.google.com/metadata/fonts')
		.then((response) => response.text())
		.then((text) => {
			const json = text.replace(/^\)\]\}'[^\n]*\n/, ''); // strip XSSI prefix if present
			const { familyMetadataList } = googleMetaSchema.parse(JSON.parse(json));
			return parseFonts(familyMetadataList, googleFontSchema, 'google');
		});
	return googleMetaPromise;
}

async function fontshareCatalog(): Promise<Array<CatalogFont>> {
	const fonts: Array<FontshareFont> = [];
	// Fontshare's `offset` counts items, not pages, so advance by however many fonts the page
	// actually returned. Walk until the API reports no more — or hands back an empty page,
	// which guards against an infinite loop should `has_more` ever misreport.
	let offset = 0;
	let hasMore = true;
	while (hasMore) {
		const response = await fetch(
			`https://api.fontshare.com/v2/fonts?limit=100&offset=${String(offset)}`,
		);
		const chunk = fontsharePageSchema.parse(await response.json());
		fonts.push(...parseFonts(chunk.fonts, fontshareFontSchema, 'fontshare'));
		hasMore = chunk.has_more && chunk.fonts.length > 0;
		offset += chunk.fonts.length;
	}
	const popularityRank = rankByDescending(fonts, (font) => font.views);
	const trendingRank = rankByDescending(fonts, (font) => font.views_recent);
	return fonts.map((font) => {
		const weights = [...new Set(font.styles.map((style) => style.weight.weight))].toSorted(
			(first, second) => first - second,
		);
		const entry: CatalogFont = {
			category: normalizeCategory(font.category),
			family: font.name,
			italic: font.styles.some((style) => style.is_italic),
			providers: ['fontshare'],
			variable: font.styles.some((style) => style.is_variable),
			weights,
		};
		const popularity = popularityRank.get(font.name);
		const trending = trendingRank.get(font.name);
		if (popularity !== undefined) entry.popularity = popularity;
		if (trending !== undefined) entry.trending = trending;
		return entry;
	});
}

async function fontsourceCatalog(): Promise<Array<CatalogFont>> {
	const response = await fetch('https://api.fontsource.org/v1/fonts');
	const list = fontsourceListSchema.parse(await response.json());
	return parseFonts(list, fontsourceFontSchema, 'fontsource')
		.filter((font) => font.subsets.includes('latin') && font.category !== 'icons')
		.map((font) => ({
			category: normalizeCategory(font.category),
			family: font.family,
			italic: font.styles.includes('italic'),
			providers: ['fontsource'],
			variable: font.variable,
			weights: font.weights,
		}));
}

async function googleCatalog(): Promise<Array<CatalogFont>> {
	const fonts = await fetchGoogleMeta();
	return fonts.map((font) => {
		const entry: CatalogFont = {
			category: normalizeCategory(font.category),
			family: font.family,
			italic: Object.keys(font.fonts).some((key) => key.endsWith('i')),
			providers: ['google'],
			variable: font.axes.length > 0,
			weights: googleWeights(font.fonts),
		};
		if (typeof font.popularity === 'number') entry.popularity = font.popularity;
		if (typeof font.trending === 'number') entry.trending = font.trending;
		return entry;
	});
}

// Cross-provider popularity backbone: Fontsource and Bunny carry no usage signal of their own,
// so assembleCatalog joins Google's rank onto them by family name.
function googlePopularityMap(): Promise<Map<string, { popularity: number; trending: number }>> {
	return fetchGoogleMeta().then(
		(fonts) =>
			new Map(
				fonts.map((font) => [
					font.family,
					{ popularity: font.popularity, trending: font.trending },
				]),
			),
	);
}

function googleWeights(fonts: Record<string, unknown>): Array<number> {
	const weights = new Set<number>();
	for (const key of Object.keys(fonts)) {
		const weight = Number.parseInt(key, 10);
		if (!Number.isNaN(weight)) weights.add(weight);
	}
	return [...weights].toSorted((first, second) => first - second);
}

function rankByDescending(
	items: Array<FontshareFont>,
	score: (item: FontshareFont) => number,
): Map<string, number> {
	const sorted = items.toSorted((first, second) => score(second) - score(first));
	return new Map(sorted.map((item, index) => [item.name, index + 1]));
}

// --- Catalog assembly -----------------------------------------------------

const ADAPTERS: Record<ProviderName, () => Promise<Array<CatalogFont>>> = {
	bunny: bunnyCatalog,
	fontshare: fontshareCatalog,
	fontsource: fontsourceCatalog,
	google: googleCatalog,
};

const catalogCache = new Map<string, Promise<Array<CatalogFont>>>();

export function createCatalogHandler(providers: Array<ProviderName>): Connect.NextHandleFunction {
	return (_req, res) => {
		buildCatalog(providers)
			.then((catalog) => {
				res.setHeader('content-type', 'application/json');
				res.setHeader('cache-control', 'no-store');
				res.end(JSON.stringify(catalog));
			})
			.catch((error: unknown) => {
				res.statusCode = 502;
				res.setHeader('content-type', 'application/json');
				res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }));
			});
	};
}

async function assembleCatalog(providers: Array<ProviderName>): Promise<Array<CatalogFont>> {
	const [lists, popularity] = await Promise.all([
		Promise.all(providers.map((name) => ADAPTERS[name]())),
		googlePopularityMap(),
	]);
	const byFamily = new Map<string, CatalogFont>();
	for (const list of lists) {
		for (const font of list) {
			const existing = byFamily.get(font.family);
			if (existing) {
				for (const provider of font.providers) {
					if (!existing.providers.includes(provider)) existing.providers.push(provider);
				}
				continue;
			}
			if (font.popularity === undefined) {
				const joined = popularity.get(font.family);
				if (joined) {
					font.popularity = joined.popularity;
					font.trending = joined.trending;
				}
			}
			byFamily.set(font.family, font);
		}
	}
	return [...byFamily.values()].toSorted(
		(first, second) => (first.popularity ?? Infinity) - (second.popularity ?? Infinity),
	);
}

function buildCatalog(providers: Array<ProviderName>): Promise<Array<CatalogFont>> {
	const key = [...providers].toSorted().join(',');
	const cached = catalogCache.get(key);
	if (cached) return cached;
	const promise = assembleCatalog(providers);
	catalogCache.set(key, promise);
	return promise;
}
