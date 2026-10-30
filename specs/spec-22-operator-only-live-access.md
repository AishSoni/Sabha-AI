# Spec 22 (Phase 6): Operator-Only Live Access

## Purpose and prerequisites

Make Sabha a hiring-portfolio application with two honest access paths: a public,
account-free guided replay, and the full hosted live application behind a login
held only by the project owner. Recruiters can explore the recorded journey
without supplying credentials or funding inference; the owner can demonstrate
live operation during an interview.

This is **one operator accessing the existing shared workspace**, not a
multi-user product. Use Supabase Auth for authentication and an exact,
server-configured operator user UUID for authorization. A valid Supabase account
alone never grants live access.

Read Specs [05](spec-05-frontend-transport-and-state.md),
[12](spec-12-database-read-isolation.md),
[14](spec-14-live-and-replay-composition.md),
[19](spec-19-replay-release-acceptance.md), and
[21](spec-21-in-app-evidence-previews.md), plus the
[runtime contract](reference-runtime-modes-and-credentials.md) and
[architecture contracts](reference-architecture-contracts.md). Preserve Spec 20's
off-loop execution and bounded-resource behavior. Characterize current live
workflows before changing their admission boundary.

**Decision supersession:** this spec replaces earlier requirements that live
HTTP remain public/no-sign-in and that all frontend Auth SDK imports be forbidden.
It does not replace public replay's no-account/no-Auth-bootstrap contract,
database isolation, provider-vault guarantees, or participant knowledge scopes.
Earlier specs and their completion records remain historical evidence, not
instructions to bypass the new gate. This document is a planned assignment,
not proof that authentication or hosted acceptance has shipped. Spec 19's
unexecuted hosted gates remain unexecuted.

## Grounding

- `backend/app/presentation/router.py::mount_routes` centrally mounts all live
  module routers. `bootstrap.py::create_app` mounts replay separately and already
  supports `REPLAY_ONLY=true`/`mount_live=False`. This is the seam for a blanket
  live gate without adding checks to every domain use case.
- `bootstrap.py::_ensure_demo_guard` blocks writes only. Neither that guard,
  CORS, the homepage choice, nor hiding frontend links protects live reads.
- `backend/app/platform/database.py` owns a shared server service-role client.
  Migration `030_database_read_isolation.sql` removes direct browser-role live
  access. Authentication must not mutate that client's session or grant browser
  database/Storage/RPC rights.
- `frontend/src/app/` exposes `/meetings`, `/roster`, `/knowledge-stacks`, and
  `/settings` outside any access boundary. Live pages are client-composed;
  `/demo` already has its own composition. The homepage's `sabha:experience`
  preference is not identity or authorization.
- `frontend/src/shared/api/transport.ts` is shared by both runtimes. JSON and
  byte requests accept headers, multipart currently does not, and absolute URLs
  can pass through. Global token injection here would risk replay coupling and
  credential leakage.
- Seven live API clients live under the frontend's
  `features/meetings/api/{client,closing-client,turn-client}.ts`,
  `features/persona-catalog/api/client.ts`, `features/settings/api/client.ts`,
  and `features/knowledge/api/{client,stacks}.ts`.
  `turn-client.ts::observe` performs a separate SSE `fetch`;
  `features/meetings/runtime/live-evidence.ts` loads private bytes. Gate all of
  them, not just JSON mutations. Recorded closing/event decoders remain shared
  and auth-free.
- The frontend already declares `@supabase/supabase-js`, but
  `frontend/tests/architecture/checker.ts` forbids SDK imports everywhere.
  `replay-boundaries.test.ts` walks the recorded room's transitive imports.
  Both need deliberate, narrow contract changes rather than deleted checks.
- Live uses a browser QueryClient and a stable live projection scope. Logout
  needs explicit invalidation, cancellation, vault locking, and stale-completion
  protection; clearing a rendered login flag is insufficient.

Source anchors describe the reviewed checkout; recheck callers before editing.
The deployed frontend/API/proxy topology and effective Supabase settings have
not been verified as part of this specification.

## Bounded scope and non-goals

Add one authentication adapter, one operator policy/dependency, central live
route protection, a small authorization-status read, a login/logout lifecycle,
live authenticated transport, and test/operations coverage. Keep current live
URLs and real live/replay feature components.

Do not add ownership columns/backfills, per-user query filters, tenant RLS,
registration/invitations, roles/teams/billing, public BYOK onboarding, or a
multi-account cache scheme. No meeting/persona/knowledge schema migration is
required. Do not rewrite workers, RPCs, RAG eligibility, operation durability,
the replay package, or the shared evidence viewer to implement this gate.
Preserve trusted local provider/Ollama configuration and existing hosted
credential-selection policy; enabling login does not silently enable new
server-key fallbacks.

