# CopyCloud product upgrade — acceptance gates
Branch: feature/product-upgrade, based on the editorial preview. Main is not changed.
## Baseline audit
Repository inventory includes classic and glass clients, editorial workspace, admin API, static SEO pages, Vite, Vercel, Supabase, service worker and CI. Generated dist and binary assets are not the implementation source.
- Legacy clips are accessed through browser Supabase calls and public uploads. Short codes are convenience identifiers, not secret keys. Existing clients and data must remain readable during migration.
- Admin deletion currently deletes records after storage errors; scheduled cleanup is not established by the repository.
- Public privacy claims about permanent deletion, complete anonymity and access restricted to a six-character code are unsupported. Google advertising and Vercel instrumentation are present in baseline.
- Service worker has malformed precache list and incomplete asset caching; editorial registration is absent.
- Dependency lockfile does not include earlier PDF.js addition; CI needs a regenerated lockfile.
## Release gates (not yet passed)
1. Unified workspace, original filenames and folders, real local operations and browser tests.
2. Private v2 cloud with atomic claim/limits, high-entropy capabilities, client encryption, password protection, revocation and verified cleanup; separate staging database first.
3. Resumable chunk transfer and integrity verification, retry and quota enforcement.
4. Authenticated WebRTC signaling, streamed direct transfer and nearby QR pairing. No claim that STUN alone works through all NATs; TURN requires separately approved infrastructure.
5. PWA offline shell, local drafts, text/file tools, docs and accessibility.
6. Real desktop/mobile cross-device acceptance tests, security review, performance gates, legacy compatibility, no production merge without owner approval.
## Protocol
v2 crypto primitives use 256-bit random secrets, AES-GCM with a fresh 96-bit IV and authenticated version/transfer/item/chunk context, and SHA-256. These primitives are not an enabled secure transfer feature by themselves. Never send decryption keys in HTTP query parameters. A future private cloud transfer must use separate revocation/authorization capabilities and a fragment or out-of-band key. No password-only or short-code-only E2EE claim.
