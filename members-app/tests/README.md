# Workflow verification

Run with Node.js 22.13+ (node:sqlite required):

```sh
node tests/workflows.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The tests load the actual server routes, authorization, schema and query code against an isolated in-memory SQLite database through the D1 interface. They replace only Firebase identity lookup with known verified/unverified identity fixtures. No production accounts, memberships, sessions or reservations are changed.

Covered: email-verification requirements; preservation of existing membership IDs and approvals; anonymous/member/admin authorization; same-origin writes; approval and revocation; booking capacity, duplicates and cancellation; session editing, archive and restore; attendance finalization; public leaderboard consent. Firebase console setup and browser sign-in must additionally be verified on the deployed site.