## Requirements

### 1. Provision one managed identity and fail closed

- Manually provision the owner's email/password account in the configured
  Supabase Auth project. Disable **Allow new users to sign up** and anonymous
  sign-ins; disable unused sign-in providers. Do not expose a signup, account
  creation, magic-link onboarding, or password-recovery workflow in Sabha.
  Account recovery/rotation is an operator runbook task.
- Add a required `OPERATOR_USER_ID` UUID and an explicitly public Auth API key
  setting, such as `SUPABASE_AUTH_PUBLISHABLE_KEY`, alongside `SUPABASE_URL`.
  The public key may be the supported publishable/legacy anon key, never the
  service-role/secret key. Frontend equivalents are
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Validate operator/Auth configuration before constructing or mounting the live
  HTTP graph. Missing/invalid configuration must prevent live startup, never
  select an unauthenticated fallback. Apply the gate whenever live HTTP is
  mounted, regardless of `runtime_mode` or `APP_ENV`; a default `local` value
  must not become a hosted bypass. Tests inject a verifier, not a production
  bypass flag.
- Replay-only startup/imports must need no operator UUID, Auth client/key,
  service-role credential, provider, or live recovery graph. A standalone live
  worker is not a browser endpoint and must not acquire a browser-session
  dependency merely to execute admitted work.
- Keep passwords, session tokens, provider keys, and server credentials out of
  committed examples, generated artifacts, logs/traces and error bodies. Public
  project URL/key configuration is not authority to read live application data.

### 2. Authenticate and authorize once at the live HTTP boundary

Implement a narrow access capability, for example under
`backend/app/modules/access/`, using the existing presentation/composition and
application/infrastructure dependency rules. Do not create a generic identity
framework or couple business services to Supabase Auth types.

Accept only `Authorization: Bearer <access_token>`. Verify it through the
configured project's trusted Auth `getUser(access_token)` operation, or its
equivalent `/auth/v1/user` request, before comparing the returned user ID with
`OPERATOR_USER_ID`. Use an async, pooled, bounded-time verification adapter, or
the established bounded off-loop boundary for a synchronous SDK. Do not add a
blocking network request to the event loop or a new connection pool per request.

Never trust a decoded JWT alone, a browser-supplied user ID/email, session
storage's embedded user record, `getSession()` as server authorization, or an
unverified proxy identity header. Verification targets the configured project,
not an issuer/URL supplied by the token or request. Never call `set_session` or
sign in on the shared service-role database client. Do not cache positive
authorization across requests in this initial implementation.

| Outcome | Required response |
| --- | --- |
| Missing/malformed/invalid/expired/tampered/wrong-project access token | `401`, safe existing `detail` envelope and a Bearer challenge |
| Verified user other than the configured operator | `403`, stable `"Operator access denied"` detail, distinct from business-policy denials |
| Verification timeout or Auth service unavailable | Safe `503` with `"Access verification unavailable"`; no live adapter dispatch or permissive fallback |
| Verified configured operator | Dispatch the existing live use case |

Wrap every live module router in one parent `APIRouter` dependency, or an
equivalent centrally enforced boundary. Preserve paths/prefixes/tags and apply
it to reads, commands, probes, multipart uploads, original/derived document
content, operation status, SSE observation, and legacy summary/turn adapters.
Even static live participant templates remain behind the same policy. Resolve
authorization before business adapters, file persistence or paid effects; this
does not promise that the server never receives/parses a rejected request body.
If the legacy demo write guard is also enabled, order the live policies so
authentication denial wins on live paths; an admitted operator still receives
the existing read-only denial for prohibited demo-mode writes. Do not move the
public replay write guard behind authentication.

Add `GET /api/access/session` within the protected live graph, returning only a
small typed authorization result such as `{ "authorized": true }`. It verifies
the operator without fetching workspace/provider data and gives the frontend
one authoritative admission probe. Login and refresh still go directly to
Supabase Auth; do not implement password/token proxy endpoints in Sabha.

Mount `/api/replay/*` outside this dependency. Keep its existing read-only
command rejection and restricted reader intact. Generic `/`, `/health`, CORS
preflight and schema/docs may remain public only if they contain no private data
or credentials. An inventory/boundary test must fail if a future live route is
mounted without operator authorization; a single protected example is not proof.

