# n8n Workflows — Node-by-Node Reference

This is a step-by-step walkthrough of every n8n workflow currently built for the portal (one is
built but intentionally left switched off — noted where it comes up), node by node, in
the order each one actually runs. It describes exactly what each node does and why — not a general
explanation of what an n8n node type is. For "how do I use the portal," see `USER_GUIDE.md`. This
file is the implementation detail behind that guide's "How it's built" section.

Source: the current exported workflow JSON (`n8n-workflows/`), read node by
node — this reflects what's actually built, not a summary from memory. Re-export and update this
file whenever a workflow's nodes change (`n8n export:workflow`, one workflow at a time).

## Two patterns used in almost every workflow below

Rather than re-explain these in every section, they're described once here:

1. **Validate-then-branch.** Most workflows start with a single Postgres node (named
   `Validate …`) that does all the lookup work in one query — checking the input exists, is in the
   right state, etc. — and returns a `rejection_reason` column that is `NULL` when everything
   checks out and a human-readable error string when it doesn't. The next node, an `If` node,
   checks `!$json.rejection_reason` (true = no error). The **true** branch continues to the actual
   write; the **false** branch goes straight to a `respondToWebhook` node that returns that message
   as a `400`. This means one query does both the validation and the error-message generation —
   there's no separate "figure out what went wrong" step.
2. **Audit tagging via `set_config` in the `WHERE` clause.** Every write query embeds
   `set_config('app.actor', 'n8n:<workflow name>', true) IS NOT NULL` inside its `WHERE`/`SELECT …
   WHERE` clause. Postgres evaluates this as part of running the query, which sets a session
   variable the database's own audit trigger reads to record *who* made the change. It's written
   this way (not a separate `SET` statement) because n8n's Postgres node can't run a leading `SET`
   under parameterized queries — folding it into the query's own `WHERE` guarantees it only fires
   exactly when a row is actually written.

