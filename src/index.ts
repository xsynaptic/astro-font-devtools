import type { AstroIntegration } from 'astro';

import type { ProviderName } from './types.js';

import { createCatalogHandler } from './catalog.js';
import { createResolveHandler } from './resolve.js';

interface Options {
	/** Which font providers to browse. Defaults to Fontsource only. */
	providers?: Array<ProviderName>;
	/** CSS custom properties exposed as swap targets. */
	vars: Array<string>;
}

const APP_ID = 'astro-font-devtools';

export default function fontDevtools(options: Options): AstroIntegration {
	const { providers = ['fontsource'], vars } = options;
	return {
		hooks: {
			'astro:config:setup': ({ addDevToolbarApp, command }) => {
				if (command !== 'dev') return;
				addDevToolbarApp({
					// Source in dev (Vite compiles the .ts), built file once published.
					entrypoint: new URL(
						import.meta.url.endsWith('.ts') ? 'toolbar.ts' : 'toolbar.js',
						import.meta.url,
					),
					icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><text x="8" y="13" font-family="serif" font-size="14" font-weight="700" text-anchor="middle" fill="currentColor">Aa</text></svg>`,
					id: APP_ID,
					name: 'Font Devtools',
				});
			},
			'astro:server:setup': ({ server, toolbar }) => {
				server.middlewares.use('/__astro-font-devtools/catalog', createCatalogHandler(providers));
				server.middlewares.use('/__astro-font-devtools/resolve', createResolveHandler(providers));
				toolbar.on(`${APP_ID}:init`, () => {
					toolbar.send(`${APP_ID}:config`, { vars });
				});
			},
		},
		name: '@xsynaptic/astro-font-devtools',
	};
}
