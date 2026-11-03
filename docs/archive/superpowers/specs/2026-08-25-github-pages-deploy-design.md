# GitHub Pages Deployment Design

## Goal

Deploy the built game to `https://deadronos.github.io/pixel-dwarves-digging/` whenever a tag matching `v*` is pushed, while preserving normal root-path behavior for local development and preview.

## Approach

Use a GitHub Actions Pages workflow triggered by pushed version tags. The workflow will check out the tagged commit, install the locked npm dependency tree, run the test suite, build the Vite application, upload `dist` as a Pages artifact, and deploy it through the official GitHub Pages actions.

Vite will use an environment-aware base path:

- GitHub Actions builds use `/pixel-dwarves-digging/`, matching the repository Pages URL.
- Local builds and `vite dev` use `/`, keeping the existing localhost workflow unchanged.

## Workflow behavior

The workflow will:

1. Run on `push` events whose tag name matches `v*`.
2. Grant only the permissions required to read source, upload Pages artifacts, and deploy Pages.
3. Use npm lockfile installation with `npm ci`.
4. Run `npm test -- --run` and `npm run build` before publishing.
5. Upload `dist` and deploy it to the `github-pages` environment.
6. Prevent concurrent deployments from racing while allowing the active deployment to finish.

## Verification

Local verification will run typecheck/build-relevant project checks and inspect the generated `dist/index.html` to confirm that asset URLs include `/pixel-dwarves-digging/` when the Actions environment variable is set, while the default local build remains rooted at `/`.

No application routing changes are required because the game is a single-page client application served from the Pages base path.
