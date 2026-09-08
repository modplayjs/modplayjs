# Contributing

## Changesets (versioning & changelog)

This repo uses [Changesets](https://changesets.dev) — per-package
`CHANGELOG.md` files and git tags are generated automatically.

When a PR changes a package's behavior, add a changeset file describing
the change and which packages get which bump:

```sh
npx changeset
```

Pick the affected packages (e.g. `@modplayjs/dsp-softmixer`), the bump
level (`patch` for fixes, `minor` for features), and write a summary —
the summary becomes the changelog entry verbatim. Commit the generated
`.changeset/*.md` file with your PR.

On merge to `main`, the Release workflow consumes pending changesets and
opens a **Version Packages** PR. Merging that PR bumps versions, writes
the per-package changelogs, creates git tags, and pushes them. The
packages are private, so nothing is published to npm.

## Build & test

```sh
npm run build       # turbo: all packages
npm run typecheck
sh tools/run-mixer-data-tests.sh   # mixer-state parity vs libxmp goldens
```

CI builds only the packages affected by a PR (plus everything depending
on them); root manifest changes build all packages.
