# @xsynaptic/astro-font-devtools

An Astro dev toolbar app for browsing fonts (Google, Fontsource, Bunny, Fontshare) and previewing
them live on your site.

> Early prototype; the API is still changing.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/xsynaptic/astro-font-devtools/tree/main/playground)

## Setup

Requires Astro 6+.

```sh
npm install -D @xsynaptic/astro-font-devtools
```

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import fontDevtools from '@xsynaptic/astro-font-devtools';

export default defineConfig({
	integrations: [fontDevtools()],
});
```

Run `astro dev`, open the dev toolbar, and pick **Font Devtools**. By default only Fontsource is
queried; pass `providers` to add more:

```ts
fontDevtools({ providers: ['google', 'fontsource', 'bunny', 'fontshare'] });
```

You can also pre-seed targets:

```ts
fontDevtools({ targets: ['--font-display', 'h1', 'p', '.card'] });
```

## Development

```sh
pnpm install
pnpm dev # rebuilds on change; link into an Astro project to try it live
```
