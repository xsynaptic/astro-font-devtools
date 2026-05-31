import type { AstroIntegration } from 'astro';

import { describe, expect, it } from 'vitest';

import fontDevtools from '../src/integration.js';

type ConfigSetup = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type SetupArg = Parameters<ConfigSetup>[0];

function runConfigSetup(command: SetupArg['command']) {
	let addedApps = 0;
	let viteConfig: unknown;
	const context = {
		addDevToolbarApp: () => {
			addedApps += 1;
		},
		command,
		updateConfig: (config: unknown) => {
			viteConfig = config;
		},
	};
	const setup = fontDevtools().hooks['astro:config:setup'];
	if (!setup) throw new Error('astro:config:setup hook is missing');

	void setup(context as unknown as SetupArg);

	return { addedApps, viteConfig };
}

describe('fontDevtools', () => {
	it('exposes the integration contract', () => {
		const integration = fontDevtools();

		expect(integration.name).toBe('@xsynaptic/astro-font-devtools');
		expect(integration.hooks['astro:config:setup']).toBeTypeOf('function');
		expect(integration.hooks['astro:server:setup']).toBeTypeOf('function');
	});

	it('registers the toolbar and pre-bundles zod in dev', () => {
		const { addedApps, viteConfig } = runConfigSetup('dev');

		expect(addedApps).toBe(1);
		expect(viteConfig).toEqual({ vite: { optimizeDeps: { include: ['zod'] } } });
	});

	it('does nothing outside dev', () => {
		const { addedApps, viteConfig } = runConfigSetup('build');

		expect(addedApps).toBe(0);
		expect(viteConfig).toBeUndefined();
	});
});
