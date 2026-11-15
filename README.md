<div align="center">
<img src="public/logo.png" alt="CopyCloud logo" width="96" height="96" />
<h1>CopyCloud</h1>
<p>One workspace for text, files and device-to-device transfers.</p>
<a href="https://copycloud.me/">copycloud.me</a> · <a href="https://github.com/anshdeepofficial1/Copy-Cloud/pull/61">Product upgrade preview</a>
</div>

## Release status

This branch is a staged product upgrade, not the production release. Production is unchanged until the acceptance gates in [the upgrade plan](docs/product-upgrade.md) pass. No mandatory account or paid service is introduced.

### Transfer modes

| Mode | How it works | Current limits |
|---|---|---|
| Ordinary cloud | Legacy Supabase storage and six-character retrieval code | 40 MB, 24-hour UI expiry; not E2EE |
| Private cloud | Browser AES-GCM encryption, private storage, high-entropy access key and short-lived signed access | 40 MB, 15 min–24 h, staged/disabled until configured |
| Direct | WebRTC with authenticated manual pairing, encrypted frames, SHA-256 chunk checks | Both devices online; 2 GB safety cap with supported disk streaming; 40 MB browser-memory fallback |
| Nearby | Direct mode using host candidates only | Same-network pairing, no automatic discovery or guaranteed connectivity |

Private cloud supports a transfer name, description, optional password, access-session limits and revocation. A six-character code is a locator, not a decryption key. A secure link carries a separate access capability and encryption-key envelope in its fragment; share the optional password separately. Revocation cannot erase downloaded copies. Direct pairing requires a trusted exchange of the offer and response. There is no TURN relay or disconnected-session recovery yet.

## Workspace

- Unified text and attachments, clipboard-image paste, folder selection/drop, renaming, ordering, previews and duplicate detection.
- Browser-local image conversion, compression, crop/resize, PDF merge/extract/split/reorder/convert, image-to-PDF, ZIP operations, file metadata and SHA-256 inspection.
- JSON formatting, Markdown preview, syntax-highlighted code preview, QR creation and user-initiated QR scanning.
- Searchable local transfer history and optional IndexedDB draft recovery (40 MB, 24 hours).
- Free usage subject to infrastructure quotas; no unlimited storage promise.

## Development

Requires Node.js 22 and npm.

```sh
npm install
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser tests exercise the workspace, PDF canvas rendering, real peer delivery and mobile overflow. For the private-cloud integration test, use a disposable Supabase instance and the staging variables documented below; do not point tests at production.

## Architecture and deployment

React + TypeScript + Vite on Vercel. Existing Supabase legacy transfers remain compatible. The private v2 migration is isolated from legacy data. The app's private-cloud endpoint is disabled by default.

- [Upgrade acceptance gates](docs/product-upgrade.md)
- [Private cloud staging and migration](docs/secure-cloud-deployment.md)
- [Transfer protocol](docs/transfer-protocol.md)
- [Privacy and offline behavior](docs/privacy-and-offline.md)

The production service worker caches the app shell and previously used local tools, never API responses or transfer payloads. Network transfers require connectivity. The status page shows current reachability, not historical availability. Automatic physical cleanup of legacy uploads is not yet verified.

## Security and support

Do not share sensitive information using ordinary cloud mode. Report vulnerabilities privately rather than posting transfer keys or user data in public issues. See the website's privacy and terms pages. Do not merge this branch until the live staging RLS, quotas, cleanup scheduler, browser matrix and release checks are verified.