Authenticate SSE before opening the subscription and on every reconnect. Keep
tokens in headers, never EventSource query strings, asset URLs or stream events.
Authorization is request admission, not a new continuous session/worker lease:
an already authorized in-flight response can finish, and logout cannot retract
bytes already delivered. Document this limit instead of promising instantaneous
revocation of every open connection.

### 3. Compose a private frontend without bootstrapping Auth for replay

Add `/login` and a protected route-group layout, for example
`app/(operator)/layout.tsx`, covering `/meetings` and all descendants, `/roster`,
`/knowledge-stacks`, and `/settings`. Preserve their browser URLs. Keep `/`,
`/demo` and every replay descendant outside it; the root provider must not
initialize Supabase Auth just to render public content.

Use a single lazy browser Auth adapter, for example
`shared/access/browser-session.ts`, and a feature/composition-owned access UI
and lifecycle. Permit the Supabase SDK import only in that adapter. Expose Auth
operations, not the underlying database/Storage client. Shared code must still
not import feature stores, query keys, or app modules. A client boundary is
sufficient for the current client-composed pages; backend enforcement remains
authoritative. Do not add SSR cookies or framework middleware without an actual
server-rendered private-data requirement. If private server reads are later
introduced, they need the same verified boundary before rendering/caching data.

Model loading, signed-out, authorizing, operator-ready, forbidden, and service
unavailable states explicitly. Do not mount private children or run their
queries until the backend authorization probe succeeds. A locally restored
session alone is not readiness. Offer email/password sign-in and explicit
logout; clear password form state after submission. Wrong credentials and a
valid non-operator account must not reveal workspace content or the configured
operator's identity. A forbidden account gets a sign-out action, not a redirect
loop. A temporary Auth/API outage gets a safe retry state, not automatic logout
or an infinite retry loop.

Preserve only validated same-origin live-path return targets after login; reject
absolute/protocol-relative/external destinations. Public deep links stay public.
Update path-sensitive tests and architecture rules when route files move so the
route group cannot accidentally evade the existing import checks.

Use the SDK's managed browser session persistence in its dedicated Auth storage
namespace. Access/refresh tokens may persist there; this is an explicit Auth
session policy, **not** a claim that they have the provider vault's encrypted
at-rest guarantee. Never persist the login password, place Auth tokens in Query,
Zustand persistence, URLs or replay artifacts, or use the vault passphrase to
unlock a login. A restored login does not unlock the provider vault; reload
still starts that vault locked. Treat same-origin XSS as a risk to both Auth
sessions and unlocked credentials, not as something login solves.

### 4. Authenticate every live transport, never public assets

Add a live-only transport layer over the generic JSON/form/byte helpers and the
existing fetch-based SSE transport. It obtains a current SDK access token,
attaches Bearer authorization, and composes caller cancellation with the active
access-lifecycle signal. Keep the generic transport and shared stream decoders
free of Auth imports, session bootstrap and feature state.

- Migrate all seven live clients, live evidence-byte reads, direct live stream
  fetches, and any remaining live request callers found by an import/fetch
  audit. Add multipart header support without setting `Content-Type` manually;
  the browser must still supply the form boundary.
- Only attach tokens to the explicitly configured live API origin/base-path
  and approved live routes. Reject arbitrary absolute URLs, protocol-relative
  URLs, path escapes and redirects in the authenticated transport. Never send a
  token to `/api/replay`, a replay asset/public Storage URL, citation URL or a
  third-party viewer. `NEXT_PUBLIC_API_URL` may identify a separate trusted API
  host; TLS is required when hosted.
- Keep `X-Provider-Key`/transient provider handoff separate from the login token.
  Logging in does not supply a provider key or relax its non-persistence rules.
- An Auth `401` or operator-denial `403` ends private admission and tears down
  the active private scope; do not treat it as an ordinary retryable data error.
  Distinguish the stable access-denied response from a business-policy `403`,
  which must not log out an authorized operator. SDK refresh can happen before
  dispatch, but never automatically replay a paid/stateful request after
  rejection or an uncertain response. Preserve current command idempotency and
  no-auto-retry policy. Reconnecting an authenticated observation is a read,
  not resubmission of its command.

### 5. Make logout, session loss and late responses safe

On logout, verified session loss, or operator denial:

1. Immediately stop new private admission and unmount private screens, even if
   remote sign-out is slow or fails. A late login/probe/refresh result must not
   re-enable the ended scope.
2. Abort live JSON/form/byte requests, polling and SSE observations; close private
   previews and revoke blob URLs. Clear private Query records, mutation results,
   projections and sensitive drafts. Guard late completions by an access epoch
   or equivalent lifecycle identity so an abort-ignoring result cannot refill a
   cleared cache or a subsequent login.
