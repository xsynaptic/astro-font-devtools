import type { Connect } from 'vite';

import type { CatalogFont, ProviderName } from '../types.js';

import { bunnyCatalog } from './bunny.js';
import { fontshareCatalog } from './fontshare.js';
import { fontsourceCatalog } from './fontsource.js';
import { googleCatalog, googlePopularityMap } from './google.js';

const adapters: Record<ProviderName, () => Promise<Array<CatalogFont>>> = {
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
		Promise.all(providers.map((name) => adapters[name]())),
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
				for (const script of font.scripts) {
					if (!existing.scripts.includes(script)) existing.scripts.push(script);
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
