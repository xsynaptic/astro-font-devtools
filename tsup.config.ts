import { defineConfig } from 'tsup';

export default defineConfig({
	clean: true,
	dts: true,
	// index.ts = the integration (Node); toolbar.ts = the dev-toolbar client entrypoint,
	// referenced by the integration via `new URL('toolbar.js', ...)` after build.
	entry: ['src/index.ts', 'src/toolbar.ts'],
	format: ['esm'],
	target: 'es2022',
});