3. Lock the existing provider vault and clear its in-memory credential/key
   capability. Preserve encrypted provider envelopes and unrelated non-secret
   preferences unless the operator explicitly chooses Forget.
4. Clear the managed local Auth session and propagate logout/session loss to
   other active operator tabs using the supported SDK lifecycle. Test actual
   cross-tab behavior; no tokens belong in an application broadcast payload.

Do not reset unrelated replay progress/caches or make replay import the Auth
adapter to perform cleanup. Simply navigating into replay is not logout and
must not clear the live vault/cache or cancel admitted work. A durable turn,
closing or ingestion operation can finish using its already admitted bounded
handoff; logout detaches observation, not implicit server cancellation or a new
promise to recall dispatched provider credentials. After sign-in, observe the
existing operation instead of automatically starting it again.

A lifecycle already activated by operator login may remain subscribed to clean
up retained private state while that browser displays replay. Public replay must
neither initialize that lifecycle nor depend on its readiness or availability.

### 6. Present the portfolio boundary and document deployment

Make guided replay the public primary entry. Replace first-visit public live
setup/BYOK invitations and misleading "your own meetings and knowledge" copy
with an unobtrusive **Operator login** entry and disclosure equivalent to:
"Interactive replay of a recorded session. Live demonstration available during
interviews." A saved `sabha:experience=live` preference must not bypass the gate
or force new visitors into a login loop. Existing live navigation is available
only within the admitted operator experience.

At implementation, update `README.md`, `.env.example`, `docs/OPERATIONS.md`,
the runtime/architecture references and affected test contracts. Add a hosted
runbook for account provisioning, disabled registration/anonymous access, exact
UUID configuration, public-key versus service-key handling, password/session
rotation, logout limitations, and private response caching. Protected live
responses must not be stored in shared/CDN caches; use
`Cache-Control: private, no-store`, including private bytes and streams, while
preserving replay's immutable-public-asset policy.

Update the actual API inventory, OpenAPI security scheme/operation requirements,
401/403/503 contracts, frozen schema and generated frontend types **when the
implementation ships**, not as if this plan were already deployed. Public replay
operations must not inherit a global OpenAPI security requirement. Adapt old
no-sign-in scans to assert protected live/public replay coverage rather than
removing them. Keep direct Supabase database/Storage permissions restricted for
both `anon` and `authenticated`; enabling Auth requires no live browser grants.

The application backend must enforce authorization at its direct origin as
well as through the public frontend/proxy. Do not rely on CORS, obscured hosts,
referer checks, frontend redirects or an unverified proxy header. Additional
edge access control is optional defense in depth, not a substitute for this
gate. Do not change a real hosted account, Auth setting, grant or deployment
without separate operational authorization.

## Tests to write first

### Backend admission and architecture

- Missing/malformed/expired/tampered/wrong-project tokens return `401`; a real
  verified non-operator returns `403`; only the configured UUID is allowed.
  Forged user IDs, emails, mode flags, proxy headers, provider keys and locally
  altered session records cannot authorize. Auth timeout/unavailability returns
  safe `503` with zero business-adapter calls.
- Enumerate every mounted live method/path, including legacy adapters, static
  templates, provider probes, uploads, ingestion status/retry, document bytes,
  closing and turn SSE. Prove absent/wrong identity cannot reach handlers or
  effectful adapters, and new unprotected live mounts fail the boundary test.
  Verify dependency ordering with rejecting adapter sentinels, not only OpenAPI.
- Operator admission preserves JSON, multipart boundary/limits, exact-revision
  content and incremental/resumable SSE behavior. Reconnect reauthenticates;
  rejected streams never send a private frame. Private responses are no-store.
- Missing operator/Auth config rejects live composition before live adapter
  construction in every runtime mode. Replay-only composition and public reads/
  streams work without it; forged replay writes still fail before effects.
  Auth verification neither changes service-role client state nor blocks the
  event loop. Live workers retain their existing recovery/credential contracts.
- General regression fixtures may explicitly override the verifier with a
  synthetic operator; denial/security suites must exercise the real dependency
  and adapter protocol. No autouse override may silently disable those tests.
  Keep the database browser-role denial and replay-reader permission suites.

### Frontend transport, state and boundaries

- Direct navigation/reload of every private namespace waits for backend
  admission before mounting queries; signed-out redirects preserve only safe
  targets. Bad credentials, forbidden account, blocked storage and service
  outage have distinct safe UI and no loop or content flash.
