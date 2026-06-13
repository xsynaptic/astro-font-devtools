# @xsynaptic/astro-font-devtools

## 0.2.0

### Minor Changes

- Reorganize the repo into a pnpm monorepo: the package now lives under `packages/astro-font-devtools` with a private, tooling-only root. Adopt changesets for versioning and publishing, consolidate ESLint onto the shared `@xsynaptic/eslint-config`, and gate releases on the full lint, type-check, format, build, and unit/e2e test suite. No changes to the package's runtime behavior or public API.

### Patch Changes

- Escape interpolated values in CSS attribute selectors with `CSS.escape()`. Font keys, family names, and provider ids that contain CSS-special characters no longer break the selector used to find or remove injected `<style>` elements and provider toggles.
