# Chrome Distribution Guide (MARK II)

This project targets Manifest V3 and is distributed using Chrome's official channels.

## Recommended Channels

1. `Chrome Web Store` (public or unlisted): recommended for normal users.
2. `Developer mode unpacked`: for local development/testing only.
3. `Enterprise self-host`: only for managed enterprise environments.

## Pre-Publish Checklist

- Keep extension permissions minimal and purpose-specific.
- Ensure `host_permissions` only include required hosts.
- Provide a public privacy policy URL.
- Ensure listing text matches actual behavior (single purpose).
- Verify all network endpoints are documented.
- Build production bundle and package deterministic zip.

## Build and Package

From repo root:

```bash
bash scripts/package-extension.sh
```

Outputs:

- `artifacts/mark2-extension-v<version>.zip`
- `artifacts/mark2-extension-v<version>.sha256`

Upload the zip to Chrome Web Store Dashboard.

## GitHub Distribution Trust Signals

If sharing outside CWS, publish:

- Release notes per version.
- SHA256 checksum for zip.
- Source tag matching release.
- Clear warning that non-CWS installation is for developers/managed environments.

## Important Note

For regular users on Chrome (Windows/macOS), CWS publication is the safest and most compatible path.

