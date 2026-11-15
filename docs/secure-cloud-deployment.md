# Private cloud staging deployment
Do not enable on production before staging acceptance. This migration introduces separate v2 tables and a private bucket, leaving legacy data untouched. The API is disabled unless CC_V2_ENABLED=true and all v2-specific variables are set.
Required server-only Vercel variables (Preview scope, a staging Supabase project):
- CC_V2_SUPABASE_URL
- CC_V2_SUPABASE_SERVICE_ROLE_KEY (never expose to the browser)
- CC_V2_SUPABASE_ANON_KEY (public key only)
- CC_V2_RATE_SECRET (random high-entropy server secret)
- CC_V2_ENABLED=true
- CRON_SECRET (random server secret for cleanup)
Apply supabase/migrations/202611150001_copycloud_v2.sql to staging. Check the private bucket, restrictive storage policy, table RLS, function grants, signed upload behavior and quota. Do not apply a destructive migration to clips/uploads.
Cleanup is authenticated GET /api/secure-transfer with Authorization: Bearer CRON_SECRET. A real scheduled job must be configured and tested before release. Supabase signed upload URLs are valid for up to two hours; expired/revoked rows remain for a second cleanup after that window. Signed downloads last at most 60 seconds and cannot be recalled once delivered. One-time access limits claims, not copies already held by a recipient.
The code is a convenience locator; a separate 256-bit access secret is required for a private claim. Encryption keys are distinct from access/owner capabilities and must remain client-side. No promise of permanent erasure, unlimited transfer capacity, or universal P2P connectivity.
