# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).

Workflow:

1. Make your changes.
2. Run `pnpm changeset` and describe the change (pick a semver bump).
3. Commit the generated changeset file alongside your work.
4. To release, run `pnpm changeset version` to apply the bump and update `CHANGELOG.md`,
   commit that, then `pnpm release` to build and publish to npm.

The `access: public` setting in `config.json` ensures the scoped `@xsynaptic/*` package
publishes publicly. `commit: false` means changesets never commits for you.