- JSON, uploads, evidence bytes and every direct live SSE fetch carry only the
  intended access token to the trusted API. Redirect/URL-escape tests prove no
  Auth/provider secret reaches replay, Storage assets or arbitrary origins.
  Refresh races and access denials never replay create/upload/generation/closing;
  a business-policy `403` does not terminate a valid operator session.
- Logout during pending reads, mutations, previews, streaming, login or refresh
  clears private state, revokes blob URLs and locks the vault. Delayed results
  cannot repopulate the ended or newly admitted scope. Cross-tab sign-out and
  restored-session/locked-vault reload are covered without clearing replay.
- The SDK exception permits only the dedicated Auth adapter; database/provider
  SDKs remain forbidden elsewhere. Walk public replay route/layout/provider and
  runtime import graphs to prove no Auth/vault/live transport dependency or
  eager initialization, including shared component barrels and route moves.

### Browser and hosted acceptance

- In a fresh production-build browser context, enter and finish the approved
  replay, restart, open evidence and deep links without sign-in, Auth network
  bootstrap, vault access, live API calls or new application writes. Two public
  contexts keep independent progress; package/hash and Spec 19 gates are intact.
- In a separate operator context, sign in and exercise list/create/roster/stacks/
  settings, representative upload/preview, turn/reconnect and closing workflows
  with synthetic controlled providers. Logout while observing; a public context
  cannot see those records or operation events by calling the known URLs.
- Exercise simultaneous operator/replay tabs and cross-tab logout. Replay does
  not change the private vault or live operation; logout clears private UI and
  previews without resetting a mounted public replay. Existing live regression,
  shared preview, architecture, type/build and OpenAPI drift suites stay green.
- With separate authorization, verify the deployed Supabase signup/anonymous
  settings and operator UUID; deny unauthenticated/non-operator calls at both
  the proxy and direct API origin; check real browser upload/download/SSE,
  private cache headers, CORS and HTTPS. Recheck effective browser-role live
  database/Storage/RPC denial. Never use paid inference or destructive live data
  as a required test fixture.

## Small implementation slices

Use the existing mandatory red-green-refactor method. Record the intended red
failure, smallest passing implementation, regression results and unexecuted
checks for each slice; do not land an authorization stub as a security gate.

1. Pin public replay/private live access expectations and configuration failures;
   implement the verifier adapter and exact operator policy with controlled
   Auth responses and rejecting live sentinels.
2. Protect the full live router tree and add the authorization-status read;
   verify route coverage, response caching, replay-only startup and unchanged
   service-client/worker boundaries.
3. Add the narrow browser Auth adapter and live JSON/form/byte/SSE transport;
   prove origin/path restrictions, error classification and no command replay.
4. Move existing live routes under the private layout, add login/logout, and
   implement access-epoch cleanup, vault locking and cross-tab behavior.
5. Update public entry copy, boundary checks, actual API artifacts and operations
   documentation together; run full live/replay/preview regression and browser
   journeys before claiming local acceptance.
6. Separately authorize and execute hosted account/configuration, direct-origin,
   cache, permission and browser/SSE checks; record the release decision.

## Exit gate and rollback

Public visitors can use only the account-free recorded experience; no valid
non-operator identity or direct API call exposes live data, bytes or effects.
The configured operator can use all existing live workflows through the hosted
platform. Login and provider-vault unlock remain distinct. Logout/session loss
cannot leave private browser state or stale subscriptions visible, replay never
bootstraps Auth, and workers/replay packages/domain ownership remain unchanged.

Record exact commands, environment/dependency versions, local and deployed
results, account/configuration verification without secrets, and remaining
limitations only after execution. Conditional local acceptance is permitted;
unexecuted hosted checks mean hosted protection is **unproven**, not passed.
This gate does not retroactively close Spec 19's outstanding public-release
checks.

Security rollback disables live mounting with `REPLAY_ONLY=true` or removes live
exposure at both frontend and API while retaining verified public replay. It
must never restore the old unauthenticated live API, relax database grants,
delete existing workspace records, or claim that stopping observation cancels
an admitted job. Re-enable live only after configuration and denial tests pass.

Implementation references: Supabase's current
[Auth configuration](https://supabase.com/docs/guides/auth/general-configuration),
[`getUser`](https://supabase.com/docs/reference/javascript/auth-getuser),
[`getSession`](https://supabase.com/docs/reference/javascript/auth-getsession),
and [session lifecycle](https://supabase.com/docs/guides/auth/sessions)
documentation. Recheck the installed SDK versions before implementing; a stored
session record is not server-verified authorization.
