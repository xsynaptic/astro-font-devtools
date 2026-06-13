# astro-font-devtools

Monorepo for [`@xsynaptic/astro-font-devtools`](packages/astro-font-devtools), an Astro dev
toolbar app for browsing fonts (Google, Fontsource, Bunny, Fontshare) and previewing them live
on your site. See the [package README](packages/astro-font-devtools/README.md) for usage.

## Layout

- [`packages/astro-font-devtools`](packages/astro-font-devtools): the published package
- [`playground`](playground): a local Astro app for trying the toolbar during development

## Development

```sh
pnpm install      # install dependencies and build the package
pnpm build        # rebuild the package (tsdown -> dist)
pnpm playground   # run the playground against the local workspace package
pnpm test         # run unit tests (vitest)
pnpm test:e2e     # run end-to-end tests (playwright, drives the playground)
pnpm check        # lint, type-check, format check, and knip
```

## Releasing

Versioning and publishing are managed by [changesets](https://github.com/changesets/changesets):

```sh
pnpm changeset          # describe a change + pick a semver bump
pnpm changeset version  # apply the bump and update CHANGELOG.md
pnpm release            # check, build, then publish to npm and tag
```
