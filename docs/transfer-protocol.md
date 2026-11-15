# CopyCloud transfer protocol (v2 staged)
The public-facing API is an evolving, capability-authenticated protocol, not a stable production SDK yet.
## Private cloud
POST /api/secure-transfer, JSON action and fields. HTTP 429 is a rate-limit rejection; retry after the returned delay. No third-party analytics are required. Do not log request bodies or key envelopes.
- status: returns enabled and public Supabase connection parameters only if staging is configured.
- create: id (UUID v4), six-character code, SHA-256 hashes of separately generated access/owner tokens, minutes (15/60/360/1440), maxClaims (1–100), objects (opaque path + ciphertext byte length). Reserves quota idempotently.
- upload: id, owner token, paths (max 20). Returns existing-size matches or signed upload tokens. Upload ciphertext to private copycloud-v2 bucket. Chunks are 1 MiB or smaller.
- finalize: id, owner. Checks all stored ciphertext objects and sizes before publishing.
- claim: code, access token. Atomically increments access count and returns a short-lived grant, transfer UUID, expiry.
- download: id, grant, paths. Returns signed URLs valid up to 60 seconds. Grant cannot authorize new reads after expiry/revocation.
- ownerStatus / revoke: id and owner token. Revocation prevents new claims/authorizations; signed URLs already issued may remain valid briefly, and downloaded copies cannot be revoked.
- GET with CRON_SECRET: cleanup. Production scheduling still needs verification.
Each ciphertext object begins with 12 random IV bytes, followed by AES-GCM ciphertext and 16-byte authentication tag. AAD is JSON [2,transferId,itemId,index]. File names, paths, description, text and chunk SHA-256 hashes are in an encrypted manifest. Decryption and SHA-256 verification occur in the browser. Encryption keys never enter the API. Key envelopes are URL fragments; password mode wraps a random key using PBKDF2-SHA256 and AES-GCM. Use a strong password: anyone holding the envelope can attempt offline password guessing.
## Direct and Nearby
Offer token contains session UUID, mode, random 256-bit pairing secret, SDP and expiration. The receiver's SDP response is HMAC authenticated with the pairing secret. Exchange both through a trusted channel. DataChannel frames contain a length-prefixed header (kind, sequence, IV) and AES-GCM ciphertext, with direction/kind/sequence bound to AAD. Metadata is encrypted. Each 32 KiB data chunk carries a SHA-256 digest and an explicit receiver acknowledgment, with backpressure and pause/resume during an open connection. File paths are validated. Large files may stream directly into a user-selected folder; browsers without File System Access use bounded memory. Nearby has host candidates only; Direct uses a public STUN server, no TURN. No automatic discovery or recovery after disconnection.
## Legacy compatibility
Existing clips rows and uploads remain readable. New ordinary attachments include a reserved metadata file preserving original names, relative paths and SHA-256. Older clients may display this metadata as an extra downloadable file. Ordinary cloud is not E2EE and has public object URLs.
