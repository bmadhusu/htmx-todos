# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Fastify application skeleton running TypeScript directly on Node 24, with no build step (FD-001)
- `/healthz` endpoint reporting status and the running commit, so a deploy can be identified rather than merely detected (FD-001)
- Continuous deployment to Railway from `main`, with GitHub Actions running typecheck and tests on every push (FD-001)
- Deploy verification that polls `/healthz` until the live service reports the pushed commit, so a green pipeline means the deploy actually landed (FD-010)

### Changed

- GitHub Actions is now the only path to production: `test` → `deploy` → `verify-deploy` run in sequence, so a commit with failing tests can no longer reach the live URL (FD-010)
- The running commit travels with the upload in a `.commit` file, because deploying from CI carries none of Railway's git metadata (FD-010)
