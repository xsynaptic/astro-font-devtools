import { defineConfig } from 'tsdown';

export default defineConfig({
	// index.ts = the integration (Node); toolbar.ts = the dev-toolbar client entrypoint,
	// referenced by the integration via `new URL('toolbar.mjs', ...)` after build. Both are
	// explicit entries (not a glob) so the rest of src/ bundles into them.
	dts: true,
	entry: ['src/index.ts', 'src/toolbar.ts'],
	format: 'esm',
	minify: true,
});
