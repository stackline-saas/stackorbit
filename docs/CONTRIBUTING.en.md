# Contributing to StackOrbit

Thank you for helping improve StackOrbit. Please read the [Code of Conduct](../CODE_OF_CONDUCT.md) before participating.

## Development flow

1. Fork the repository and create a focused branch from `main` or `master`.
2. Use a descriptive prefix such as `feat/`, `fix/`, `docs/`, `refactor/`, or `chore/`.
3. Install dependencies with `pnpm install`.
4. Run `pnpm build` and the relevant tests before opening a pull request.
5. Use Conventional Commits, for example `fix(traefik): handle missing router configuration`.
6. Explain the motivation, implementation, testing, and operational impact in the pull request.

## Security and secrets

Never commit `.env` files, passwords, private keys, certificates, tokens, or production data. Read [SECURITY.md](../SECURITY.md) to report a vulnerability privately.

## Pull requests

Keep pull requests small and reviewable. Update documentation and `.env.example` when behavior or configuration changes. CI must pass before merge.
