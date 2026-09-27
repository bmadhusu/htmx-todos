# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Fastify application skeleton running TypeScript directly on Node 24, with no build step (FD-001)
- `/healthz` endpoint reporting status and the running commit, so a deploy can be identified rather than merely detected (FD-001)
- Continuous deployment to Railway from `main`, with GitHub Actions running typecheck and tests on every push (FD-001)