Every WhatsApp "send notification" node runs with **"continue on error"** — if the WhatsApp send
fails (e.g. a template isn't approved, or sending is switched off), the workflow still finishes and
still returns a success response to the portal. A notification failure never blocks the underlying
action.

---

## A. Asset-request lifecycle

These five workflows are the request → decision → fulfilment chain. Each is triggered by a
webhook the portal (via the backend API) calls directly.

### 1. Portal - Submit Asset Request
**Webhook:** `POST /webhook/portal-asset-request`
**Connects to webapp:** `POST /api/v1/asset-requests` (`requests.py:submit_asset_request`) forwards
here as-is. Called from the **New Request** page, by any logged-in role, always as the caller
themselves — this endpoint has no on-behalf-of option.

1. **Webhook** — receives `employee_id`, `device_type_id`, `requested_qty`, and optional
   `purpose`/`department`/`needed_by_date`/`asset_specification`.
2. **Validate submission** (Postgres) — looks up the employee and the device type in one query;
   builds `rejection_reason` if the employee code doesn't exist or the device type doesn't exist.
3. **If valid** — true → step 4; false → **Respond rejected** (`400`, the message from step 2).
4. **Insert request** (Postgres) — `INSERT INTO asset_requests (...) ... RETURNING request_id`,
   status defaults to `submitted`. Tagged `n8n:Portal - Submit Asset Request`.
5. **Mirror ticket (open)** (Postgres) — inserts a matching row into `it_requests` (the internal
   ticket log) with `status='open'`, linked back to the request via `source_asset_request_id`.
6. From here the flow fans out to two parallel branches (deliberately not chained one after the
   other, so a multi-row lookup in the second branch can't cause the webhook to respond twice):
   - **Respond submitted** — returns `{request_id, status: "submitted"}`, `200`.
   - **Get approvers** (Postgres) — `whatsapp_contacts` joined to `app_users` for everyone with
     role `management` or `super_admin` — one row per approver.
   - **Send approval request** (WhatsApp) — for each approver row, sends the
     `request_needs_approval` template with the request id/device type/qty/employee id filled in,
     plus Approve/Reject quick-reply buttons.

### 2. Portal - Approve Asset Request
**Webhook:** `POST /webhook/portal-approve-asset-request`
**Connects to webapp:** `POST /api/v1/asset-requests/{id}/approve` (`requests.py:
approve_asset_request`, role-gated to `management`/`super_admin`). Called from the **Approvals**
page's Approve button. Also entered a second way, indirectly: workflow #11 below calls this exact
same webhook when someone taps "Approve" on a WhatsApp message — same logic, two front doors.

1. **Webhook** — receives `request_id`, `decided_by`.
2. **Approve request** (Postgres) — `UPDATE asset_requests SET status='approved', approved_by=…,
   approved_at=now() WHERE request_id=… AND status='submitted' RETURNING …`. The
   `AND status='submitted'` guard is what stops a request from being approved twice.
3. **Found?** — checks the update actually returned a row (a nonexistent id, or one already
   decided, returns nothing). True → step 4; false → **Respond not found** (`400`).
4. **Mirror ticket (in_progress)** (Postgres) — updates the matching `it_requests` row to
   `in_progress`.
5. Fans out to:
   - **Respond approved** — `{request_id, status: "approved"}`, `200`.
   - **Get IT team contacts** (Postgres) — `whatsapp_contacts` joined to `app_users` for role
     `it` **only** (narrower than the "it/management/super_admin" set used elsewhere — this
     notification is specifically for IT to go fulfil it).
   - **Send approved notice** (WhatsApp) — `request_approved` template to each IT contact.

### 3. Portal - Reject Asset Request
**Webhook:** `POST /webhook/portal-reject-asset-request`
**Connects to webapp:** `POST /api/v1/asset-requests/{id}/reject` (`requests.py:
reject_asset_request`, role-gated to `management`/`super_admin`). Called from the **Approvals**
page's Reject button. Also entered indirectly by workflow #11 once a rejection reason is typed
back over WhatsApp.

1. **Webhook** — receives `request_id`, `decided_by`, `notes` (rejection reason).
2. **Reject request** (Postgres) — same `status='submitted'` guard as Approve, but sets
   `status='rejected'`, `rejected_by`, `rejected_at`, `rejection_reason`.
3. **Found?** — true → step 4; false → **Respond not found** (`400`).
4. **Mirror ticket (rejected)** (Postgres) — updates `it_requests` to `rejected` with
   `resolution_notes` set to the reason.
5. **Respond rejected** — `{request_id, status: "rejected"}`, `200`.
6. Two independent notification branches run off the same rejection (this is the one workflow that
   notifies two different audiences on the same event, by design — "on reject, notify both IT and
   the employee, no further action"):
   - **Get employee contact** → **Send rejected notice** — `request_rejected` template to the
     employee who submitted the request.
   - **Get IT team contacts** (role `it`) → **Send rejected notice (IT team)** — the same template
     to IT, so IT knows not to expect to fulfil it.

### 4. Portal - Fulfill Asset Request
**Webhook:** `POST /webhook/portal-fulfill-request`
**Connects to webapp:** `POST /api/v1/asset-requests/{id}/fulfill` (`requests.py:
fulfill_asset_request`, role-gated to `it`/`management`/`super_admin`). Called from the
**Fulfillment** page's Fulfil action, after IT picks a matching asset from
`GET /api/v1/assets/available`.

1. **Webhook** — receives `request_id`, `asset_id`, `decided_by`.
2. **Validate fulfillment** (Postgres) — checks the request exists **and is `status='approved'`**,
   and the asset exists; builds a `rejection_reason` covering "not approved yet", "asset doesn't
   exist", asset/device-type mismatch, or insufficient quantity.
3. **If valid** — true → step 4; false → **Respond rejected** (`400`) — this is the gate that makes
   TC-A6 ("fulfil before approval") fail cleanly instead of silently allocating.
4. **Apply fulfillment** (Postgres, multi-CTE) — the one query that does everything:
   - Works out whether the stock line has more quantity than the request needs; if so, splits off
     a derived row (`<asset_id>-S<n>`, linked via `split_from_asset_id`) holding exactly the
     requested quantity, and decrements the original line.
   - Creates the `asset_allocations` row directly as `status='active'` (no intermediate "pending"
     state) — `source='n8n_fulfillment'`.
   - Updates the asset: `current_employee_id` = the requester, `party_type='person'`,
     `asset_status='in_use'`.
   - Updates the request: `status='fulfilled'`, `fulfilled_asset_id`, `resulting_allocation_id`.
   - This node runs with **"continue on error"**: if a concurrent fulfilment already changed the
     same stock line (a real race, e.g. two people fulfilling from the same bundle
     simultaneously), the `assets_qty_nonnegative_chk` constraint aborts the statement and the
     workflow follows the **error branch** to **Respond conflict** (`409`) instead of crashing.
5. Success path fans out to:
   - **Mirror ticket (resolved)** (Postgres) → **Respond fulfilled** (`{request_id, allocation_id,
     status: "fulfilled"}`, `200`) and, in parallel, **Get requester contact** → **Send fulfilled
     notice** (WhatsApp, `request_fulfilled` template, to the employee who gets the asset).

### 5. Portal - Mark Request Needs Purchase
**Webhook:** `POST /webhook/portal-request-needs-purchase`
**Connects to webapp:** `POST /api/v1/asset-requests/{id}/needs-purchase` (`requests.py:
mark_needs_purchase`, role-gated to `it`/`management`/`super_admin`). Called from the
**Fulfillment** page's Needs Purchase action.

1. **Webhook** — receives `request_id`, `fulfilled_by` (who's flagging it), optional notes.
2. **Mark needs purchase** (Postgres) — `UPDATE asset_requests SET status='needs_purchase', …
   WHERE request_id=… AND status='submitted'` — same "only from submitted" guard pattern.
3. **Found?** — true → step 4; false → **Respond not found** (`400`).
4. **Mirror ticket (needs_purchase)** (Postgres) — updates the matching `it_requests` row to
   `needs_purchase`.
5. Fans out to:
   - **Respond needs purchase** — `{request_id, status: "needs_purchase"}`, `200`.
   - **Get IT/mgmt contacts** (role `it`/`management`/`super_admin`) → **Send needs-purchase
     notice** (WhatsApp, `request_needs_purchase` template) — flags it to the whole admin group,
     not just IT, since it may need a purchasing decision.

---

## B. Allocation lifecycle (Return / Lost / Write Off)

These act on an asset that's already allocated to someone (an active `asset_allocations` row),
rather than on a request.

### 6. Portal - Return Asset
**Webhook:** `POST /webhook/portal-return`
**Connects to webapp:** `POST /api/v1/returns` (`requests.py:submit_return`). Called from the
**Return Asset** page, by any logged-in role — for `it`/`management`/`super_admin` the endpoint
accepts an `employee_id` to act on behalf of someone else, otherwise it's always the caller's own
asset.

1. **Webhook** — receives `asset_id`, `employee_id`, `received_by`, `condition_in`
   (`Good`/`Fair`/`Damaged`/`Not Working`), optional notes.
2. **Validate return** (Postgres) — confirms the asset exists and has an **active** allocation for
   that employee; builds `rejection_reason` for "doesn't exist" / "no active allocation" cases.
3. **If valid** — true → step 4; false → **Respond invalid** (`400`).
4. **Apply return** (Postgres) — `UPDATE asset_allocations SET status='returned', returned_at=now(),
   received_by, condition_in, return_notes WHERE allocation_id=… AND status='active'` (the
   `status='active'` guard is the race-safety check — see step 5), then updates the asset:
   custody resets to the IT team custodian, and `asset_status` becomes `'damaged'` if
   `condition_in` is Damaged/Not Working, otherwise `'available'`.
5. **Return applied?** — checks the update actually returned a row. This catches the case where
   two return calls raced and the allocation was already closed by the other one a moment earlier.
   True → step 6; false → **Respond already recorded** (`400`).
6. **Respond returned** (`{allocation_id, asset_id, status}`, `200`), and in parallel:
   **Get IT/mgmt contacts** (role `it`/`management`/`super_admin`) → **Send return notice**
   (WhatsApp, `asset_returned` template).

### 7. Portal - Mark Asset Lost
**Webhook:** `POST /webhook/portal-mark-lost`
**Connects to webapp:** `POST /api/v1/returns/lost` (`requests.py:mark_lost`, role-gated to
`management`/`super_admin` — **not** `it`). Called from the **Return Asset** page's Mark Lost
button, which is only rendered for those two roles.

1. **Webhook** — receives `asset_id`, `received_by` (who's recording it), optional notes.
2. **Validate** (Postgres) — confirms the asset exists and has an active allocation; looks up the
   current holder's name for the notification.
3. **If valid** — true → step 4; false → **Respond invalid** (`400`).
4. **Apply lost** (Postgres) — `UPDATE asset_allocations SET status='lost', received_by, …
   WHERE status='active'`, then `UPDATE assets SET asset_status='lost'`. Unlike a return, custody
   is deliberately **not** reset to the team — the asset stays attributed to the employee who lost
   it, and `returned_at` is left `NULL`.
5. **Respond lost** (`{allocation_id, asset_id, status: "lost"}`, `200`), and in parallel:
   **Get IT/mgmt contacts** → **Send lost notice** (WhatsApp, `asset_marked_lost` template).

### 8. Portal - Write Off Asset
**Webhook:** `POST /webhook/portal-write-off`
**Connects to webapp:** `POST /api/v1/returns/write-off` (`requests.py:write_off`, role-gated to
`management`/`super_admin` — **not** `it`). Called from the **Return Asset** page's Write Off
button, alongside Mark Lost.

Same shape as Mark Lost, with one difference in the write step:

1–3. **Webhook → Validate → If valid** (identical pattern to Mark Lost).
4. **Apply write off** (Postgres) — `UPDATE asset_allocations SET status='written_off', …`, then
   `UPDATE assets SET current_employee_id='IPACTM001' (IT Team), party_type='team',
   asset_status='retired'`. Custody **does** reset to the team here (unlike Lost), but the asset is
   retired rather than made available again — it's out of service, not back in the pool.
5. **Respond written off** (`200`), and in parallel: **Get IT/mgmt contacts** → **Send write-off
   notice** (WhatsApp, `asset_written_off` template).

---

## C. Other portal actions

### 9. Portal - Toggle Asset High Value
**Webhook:** `POST /webhook/portal-toggle-high-value`
**Connects to webapp:** `POST /api/v1/assets/{asset_id}/high-value` (`requests.py:
set_high_value`, role-gated to `it`/`management`/`super_admin`). Called from the **Assets**
(admin) page's high-value toggle.

1. **Webhook** — receives `asset_id`, `is_high_value` (boolean).
2. **Validate** (Postgres) — `SELECT asset_id FROM assets WHERE asset_id = $1` — just confirms it
   exists.
3. **If valid** — true → step 4; false → **Respond invalid** (`400`, "Asset … does not exist.").
4. **Apply toggle** (Postgres) — `UPDATE assets SET is_high_value = $2::boolean WHERE asset_id =
   $1 RETURNING asset_id, is_high_value`. The value is cast explicitly to `boolean` rather than
   relying on n8n's default parameter substitution, specifically so that toggling it **off**
   (`false`) doesn't get silently dropped as a "falsy" value before reaching the query.
5. **Respond success** — `{asset_id, is_high_value}`, `200`. No notification — this is an
   internal admin/reporting flag, not a lifecycle event.

### 10. Portal - Send Password Reset Email
**Webhook:** `POST /webhook/portal-password-reset-email` — the only webhook in the fleet gated by
header authentication (every other one accepts unauthenticated calls, a known accepted gap covered
in the security documentation).
**Connects to webapp:** called from inside `POST /api/v1/auth/password-reset/request`
(`password_reset.py:_send_reset_email`) — unlike every other row in this file, the backend doesn't
just forward the caller's request: it first generates and stores the reset token itself, then
calls this webhook purely to send the email. Triggered by "Forgot password" on the **Login**
page.

1. **Webhook** — receives `name`, `email`, `reset_link` (the backend has already generated and
   stored the reset token before calling this).
2. **Build email** (Code) — assembles a plain HTML email body containing the reset link and a note
   that it expires in 20 minutes and works once.
3. **Send reset email** (Gmail) — sends it to the address the backend passed in.
4. **Respond** — `{sent: true}`, `200`.

---

## D. Inbound WhatsApp (approve/reject by replying to a message)

Two workflows exist that do the same job; only one is actually switched on.

### 11. Portal - WhatsApp Webhook — **the live one**
**Webhook:** `GET`/`POST /webhook/whatsapp-inbound` (a raw webhook, not n8n's native WhatsApp
trigger — chosen so only this one path is exposed publicly, not all of n8n)
**Connects to webapp:** not called by the webapp at all — the caller is Meta's WhatsApp Cloud API
directly, hitting n8n over the public internet. It connects back into the same logic the webapp
uses by calling workflows #2 and #3 above (over `http://localhost:5678`, n8n calling itself)
exactly as if the portal itself had made the request.

**GET path — Meta's one-time subscription handshake:**
1. **Verify Handshake (GET)** — receives `hub.mode`/`hub.verify_token`/`hub.challenge` query params.
2. **Token matches?** — checks `hub.mode == subscribe` and the verify token matches the configured
   secret. True → **Echo challenge** (returns `hub.challenge` as plain text, `200` — this is what
   completes Meta's subscription). False → **Reject (GET)** (`403`).

**POST path — every real inbound WhatsApp event:**
3. **Inbound Events (POST)** — receives the raw event body.
4. **Verify signature** (Code) — recomputes an HMAC-SHA256 over the *raw* request body using the
   app secret, and compares it to the `X-Hub-Signature-256` header with a timing-safe comparison
   (not a plain `===`, to avoid leaking timing information about how much of the signature
   matched).
5. **Signature valid?** — true → step 6; false → **Reject (POST)** (`403`) — an unsigned or
   forged request never reaches any of the logic below.
6. **Acknowledge** — immediately responds `200 EVENT_RECEIVED` to Meta (Meta expects a fast ack
   regardless of what happens next). The webhook call is now closed, but the workflow execution
   keeps running in the background from here.
7. **Parse inbound** (Code) — pulls the actual message out of Meta's nested payload shape
   (`entry[0].changes[0].value.messages[0]`) and classifies it as a **button** press (with a
   `payload` string) or a plain **text** reply.
8. **Route** (Switch) — three explicit branches based on `kind` + `payload` (anything matching
   none of them, e.g. an image or an unsupported message type, is simply dropped — there's no
   catch-all branch):
   - `kind=button` and `payload` starts with `APPROVE_` → the Approve branch.
   - `kind=button` and `payload` starts with `REJECT_` → the Reject branch.
   - `kind=text` (a plain-text reply, in practice a rejection reason) → the "resolve a pending
     reject reason" branch.
9. **Approve branch**: **Approve: lookup** (Postgres, resolves the sender's phone number to an
   `employee_id` via `whatsapp_contacts`) → **Approve: registered?** — if the phone isn't a known
   contact, **Reply: not registered (approve)** is sent back and nothing else happens. If it is,
   **Call approve webhook** (HTTP request to this same n8n instance's
   `portal-approve-asset-request` webhook — i.e. it re-enters workflow #2 above) → **Reply:
   approved** (a plain WhatsApp text confirming it).
10. **Reject branch**: **Reject: lookup** → **Reject: registered?** — same registered-number
    check. If registered, **Open pending reject** (Postgres `INSERT … ON CONFLICT (phone_number)
    WHERE resolved_at IS NULL DO UPDATE` — at most one open "waiting for a reason" ask per phone
    number at a time) → **Reply: ask reason** (asks the approver to reply with why).
11. **Plain-text branch** (the reason reply): **Find open pending** (Postgres, looks up that
    phone's still-open pending-reject row) → **Resolve pending** (marks it resolved) →
    **Call reject webhook** (re-enters workflow #3 with the typed text as the rejection reason) →
    **Reply: rejected** (confirms it back over WhatsApp).

### 12. Portal - WhatsApp Inbound — **built, not active**
**Connects to webapp:** none — not called by the webapp, and not currently called by anything
else either, since it's inactive.

Structurally identical routing logic to workflow #11 (same Approve/Reject/pending-reason branches),
but built on n8n's *native* `whatsAppTrigger` node instead of a raw webhook. Left inactive: the
native trigger has to register its callback URL with Meta directly from n8n's own configured
`WEBHOOK_URL`, and activating it would also expose more of n8n's built-in HTTP surface than the
single scoped path workflow #11 uses. Kept in the project as a built alternative, not wired live.

---

## E. Scheduled risk detection

Both run daily on a schedule (`scheduleTrigger`, 11:15) — nothing calls these from the portal.
**Connects to webapp:** one-directional, backwards. The webapp doesn't trigger either workflow,
but its own `GET /api/v1/dashboard/summary` (`dashboard.py:get_summary`) directly queries the same
`rental_risk_flags`/`offboarding_risk_flags` tables these workflows maintain, for the Dashboard
page's `open_rental_risk`/`open_offboarding_risk` tiles. The workflow writes the row, the webapp
just reads it later — there's no webhook or API call between them.

### 13. Phase3 - Rental Risk Detection
1. **Schedule Trigger** — fires daily at 11:15.
2. **Execute a SQL query** (Postgres) — `UPDATE rental_risk_flags SET status='resolved',
   resolved_at=now() WHERE status='open' AND asset_id NOT IN (SELECT asset_id FROM
   v_rental_risk)` — closes any flag whose asset no longer matches the risk criteria (e.g. the
   asset was returned or reassigned since it was flagged).
3. **Execute a SQL query1** (Postgres) — `INSERT INTO rental_risk_flags (...) SELECT … FROM
   v_rental_risk r WHERE NOT EXISTS (a still-open flag for that asset already)` — opens a new flag
   for every asset the view currently considers at risk that isn't already flagged. The view
   itself defines "at risk" (a Purchase/Rental asset in one of several problem states, held by a
   resigned employee) — this workflow just reconciles the flag table against it.
4. **Execute a SQL query2** (Postgres) — aggregates currently-open flags by vendor, plus a total
   and a "new today" count, for the email.
5. **Code in JavaScript** — builds an HTML summary table (vendor / flagged / lost counts) and an
   email subject line from the aggregated rows.
6. **Send a message** (Gmail) — emails the summary to the configured IT recipients.

### 14. Phase3 - Offboarding Risk Detection
Same reconcile-then-email shape as Rental Risk Detection:
1. **Schedule Trigger** — daily at 11:15.
2. **Auto-resolve closed flags** (Postgres) — closes any open flag whose asset no longer matches
   `v_offboarding_risk` (e.g. it's been returned or reassigned).
3. **Insert new open flags** (Postgres) — opens a flag for every asset the view currently flags
   (an `in_use` asset still held by a resigned employee) that isn't already open.
4. **Aggregate for summary** (Postgres) — groups open flags by employee name, plus totals.
5. **Build email** (Code) — HTML summary + subject, explicitly noting the email is a detection
   report only — nothing is reclaimed or changed automatically.
6. **Send a message** (Gmail) — emails it.

---

## F. Scheduled reporting digests

**Connects to webapp:** neither of these two is called by the webapp, and — unlike the risk
detection pair above — the webapp doesn't read their output back either: `v_daily_it_summary` and
`v_weekly_it_summary` are views built specifically for these emails, not queried anywhere in
`webapp/backend`. Their only other consumer is Metabase's own "Daily/Weekly IT Summary" cards on
the dashboard embedded in the portal — a separate system reading the same database independently,
not a call between the workflow and the webapp.

### 15. Phase3.5a - Daily IT Summary Digest
1. **Schedule Trigger** — daily at 11:45.
2. **Query Daily Summary** (Postgres) — `SELECT * FROM v_daily_it_summary` (activity events today,
   new requests today, pending approvals, needs-purchase backlog).
3. **Build digest text** (Code) — formats those four numbers into an HTML bullet list with a
   dated subject line.
4. **Send daily digest** (Gmail) — sends it to the configured IT distribution addresses.
5. **Prepare report_log row** (Code) — packages a `run_name`/`status`/the Gmail response's message
   id into a row shape.
6. **Log to report_log** (Postgres) — inserts that row, so every digest run leaves an auditable
   record of whether it actually sent (and what the mail provider's message id was), not just that
   the workflow executed.

### 16. Phase3.5a - Weekly IT Summary Digest
1. **Schedule Trigger** — Mondays at 11:45 only.
2. **Query Weekly Summary** (Postgres) — `SELECT … FROM v_weekly_it_summary` — asset counts by
   office and device type, plus each row's change versus the prior week's snapshot.
3. **Build weekly digest text** (Code) — rolls the per-device-type rows up into per-office totals,
   works out this week's Monday date for the subject line, and renders an HTML table (office /
   assets / Δ vs prior week / open rental-risk flags) plus a grand total across all offices.
4. **Send weekly digest** (Gmail) — sends it.
5. **Snapshot this week's counts** (Postgres) — `INSERT INTO report_weekly_snapshot (...) SELECT
   …, sum(qty) FROM assets GROUP BY office_id, device_type_id ON CONFLICT (...) DO UPDATE` — this
   is what next week's "Δ vs prior week" is computed against; it's idempotent, so re-running the
   workflow the same week updates the same snapshot rather than duplicating it.
6. **Prepare report_log row** / 7. **Log to report_log** — same auditable-run-record pattern as
   the daily digest.

---

## Where the frontend/backend fit around all this

None of the business logic above lives in the FastAPI backend or the React frontend — the backend's
job for every one of these is just: check the caller is logged in and has the right role, then
forward the request to the matching webhook above and pass its response straight back. That's the
`USER_GUIDE.md` "How it's built" split in practice: the workflow above **is** the logic; FastAPI is
the gate in front of it.
