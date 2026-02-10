## Crew Console embedding plan (CSV importer)

Goal: keep this importer hosted where it already runs, add a button on each Crew Console index screen (Employees/Staff/Equipment/Jobs/Tasks/Customers) that deep-links here, and make sure auth + company context are handled automatically so users never see or copy tokens.

### Constraints to honor
- Leave hosting here; Console just links out (new tab or overlay) instead of embedding code.
- No user-visible auth steps; importer must learn the Console user + company implicitly.
- Importer expects `crewBaseUrl` and a Crew API token today (see `nuxt.config.ts` + `utils/crewClient.ts`).

### Auth & context handoff (recommended)
1) **Console issues a short-lived SSO token:** Add a Console backend endpoint (e.g., `POST /integrations/crew-import/token`) that only authenticated Console users can call. It signs a JWT (or encrypted blob) with fields: `sub` (Console user id), `company_id`, `email`, `name`, `scopes: ["crew-import"]`, `exp` (~5–10 minutes), and a nonce. Sign with a secret shared only with the importer service.
2) **Button links to importer with the token:** Each Console index page renders an “Import via CSV” button pointing to `https://<importer-host>/?sso=<token>&entity=<entity>`, where `entity` is one of `employees|staff|equipment|jobs|tasks|customers` to pre-focus the right row.
3) **Importer exchanges token server-side:** Add an importer endpoint (e.g., `POST /api/session/bootstrap`) that reads the `sso` token (from query or POST), verifies the signature/expiry, and calls back to a Console endpoint (e.g., `POST /integrations/crew-import/exchange`) to fetch:
   - the Crew API base URL for that tenant,
   - a company-scoped Crew API token (or a user-scoped token if required),
   - the resolved `company_id` and user metadata for logging.
   Store these in an HttpOnly session cookie (or server session) and set `runtimeConfig` per-request so `createCrewClient` uses the exchanged values.
4) **Session refresh + revocation:** If the session is older than the Crew token expiry, the importer redirects back to Console to get a fresh `sso` token. Honor revocation by rejecting tokens with invalid nonce/exp or that Console marks as revoked.

### UI entry points inside Console
- Add the button on each index page: Employees/Foremen, Staff, Equipment, Jobs, Tasks, Customers. Label e.g., “Import CSV”. Open in a new tab to keep Console state intact.
- Pass the `entity` query so the importer can auto-scroll to the relevant row (already supported by the rows list; we can add a small client-side focus in this repo if desired).

### Minimal changes required per repo
- **Console repo (blacklabapps/console):**
  - Backend: create the token-issuer and token-exchange endpoints; log who initiated the import.
  - Frontend: add the “Import CSV” buttons and build the importer URL with the SSO token + entity.
  - Config: define the shared signing secret and importer base URL.
- **Importer repo (this project):**
  - Add `/api/session/bootstrap` to validate SSO tokens and persist `crewBaseUrl` + `crewApiToken` per session.
  - Update `createCrewClient` to read from the per-request session before falling back to env vars.
  - Optional: accept `entity` query on `/` to scroll/focus the right upload row.

### Edge cases & safeguards
- Reject expired/invalid tokens with a friendly message that re-links to Console to fetch a fresh token.
- Ensure tokens are single-use (store nonce server-side for a brief window).
- Map permissions: only allow imports for users with Console roles that should import; deny otherwise during exchange.
- Log imports with user id + company id for audit; surface errors back to Console if exchange fails.

### Rollout steps
1) Ship Console backend endpoints + feature-flag the buttons.
2) Add importer bootstrap endpoint + session-based client.
3) Test end-to-end on staging with real Crew API tokens and multiple companies.
4) Enable the buttons by default once validation passes; keep the older manual-token flow as a temporary fallback if desired.
