# Security Policy

## Supported versions

Security fixes are applied to the latest stable release. Beta releases may receive fixes at the maintainers' discretion.

## Reporting a vulnerability

Please do not open a public issue for a security vulnerability. Report it privately through GitHub's **Report a vulnerability** feature, or contact the maintainers at the security contact published in the repository.

Include:

- affected version or commit;
- deployment environment and reproduction steps;
- impact and, if possible, a minimal proof of concept;
- any suggested mitigation.

We will acknowledge valid reports, investigate them privately, and publish a security advisory when a fix is available. Please avoid accessing, modifying, or deleting data that does not belong to you.

## Security practices

- Never commit `.env` files, private keys, certificates, or credentials.
- Rotate credentials immediately if they are exposed.
- Keep Docker, the host operating system, dependencies, and Traefik updated.
- Expose the administration port only through a trusted network or VPN.
- Change the default administrator credentials after installation.
