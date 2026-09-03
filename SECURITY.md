# Security Policy

## Product threat model

The Security tab is a static STRIDE review of the drawn architecture, not
vulnerability, CVE, or dependency scanning.

Spec-Design-Yard is a **local architecture IDE**. Specs live on disk in the
project folder you choose. There is no multi-user mode, no cloud backend,
and no authentication on the project or store APIs.

The intended deployment is a single operator on loopback (`127.0.0.1`).
Anyone who can reach the HTTP port can read and overwrite files under the
active project directory. Do not bind to `0.0.0.0` and do not expose the
process on a public or untrusted network.

In-process controls (loopback `Host` checks, JSON Content-Type
requirements, project-epoch 409s) are defense-in-depth for a local tool,
not a substitute for network isolation.

## Supported versions

Security fixes land on the current development line (`main`). There is no
long-term support channel yet; do not treat a git tag as a supported
release until a v1 is cut.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories:

https://github.com/thamam/spec-design-yard/security/advisories/new

Do not open a public issue for an exploitable local-data or remote-code
problem. We will acknowledge privately and coordinate disclosure.
