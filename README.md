# @xsynaptic/astro-font-devtools

An Astro dev toolbar app for browsing fonts (Google, Fontsource, Bunny, Fontshare) and previewing
them live on your site.

> This is an early prototype. The API and feature set are still changing.

## Usage

```ts
// astro.config.ts
import fontDevtools from '@xsynaptic/astro-font-devtools';

export default defineConfig({
	integrations: [fontDevtools()],
});
```
