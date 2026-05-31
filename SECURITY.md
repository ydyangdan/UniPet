# Security Policy

UniPet is a local-first desktop overlay. By default it listens on localhost and
does not send telemetry.

## Supported Versions

Security fixes target the latest npm release and the `main` branch.

## Reporting a Vulnerability

Please report security issues privately to the maintainer instead of opening a
public issue. If you cannot find a private contact path, open a minimal GitHub
issue that does not include exploit details and ask for a private channel.

Useful details include:

- UniPet version
- Operating system
- Connector involved
- Reproduction steps
- Whether the issue requires local access

## Security Expectations

- Bridge events should stay on `127.0.0.1` by default.
- Connectors should not modify upstream agent source code.
- Pet imports and market installs should avoid path traversal, symlinks, and
  unexpectedly large archives.
- New network behavior should be documented and opt-in where possible.
