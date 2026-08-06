# Hermes → Mend inbox contract

How an agent (Hermes) drops structured suggestions into Mend. The app never
blocks on Hermes: this contract is stable and the agent targets it.
Mirror of the interpreter in `src/lib/inboxApply.ts` — that file is the
source of truth.

## Principles

1. **Suggestions only.** The agent writes to one staging node. Nothing
   touches the real record until a person taps **Apply** in the app.
2. **Write-only.** The agent identity can read *nothing* — not even the
   inbox. Every write must be unconditional and idempotent (no
   check-before-write; that pattern silently broke PayDay's sensor).
3. **Client-supplied ids.** The agent mints its own `$id` (e.g. a UUID or
   a content hash). Retrying a POST with the same id overwrites the same
   pending item — safe.

## Auth flow (REST, no SDK needed)

1. One-time setup (Sterling): Firebase console → enable Email/Password →
   create a dedicated agent user → note its UID → grant it in Mend
   (Settings → Hermes agent → paste UID → Grant). Revoke any time by
   deleting the grant or the user.
2. Sign in for an ID token (returns `idToken`, ~1 h lifetime, and a
   `refreshToken`):

   ```
   POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<WEB_API_KEY>
   { "email": "...", "password": "...", "returnSecureToken": true }
   ```

3. Write a suggestion (PUT = idempotent create-or-replace):

   ```
   PUT https://<DB>.firebaseio.com/households/<HID>/inbox/<ID>.json?auth=<idToken>
   ```

   `<HID>` is the household id (Sterling's uid; visible in the app URL to
   members — give it to the agent as config, since the agent can't read).

## Envelope (enforced by RTDB rules)

```jsonc
{
  "type": "ptSession" | "doseLog" | "metric",   // required, enum
  "payload": { ... },                            // free-form; validated app-side
  "receivedAt": 1791234567890,                   // required, epoch ms > 0
  "status": "pending"                            // required; agents may ONLY write "pending"
}
```

Rules also enforce: the agent uid must hold a grant (`agents/<uid> == true`);
it can create new items or overwrite its own items **while still pending**;
applied/dismissed items are frozen to it; no extra top-level keys.

## Payload shapes (validated in `inboxApply.ts`)

All fields optional unless marked. Unknown fields are ignored. Malformed
payloads surface in-app as "can't apply" cards with a reason — they are
never silently dropped, and never crash.

### `ptSession`

```jsonc
{
  "at": 1791234567890,          // epoch ms; default = receivedAt
  "kind": "clinic" | "home",    // default "clinic"
  "exercises": [                 // REQUIRED, at least one with a name
    { "name": "Quad sets", "sets": 3, "reps": 15,
      "resistance": "red band", "durationSec": 0 }
  ],
  "painPre": 6, "painPost": 3,  // 0–10, clamped
  "rom": { "knee flexion": 110 },
  "therapistNotes": "..."
}
```

Applies to `ptSessions/pt_<inboxId>` with `source: "hermes"`.

### `doseLog`

```jsonc
{
  "medName": "Naproxen",        // OR "medId"; name matching is exact,
                                 // case-insensitive; ambiguity rejects
  "at": 1791234567890,          // when taken; default = receivedAt
  "dateKey": "2026-08-06",      // default = local date of `at`
  "slot": "08:00",              // optional; present → converges on the
                                 // scheduled slot record (medId_0800)
  "note": "..."
}
```

Without `slot`, lands as an as-needed record at `prn_inbox_<inboxId>`.

### `metric`

```jsonc
{
  "dateKey": "2026-08-06",      // default = local date of receivedAt
  "pain": 4,                     // 0–10, clamped; pain and/or notes required
  "notes": "Slept badly"
}
```

## Testing the contract by hand

```bash
ID_TOKEN=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"'$AGENT_EMAIL'","password":"'$AGENT_PW'","returnSecureToken":true}' \
  | jq -r .idToken)

curl -X PUT "https://$DB.firebaseio.com/households/$HID/inbox/test-$(date +%s).json?auth=$ID_TOKEN" \
  -d '{"type":"ptSession","receivedAt":'"$(date +%s000)"',"status":"pending",
       "payload":{"exercises":[{"name":"Quad sets","sets":3,"reps":15}],
                  "painPre":6,"painPost":3}}'
```

The item should appear as a suggestion card on Today within a second, and
become an applied PT session on tap. Negative checks worth running once:
a GET as the agent (must 401/permission-denied), a write with
`status: "applied"` (must fail), a write to any other node (must fail).
