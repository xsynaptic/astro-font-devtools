import type { FontFaceData, FontStyles, Provider, UnifontOptions } from 'unifont';
import type { Connect } from 'vite';

import { createUnifont, providers as unifontProviders } from 'unifont';

import type { ProviderName } from './types.js';

type Storage = NonNullable<UnifontOptions['storage']>;
type UnifontInstance = Awaited<ReturnType<typeof createUnifont>>;

const providerFactories = {
	bunny: unifontProviders.bunny,
	fontshare: unifontProviders.fontshare,
	fontsource: unifontProviders.fontsource,
	google: unifontProviders.google,
} satisfies Record<ProviderName, () => Provider>;

let unifontPromise: Promise<UnifontInstance> | undefined;

export function createResolveHandler(providers: Array<ProviderName>): Connect.NextHandleFunction {
	return (req, res) => {
		const params = new URL(req.url ?? '', 'http://localhost').searchParams;
		const family = params.get('family');
		if (!family) {
			res.statusCode = 400;
			res.end('/* missing family */');
			return;
		}
		const provider = params.get('provider');
		const weights = (params.get('weights') ?? '400,700').split(',');
		const styles = (params.get('styles') ?? 'normal,italic').split(',') as Array<FontStyles>;
		const only = provider ? [provider] : undefined;
		getUnifont(providers)
			.then((unifont) =>
				unifont.resolveFont(
					family,
					{ formats: ['woff2'], styles, subsets: ['latin'], weights },
					only,
				),
			)
			.then((result) => {
				const css = result.fonts.map((face) => renderFontFace(family, face)).join('\n');
				res.setHeader('content-type', 'text/css');
				res.setHeader('cache-control', 'no-store');
				res.end(css);
			})
			.catch(() => {
				res.statusCode = 502;
				res.end('/* resolve failed */');
			});
	};
}

function getUnifont(providers: Array<ProviderName>): Promise<UnifontInstance> {
	const instances = providers.map((name) => providerFactories[name]());
	// createUnifont wants a non-empty tuple; `providers` always has at least one entry.
	unifontPromise ??= createUnifont(instances as [Provider, ...Array<Provider>], {
		storage: memoryStorage(),
	});
	return unifontPromise;
}

function memoryStorage(): Storage {
	const store = new Map<string, unknown>();
	return {
		getItem: (key) => store.get(key),
		setItem: (key, value) => {
			store.set(key, value);
		},
	};
}

function renderFontFace(family: string, data: FontFaceData): string {
	const src = data.src
		.map((source) =>
			'name' in source
				? `local("${source.name}")`
				: `url("${source.url}")${source.format ? ` format("${source.format}")` : ''}`,
		)
		.join(', ');
	const weight = Array.isArray(data.weight) ? data.weight.join(' ') : data.weight;
	const lines = [`font-family: "${family}"`, `src: ${src}`, 'font-display: swap'];
	if (weight !== undefined) lines.push(`font-weight: ${String(weight)}`);
	if (data.style) lines.push(`font-style: ${data.style}`);
	if (data.unicodeRange) lines.push(`unicode-range: ${data.unicodeRange.join(', ')}`);
	return `@font-face { ${lines.join('; ')}; }`;
}
