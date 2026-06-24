# Linkr — Project Progress & Status

> **Living document:** everything built so far, how to run it, and what's next.  
> For the original product blueprint (vision, rules, full roadmap), see [`projectlinkr.md`](./projectlinkr.md).

**Last updated:** June 25, 2026 — **Sprint 3.2 (video calls)**: 1:1 **video calls are live** on the same WebRTC engine/signaling as voice (no server changes) — camera+mic capture via `requestCallMediaAccess`, full-screen remote video with a mirrored local PiP, **camera on/off** toggle, 720p target bitrate; remote audio still routes through the engine's `<audio>` element so earpiece/speaker/BT switching is unchanged; the header **Video** button is now live for accepted friends. Earlier — **Phase 4.2 patch (round 3)**: privacy is now **two independent settings** — **Profile details** (display name, status, bio) and **Profile picture** (avatar thumbnail + zoom); `@username` always visible; **Everyone** picture = strangers see photo **without zoom**, friends can zoom; **`user:profile-changed`** socket + silent cache merge keeps search/contact card/chat list fresh **without modal flicker** (15s background refetch fallback). Builds on **round 2** (E2EE prompt, interim split privacy, contact-card poll fix) and **round 1** (sidebar previews, call reliability, privacy enforcement).

Earlier (Sprint C.2.2 — Contact info button now toggles the profile pane open/closed; self chat renamed "Self chat" everywhere and now shows your own custom-status chip)

Earlier (Sprint C.2.1 — status popover fixes (above messages, no label, fits text), 50-char status cap, emoji picker now uses the real dark/light theme + docks below the field on mobile, self avatar is click-to-zoom)

Earlier (Sprint C.2 — Contact info opens a side profile (right-drawer on tablet), circular avatar lightbox, **self chat**, header "last seen X ago" when offline, custom status moved to a floating chip, compact scrollable emoji picker)  
**Tagline:** Connect privately. Talk freely.  
**Brand:** Iris Violet `#7C5CFC` (gradient → `#9D7BFF`)

---

## Current status (at a glance)

| Area | Status |
|------|--------|
| Monorepo + dev tooling | ✅ Done |
| UI shell + 6 themes | ✅ Done |
| Google login + JWT + onboarding | ✅ Done |
| Friends (search, requests, block) | ✅ Done |
| Real-time 1:1 chat (Socket.IO) | ✅ Done |
| Professional UI overhaul | ✅ Done |
| Edit profile (display name, bio, status) | ✅ Done |
| Message actions (reply, edit, delete, react) | ✅ Done |
| Pin chats | ✅ Done |
| Dev test bot (`@linkr_bot`) + UX polish | ✅ Done |
| Media messages (image + file) | ✅ Done |
| In-app notifications | ✅ Done |
| Block / Unblock (everywhere + in chat) | ✅ Done |
| Friend-request actions in the bell | ✅ Done |
| Profile photo upload | ✅ Done |
| UX polish (scroll lock, blue ticks, close chat) | ✅ Done |
| Unfriend + per-user delete chat | ✅ Done |
| Composer emoji picker | ✅ Done |
| Details Media / Files galleries | ✅ Done |
| Media preview before send (staging) | ✅ Done |
| Click profile → details + mobile details sheet | ✅ Done |
| End-to-end encryption (E2EE) — text, human↔human | ✅ Done (Phase 2) |
| Real SMS phone OTP (MSG91 widget + server token verify) | ✅ Done (dev OTP fallback kept) |
| Onboarding profile photo (Add a photo on the Profile step) | ✅ Done |
| Voice calls (WebRTC, HD Opus audio) | ✅ Done (Sprint 3.1) |
| Call UX (background bar, mute/speaker, sounds, call log) | ✅ Done (Sprint 3.1.1) |
| Call UX polish (WhatsApp bar, log align, smart audio routing) | ✅ Done (Sprint 3.1.2) |
| Call UX polish (full-screen-first, audio-route dropdown, BT icon) | ✅ Done (Sprint 3.1.3) |
| Bluetooth route icon correct on mobile | ✅ Done (Sprint 3.1.4) |
| Mobile audio dropdown + earpiece default + mic gate | ✅ Done (Sprint 3.1.5) |
| Call resync after refresh (ghost BUSY + Ringing/Connecting desync) | ✅ Done (Sprint 3.1.6) |
| Reliable incoming-call delivery (ack + retry, accurate Ringing) | ✅ Done (Sprint 3.1.7) |
| Call delivery fix (fetchSockets, pending retry, sync poll) | ✅ Done (Sprint 3.1.8) |
| Explicit incoming ack + early handler (no Socket.IO server ack) | ✅ Done (Sprint 3.1.9) |
| Per-socket accept/WebRTC relay + reconnect replay | ✅ Done (Sprint 3.1.10) |
| Caller handler bind fix + offer diagnostics (3.1.11) | ✅ Done (Sprint 3.1.11) |
| Video calls (WebRTC, 720p, camera toggle + local PiP) | ✅ Done (Sprint 3.2) |
| Mute notifications + archive chats (per-user) | ✅ Done (Phase 4) |
| Privacy settings UI (last seen / profile / requests) | ✅ Done (Phase 4) |
| Forward message (friends only) + share contact | ✅ Done (Phase 4) |
| Report user | ✅ Done (Phase 4) |
| Account deletion (15-day soft + immediate purge) | ✅ Done (Phase 4) |
| Screen share, groups | ❌ Phase 3 (3.3+) / Phase 6 |

**You are here:** **MVP complete — Sprints 0–5 done, plus Sprint 5.5 UX & social polish, Sprint 5.6 social actions + emoji + media galleries, and Sprint 5.7 "Add friend" reachability + not-friends composer gate.** Sprint 5 shipped media messages (images + files, encrypted **in transit**, with Cloudinary-or-local-disk storage) and in-app notifications (a real notification center replacing the bell stub, live over the `notification:new` socket event). Sprint 5.5 added **Block/Unblock everywhere** (the block stub is now a real round-trip), **friend-request Accept/Reject/Block inside the bell**, **profile photo upload** (same hardening as chat media), **desktop close-chat**, **blue read ticks + Online/Offline labels**, **page-scroll lock**, and **explanatory media-upload errors**. **Phase 2 then shipped end-to-end encryption for text** (libsodium sealed boxes; the server stores ciphertext only; the badge is now a real dynamic "End-to-end encrypted"). The dev bot is kept **plaintext by design** (it has no key, so the client auto-falls back) rather than retired, and **media stays in-transit only** for now — E2EE media + multi-device key sync are the remaining items in that theme. **Phase 8 has now kicked off** with pre-deploy hardening: onboarding uses a **real SMS OTP provider (MSG91 widget + server-side token re-verification)** with the dev code as a fallback, the onboarding profile step gained an **Add a photo** upload, and a dark-theme **input autofill contrast** bug was fixed.

---

## Timeline — what happened

### Planning
- Defined Linkr as a privacy-first messenger: strangers can be **found** but cannot **message** until friendship is accepted.
- Chose MERN + TypeScript monorepo (`shared` / `client` / `server`), Socket.IO, MongoDB Atlas, Google OAuth, libsodium (later).
- Wrote full blueprint in `projectlinkr.md`.

### Sprint 0 — Foundation
- Scaffolded pnpm workspace monorepo.
- **shared:** types (User, Message, Chat, Friendship, Otp), Zod schemas, socket event constants.
- **server:** Express app, MongoDB/Redis graceful connect, health route, middleware stubs, Mongoose models.
- **client:** React + Vite + TS, Tailwind, 6-theme system (light/dark), 3-pane AppShell (placeholder data).
- `pnpm dev` → client `:5173`, server `:5000`.

### UI polish (post–Sprint 0)
- Premium visual pass: gradient brand, bubble styling, theme swatches, avatar rings, design tokens.

### Sprint 1 — Auth & onboarding
- **Google Sign-In** via ID token (`@react-oauth/google` → `POST /api/auth/google`).
- **JWT:** access token (~15m, in memory) + refresh token (~7d, HttpOnly cookie `linkr_refresh`).
- **Onboarding wizard:** @username → phone OTP (dev mode shows code on screen) → profile.
- Phone stored **encrypted at rest** + HMAC for uniqueness (one account per number).
- Route guards: `/login`, `/onboarding`, `/` (AppShell).

### Sprint 2 — Friends & privacy
- Search users by `@username` (privacy-limited `PublicUser`).
- Friend requests: send / accept / reject / cancel / block.
- `requireFriendship` middleware (403 `NOT_FRIENDS` if not friends).
- `PATCH /api/users/me/privacy` (API only; partial UI).
- Friends panel in details pane + friend search in sidebar.

### Header + logout (Sprint 2 follow-up)
- Profile chip in header (avatar, display name, `@username`).
- User dropdown: Profile, Theme, Light/Dark, **Sign out** (click name + ▼ in top-right).

### Professional UI overhaul
- Removed all user-facing “Sprint 0” placeholder text from composer.
- iMessage-style message bubble grouping (first/middle/last in group).
- **Sidebar:** sticky user identity row, “Search conversations”, “Find friends” modal, PINNED/RECENT sections, hover ··· menu (stub).
- **Header:** decluttered — theme moved into user menu; notification bell stub.
- **Details pane:** Profile / Media / Files tabs, action stubs (Mute, Block, Share).
- **Empty state:** animated lock + “Start a new chat” CTA.
- Design tokens: motion durations, type scale, `.glass` utility, presence colors.
- **Edit profile:** `PATCH /api/users/me` + `/profile` page (display name, bio, status; username read-only).

### Sprint 3 — Real-time chat
- **REST:** list/create chats, paginated messages, REST send fallback.
- **Socket.IO:** JWT auth on connect, `message:send/new/delivered/read`, `user:typing`, `user:online/offline`.
- Friendship enforced on every chat route and socket handler.
- Client: `socket.io-client`, `SocketProvider`, real chat list, live messages, optimistic send, typing/read receipts.
- Friend search **Message** button opens/creates 1:1 chat.

### Sprint 4 — Message actions + pin + dev bot + UX
- **Reply:** quote a message; preview bar in composer; reply preview rendered inside the bubble.
- **Edit:** sender-only in-place edit; `(edited)` marker; live broadcast via `message:edit`.
- **Delete:** *for me* (hidden only for you) and *for everyone* (sender-only; body + reactions cleared, shown as “This message was deleted”); broadcast via `message:delete`.
- **React:** one emoji per user (toggle), quick-reaction popover + reaction pills; broadcast via `message:react`.
- **Pin chats:** per-user pin (`PATCH /api/chat/:chatId/pin`), PINNED section + pin indicator, optimistic toggle from the sidebar ··· menu.
- **Dev test bot (`@linkr_bot`):** dev-only auto-replying account so chat is testable without a second Google login — auto-accepts friend requests and auto-replies (with a typing indicator). Gated off in production and force-disabled before E2EE.
- **UX polish:** dedicated **Theme** button + popover in the header (6 accents + light/dark, no more digging through the user menu); **visible Logout** icon in the sidebar identity row; “Private chat / Encrypted in transit” badge copy (does **not** claim E2EE).
- **E2EE intentionally deferred** to its own sprint: a server-side bot speaks plaintext and cannot take part in real end-to-end encryption, so libsodium lands after the bot is retired. `keys` module and E2EE stubs left in place.

### Sprint 5 — Media messages + in-app notifications → **MVP complete**
- **Media messages:** the composer paperclip now opens a file picker; selected images/files upload via `POST /api/chat/:chatId/media` (multipart) and render inline — images as click-to-open thumbnails, other files as a download chip (name + size). Reuses the normal send/emit path so it broadcasts over `message:new` (the bot still works for text).
  - **Storage degrades gracefully:** if `CLOUDINARY_URL` is set, the buffer is uploaded to Cloudinary (`resource_type: auto`) and the secure URL is stored. Otherwise it falls back to **local disk** (`server/uploads/`, git-ignored, outside the web root), served only via an **authenticated** route (`GET /api/chat/media/:messageId`) that re-checks chat membership. The client fetches local media through the authed axios client as a blob (an `<img>`/`<a>` can't send the Bearer token), so downloads/thumbnails work without Cloudinary.
  - **Upload hardening (per repo security rules):** allowlist by extension **and** magic-byte sniffing (the client `Content-Type` is ignored); size caps enforced before storage (images ≤ 10 MB, other files ≤ 25 MB, plus a hard multer cap); random UUID storage filename (the user filename is kept only as sanitized display metadata); stored outside the web root; downloads sent with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`; uploads are never executed.
- **In-app notifications:** new `Notification` model + `/api/notifications` module. Notifications are created server-side for **friend requests received**, **friend requests accepted** (incl. the bot's auto-accept), and **new messages received** (never the sender). Each is persisted and pushed live over the new `notification:new` socket event to `user:<recipientId>`.
  - **Client:** the header bell is now a real **notification center** — unread badge, dropdown list (actor + type + relative time), click a message notification to open that chat / a friend notification to open the friends panel, and mark-all-read on open. `SocketProvider` subscribes to `notification:new` to update the list + bump the unread badge live.
- **Honest crypto framing kept:** media is **encrypted in transit only** (consistent with text today) — the UI still says "Private chat / Encrypted in transit", not E2EE. No libsodium added.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Sprint 5.5 — UX & social polish
- **Page scroll lock:** `html, body` are now `overflow: hidden`, so the window itself never scrolls — only the inner panes do (chat list, message list, details body, notification dropdown). Full-screen routes (onboarding, profile) scroll internally so nothing is clipped under the lock.
- **Explanatory media-upload errors:** the composer now surfaces the **server's** specific reason instead of a generic "Upload failed." The hardened validator returns clear 4xx messages that name the accepted types (unsupported type / content-extension mismatch → 415; oversized → 413, per-kind cap named) and a clean, logged 500 if a local disk write fails (no path/PII leaked). The hidden file input already advertised `accept=…`; the client keeps its size pre-check and falls back by HTTP status if the body has no `error`. (Root cause of the old message was the client swallowing the server error in `onError`, not an upload-blocking bug — multipart posting via axios already lets the browser set the multipart boundary.)
- **Block / Unblock everywhere + in chat:** added `POST /api/friends/unblock/:userId` (only the **blocker** can lift their own block; the friendship row is deleted, so unblocking never silently recreates a friendship). Search now surfaces users **you** blocked (flagged `blockedByMe`) so you can unblock them, while a block placed by the other party stays hidden. The friends list shows an **Unblock** button; the **details-pane footer Block button is enabled** and toggles Block/Unblock for the active conversation participant; when blocked, the composer shows a friendly inline notice instead of a dead input.
- **Friend-request actions in the bell:** `friend_request` notifications now carry a `friendshipId`, so the notification center renders inline **Accept / Reject / Block** buttons wired to the existing friend mutations. After an action the row shows its resolution and notifications/friends refresh. Message notifications keep their click-to-open behavior.
- **Close chat on desktop:** the conversation header gained a desktop-visible **✕ Close** affordance (alongside the mobile back arrow) that returns to the "Select a conversation" empty state.
- **Blue read ticks + clearer presence:** the "seen" receipt is now a **blue** double-check (`text-sky-500`) regardless of the active accent theme (sent = grey single, delivered = grey double). The conversation header shows **Online / Offline** instead of the `@username` when the participant isn't online.
- **Profile photo upload:** new `POST /api/users/me/avatar` (multipart) reuses the **exact chat-media hardening** — images only, ≤ 5 MB, magic-byte verified, random UUID storage filename, stored outside the web root, Cloudinary-or-local. Local avatars are served via the authenticated `GET /api/users/avatar/:userId` route; the `Avatar` component fetches local/relative avatars as a blob (shared `useAuthedObjectUrl` hook, same pattern as chat media), while Cloudinary/Google URLs pass straight through. The profile page got a **Change photo** control (live progress + error), and the new avatar flows back through the session-user mapper so it updates everywhere instantly.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Sprint 5.6 — Social actions, emoji & media galleries
- **Unfriend (remove an accepted friend):** new `DELETE /api/friends/friend/:userId` (by target user id, so it can't collide with the `DELETE /:friendshipId` cancel route). `removeFriend` requires an **accepted** friendship and then **deletes** the row — both users return to strangers and messaging is gated off by the existing friendship check; it does **not** block. The other user is notified live over a new `friend:removed` socket event (mirrors how `friend:rejected` is emitted) and the client invalidates friends/requests/search/chats. Surfaced as an **Unfriend** action next to **Message** in `FriendActions` and in the sidebar ⋯ menu — both with a confirm.
- **Per-user delete chat:** new `DELETE /api/chat/:chatId` (membership only — friendship isn't needed to hide a chat). Modeled as a **per-user soft delete**: the user is added to a new `Chat.hiddenFor[]` so the chat disappears from **their** list only; the other member keeps the full history. Nothing is hard-deleted — `listChats` excludes `hiddenFor` rows, and the chat **reappears** for anyone who hid it on new activity (`sendMessage` clears `hiddenFor`) or when they re-open it (`getOrCreate` un-hides the requester). If the deleted chat was active, the client clears the active chat.
- **Sidebar ⋯ menu, expanded:** the per-chat menu (previously Pin/Unpin only) now offers **Pin/Unpin**, **Unfriend** (when currently friends), **Block / Unblock** (driven by the participant's friendship `status`/`blockedByMe`, already on the chat-list DTO since 5.5), and a danger-styled **Delete chat** (last, red, with a confirm). Closes on outside-click and Escape.
- **Composer emoji picker:** a new **Smile** button left of the textarea toggles an emoji picker popover that inserts the chosen emoji **at the caret** (keeping focus) — plain text into the existing input, **no server changes**. Built on **`emoji-mart`** + **`@emoji-mart/react`** + **`@emoji-mart/data`**, **lazy-loaded** (`React.lazy` + dynamic `import()` of the dataset) so it lands in its own chunks and never bloats the initial bundle. Themed to the app's light/dark mode via the theme store; closes on outside-click + Escape; Enter-to-send / Shift+Enter are untouched.
- **Details Media / Files galleries:** the previously-stubbed **Media** and **Files** tabs are now wired. They derive from the **already-cached messages** for the active chat (the `useMessages` query — no new endpoint), filtered by type: **Media** is a newest-first thumbnail grid of `image` messages (click opens full size), **Files** is a newest-first list of `file` messages reusing the existing authed download chip. Both keep empty-states and live inside the existing scroll area (5.5 scroll lock intact).
- **Honest crypto framing kept:** still "encrypted in transit only", **E2EE remains deferred**. No new env vars.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (emoji-mart split into its own lazy chunks; chunk-size warning only).

### Sprint D — Account-level E2EE / multi-device 🔐🔁
Phase 2 made encryption **device-bound**: the private key lived only in one browser's IndexedDB, so logging in elsewhere minted a fresh key and **old messages were unreadable**. Sprint D makes encryption **account-bound** — your key can be securely backed up and restored on any device with a **recovery passphrase**, so a new login decrypts your **whole history**. The server still never sees a private key or the passphrase (zero-knowledge backup).

- **Encrypted key backup (`client/src/lib/crypto/keyBackup.ts`):** the account keypair is wrapped client-side with a key derived from the user's **recovery passphrase** via **Argon2id** (`crypto_pwhash`, memory-hard) over a random salt, then sealed with **`crypto_secretbox`** (XSalsa20-Poly1305, authenticated). The salt/nonce + exact Argon2id limits travel inside the blob so any device re-derives the same key. The server stores only this **opaque blob** — it can never read it.
- **Backup API (`/api/keys/backup`):** `GET` returns the caller's own encrypted backup + the public key it unlocks to; `PUT` stores the public key + backup **atomically** so they always match. The blob lives in `User.keyBackup` (**`select:false`** — only the dedicated self endpoint ever returns it). **`POST /api/keys` now clears the backup when the public key actually changes** (a key reset), so a stale backup never lingers; re-publishing the same key leaves it intact.
- **State machine (`cryptoStore.ts`):** `init` now decides between **ready** (local key present → publish it; flag `needsBackup` if the account has no server backup yet), **locked** (account has a backup but this device has no matching key → wait for the passphrase), and **ready (fresh)** (brand-new account → mint a key + prompt setup). A local key that **doesn't match** an existing account backup is treated as stale → **locked**, so every device converges on the one canonical account key. New actions: `unlockWithPassphrase`, `setupBackup`, `resetKeys`.
- **Unlock + setup UI (`features/security/`):** `E2EEKeyGuard` (mounted in the authed shell) shows a **blocking unlock modal** on a locked device — enter the passphrase to restore the key (or deliberately **start fresh**, losing old history) — and a **dismissible "turn on multi-device" prompt** when ready-but-unbacked (dismissal remembered per-user). **Profile → Security** (`RecoveryCard`) is the canonical place to enable it later or **change the passphrase**.
- **Why blocking on unlock:** while locked we have no usable key, so the modal is blocking to avoid silently **downgrading** new messages to in-transit-only. Once unlocked, cached "can't decrypt" results are dropped so bubbles re-decrypt with the restored key.
- **Media note:** media was already **in-transit only** (not device-encrypted), so it has **always** been viewable on any logged-in device — Sprint D was about restoring **encrypted text** history. (E2EE media remains future work.)
- **Crypto choices (per security guidance):** Argon2id KDF + authenticated `secretbox`; no banned/deprecated algorithms; passphrase never transmitted; backup is integrity-protected (a tampered/wrong blob fails the AEAD tag and returns "wrong passphrase").
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (only the pre-existing chunk-size warning).

### Sprint D.1 — Opt-in recovery + backup codes (no more new-user nag) 🔑🆘
Sprint D worked but had two rough edges: (1) **brand-new users were nagged** to set a recovery passphrase before they'd even sent a message, and (2) **forgetting the passphrase meant losing old history** on a new device (the only fallback was "start fresh"). D.1 makes multi-device **opt-in** and adds a **single-use backup code** fallback gated by a **phone OTP** — closer to the "log in on a new device with my number" feel, without breaking zero-knowledge (we still can't read your key, and we still can't *reset* your secret for you).

- **No new-user nag:** `E2EEKeyGuard` no longer shows the "turn on multi-device" prompt; the dismissible `SetupModal` is gone. A fresh account silently mints a key and chats immediately. `needsBackup` stays *factual* (no server backup yet) but only surfaces as a calm, **opt-in card in Profile → Security** ("Use Linkr on another device"). The **blocking unlock modal still appears only when LOCKED** (an existing backup on a new device).
- **Backup codes (`client/src/lib/crypto/keyBackup.ts`):** setup now also mints **8 high-entropy single-use codes** (20 Crockford-base32 chars ≈ 100 bits, shown grouped `ABCD-EFGH-…`). The keypair is sealed under **each** code with the same Argon2id + `secretbox` scheme, producing opaque **envelopes**. Each envelope is keyed by **SHA-256(code)** — the server's lookup id; the **raw code never reaches the server**, so it still can't open the blob.
- **Storage + clear-on-rotate (`User.recoveryCodes`, `select:false`):** envelopes carry `{ idHash, …sealed…, used }`. `PUT /api/keys/backup` now stores `{ publicKey, backup, recoveryCodes? }` atomically; **`POST /api/keys` clears `keyBackup` *and* `recoveryCodes` when the key changes** (they encrypt the old key).
- **Redeem (`POST /api/keys/recover`, phone-OTP gated):** the new device (a) proves it controls the account's number — re-verifying the **MSG91 access token** in prod, or a **dev OTP** locally (new `consumeOtp` helper validates without re-binding) — (b) the server confirms the verified number matches the account's `phoneHash`, then (c) looks up the envelope by `codeHash`, **burns it** (`used=true`), and returns it. The client opens it locally with the raw code. Codes are tied to the user's **own phone number** as a second factor, but are **not derived from it** (that would be guessable).
- **Masked phone hint:** `GET /api/keys/backup` now also returns `recoveryCodesRemaining` + a **masked** `phoneHint` (e.g. `•••• 3210`, decrypted server-side just to mask) so the unlock + recovery screens show *which* number unlocks the codes — without ever exposing the full number.
- **UI:** the unlock modal gains **"Forgot your passphrase? Use a backup code"** → verify phone (Send code → SMS/dev OTP) + enter a backup code → **Restore my chats**. Profile → Security shows the **codes exactly once** after setup (copy / download / "I've saved them") and a **remaining-codes** count with **change-passphrase-&-regenerate**.
- **Honest limits (unchanged guarantees):** we still **cannot reset** your passphrase or codes (zero-knowledge). If you lose *both* and have no logged-in device, **Start fresh** is the only path (old history stays unreadable). Recovery codes are a convenience the user must save — phrased plainly in the UI.
- **Verified green:** `tsc --noEmit` for shared + server + client.

### Sprint D.2 — Backup actually saves + dismissible restore + decrypt-anytime 🐛🔓
D.1 shipped with a silent show-stopper: **setup never saved** ("Enable" produced no `PUT /api/keys/backup`). Root cause: the app imported the **standard `libsodium-wrappers`** build, whose **TypeScript types declare `crypto_pwhash`/`crypto_hash_sha256` but the runtime omits them** (those live only in the **sumo** build). So `wrapKeypair` threw `… is not a function` *before* the network call — and the `catch` swallowed it into a generic message. (This also means Sprint D's passphrase backup never actually persisted.)

- **Real fix (`client/package.json`, `sodium.ts`):** switched `libsodium-wrappers` → **`libsodium-wrappers-sumo@^0.8.4`** (same API, includes Argon2id + SHA-256). `OPSLIMIT/MEMLIMIT_INTERACTIVE` = `2` / `64 MiB`, both within the upload-schema bounds, so nothing else changed. **Run `pnpm install` after pulling.**
- **Real error messages (`cryptoStore.setupBackup`):** no longer returns a bare `{ok:false}` — it surfaces the actual reason (crypto-not-ready vs. server error via a small axios-error helper), and the Profile card shows it instead of "Please try again."
- **Dismissible restore (`E2EEKeyGuard` → `RestoreModal`):** a locked new device no longer **blocks the whole app**. It shows a **dismissible "Restore your old chats?" popup** (backdrop / ✕ / "Not now"); closing lets the user keep chatting (new messages still flow). Dismissal is **per-tab (sessionStorage)** so it won't nag within a session but gently reminds next visit.
- **Decrypt anytime (Profile → Security):** the unlock UI is extracted into a reusable **`UnlockPanel`** (passphrase **or** phone-OTP-gated backup code, plus "start fresh"), used by both the popup and the **locked-state Profile card** — so a user can **restore/decrypt their history from Profile at any time**, not only via the login prompt.

### Sprint E — Settings hub + logged-in devices (remote logout) 🖥️🔒
A real **Settings** area plus server-tracked **sessions**, so you can see where you're signed in and sign devices out remotely.
- **Session model (`server/src/models/Session.ts`):** one document per signed-in device (`user`, friendly `label`, `userAgent`, `ip`, `lastSeenAt`), with a **TTL index (~8d)** that prunes dead rows just past the refresh-token lifetime. **A session's existence is the source of truth for token validity.**
- **Tokens carry a session id (`utils/jwt.ts`):** access + refresh tokens now embed **`sid`**; `verify*` returns `{ userId, sessionId }`. `requireAuth` attaches `req.sessionId`, and the socket auth reads `{ userId }`.
- **Auth flow (`auth.controller.ts`):** Google login **creates a session**; **refresh** re-issues only if `touchSession(sid)` finds the row (so a **revoked session → 401 → forced re-login**, surfacing the dismissible restore popup on a fresh device); **logout** deletes this device's session. *Migration note: tokens minted before Sprint E have no `sid`, so the first refresh after deploy logs everyone out once.*
- **Sessions API (`/api/sessions`):** `GET /` lists devices (current one flagged), `DELETE /:id` revokes one, `DELETE /others` keeps only the current device. Mutations require the current `sid` (else "sign in again"). UA→label is a small dependency-free parser ("Chrome on Windows"). `app.set("trust proxy", 1)` so `req.ip` is meaningful behind Render.
- **Settings hub (client):** new **`/settings`** route + a **`Settings`** entry below the profile name (gear in the sidebar identity row **and** in the user menu). **Security moved out of Profile into Settings → Security** (Profile now links across); Settings also hosts **Devices**.
- **Devices UI (`features/settings/SessionsCard.tsx`):** lists devices with icon/label/last-active and a **This device** badge; **Revoke** signs another device out (its next refresh fails) and **Sign out** on the current device logs out here; **Log out all other devices** one-tap. TanStack Query hooks in `useSessions.ts`.

### Sprint F — Mobile chat header & WhatsApp-style status 📱
Tighter mobile header and a status line that behaves like WhatsApp's.
- **Header spacing (F.1):** the placeholder **voice/video buttons are hidden on phones** (`hidden sm:grid`) and the action group is `shrink-0`, so the **name + "last seen" never get squeezed**; they return from `sm` up.
- **Last seen in the contact bar (F.2):** the details pane now shows **Online / last seen…** under the name for a contact, and the **"Private chat" encrypted pill is hidden < sm** (kept on desktop) so phones show presence where it matters.
- **WhatsApp-style status (F.3–F.5):** a mobile-only **status strip under the header** (`ConversationStatusBanner`, `sm:hidden`) mirrors the desktop `StatusChip` (`hidden sm:block`). It's **scroll-linked**: visible within ~120px of the bottom, **slides away as you scroll up** through history, and **returns at the bottom / on a new message**. `MessageList` reports at-bottom via an `onScroll` handler. **Self chat** uses your own live status.

### Sprint G — Header alignment + Profile/Settings cleanup 📱✂️
Four targeted fixes to the F + E rollout (from device testing):
- **G.1 — Sidebar gear removed:** the Settings gear no longer sits in the sidebar identity row (next to bookmark / add-friend). **Settings is reachable from the top-right user menu only** (cleaner, less clutter). Dropped the now-unused `Link`/`Settings`/`PATHS` imports from `Sidebar.tsx`.
- **G.2 — Voice/video icons back + real alignment:** F.1 had *hidden* the call buttons on phones — wrong fix. They're **visible everywhere again**, just **compact on mobile** (`h-8 w-8`, full `h-9 w-9` from `sm`) with a `grid`/`shrink-0` base and tighter header padding/gaps (`px-3/gap-2` on mobile), so **name + "last seen" keep their room** instead of being squeezed.
- **G.3 — Floating status bubble (not a big box):** the mobile status went from a **full-width bar** to a small **left-aligned pill floating under the avatar**. Same **scroll-linked** show/hide, now with a subtle slide (`translate-y`).
- **G.2 (status bubble) — true WhatsApp speech bubble:** G.3's pill was still a detached row, so it's reworked into `AvatarStatusBubble` — **absolutely anchored to the contact's avatar** with an **upward tail** pointing into the photo (rotated-square tail + `rounded-xl bg-surface-2` body, white text, no quote icon). The avatar is wrapped in a `relative` span so the bubble hangs off it. Works for self chat (your own status) too.

### Phase 4 — Chat UX & account controls 🔕🗄️🔒🗑️
Five self-contained sprints layering social/UX controls and account lifecycle on top of the MVP. Video stays deferred to Phase 3 (3.2+). All flows are built mobile-first and verified on desktop.

- **4.1 — Mute notifications + archive chats (per-user):** extended the `Chat` model with `mutedBy` / `archivedBy` ObjectId arrays (same shape as `pinnedBy`/`hiddenFor`). `listChatsForUser` now returns per-user `muted` / `archived` flags; `sendMessage` **skips the `message` notification** when the recipient has muted the chat. New `PATCH /api/chat/:chatId/mute` and `/archive` routes with optimistic client mutations (`useMuteChatMutation`, `useArchiveChatMutation`). The sidebar splits into **active** (pinned + recent) and a collapsible **Archived** section; muted chats show a `VolumeX` glyph by the name. Wired into the row context menu, the conversation header menu, and the details footer.
- **4.2 — Privacy settings UI:** new `PrivacyCard` (segmented controls for **last seen & online**, **profile details**, **who can friend-request**) auto-saving to the existing `PATCH /api/users/me/privacy` via `useUpdatePrivacyMutation`, optimistically updating the auth store. Added as a **Privacy** section atop the Settings page.
- **4.3 — Forward message (friends only) + share contact:** added a `forwarded` flag to `Message`/`MessageDTO` and `POST /api/chat/messages/:messageId/forward`. Forwarding is **E2EE-safe and client-orchestrated**: the client decrypts the source plaintext and **re-encrypts it for the chosen friend**; media is copied **by reference** server-side (no re-upload). `ForwardMessageModal` lists accepted friends (+ Saved messages); bubbles render a **"Forwarded"** label. **Share contact** (`shareContact`) uses the native `navigator.share` sheet on mobile and falls back to clipboard on desktop.
- **4.4 — Report user:** new shared `report.schema` (predefined reasons + optional details, details required for "other"), a server `Report` model (reporter / reportedUser / reason / details / status, deduped per open report, no self-report) behind `POST /api/users/:userId/report`, and a `ReportUserModal` reachable from the conversation header menu.
- **4.5 — Account deletion:** added `accountStatus` (`active` / `deactivated`), `deactivatedAt`, `scheduledPurgeAt` to `User`, and a dedicated `account.service.ts`. **Two modes** via `POST /api/users/me/delete` (both gated by typing your exact username/email): **`scheduled`** deactivates, destroys every session, clears the refresh cookie, and sets a purge date `ACCOUNT_DELETION_GRACE_DAYS` (15) out; **`immediate`** runs `purgeUser`, cascading deletes across chats, messages, friendships, notifications, reports, sessions and OTPs. A **cron job** (`startAccountPurgeJob`) purges due accounts; `loginWithGoogle` **reactivates** a soft-deleted account on next login; `requireAuth` **blocks** a deactivated account until then. Client `DangerZoneCard` + confirm dialog clears the local session on success so the route guard returns you to login.
- **4.2 (patch) — Stability, privacy enforcement & perf:** fixes from production testing — **privacy is now enforced end-to-end** (server strips `online`/`lastSeen`/bio/status when the viewer isn't allowed; profile visibility is **Everyone | Friends | Nobody**; **search + contact card** return privacy-gated avatar/bio/status/online via `GET /api/users/:userId/profile`; presence broadcasts are suppressed for "Nobody"); client headers/sidebar/details **respect `presenceVisible` / `profileDetailsVisible` / `contactCardVisible`**; **Report modal portaled** to `document.body`; **unread badge** clears via **`PATCH /api/chat/:chatId/read`** with list-cache patches; **chat list load** batched (no per-row N+1); **sidebar previews** — shared `formatMessagePreview` handles **deleted-for-everyone**, call logs (with duration), media, and E2EE; list cache **patches same-id updates**, **re-sorts** on new activity, and **sessionStorage** placeholder for instant reload on refresh; **5s poll** on chat list + friends for fresh online + previews; **delivery backlog** on socket connect (2nd tick when recipient comes online); **calls** — pending incoming on reconnect, **stale session prune** (fixes phantom BUSY), ring timeout **aborts when accepted**, correct **cancelled / missed / declined** on hang-up/disconnect, **mic permission** prompts with HTTPS/denied/unavailable messages, **incoming call no longer auto-rejected** after stale `ended` phase, 3‑min safety TTL, **`CALL_END`/`CALL_REJECT` on all local teardown paths**, active phase only after WebRTC `connected`. **Also:** strangers see **contact cards by default** until privacy is **Nobody**; **Find friends** contact-card modal; **friend requests disabled** popup.
- **4.2 (patch round 2) — E2EE prompt, split profile privacy, poll fix:**
  - **Server-backed E2EE setup prompt:** new `User.e2eeSetupPromptPending` flag — set **`true` on onboarding complete**, exposed on `SessionUser`, cleared by **`PATCH /api/users/me/e2ee-prompt-dismiss`** or when a **recovery backup is saved** (`POST /api/keys/backup`). Client `E2EESecurityPrompt` shows when `e2eeSetupPromptPending && needsBackup && status === ready` (replaces fragile sessionStorage/localStorage gating).
  - **Split profile privacy:** `@username` is **always returned** to viewers; avatar thumbnail follows **Everyone/Friends** (hidden only on **Nobody**); **full-screen avatar zoom** is **Everyone-only for strangers** (Friends setting = friends can zoom, strangers see thumbnail only); bio/status remain gated by `canViewProfileDetails`. Server adds `avatarZoomable` on `ChatParticipant` / `UserSearchResult`; client `DetailsPane`, `UserContactCardModal`, and search rows respect it.
  - **Contact-card poll fix:** removed **`refetchInterval: 5000`** from `useUserSearch` and `useUserProfile` (fetch once on open, `staleTime` 30s/60s) so the Find-friends contact card **no longer flickers**; **5s poll kept** on `useChatList` and `useFriends` only.
- **4.2 (patch round 3) — Split privacy settings + live profile sync:**
  - **Two privacy toggles:** `privacy.profileDetails` (display name, custom status, bio) and `privacy.profilePicture` (avatar thumbnail + zoom) replace the single combined `privacy.profile` (legacy field still migrated on read). Settings → **Profile details** + **Profile picture** rows in `PrivacyCard`.
  - **Rules:** `@username` always visible. **Picture → Everyone:** all see thumbnail, **only friends zoom**. **Picture → Friends:** strangers see no photo; friends see + zoom. **Picture → Nobody:** photo hidden. **Details → Everyone/Friends/Nobody:** gates name/status/bio independently (display name no longer tied to avatar visibility).
  - **Live sync:** `notifyProfileChanged()` emits **`user:profile-changed`** to friends + 1:1 chat partners on profile/privacy/avatar updates. Client `profileCache.ts` **merges** the refreshed `GET /users/:id/profile` into search, contact card, chat list, and friends caches (no invalidate → no flicker). **15s silent refetch** on `useUserSearch` / `useUserProfile` as fallback for strangers not in a chat.

### Sprint 3.2.1 — Metered static TURN (cross-network calls) 🌐
Fixes **ring + accept + stuck on Connecting** when callers are on **different Wi‑Fi / mobile data** — signaling worked but ICE failed on STUN-only Google servers.
- **Managed TURN mode:** new env **`TURN_USERNAME`** + **`TURN_CREDENTIAL`** (Metered Open Relay dashboard) alongside **`TURN_URLS`**. Server forwards creds only via authenticated `GET /api/calls/ice-config` (`Cache-Control: no-store`). **Self-hosted coturn** (`TURN_SECRET` HMAC mint) still supported; static creds take precedence when both are set.
- **Startup log:** Render logs `WebRTC TURN enabled (managed static credentials)` vs `STUN-only` warning.
- **Render:** set the four vars below on the **server** service only (never Vercel client), redeploy, then test cross-network.

### Sprint 3.2 — Video calls 📹 (Phase 3 continues)
Adds **1:1 video calls on the exact same WebRTC engine + signaling as voice** — no server/socket changes. The `media: "video"` path was already plumbed through types, the server (`call:initiate` accepts `audio|video`), the store, and the incoming/call-log UI; 3.2 wires up **camera capture, a video call surface, and a camera toggle**.
- **Media permission (`micPermission.ts`):** `requestMicAccess` → **`requestCallMediaAccess(media)`** — voice captures mic-only, video captures **camera + mic** via the existing `mediaConstraints`/`videoConstraints` (720p@30, 1080p ceiling). New **`mediaAccessMessage(reason, media)`** gives camera-aware copy (insecure / denied / no device). `requestMicAccess` kept as a thin wrapper.
- **Engine (`CallEngine.ts`):** `startLocalMedia` now **reuses the early-captured stream** when it satisfies the call (audio always; video also needs a camera track) and adds **video senders with `applyVideoBitrate`** (1.5 Mbps). New **`setCameraEnabled`**, **`getLocalStream` / `getRemoteStream`**, and an **`onLocalStream`** callback. **Remote audio still plays through the engine's `<audio>` element**, so earpiece/speaker/Bluetooth routing is unchanged — the UI `<video>` is muted and only renders frames.
- **Store (`call.store.ts`):** adds **`cameraOff`**, **`localStream`**, **`remoteStream`** + `toggleCamera` / `setCameraOff` / `setLocalStream` / `setRemoteStream`. Reset/start clear streams so each call begins clean.
- **Provider (`CallProvider.tsx`):** every engine-creation path (caller offer, callee accept, sync-restore) publishes local + remote streams to the store, applies the camera state, and uses `requestCallMediaAccess(media)`. New **`toggleCamera`** action (no-op on voice). The caller sees their **local preview immediately while "Calling…"**.
- **UI (`CallOverlay.tsx`):** when `media === "video"`, a **full-screen remote video** with a mirrored **local PiP**, a top status/timer bar, and shared controls (**mute, camera on/off, audio route, hang-up**). Pre-connect shows the peer avatar + status; the **voice overlay is byte-for-byte unchanged**. `CallBar` shows a camera glyph for minimized video calls. Header **Video button is now live** for accepted friends (`media: "video"`).
- **Verified:** TS language-server lints clean across all touched files. (Full `pnpm typecheck` to be re-run by the dev — see note below.)

### Sprint 3.1.11 — Caller handler bind fix + offer diagnostics 📞🔧
Fixes **accept relayed in Render logs but no `webrtc:offer`** — the caller never sent WebRTC because **`CallProvider` socket handlers were never registered** on first load (React runs child effects before parent `connectSocket()`).
- **Re-bind on connect:** call handlers attach on socket `connect` + 50ms poll until socket exists.
- **Early accept/ringing bridge (`callEarlyHandlers.ts`):** dispatches to CallProvider via signaling registry (works before bind completes).
- **Registry stub:** registry wired at effect start so early `call:accept` never hits an empty handler.
- **Offer guard + logs:** `[linkr:call]` client logs for accept → ICE → offer; server logs `webrtc:offer received` + `callerSocketId` on initiate.

**Test matrix:**
1. Place call → accept → Render shows `call:accept relayed` → **`webrtc:offer received`** → `webrtc:answer relayed`.
2. Caller UI: **Calling… → Ringing… → Connecting… → timer**.
3. Both sides hear audio (TURN required on cellular — see env).

### Sprint 3.1.10 — Per-socket accept/WebRTC relay + reconnect replay 📞🔧
Fixes **incoming rings but accept leaves callee on Connecting / caller stuck on Calling/Ringing** — signaling after accept used `io.to(user:room).emit()` while duplicate/replaced sockets meant the **idle** socket got events and the **call-state** socket missed them.
- **Per-socket relay:** `call:accept`, `call:reject`, `call:end`, `webrtc:offer`, `webrtc:answer`, and ICE now emit to every live **`fetchSockets()` id** for the peer (same pattern as 3.1.9 incoming).
- **Socket tracking:** `callerSocketId` / `calleeSocketId` on the in-memory call record; updated on initiate, incoming-ack, accept, offer, answer.
- **Reconnect replay:** on connect, server replays `call:accept` + buffered SDP to a socket that rejoined mid-connect (`call:signaling replay` log).
- **Caller recovery:** if `call:accept` arrives on a fresh idle socket, client runs `call:sync` and restores the offer flow.
- **Bridge fix:** duplicate `call:incoming` during `connecting` for the **same callId** re-acks only — no auto-reject.
- **Client:** tear down stale socket instance before creating a new one (reduces duplicate connections).
- **Diagnostics:** Render logs `call:accept received`, `call:accept relayed`, `webrtc:offer relayed`, `webrtc:answer relayed`, `call:signaling replay`.

**Test matrix:**
1. Test → Gylax, accept → both reach **active** + timer within ~10s.
2. Render shows `call:accept received` → `call:accept relayed` → `webrtc:offer relayed` → `webrtc:answer relayed`.
3. Mid-call socket reconnect → replay or sync restores **Connecting → active**.

### Sprint 3.1.9 — Explicit incoming ack + early handler 📞🔧
Fixes production bug where Render logs showed **`call:delivery callback → acked: false, err: "operation has timed out", responseCount: 0`** even with **`socketCount: 1`** — the server found the callee online but Socket.IO's **server-side ack** on `io.to(room).timeout().emit()` never received a client callback (handler race + Redis adapter + reconnect churn).
- **Root cause:** `call:incoming` handlers lived in `CallProvider`'s `useEffect`, which mounts **after** `SocketProvider` connects — first emits could land before the listener existed. Server-side ack also failed cluster-wide with zero responses.
- **`call:incoming-ack` event:** callee emits an explicit ack **after** updating the store (replaces Socket.IO callback ack). Server marks delivered and emits `call:ringing` to the caller.
- **Per-socket delivery:** server emits to each **`fetchSockets()` id** directly (not room-only + timeout).
- **Early handler (`callEarlyHandlers.ts`):** `SocketProvider` registers `call:incoming` / `call:accept` / `call:ringing` **immediately on connect** — before `CallProvider` binds WebRTC handlers.
- **Reconnect debounce:** token refresh / visibility reconnect throttled to **30s** when the socket is still connected (updates `auth` in place instead of disconnecting).

**Test matrix:**
1. Both phones foreground → Render shows `call:incoming emitted` → `call:incoming acked` → callee rings.
2. Caller: **Calling…** → **Ringing…** after ack.
3. Callee WS Messages tab shows `call:incoming` frames; no `operation has timed out` in logs.

> **Follow-ups:** Web Push for tab-closed rings (3.2); durable call store in Redis/Mongo.

### Sprint 3.1.8 — Call delivery fix (fetchSockets + pending retry + sync poll) 📞🔧
Fixes production bug where Render logs showed **`call:initiate` + `peerOnline: true`** but **never** `call:incoming acked` — callee UI stayed blank while caller showed **Ringing…** (optimistically).
- **Root cause:** `call:initiate` used `fetchSockets()` (peer online) but delivery used `userHasLiveSockets()` (local registry). Registry could desync from Socket.IO rooms → invite **buffered silently** with no retry while callee was already connected.
- **Unified online check:** delivery now uses **`fetchSockets()` only**; logs every attempt (`call:delivery attempt`, `call:delivery callback`, `call:incoming buffered`).
- **Retry while buffered:** offline/ failed ack keeps retrying (2s, up to 12×) instead of stopping forever.
- **`deliverPendingCalls` on every reconnect** (not only first socket) + registry sync in `auth.socket.ts`.
- **Caller UI:** **Calling…** until `call:ringing`; initiate ack always `ringing: false`.
- **Client:** ack only **after** `receiveIncoming`; **4s `call:sync` poll** while idle; skip visibility reconnect if socket already connected.
- **`call:clear-stale`:** only clears **outgoing** (caller) ghosts — never drops callee incoming rings.

**Test matrix:**
1. Gylax → Test (both foreground) → Render shows `call:delivery attempt` → `call:incoming acked` → Test rings.
2. Caller shows **Calling…** then **Ringing…** only after ack.
3. Missed socket event → sync poll restores incoming within ~4s.

### Sprint 3.1.7 — Reliable incoming-call delivery (ack + retry) 📞✅
Fixes the intermittent **"call goes from this side but nothing shows on the other end"** (then a **missed voice call** log when the caller hangs up). Root cause: Socket.IO is **at-most-once** — a single `call:incoming` emit can be missed if the callee's socket is reconnecting, stale, backgrounded, or its handler isn't mounted yet, and the server never retries.
- **Ack-based delivery (`calls.socket.ts`):** `call:incoming` is now emitted with a **server-side acknowledgement** (`io.to(room).timeout(1.8s).emit(..., cb)`). If the callee's device doesn't ack, the server **retries** (every 2s, up to 12 attempts) until the call is acked, accepted, ended, or rings out. Works cluster-wide via the Redis adapter.
- **Peer-dropped buffering:** if the callee goes offline mid-ring, the invite is **buffered** (`pendingIncoming`) and re-rung through the same retry path on their next connect (`deliverPendingCalls`).
- **Accurate "Ringing…" (`call:ringing`):** the caller now flips from **Calling…** to **Ringing…** only when the callee's device **actually acks** the incoming event — not optimistically. New `CALL_RINGING` server→caller event + `CallIncomingAck` type.
- **Client ack (`CallProvider.tsx`):** the callee acks `call:incoming` **on receipt** (idempotent — dedupes repeats), stopping retries immediately.
- **Diagnostics:** server logs `call:initiate`, `call:incoming acked` (with attempt count), and `call:incoming not acked after retries` for visibility in Render logs.

> **Follow-ups:** Web Push for tab-closed rings (3.2); durable call store in Redis/Mongo (see 3.1.9).

**Test matrix:**
1. Test → Galaxy while Galaxy tab is foreground → rings within ~1–2s.
2. Galaxy tab backgrounded / just reconnected → retry re-delivers, rings (no silent drop).
3. Caller shows **Calling…** then flips to **Ringing…** only after the callee's device acks.
4. Callee offline → buffered → rings on next connect; otherwise clean missed log.

### Sprint 3.1.6 — Call resync after refresh (ghost BUSY + desync fix) 📞🔄
Fixes the bug where refreshing one browser left the server with a ghost in-memory call (phantom **BUSY**) or split UI (**Ringing** vs **Connecting**) because client Zustand reset to `idle` while the server still tracked the session.
- **Sync socket registry (`socket-registry.ts`):** per-user socket counts updated **synchronously** on connect/disconnect — no async `fetchSockets()` race on refresh.
- **Reconnect grace (`calls.socket.ts`):** when the **last** socket for a user drops, wait **20s** before finalizing their calls (cancelled/missed/completed) so a quick reload doesn't tear down an active ring.
- **`call:sync` / `call:clear-stale`:** on connect the client emits **`call:sync`**; server returns the active call (role, phase, peer, optional SDP replay). If idle and no call, client emits **`call:clear-stale`** to drop unanswered ghost sessions for that user.
- **SDP replay buffer:** server stores `lastOffer` / `lastAnswer` on WebRTC events so a refreshed callee/caller can resume **connecting** without a stuck state machine.
- **Client restore (`CallProvider.tsx`):** restores incoming/outgoing/connecting UI from sync; replays accept/offer/answer flows; requests mic when needed after reload.
- **Reconnect safety (`SocketProvider.tsx`):** skip `reconnectSocket()` on token refresh / tab visibility while a call is live (`phase` not idle/ended).

**Test matrix:**
1. Galaxy refresh (idle) → Test calls → Galaxy rings (not BUSY).
2. Galaxy refresh during ring → incoming restored or clean missed.
3. Test accepts → Galaxy refresh mid-connect → recover or clean end (not stuck Ringing/Connecting).
4. Tab visibility during call does not drop signaling.

### Sprint 3.1.5 — Always-on audio dropdown + Earpiece default + mic gate 📞🎚️
Discord/WhatsApp-style mobile audio routing UX.
- **Always-on dropdown (`audioRoute.ts`, `AudioRoutePicker.tsx`):** on phones the menu is **always** Earpiece + Speaker, plus **Bluetooth** (and wired Headset) when connected — never a single disabled button. Uses stable **logical route ids** so the UI works even when the browser exposes no switchable outputs.
- **Earpiece default (`pickPreferredRoute`):** without Bluetooth, calls default to **Earpiece** (phone receiver), not Speaker or a false "Headset" from built-in mic labels. Bluetooth auto-wins when connected; disconnecting BT falls back to Earpiece.
- **Mic permission gate (`CallProvider.tsx`):** outgoing calls **wait for mic allow** before `startOutgoing`, ringback, or signaling — deny shows a brief notice toast, no call placed.
- **`resolveSinkId`:** maps logical Earpiece/Speaker/BT picks to real device ids for `setSinkId` where Chromium supports it; icon/label always update regardless.

### Sprint 3.1.4 — Bluetooth icon on mobile 📞🎧
Fixed the audio-route icon showing **"Default"** on mobile even when sound was coming through earbuds.
- **Never bail to "Default" (`audioRoute.ts`):** `listAudioRoutes` used to early-return a single "Default" route whenever `setSinkId` was unsupported — which is the case on **Android Chrome / iOS Safari**, so it never even looked for earbuds. It now **always enumerates and detects the connected peripheral** from device labels (inputs included) and returns the **correct icon** (Bluetooth / Headset / Speaker) even when the OS — not the web app — owns routing. Switching is still offered only where `setSinkId` works (desktop Chromium); on mobile it's a correct, static indicator.
- **Caller mic captured early (`CallProvider.tsx`, `CallEngine.ts`):** device labels are blank until a `getUserMedia` grant, and the caller didn't capture the mic until the callee accepted — so the icon was wrong during "Calling…". The caller now **grabs the mic at call start** (unlocking labels immediately), the engine **adopts that stream on accept** (no second permission prompt), and it's released on teardown if unused.
- **Better device classification:** widened Bluetooth matching (`tws`, `handsfree`, common brands like Galaxy Buds / Jabra / JBL / boAt) and stopped mis-tagging wired "headset" as Bluetooth.

### Sprint 3.1.3 — Call opens full-screen + audio-route dropdown + correct route icon 📞🔀
Fixed the two rough edges from 3.1.2 testing.
- **Calls open full-screen, minimize on demand (`call.store.ts`, `CallOverlay.tsx`):** `uiMode` now defaults to **`expanded`**, so a new call shows the full surface first. It collapses to the top **CallBar** only when the user taps the **down-arrow** or **taps the dark backdrop** (the call card itself stops propagation so taps on it don't minimize).
- **Audio-route dropdown (`AudioRoutePicker.tsx`):** replaced the tap-to-cycle button with a real **dropdown** (used in both the overlay and the bar). The trigger shows the **current** route's icon with a small chevron; the menu lists every available output (Bluetooth / Headset / Speaker / Earpiece) with a check on the active one. Closes on outside-click / Escape; renders as a static indicator when only one route exists or the browser can't switch sinks (iOS).
- **Correct route icon (`audioRoute.ts`):** the OS-default sink is now **relabeled to the connected peripheral** — we scan **all** device labels (inputs included, since Android Chrome often only exposes a single "Default" *output* but still lists the Bluetooth/wired **input**) and infer the true route, so the icon shows **Bluetooth when earbuds are connected** instead of a meaningless "Default"/Speaker. De-dupes by kind, preferring a real device id over the pseudo one so switching actually targets it. Routes are re-scanned **after mic permission** and on **devicechange**; the store tracks the active `audioDeviceId` so the dropdown marks the right row and keeps the user's choice across re-scans.

### Sprint 3.1.2 — WhatsApp call bar + call-log align + smart audio routing 📞🎚️
Polished the call surface to match WhatsApp and made audio output switchable.
- **WhatsApp-style call bar (`CallBar.tsx`, `AppShell.tsx`, `call.store.ts`):** the minimized bar is now a **thin, full-width strip glued to the very top** (primary-colored, `fixed top-0 h-11`) instead of a floating card. The shell pads down by the bar height (`pt-11`) so it **pushes content down** rather than overlapping the contact header. Calls now **default to minimized** (`uiMode: "minimized"`) so they start in the background; tap the bar to expand.
- **Call logs hug the corners (`ConversationPane.tsx`):** `CallLogRow` aligns like chat bubbles — **outgoing right, incoming/missed left** — instead of centered.
- **Smart audio routing (`audioRoute.ts`, `CallEngine.setSinkId`, `CallProvider.tsx`):** replaced the on/off speaker toggle with a **route cycler**. Output devices are enumerated and classified into **Bluetooth / headset / speaker / earpiece / default**; on connect we **auto-pick the best** (Bluetooth > headset > speaker), and the call button **cycles** through whatever's available. A `devicechange` listener **re-routes mid-call** when earbuds connect/disconnect. The overlay/bar show a context icon + label; Chromium-only (`setSinkId`), gracefully degrades to the OS default elsewhere.
- **Mic toggle pre-connect:** mute state is held in the store and applied to the engine the moment media goes live, so the **mic button toggles in every phase** (including while ringing).

### Sprint 3.1.1 — Call UX polish (background bar, mute/speaker, sounds, call log) 📞✨
Made voice calls feel real: a backgroundable call, sound cues, speaker control, online-aware status, and a chat call history.
- **Background / minimized bar (`CallBar.tsx`, `call.store.ts`):** added a `uiMode` (`expanded`/`minimized`). The full-screen overlay now has a **Minimize** button; minimizing drops the call to a slim top **CallBar** (avatar, name, live timer/status, mute, speaker, end, tap-to-expand) so you can keep browsing chats while the call runs in the background — the `CallEngine`/`RTCPeerConnection` lives in a provider ref, untouched by UI changes.
- **Mute + speaker everywhere (`CallEngine.ts`, `CallOverlay.tsx`, `CallBar.tsx`):** **Mute** is now available in every live phase (not just connected). Added a **Speaker** toggle that routes remote audio to the loudspeaker via `setSinkId` where supported (Chrome/Edge/Android), gracefully no-op on Safari/Firefox; the preference re-applies whenever the remote audio element is (re)created.
- **Call sounds (`callSounds.ts`):** Web-Audio-synthesized **ringback** (caller waiting) and **ringtone** (incoming), plus a short end blip — no audio asset files shipped. Driven off the phase machine and stopped on connect/end.
- **"Ringing" vs "Calling" (`calls.socket.ts`, `call.store.ts`):** the server ack now reports `ringing` — **Ringing…** when the callee has a live device, **Calling…** when they're offline. Offline/no-answer calls now **ring out** (35s) into a missed-call entry instead of failing instantly.
- **Call log in chat (new `type: "call"` message):** the server writes a **call-log row** on every terminal event — **completed** (with duration), **missed**, **declined**, or **cancelled** — and broadcasts it to both peers over `message:new`. Rendered as a centered WhatsApp-style pill (`CallLogRow`) with a direction/missed icon, and summarized in the chat-list preview ("📞 Voice call", "📞 Missed voice call", …). Outcome/duration are tracked in-memory on the server (`acceptedAt`, ring timeout) and persisted as cleartext activity metadata (never message content).

### Sprint 3.1 — Call engine + HD audio 📞🎧 (Phase 3 begins)
First slice of **realtime calling**: a quality-first **voice** call between accepted friends, end-to-end over WebRTC (media is peer-to-peer; the server only relays signaling and mints TURN credentials). Video / screen-share build on this same engine in 3.2–3.4.
- **Shared (`events.ts`, `types/call.ts`):** added the call signaling vocabulary (`call:incoming/accept/reject/end/unavailable/busy`, `webrtc:offer/answer/ice-candidate`) and typed payloads (`CallInitiate/Incoming/Signal`, `WebRtcSdp/IceCandidate`, `IceConfigResponse`). **Rebuild shared** so client/server pick up the new exports.
- **Server signaling (`sockets/calls.socket.ts`):** friendship-gated relay — every hop re-resolves the peer from `chatId` and re-checks the accepted friendship (blueprint §5). Tracks live calls in-memory to reject a **3rd-party call to a busy user** (`call:busy`), detect an **offline callee** (`call:unavailable` via `fetchSockets`), and tell the peer the **call ended** if a participant fully disconnects (multi-device aware).
- **TURN/STUN (`/api/calls/ice-config`, `calls.service.ts`, `env.ts`):** serves STUN (Google by default) plus **short-lived, per-user TURN credentials** minted from a server-only `TURN_SECRET` (coturn `use-auth-secret` / TURN REST API; HMAC-SHA1 is the protocol's required derivation, not a security control over our data). The secret never reaches the client; responses are `Cache-Control: no-store`. New env: `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `TURN_TTL`.
- **Client engine (`features/calls/`):** `CallEngine` wraps `RTCPeerConnection` (max-bundle, rtcp-mux, trickle ICE, remote audio playback, RTT stat). `callConfig.ts` tunes for clear voice — 48 kHz mono Opus with **in-band FEC**, DTX off, `maxaveragebitrate=64k` via SDP fmtp **and** sender `maxBitrate`. `CallProvider` orchestrates the lifecycle (idle → outgoing/incoming → connecting → active → ended) over the socket and buffers any early offer / ICE.
- **UI:** an `IncomingCallModal` (accept/decline) and a `CallOverlay` (ringing/connecting status, live mm:ss timer, connection-quality dot, **mute**, hang-up). The header **Voice** button is now live for accepted friends; **Video** is marked *coming soon* (3.2).

### Sprint J — Notification reliability + manage (clear/delete) 🔔✅🗑️
The bell stacked **duplicate friend-request rows** for one request, and accepting one left the others showing Accept/Reject — which then **400'd silently** ("Invalid friendship state"), so it took many clicks before hitting a row that worked. Also added the ability to **clear/delete** notifications.
- **Server dedupe (`notifications.service.ts`):** `createNotification` now **reuses an existing `friend_request` row** for the same `{user, friendshipId}` (bumps it back to unread + re-emits) instead of inserting a duplicate when a request is (re)sent.
- **Server cleanup (`notifications.service.ts`, `friends.service.ts`):** new `resolveFriendRequestNotifications(friendshipId)` **deletes** the now-stale `friend_request` notifications on **accept / reject / cancel**, so no dead Accept/Reject buttons remain.
- **Delete endpoints (`/api/notifications`):** new **`DELETE /`** (clear all) and **`DELETE /:id`** (remove one), both owner-scoped (`deleteAllNotifications` / `deleteOneNotification`).
- **Client (`NotificationCenter.tsx`, `useNotifications.ts`):**
  - **Instant Accept/Reject/Block** — the row flips to its resolved label **immediately** (optimistic), runs the mutation in the background, then **purges all matching rows** (by `friendshipId`, or `actor` for block) and fixes the unread count; on error it **rolls back + shows an inline reason** ("This request was already handled." etc.).
  - **Clear all** button in the dropdown header and a **per-row trash icon**, both **optimistic** (`useClearAllNotificationsMutation` / `useDeleteNotificationMutation`) with rollback on failure.

### Sprint I — Mobile soft-keyboard fix ⌨️📱
On Android Chrome, focusing the composer scrolled the **document** to reveal the input (the keyboard overlays rather than resizes), pushing the pinned chat header off-screen and leaving a black gap. Fixed with a layered approach:
- **I.1 — Viewport hint (`index.html`):** added `interactive-widget=resizes-content` so supporting browsers **shrink the layout** when the keyboard opens instead of overlaying it.
- **I.4 — `useVisualViewport` hook + `--app-vh` (`lib/hooks/useVisualViewport.ts`, `globals.css`):** tracks `window.visualViewport` (height/offset) and writes the visible height to `--app-vh`, which **`#root` consumes** (`height: var(--app-vh, 100dvh)`); also counters stray document scroll and offsets `#root` by `offsetTop`. No-op on browsers without `visualViewport` (desktop keeps `100dvh`).
- **I.2/I.3 — Flex hardening + pinned header (`ConversationPane.tsx`):** the conversation `section` is now `min-h-0 overflow-hidden` so only the **message list** scrolls; the header is `sticky top-0` so it can't drift even if a scroll is forced. Wired the hook in `AppShell`.

### Sprint H — Full-screen mobile chat + overlay status bubble 📱🪟
Two device-test fixes on top of G.2:
- **H.1 — App-like full-screen chat (mobile):** the global **Linkr top bar is hidden on phones while a chat is open** (`AppShell` renders `<Header className={showConversation && "hidden md:flex"} />`; `Header` now takes a `className`). Only the conversation header shows, so an open chat fills the screen like a native app; the bar returns on the chat list and stays put from `md` up (desktop 3-pane unchanged).
- **H.2 / H.3 — Status bubble is a true overlay (no empty strip, no "message" look):** G.2 reserved space with `min-h-16` + `pb-12`, which left a blank band that made the grey status bubble look like an incoming message. The header is back to a **fixed `h-16` with `overflow-visible`**, and the bubble **overlays** the top of the thread (`absolute top-full mt-1 z-30`) — it never takes document space, so there's **no gap** and **no layout jump** on scroll. A subtle `border-border` on the bubble + tail distinguishes it from purple message bubbles.
- **G.4 — Profile ⇄ Settings decoupled:** removed the **"Security & devices"** card from **Profile** and the **"Edit profile"** card from **Settings**. Profile = photo/name/bio/status only; Settings = Security + Devices only. Each is reached independently from the user menu — no cross-links.

### Phase 2 — End-to-end encryption (text) 🔐
The big one from the roadmap. **Text messages between humans are now end-to-end encrypted** with libsodium; the server stores ciphertext only and can never read them. Scope is **text-only** (media stays encrypted-in-transit for now) and the **dev bot stays plaintext** by design (see below).

- **Keys (`client/src/lib/crypto/`):** each device generates an **X25519 keypair** (`crypto_box_keypair`). The **private key never leaves the browser** — it's stored in **IndexedDB** keyed by userId (`storage.ts`); the **public key** is published to the server. libsodium is loaded lazily (`sodium.ts`) and the whole layer is isolated in one folder so it can be audited/swapped.
- **Key exchange (`/api/keys`):** the previously-stubbed keys module is now real — `POST /api/keys` publishes/rotates the caller's public key (`User.publicKey`), `GET /api/keys/:userId` returns a user's key (gated to **self or accepted friends**, mirroring who you can message). Bootstraps on login via `useE2EEInit` (ensures a keypair, publishes it).
- **Envelope scheme (`messageCrypto.ts`):** a message is sealed with an anonymous **sealed box (`crypto_box_seal`) to EACH chat member's public key** — one copy per member, keyed by userId, packed as a JSON envelope stored in the existing `content` field with `encrypted: true`. Both the sender and recipient open their own copy with their private key. Confidentiality is end-to-end; **sender authenticity** is provided by the authenticated transport (JWT + server-stamped `sender`), documented so we never over-claim.
- **Send/receive:** `useMessages` encrypts text before emitting `message:send` (and on edit) when the peer has a key; `useDecryptedText` decrypts bodies for the bubble, reply previews, the composer edit-prefill, and the **sidebar last-message preview**, with a small **"Decrypting…"** / **"🔒 Can't decrypt on this device"** placeholder. Decrypted plaintext is cached by message id so re-renders are cheap.
- **No-E2EE-with-bot mode (as requested):** the client looks up a peer's public key before sending. The **dev bot has no browser, so it never publishes a key** → the client **automatically falls back to plaintext** (encrypted in transit only) so the bot can still read/echo. Same graceful fallback covers any not-yet-upgraded peer. The bot remains **force-disabled in production**.
- **Honest, dynamic badge:** the conversation header badge now reflects reality per chat — a green **"End-to-end encrypted"** shield when the peer has a key, or **"Private chat / encrypted in transit"** otherwise (e.g. the bot). No more blanket "coming soon".
- **Server stores ciphertext only:** `Message.encrypted` flags E2EE bodies; the server **never** builds a readable preview for them (notifications show a generic **"🔒 New message"**) and forwards/stores the envelope untouched. Media is **not** encrypted in Phase 2 (text-only), so the `encrypted` flag is ignored for media.
- **Known limits (Phase 2 baseline — multi-device now solved in Sprint D):** Phase 2 alone was **single-device** (a new device minted a fresh key → old messages unreadable). **Sprint D adds account-level key backup + restore**, so a new device can decrypt history with the recovery passphrase. **E2EE media** is still future work. On a transient key-fetch failure the client falls back to in-transit (never silently drops a message).
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (libsodium lands in its own chunk; only the pre-existing chunk-size warning).

### Phase 8 (kickoff) — Real SMS OTP (MSG91) + onboarding photo + input contrast
Pre-deploy hardening: onboarding now uses a **real SMS OTP provider** instead of the dev code, the onboarding profile step lets you **set a photo**, and a dark-theme input-readability bug was fixed.
- **MSG91 OTP widget (real SMS):** when `MSG91_AUTH_KEY` (server) + `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_WIDGET_TOKEN` (client) are set, the phone step uses the **MSG91 OTP widget** — the widget sends + verifies the code **client-side** and returns a signed **access token (JWT)**; the client posts it to **`POST /api/auth/otp/msg91-verify`**, and the server **re-verifies it with MSG91 using the server-only Authkey** and reads the **trusted** phone from MSG91's response (the client never asserts its own number). The verified phone is then bound to the user via the shared **`bindVerifiedPhone`** helper (same encrypted-at-rest + HMAC-uniqueness path as the dev flow → one account per number). When the env vars are **unset**, the built-in **dev OTP** flow runs unchanged (a `devCode` hint in non-production), so local dev still needs no SMS provider.
  - **Client lib (`client/src/lib/msg91/`):** lazy-loads the widget script, exposes `isMsg91Enabled` / `sendMsg91Otp` / `verifyMsg91Otp` (promise-wrapped), polls for the widget's async-exposed methods, renders the captcha into a dedicated container, and surfaces MSG91's real error text. `usePhoneVerification` (in `useOnboarding.ts`) abstracts MSG91-vs-dev so the wizard UI is identical either way.
  - **Server (`server/src/modules/auth/msg91.service.ts`):** posts the access token to MSG91's `verifyAccessToken` endpoint (JSON-first with a form-urlencoded fallback + authkey header for robustness), extracts the phone from the response body or by decoding the JWT payload, normalizes to E.164, and logs MSG91's raw failure reason on rejection. Wired via `otpMsg91Verify` (controller) + `msg91VerifySchema` (shared Zod).
  - **Dev-only cleanup script:** `server/scripts/delete-user.ts` (`pnpm --filter @linkr/server delete-user <email>`) fully removes a user + their chats/messages/friendships/notifications/OTP rows, so a phone/username can be re-tested.
- **Onboarding "Add a photo":** the profile step (step 3) now has the **same avatar upload** as the Edit-Profile page — a camera button + **Add a photo / Change photo / Discard**, client-side type/size validation, and a live preview. **Stage-then-upload:** the file is only uploaded on **Finish** (via `useUpdateAvatarMutation`), then its URL is threaded into the onboarding payload so it's saved as the avatar; with no pick it still defaults to the Google photo. Reuses the hardened `POST /api/users/me/avatar` (auth-only, doesn't require completed onboarding).
- **Input contrast fix (dark theme):** browser **autofill** was painting a white background with faint text over dark inputs (the onboarding phone/profile fields). The `:-webkit-autofill` / `:autofill` rule in `globals.css` now uses `!important` (the browser applies autofill styles at very high priority) to force the themed surface + bright text and freeze the white flash.
- **Verified green:** lint clean; client TypeScript diagnostics clean on the edited onboarding files.

### Sprint C — second live-test polish (presence, friends directory, mobile, contact pane)
A second round of two-person testing surfaced more UX issues. Nine fixes, all **client-only** except real presence on the friends list (one shared type + server field) and auto-creating the chat on accept (server). Verified green: `tsc` for shared + server + client, plus the client production build.
- **C1 — friends list showed everyone as "online" (always green):** `FriendsPanel`'s rows hardcoded `<Avatar online />`. The friends list payload had no presence at all (`FriendshipListItem.user` is a `PublicUser`, which omits `online`). Added an optional **`online`** field to `FriendshipListItem` (shared) and populated it server-side (`loadOtherUser` now selects `online`, `toListItem` returns it). The client row now shows real presence: `onlineOverrides[id] ?? item.online ?? false`, so it matches the chat header (and live socket `USER_ONLINE/OFFLINE` events still update it in-session).
- **C2 — chat-row "⋯" menu was painted under the next row:** every `ChatRow` is `position: relative`, so the later-in-DOM sibling row painted over the open dropdown (which lived inside the previous row). The row now gets **`z-20` while its menu is open**, lifting it above its siblings.
- **C3 — onboarding/login inputs unreadable (white box, faint text on mobile):** theme color tokens (`bg-surface-2` / `text-text`) were resolving to a light palette on some devices, leaving a white field with faint grey text over the dark branded gradient. The shared onboarding `TextInput` now **hardcodes a dark-grey field** (`bg-[#1c1d22]`, `text-white`, `caret-white`, `border-white/10`) so the typed value is always legible (these auth screens always render on the dark gradient).
- **C4 — mobile emoji picker stretched into a tall full-width strip:** `dynamicWidth` made emoji-mart fill the whole viewport width. Switched to a **fixed compact rectangle** — `perLine={8}`, `emojiButtonSize={34}`, `emojiSize={22}`, `navPosition="top"` — inside the responsive `w-[min(20rem,calc(100vw-1.5rem))]` popover.
- **C5 — friends row had a redundant Block:** Block already lives in the contact details footer and the chat ⋯ menu, so the friends-list row now shows **Message + Unfriend only** (cleaner alignment; the name/avatar is its own button — see C9).
- **C6 — accepting a request didn't add the chat to the sidebar:** a 1:1 chat only existed once someone clicked "Message". `acceptFriendRequest` now **auto-creates the direct chat** (`getOrCreateDirectChat`, best-effort/try-catch so a chat hiccup never fails the accept). Both users see it immediately — the acceptor's accept mutation already invalidates the chat list, and the requester gets it via the existing `FRIEND_ACCEPTED` socket → chat-list invalidation.
- **C7 — no mobile long-press for chat actions:** a **~500 ms long-press** (and right-click `contextmenu`) on a chat row now opens the same ⋯ actions menu. A `longPressedRef` swallows the click synthesized right after the press so a long-press doesn't also open the chat; a normal tap still opens it. The press timer is cleared on touch-end/move and on unmount.
- **C8 — a contact's profile pane listed ALL your friends:** the Profile tab in the right details pane mounted the global `<FriendsPanel />`, so opening any contact showed your entire friends list + pending requests. Removed it — the contact pane now shows **only that contact** (avatar, @username, About, Privacy + the existing Message/Unfriend/Block footer). The full friends directory moved to the sidebar (C9).
- **C9 — sidebar now has a Chats | Friends switch + a real friends directory:** the sticky user row had **two buttons that did the same thing** (PenSquare "New chat" + UserPlus "Find friends", both opened the search modal). Removed the duplicate; kept a single **Find people** button (opens the search modal to add strangers). Added a **Chats | Friends** segmented toggle: *Chats* is the existing conversation list + search; *Friends* renders the friends directory (`FriendsPanel`). Each friend row: clicking the **avatar/name → View profile** (opens the chat and the details pane), a **Message** button opens the conversation, and **Unfriend** stays. So friends are browsable from the sidebar and a click offers profile-or-message, WhatsApp-style.

### Sprint C.1 — third live-test polish (status, profile data, header menu, mobile/auth fixes)
A third round of feedback (nine items). Mostly client-only; the custom-status + friend-bio work added two fields to the `ChatParticipant`/`SessionUser` shared types and a `statusExpiresAt` field on the `User` model + a status auto-expiry on the profile update. Verified green: zero TypeScript/lint diagnostics across all 18 edited files, and the live `tsx watch` server restarted cleanly + Vite HMR applied every change without transform errors. (The general shell harness was unresponsive for ad-hoc commands during this sprint, so verification used the IDE TS language server + the running dev server rather than a fresh `tsc` invocation.)
- **C1.1 — "Message" opened the chat but the sidebar stayed on the Friends tab:** the sidebar view was local state in `Sidebar`. Lifted it into the UI store as `sidebarView`, and `setActiveChat(id)` now also flips the view back to **`chats`** whenever a chat is opened — so messaging a friend from the Friends directory drops you on the conversation list with that chat active.
- **C1.2 — a contact's "About" never showed their bio:** the details pane hardcoded a generic "You're connected with …" line. Added **`bio`** to `ChatParticipant` (shared), populated it server-side in the chat-list builder (`chat.service` now selects `bio status statusExpiresAt`), and the About section now shows the friend's real bio when set (falling back to the generic line).
- **C1.3 — custom status had no expiry:** added a **`statusExpiresAt`** field (`User` model) and a `statusDurationHours` option to the profile-update schema (`1h / 4h / 1 day (default) / 2 days / 1 week / Don't clear`). `updateProfile` turns the chosen hours into an absolute expiry; an empty status clears it. Expired statuses are filtered out on read everywhere (`toSessionUser` for the owner, `activeStatus()` in the chat-list builder for peers).
- **C1.4 — E2EE badge tooltip overflowed the header:** the native `title=` rendered a huge OS bubble that bled across the header on hover. Replaced it with a **custom `BadgeTooltip`** — a width-constrained (`w-60`, `max-w-[min(16rem,calc(100vw-2rem))]`), right-aligned, `pointer-events-none` popover shown on `group-hover`/`group-focus-visible`.
- **C1.5 — chat header never showed the contact's custom status:** the subtitle only had typing / Online / Offline. It now shows the participant's **custom status** when set (presence still conveyed by the avatar dot), falling back to Online/Offline.
- **C1.6 — onboarding step 1 had no way back to switch account:** wrong-Google-account users were stuck (step 1 has no Back). Added a **"Signed in as … · Use a different account"** footer under the wizard card (every step) that calls the logout mutation.
- **C1.7 — notifications dropdown overflowed narrow phones:** the `w-80` absolutely-positioned panel spilled off a 360 px screen. It's now **responsive** — a viewport-anchored sheet (`fixed inset-x-2 top-16`, `max-h-[70vh]`) on mobile, reverting to the classic `sm:absolute … sm:w-80` dropdown on desktop.
- **C1.8 — tapping a profile photo did nothing:** added a global **`<Lightbox />`** (mounted in `AppShell`, driven by `useUIStore().openLightbox`) and a `zoomable` prop on `Avatar`. The contact details pane's `xl` avatar is now click-to-zoom (full-screen, click-outside/✕/Escape to close). The avatar's already-resolved src (blob URL for authed local avatars, public URL otherwise) is reused, so no re-fetch.
- **C1.9 — chat header had no overflow menu:** added a **⋮ `HeaderMenu`** next to the call buttons with Contact info, Mute (soon), Unfriend (when friends), Block/Unblock, and Share (soon). Closes on outside-click / Escape / action; wired to the existing block/unblock/remove-friend mutations.

### Sprint C.2 — fourth live-test polish (side profile, lightbox, self chat, presence, status, emoji)
A fourth round of feedback (six items). Mostly client-only; the **self chat** feature added `"self"` to the shared `CHAT_TYPES`/`ChatType`/`ChatListItem.type` and a single-member self-chat path on the server (creation, list, send, sockets). Verified via the IDE TS language server (zero lint diagnostics across all edited files); the general shell harness was again unresponsive for ad-hoc `tsc`/`pnpm`, so `shared/dist` was hand-synced as a stopgap and should be rebuilt with `pnpm --filter @linkr/shared build` once the shell recovers.
- **C2.1 — "Contact info" didn't reliably open the side profile:** the desktop static `DetailsPane` (`lg+`) already worked, but on tablet/medium widths the contact info only appeared as a bottom slide-up sheet. The mobile details sheet is now **responsive** — a bottom sheet on phones, but a **right-side drawer** (`sm:inset-y-0 sm:right-0 sm:w-96 sm:border-l`) on `sm`–`lg`, so "Contact info" reads as a side profile everywhere. The header name and the ⋮ "Contact info" both call `openDetails()` (reveals the desktop aside **and** opens the sheet), so it always shows.
- **C2.2 — avatar lightbox looked unprofessional (rounded rectangle):** the full-screen viewer now renders the photo in a **fixed circle** (`rounded-full object-cover`, `min(20rem,70vw)`, soft `ring-2 ring-white/15`) with the contact's **name below it** — WhatsApp/Telegram-style. Still click-outside / ✕ / Escape to close.
- **C2.3 — no way to message yourself:** added a **self ("Saved messages") chat**. Shared: `"self"` chat type. Server: `getOrCreateSelfChat` (single-member `type:"self"` chat); `getOrCreateDirectChat(self, self)` routes to it; `getOtherMemberId` returns the user themselves for self chats; `listChatsForUser` includes self chats and skips the friendship lookup; `sendMessage` skips the friend gate **and** the self-notification; the socket `MESSAGE_SEND` + `postMedia` skip the friend gate and avoid the duplicate `MESSAGE_NEW` (counterpart === self). Client: a **Bookmark "Saved messages"** button in the sidebar identity row opens/creates it (`useCreateChatMutation` with your own id); the chat row + header show **"Saved messages"** with a bookmark avatar and no presence/status/friend actions; the composer is never friendship-gated for self. **E2EE still applies** — the client seals to your own published key, which you can open with your own private key (no crypto change needed).
- **C2.4 — offline contacts just said "Offline":** added `formatLastSeen()` (`last seen just now` / `…Xm ago` / `…Xh ago` / `…yesterday at …` / `…on Mon D`). The header subtitle now shows **Online** or a relative **"last seen …"** (falling back to "Offline" when there's no timestamp).
- **C2.5 — custom status crowded the name/presence (inline):** the status moved out of the subtitle into a compact **floating chip** (`StatusChip`) beside the name — a small quote glyph + snippet that opens a width-constrained **popover** with the full text on hover/tap (outside-click / Escape to close). Presence is back to being the subtitle's job (C2.4).
- **C2.6 — emoji picker took up the whole screen:** capped the emoji-mart host height in `globals.css` (`em-emoji-picker { height: 18rem; max-height: min(18rem,45vh) }`) so its category list **scrolls** instead of growing to fit every row, and tightened the grid to a compact rectangle (`perLine={7}`, `emojiButtonSize={30}`, `emojiSize={20}`, `w-[min(18rem,…)]`).

### Sprint C.2.1 — fourth-round follow-ups (status popover, emoji theme/mobile, self avatar)
Eight quick corrections from the next live test. All client-only except the status cap (one shared constant). Verified green: `tsc` for shared + server + client, plus the client production build.
- **Status popover rendered behind the messages:** the chat header had no stacking context, so the later-in-DOM message list painted over the `StatusChip` popover (and the ⋮ menu). The header is now **`relative z-30`**, lifting it (and any dropdown it owns) above the conversation.
- **Dropped the "STATUS" label** in the popover — it just shows the status text now.
- **Popover sized to its text:** was a fixed `w-64` (huge for "fed up"). Now **`w-max`** with a sensible `max-w`, so a short status is a small chip and only long text wraps.
- **Status capped at 50 characters:** `STATUS_MAX` 100 → **50** (shared) — enforced by the Zod schema and the profile input `maxLength`, plus a live **`n/50`** counter on the profile form.
- **Emoji picker was always light:** it read `themeStore.colorMode` (a legacy store stuck at `"light"`), so on the dark app it rendered a white panel. It now reads the **real applied mode** from the `ThemeProvider` (`useTheme().mode`), so it matches the active dark/light theme.
- **Mobile emoji picker is WhatsApp-style:** on phones (`<640px`) the picker now **docks below the composer field** (full-width panel) with the text box staying above it, instead of floating over the input. Desktop keeps the floating popover above the emoji button. Outside-click tracks both the toggle and the docked panel so tapping an emoji doesn't dismiss it.
- **Contact info opens the side profile:** verified — the ⋮ "Contact info" and the header name both call `openDetails()` (desktop pane + the C2.1 right-drawer on tablet/phone), so it reliably reveals the contact's profile bar.
- **Self "Saved messages" photo is now click-to-zoom:** the details-pane avatar is `zoomable` for the self chat too (it was excluded), so tapping your own picture opens the circular lightbox.

### Sprint 6 — live-testing bugfixes (first real two-person test on the deployed build)
After deploying (Vercel client + Render server) and testing with a friend, a batch of real-world bugs surfaced. Fixed in two passes — **Sprint A (server)** then **Sprint B (client UX)**.

**Sprint A — server fixes (committed `29d8778`):**
- **Sidebar showed the raw envelope instead of the message (Bug 2):** the chat-list query only `select`ed `content sender status readBy createdAt chatId type` when populating `lastMessage`, so for **encrypted** rows the sidebar preview rendered the JSON envelope (it looked like a "SQL query") because the decrypt helper never got the `encrypted` flag or media fields. `listChatsForUser` now also selects `encrypted mediaUrl mediaName mediaSize mediaMime deletedForEveryone`, so `useDecryptedText` can decrypt the preview (or show the right media/deleted placeholder) exactly like the thread.
- **Media only arrived after the next text (Bug 3):** `postMedia` emitted `MESSAGE_NEW` to the **sender twice** and never to the recipient, so an image/file sat invisible on the other side until an unrelated text message triggered a refetch. It now resolves the chat + the other member (`getChatForUser` + `getOtherMemberId`) and emits `MESSAGE_NEW` to **both** `user:<sender>` and `user:<recipient>`, matching the realtime path text messages already used. Media is delivered live now.

**Sprint B — client UX fixes (this commit):**
- **Friends list now has Message + Unfriend, not just Block (Bug 1):** `MessageFriendButton` and `UnfriendButton` are now exported from `FriendActions.tsx` and reused in `FriendsPanel`'s `FriendRow`, so an accepted friend row offers **Message** (opens/creates the direct chat) and **Unfriend** beside the existing **Block** (now an icon button) — you can act on a friend straight from the list.
- **Login/onboarding inputs were too faint in dark mode (Bug 4):** the shared `TextInput` now uses a **fully opaque** `bg-surface-2` (was `/60` translucent over the page), `font-medium`, and explicit bright `text-text`, with `placeholder:font-normal` — so what you type (phone, username) stays high-contrast on mobile dark theme.
- **Mobile showed two emoji pickers at once (Bug 7):** kept the in-app picker on mobile (per request) but made it **mutually exclusive** with the device keyboard so only one is ever open. Opening the in-app picker now **blurs the textarea** (`toggleEmoji`) so the native keyboard's emoji pane collapses; tapping an emoji **no longer steals focus on touch devices** (`window.matchMedia("(pointer: coarse)")` gate in `insertEmoji`) so the native keyboard doesn't pop back up over the picker; tapping the textarea closes the picker via the existing outside-click handler (and opens the keyboard). The popover is also responsive — `w-[min(22rem,calc(100vw-2rem))]` + emoji-mart `dynamicWidth` so the grid reflows instead of overflowing narrow screens. Desktop behavior (focus stays, multi-insert) is unchanged.
- **Verified green:** `tsc --noEmit` for the client and the client production build (chunk-size warning only); lint clean on the edited files.
- **Still queued from this test:** **Bug 5** — account-level E2EE so a second device can read history and the older device logs out (WhatsApp-style single active session) — and **Bug 6** — mobile long-press to reveal message actions. Both are larger and tracked as their own sprints (C/D).

### Sprint 5.11 — sidebar user-row cleanup (de-duplicated actions)
- **Removed the redundant Settings + Logout from the sidebar user row (client-only):** the sticky identity row at the top of the left pane previously carried a **Settings** link (→ `/profile`) and a **Logout** button, but **both already live in the header's user menu** (avatar → Profile / Settings / Logout), so they were duplicated. They're gone from the sidebar row — logout/profile now have a single, canonical home in the header to avoid confusion and accidental sign-outs.
- **Replaced them with discovery actions:** the row now shows a **Find friends** button (`UserPlus`) next to the existing **New chat** button (`PenSquare`); both open the friend-search modal (`openFriendSearch`), which is the single entry point for finding people and starting a conversation. This "covers" the space the removed icons left and makes the most-common action (reach someone new) more obvious.
- **Cleanup:** dropped the now-unused imports/logic from `Sidebar.tsx` — `LogOut`, `Settings`, `Link`, `useNavigate`, `useLogoutMutation`, `PATHS`, and the local `handleLogout`/`logout`/`navigate`. No server, shared-type, schema, API, or socket changes; the header user menu (the real logout/profile path) is untouched.
- **Verified green:** `tsc --noEmit` for the client (no errors), lint clean on `Sidebar.tsx`.

### Sprint 5.10 — unread/badge sync, avatar cache-bust, dev-bot ticks
- **No phantom unread on the chat you're viewing (client-only):** the sidebar row used to flash/stick a "1" when a message arrived for the chat you were actively reading, because `SocketProvider.onNewMessage` always invalidated the chat list (which refetches the still-unread `unreadCount` before the read is recorded). Now, when a new message lands in the chat whose id matches `useUIStore.getState().activeChatId` (read at event time, never a stale closure) **and** it's from the other user, the row is patched **directly** in the `chatKeys.list()` cache (new last message + `unreadCount: 0`) **instead of** invalidating — so there's no refetch race that can momentarily re-show "1". The existing `MessageList` read effect still emits `MESSAGE_READ`, so the server records the read and any later refetch / other device agrees. Messages for **other** chats are unchanged: they still invalidate the list and show their unread badge (a message in chat B while viewing A still shows "1" on B). `useMarkReadMutation` now also optimistically zeroes its chat's row on mutate, so **opening** a chat with an unread last message clears the badge immediately (and stays cleared, since the server records the read on the same event) — fixing the badge that used to stick at "1" while the chat was open.
- **Bell stays consistent:** the Sprint 5.9 behavior is untouched — a `message` notification for the chat you're viewing is still suppressed (no badge bump) and marked read server-side, and mark-all-read-on-bell-open still clears the count. The new sidebar fix doesn't create or read notifications, so there's no double-counting; the bell's `unread-count` query stays authoritative via its own refetch.
- **Avatars update immediately after Save (server resolver, no hard refresh):** local avatars resolved to a **stable** `/users/avatar/<userId>` URL, so after an upload `setUser` ran but `user.avatar` was the *same string* → `useAuthedObjectUrl` never refetched → the old cached blob showed until a hard refresh. The stored ref is actually `local:<uuid><ext>` and the **uuid changes on every upload**, so `resolveAvatarUrl` now appends a short, URL-safe `?v=<token>` derived from that ref (`User` has no `updatedAt` — `timestamps.updatedAt: false`). The avatar route ignores the query string, so matching is unaffected, but the resolved URL is now a **new string per upload** → `useAuthedObjectUrl` refetches and the new photo appears instantly. Cloudinary/Google URLs already change per upload and pass through unchanged. The fix lives entirely in `avatar.helpers.ts`, so **every** mapper that returns avatars (session user, friends, users search, chat participant, notification actor) benefits with no signature change; the avatar-upload controller already returns the freshly-resolved (now versioned) URL via `toSessionUser`, so `setUser` flips the avatar without a reload.
- **Dev bot now shows delivered → blue-read ticks (server-only, dev-only):** receipts are normally driven by the recipient's client, but the test bot has no browser, so a human's messages to it stayed on a single grey ✓. `maybeAutoReply` now (best-effort, gated by `isBotEnabled()`) simulates the bot **receiving and reading** the human's message: a new `markIncomingMessagesDelivered(chatId, botId)` flips the human's `sent` messages to `delivered` and emits `MESSAGE_DELIVERED { message }` per message to `user:<senderId>` (✓✓ grey), then a moment later `markMessagesRead(chatId, botId)` flips them to `read` and emits `MESSAGE_READ { chatId, messages }` (blue ✓✓ — mirroring the shape the client's `onRead` expects). Human-ish delays (~400 ms delivered, ~0.7–2 s read) make it look natural. Strictly dev-only (the bot is force-disabled in production and before E2EE); human↔human chats are never affected (real clients drive their own receipts). The existing auto-reply is unchanged and the simulation is wrapped in try/catch + logger.
- **Bug split:** BUG 1 was **client-only** (`SocketProvider`, `useMessages`); BUG 2 was **server-only** (`avatar.helpers.ts`); BUG 3 was **server-only** (`bot.service.ts` + a small `chat.service.ts` helper). No `shared` changes (events + DTO shapes already existed).
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Sprint 5.9 — Notification & avatar-preview fixes
- **Message notifications no longer nag while you're in that chat (client-only):** the server still creates a `message` notification for every received message (it has no reliable knowledge of which chat the recipient is actively viewing), so the fix lives in `SocketProvider`'s `onNotification`. When an incoming notification has `type === "message"` **and** its `chatId` matches `useUIStore.getState().activeChatId` (read at event time, never a stale closure), it's treated as already-seen: the unread badge is **not** incremented, and the row is inserted as **`read: true`** while the client also fires a best-effort `PATCH /api/notifications/:id/read` (failures ignored) so the persisted state stays consistent. Because the server row is flipped to `read: true`, a later refetch of **`unread-count`** (which counts `read:false`) and the **list** both agree — no double-counting. Every other case (a different chat, or `friend_request` / `friend_accepted` types) keeps the **exact** previous behavior, and the existing mark-all-read-on-open + optimistic updates are untouched. No server or shared-type change.
- **Profile photo is now "preview then Save" (no auto-upload on pick, client-only):** picking a photo on the profile page no longer uploads immediately. The file is **staged** in local state and shown as a **local preview** (`URL.createObjectURL`) in the avatar (the preview src overrides `user.avatar` while staged); the object URL is **revoked** on replace / discard / unmount via an effect, so there are no leaks. A **Discard (✕)** affordance clears the staged photo and reverts to the current avatar. The actual commit happens on **Save changes**: the staged avatar uploads first (`useUpdateAvatarMutation`), then the text fields patch (`useUpdateProfileMutation`). That order leaves the auth store correct because `PATCH /users/me` echoes the **full** session user (avatar included), so the final `setUser` carries both the new photo and the new displayName/bio/status. Photo-only saves (no text edits) still work; an avatar-upload failure surfaces `avatarErrorMessage` and aborts before the profile patch; the existing "Profile saved." confirmation shows on success and clears the staged file. Reuses the `useProfile.ts` contract unchanged. Net UX: pick → see how it looks → **Save changes** commits; navigating away without saving never changes your avatar (fixing the old "only updates when I leave" confusion).
- **Client-only:** no server, shared types, schema, API, or socket changes — reuses the existing notification read endpoint, avatar/profile mutations, and UI store.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Sprint 5.8 — Media preview before send, profile-opens-details, mobile details sheet
- **Media preview before send (no more auto-send):** picking a file in the composer no longer uploads immediately. The file is **staged** in local component state and previewed inside the composer — images show a thumbnail (a `URL.createObjectURL` object URL, **revoked** on remove / chat-switch / unmount so there are no leaks), other files show an icon + name + human-readable size chip. A **✕** discards the staged file. The text box becomes the **caption** (placeholder hints "Add a caption…"); **Send** (button or Enter, Shift+Enter still newlines) uploads the staged file via the existing `useUploadMediaMutation` with the caption, shows the existing uploading state, then clears the file + caption on success and surfaces the same `uploadErrorMessage` on failure. The client size pre-check runs both when staging **and** again on send. With a file staged, Send sends the **file**; with no file, Send behaves exactly as before (text message); empty + no file can't be sent. Attachment staging stays disabled while **editing** a message (attachments aren't editable).
- **Click the recipient profile → open details:** the conversation header's **avatar + name** are now a single real `<button>` ("View contact info", keyboard-focusable, hover affordance) that opens the details — `setDetailsOpen(true)` for the desktop aside and the new mobile sheet on small screens, via one `openDetails()` handler. The ✕ close and call buttons are unchanged.
- **Mobile details sheet:** the details pane was desktop-only (`lg+`). The inner content was refactored into a shared **`DetailsContent`** component used by **both** the desktop aside and a new **`MobileDetailsSheet`** — a `lg:hidden` slide-up bottom sheet (backdrop click + ✕ + **Escape** to dismiss, internal scroll honoring the Sprint 5.5 page-scroll lock, `z-50` above the shell). It shows the **same** Profile / Media / Files tabs + footer actions for the active chat. To avoid the sheet popping open by default (`detailsOpen` defaults to `true`), a dedicated **`mobileDetailsOpen`** flag (default **false**) gates it, additionally requiring an `activeChatId`; switching/closing the active chat resets it. The header profile tap and the bell's friend-notification handler both open it.
- **Client-only:** no server, shared types, schema, API, or socket changes — reuses the existing media upload contract and UI store.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Sprint 5.7 — "Add friend" reachability + not-friends composer gate
- **The gap it closes:** two users become **strangers** after **Unblock** or **Unfriend** (both delete the friendship row). Until now there was **no way to re-add a friend from an existing chat** — "Add" only lived in Find-friends search — and the chat composer only gated on `blocked`, so when you were simply *not friends* the input still rendered and sends failed server-side with `NOT_FRIENDS`. Both are now fixed; no new endpoints (reuses send/accept/reject/cancel).
- **Chat participant friendship DTO extended (additive):** `ChatParticipantFriendship` (in `shared/src/types/chat-api.ts`) now also carries `direction?: "incoming" | "outgoing"` and `friendshipId?` alongside `status` + `blockedByMe`. The server chat-list mapper (`chat.service.ts`) populates them from the already-fetched relationship doc (`direction` only for pending; `friendshipId` always), so the chat UI can tell **stranger** ("Add friend") from **pending-outgoing** ("Requested"/Cancel) from **pending-incoming** ("Accept") and call accept/reject/cancel directly. `useChatById` (active chat) reads the same list cache, so Sidebar / DetailsPane / ConversationPane all agree.
- **Add friend from the sidebar ⋯ menu:** the per-chat menu gained relationship branches under Pin — **Add friend** (stranger), **Cancel request** (pending-outgoing), **Accept request** (pending-incoming) — beside the existing Unfriend / Block-Unblock / Pin / Delete (Delete stays last/danger).
- **Add friend from the details pane:** a compact relationship control sits just above the Mute/Block/Share footer — **Add friend** (stranger), **Requested + Cancel** (outgoing), **Accept + reject** (incoming). Friends and blocked render nothing here (Block/Unblock stays in the footer).
- **Composer gates on not-friends, not just blocked:** the composer now shows a friendly inline notice whenever the participant isn't an accepted friend — *stranger* → "not friends … Add friend to start messaging" + **Add friend**; *pending-outgoing* → "request sent … once {name} accepts"; *pending-incoming* → "{name} sent you a friend request" + **Accept**; *blocked* → the existing notice (unchanged). Accepted → the normal composer (unchanged).
- **Caches flip without a reload:** the existing friend mutations already invalidate friends/requests/search/**chats**, so acting from any surface refreshes the chat list (and thus the active chat). `SocketProvider` now also refreshes friends/search/**chats** on `friend:request` **and** `friend:accepted` (not just `friend:removed`), so when the other side accepts the UI flips "Requested" → normal composer live. With the dev bot the request auto-accepts in the POST response, so messaging unlocks immediately.
- **Privacy rule preserved:** Add friend sends a **request** (recipient must accept) — strangers still can't message until accepted; only the dev bot auto-accepts.
- **Verified green:** `tsc --noEmit` for shared + server + client, and the client production build (chunk-size warning only).

### Dev environment notes (learned the hard way)
- **Vite env:** root `.env` is loaded via `envDir` in `client/vite.config.ts` (same file as server).
- **Google OAuth:** Client ID only (no secret needed for ID-token flow). Add Gmail as **Test user** in Google Cloud Console. Origins: `http://localhost:5173`.
- **Phone OTP:** with `MSG91_AUTH_KEY` + `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_WIDGET_TOKEN` set, real SMS via the MSG91 widget (server re-verifies the token). Without them, dev mode shows the code in the UI. MSG91 dashboard tips: **disable captcha** for localhost, and if testing hammers it, **unblock your IP** + raise throttle limits.
- **OneDrive:** project lives in OneDrive; sync can cause flaky typecheck during heavy edits — wait for sync or use `C:\dev\linkr` if issues persist.
- **Ports:** kill stray `node.exe` if `:5000` / `:5173` are in use (`taskkill /F /IM node.exe`).

---

## Sprint checklist (MVP Phase 1)

| Sprint | Goal | Status |
|--------|------|--------|
| **0** | Monorepo, shared types, AppShell, themes, DB connect | ✅ |
| **1** | Google login, JWT, onboarding (username + OTP + profile) | ✅ |
| **2** | Search, friend requests, block, privacy enforcement | ✅ |
| **3** | Real-time 1:1 chat, typing, receipts, presence | ✅ |
| **4** | Message actions (reply/edit/delete/react), pin chats, dev test bot, UX polish | ✅ |
| **4.5** | E2EE (libsodium) — **shipped as Phase 2** (text-only; bot stays plaintext by design) | ✅ |
| **5** | Media messages (image + file), in-app notifications → **MVP complete** | ✅ |
| **5.5** | UX & social polish: scroll lock, upload errors, block/unblock, bell actions, close chat, blue ticks, profile photo | ✅ |
| **5.6** | Social actions (unfriend, per-user delete chat, expanded sidebar menu), composer emoji picker, Details Media/Files galleries | ✅ |
| **5.7** | "Add friend" reachable from chat (sidebar ⋯ + details pane); composer gates on not-friends, not just blocked | ✅ |
| **5.8** | Media preview before send (staging), click recipient profile → details, mobile details bottom sheet | ✅ |
| **5.9** | Notification fix (suppress/auto-read message alerts for the chat you're viewing) + profile photo preview-then-Save flow | ✅ |
| **5.10** | Unread/badge sync (no phantom unread on the active chat), avatar cache-bust (versioned URL → updates without hard refresh), dev-bot delivered/blue-read ticks | ✅ |

### Post-MVP phases (named roadmap)
- **Phase 2 — E2EE (text)** ✅ **Done** — libsodium sealed-box encryption for human↔human text; keys module live; bot stays plaintext by design.
- **Sprint D — Account-level E2EE / multi-device** ✅ **Done** — recovery-passphrase-encrypted key backup (`/api/keys/backup`) + unlock/restore on new devices; converges every device on one account keypair.
- **Sprint D.1 — Opt-in recovery + backup codes** ✅ **Done** — no new-user nag (multi-device opt-in from Profile → Security); **single-use backup codes** (`POST /api/keys/recover`, phone-OTP gated) recover a forgotten passphrase on a new device; masked phone hint + remaining-codes count.
- **Sprint D.2 — Backup save fixed + dismissible restore + decrypt-anytime** ✅ **Done** — switched to **`libsodium-wrappers-sumo`** (standard build's runtime lacks `crypto_pwhash`/`crypto_hash_sha256`, so setup silently threw before the `PUT`); real error messages; **dismissible "Restore old chats?" popup** (no app-wide block); reusable `UnlockPanel` lets users **decrypt history anytime from Profile → Security**. *Still open in this theme: E2EE media; QR device-linking (needs an app); optional key-fingerprint verification.*
- **Sprint E — Settings hub + logged-in devices** ✅ **Done** — server-side **`Session`** model with `sid` baked into access/refresh tokens; **`/api/sessions`** (list / revoke one / revoke others); **remote logout** = delete session → next refresh 401s → forced re-login. New **`/settings`** hub (gear below the profile name + user-menu entry); **Security moved Profile → Settings**; **Devices** screen lists/revokes devices. *Note: first refresh after deploy logs everyone out once (old tokens have no `sid`).*
- **Sprint F — Mobile chat header & WhatsApp status** ✅ **Done** — contact bar shows **Online / last seen** on mobile (encrypted pill hidden < sm); **scroll-linked status** under the header that hides on scroll-up and returns at the bottom; self chat uses your own status. *(Call-button handling superseded by Sprint G.)*
- **Sprint G — Header alignment + Profile/Settings cleanup** ✅ **Done** — removed the **sidebar Settings gear** (Settings = user menu only); **voice/video icons restored** (compact on mobile) with tighter header spacing so **last seen** stays readable; mobile status is now a **WhatsApp-style bubble anchored under the avatar** (G.2); **Profile and Settings fully decoupled** (no cross-links).
- **Sprint H — Full-screen mobile chat + overlay status** ✅ **Done** — the **Linkr top bar hides on phones when a chat is open** (app-like full-screen; returns on the list, unchanged on desktop); the status bubble is now a true **overlay** (fixed `h-16` header + `overflow-visible`), removing the empty `pb-12` strip that made it look like a message.
- **Sprint I — Mobile soft-keyboard fix** ✅ **Done** — focusing the composer no longer scrolls the header off-screen: `interactive-widget=resizes-content` + a `useVisualViewport` hook driving `--app-vh` on `#root`, plus a `sticky` chat header and `min-h-0 overflow-hidden` flex chain so only the message list shrinks above the keyboard.
- **Sprint J — Notification reliability + manage** ✅ **Done** — **deduped** friend-request notifications (one row per `friendshipId`), **delete** stale rows on accept/reject/cancel, **instant optimistic** Accept/Reject/Block that purges duplicate rows + shows inline errors, plus **Clear all** and a **per-row delete icon** (`DELETE /api/notifications` + `DELETE /:id`, both optimistic).
- **Phase 3 — Realtime calling** — ✅ **voice (3.1) + video (3.2) + Metered TURN (3.2.1)**; remaining: **screen share (3.3)**, group calls (Phase 6).
- **Phase 4 — Chat UX & account controls** — mute, archive, share, message forward, report user, privacy-settings UI (API exists), account deletion.
- **Phase 5 — Notifications++** — web push (Service Worker + VAPID) for background alerts (generic content to preserve E2EE).
- **Phase 6 — Groups & discovery** — group chats + admins, group calls, in-chat search; later stories / disappearing messages / channels / polls.
- **Phase 7 — AI & mobile** — on-device/opt-in AI assistant, voice transcription, spam detection, React Native app.
- **Phase 8 — Production & scale** — ✅ **real OTP provider (MSG91)** done; remaining: deploy (Vercel + Render/Railway + Atlas), Cloudinary, Redis for multi-instance sockets, HTTPS/WSS, monitoring, CI/CD.

---

## What's built — backend

**Pattern everywhere:** `route → controller → service → model`, Zod validation at edges, `ApiError` + global `{ error, code }` handler.

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/google` | Verify Google ID token, find/create user, issue JWTs |
| POST | `/refresh` | Refresh access token (HttpOnly cookie) |
| POST | `/logout` | Clear refresh cookie |
| GET | `/me` | Current session user |
| POST | `/otp/send` | Send phone OTP (dev flow: returns `devCode`) |
| POST | `/otp/verify` | Verify dev-flow OTP for onboarding |
| POST | `/otp/msg91-verify` | Verify a MSG91 widget access token server-side (re-checks with the Authkey, binds the trusted phone) |

### Users (`/api/users`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/username-available?username=` | Check @username availability |
| GET | `/search?q=` | Search by username (PublicUser + friendship context) |
| POST | `/onboarding` | Complete onboarding (requires verified phone) |
| PATCH | `/me` | Update display name, bio, status |
| PATCH | `/me/privacy` | Update privacy settings |
| POST | `/me/avatar` | Upload a profile photo (multipart `file`; images ≤ 5 MB, same hardening as chat media) |
| GET | `/avatar/:userId` | Authenticated stream of a locally-stored avatar (Cloudinary avatars served directly) |

### Friends (`/api/friends`) — all require auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Accepted friends list |
| GET | `/pending` | Incoming + outgoing requests |
| POST | `/request` | Send friend request `{ recipientId }` |
| POST | `/:friendshipId/accept` | Accept |
| POST | `/:friendshipId/reject` | Reject |
| DELETE | `/:friendshipId` | Cancel outgoing pending |
| DELETE | `/friend/:userId` | Unfriend an accepted friend (deletes the row → strangers; emits `friend:removed`; does **not** block) |
| POST | `/block/:userId` | Block user |
| POST | `/unblock/:userId` | Remove a block you placed (blocker-only; deletes the row — no auto friendship) |

### Chat (`/api/chat`) — all require auth + friendship for messaging
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List 1:1 chats with last message + unread |
| POST | `/` | Get or create chat `{ participantId }` |
| GET | `/:chatId/messages` | Paginated history (`?before=&limit=50`) |
| POST | `/:chatId/messages` | REST send (fallback; supports `replyTo`) |
| PATCH | `/messages/:messageId` | Edit a message body (sender only) |
| DELETE | `/messages/:messageId` | Delete `{ scope: "me" \| "everyone" }` |
| POST | `/messages/:messageId/react` | Toggle an emoji reaction |
| PATCH | `/:chatId/pin` | Pin/unpin chat for current user `{ pinned }` |
| DELETE | `/:chatId` | Per-user delete (hide from your list via `hiddenFor`; the other member keeps history) |
| POST | `/:chatId/media` | Upload an attachment (multipart `file` + optional `caption`) → creates a media message |
| GET | `/media/:messageId` | Authenticated download for locally-stored media (re-checks chat membership) |

### Notifications (`/api/notifications`) — all require auth
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Recent notifications (newest first, capped) |
| GET | `/unread-count` | Unread notification count `{ count }` |
| PATCH | `/read` | Mark all of the user's notifications read |
| PATCH | `/:id/read` | Mark a single notification read (owner only) |
| DELETE | `/` | Clear all of the user's notifications (Sprint J) |
| DELETE | `/:id` | Delete a single notification (owner only) (Sprint J) |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness + mongo/redis status |
| POST | `/api/keys` | Publish/rotate the caller's E2EE public key (Phase 2); clears the key backup when the key changes (Sprint D) |
| GET | `/api/keys/:userId` | Fetch a user's public key — self or accepted friends only (Phase 2) |
| GET | `/api/keys/backup` | Fetch the caller's own encrypted account-key backup (Sprint D) |
| PUT | `/api/keys/backup` | Store/replace the caller's account public key + encrypted key backup (Sprint D) |

### Socket.IO (JWT on connect)
| Event | Purpose |
|-------|---------|
| `message:send` | Send message (with ack) |
| `message:new` | New message to both participants |
| `message:delivered` | Delivery receipt |
| `message:read` | Read receipt |
| `message:edit` | Edited message broadcast to both participants |
| `message:delete` | Delete-for-everyone broadcast (body cleared) |
| `message:react` | Reaction change broadcast |
| `user:typing` | Typing indicator |
| `user:online` / `user:offline` | Presence to friends |
| `friend:request` / `friend:accepted` / `friend:rejected` | Friend events (REST is primary; client now refreshes friends/search/**chats** on `friend:request` + `friend:accepted` so the chat's Add/Accept/Requested controls + composer gate flip live — Sprint 5.7) |
| `friend:removed` | Unfriend broadcast to the other user (Sprint 5.6) — client refreshes friends/chats/search |
| `notification:new` | New in-app notification to `user:<recipientId>` (Sprint 5; `friend_request` payloads now carry `friendshipId` for inline accept/reject — Sprint 5.5) |

### Data models (MongoDB)
- **User** — googleId, email, username (sparse unique), displayName, avatar, bio, status, onboarded, phoneEnc/phoneHash (encrypted, never sent to client), privacy, online/lastSeen.
- **Friendship** — requester, recipient, status (pending/accepted/rejected/blocked).
- **Chat** — type `1:1`, members, `pinnedBy` (per-user pins), `hiddenFor` (Sprint 5.6; per-user soft-delete — chat is hidden from these members' lists, re-appears on new activity), lastMessage.
- **Message** — chatId, sender, type, content (plaintext until the future E2EE sprint), `mediaUrl`/`mediaName`/`mediaSize`/`mediaMime` (Sprint 5; `mediaUrl` stores a Cloudinary secure URL or an internal `local:<uuid>` ref), status, readBy, `replyTo`, `reactions`, `editedAt`, `deletedFor` (per-user), `deletedForEveryone`.
- **Notification** (Sprint 5; `friendshipId?` added Sprint 5.5) — `user` (recipient, indexed), `type` (`friend_request` | `friend_accepted` | `message`), `actor` (ref User), `chatId?`, `friendshipId?` (set on `friend_request` so the bell can accept/reject inline), `messagePreview?` (short plaintext snippet), `read` (default false), `createdAt`.
- **User (test bot)** — a single dev-only `@linkr_bot` row seeded at startup (skipped in production); auto-accepts requests and auto-replies.
- **Otp** — phone hash, code hash, expiry, attempts.

---

## What's built — frontend

### Routes
| Path | Guard | Purpose |
|------|-------|---------|
| `/login` | Public | Google sign-in |
| `/onboarding` | Auth | Username + phone + profile |
| `/` | Auth + onboarded | Main AppShell (chats) |
| `/profile` | Auth + onboarded | Edit display name, bio, status |

### Main UI (AppShell)
- **Header:** Linkr brand, **notification center** (bell + unread badge + dropdown), **dedicated Theme button** (palette popover), details toggle, **user menu** (Profile, Theme, Dark/Light, Sign out).
- **Sidebar:** Your identity row (with **visible Logout** icon), search conversations, find friends, PINNED/RECENT chat list (media last-messages show as 📷 Photo / 📎 File), per-chat ··· menu (**Pin/Unpin, Add friend / Accept / Cancel request** (Sprint 5.7), Unfriend, Block/Unblock, Delete chat).
- **Conversation:** Bubble grouping, reply/edit/delete/react actions on hover, reaction pills, reply preview, `(edited)`/deleted rendering, **inline media** (image thumbnails + file download chips), composer with a working **attach** button that **stages a preview** before sending (Sprint 5.8 — thumbnail / file chip + size, ✕ to discard, text box becomes the caption, Send uploads) and a lazy-loaded **emoji picker** (Sprint 5.6), typing indicator, private-chat badge, a clickable **header profile** (avatar + name → opens details, Sprint 5.8), and a **not-friends composer gate** (Sprint 5.7) that replaces the input with an Add friend / Accept / Requested notice whenever the participant isn't an accepted friend.
- **Details pane:** Profile tab + wired **Media** (image thumbnail grid) / **Files** (download list) tabs (Sprint 5.6), friends/requests panel, an **Add friend / Accept / Requested** relationship control above the footer (Sprint 5.7), working **Block/Unblock** footer button (Mute/Share still stubs). The content is shared (`DetailsContent`) between the desktop aside and a **mobile slide-up sheet** (Sprint 5.8).

### Client features (`client/src/features/`)
- `auth/` — LoginPage, SessionProvider, logout
- `onboarding/` — 3-step wizard (username → **phone OTP via MSG91 widget or dev fallback** → profile with an **Add a photo** upload)
- `profile/` — ProfilePage (**Change photo** now stages a local preview and commits on **Save changes**, Sprint 5.9) + PATCH `/me` + POST `/me/avatar`
- `friends/` — search, requests, FriendsPanel, Message button, **block + unblock + unfriend** mutations
- `chat/` — SocketProvider, useChats (+ pin/**delete**), useMessages (send/edit/delete/react/**upload media**), MessageMedia (image/file rendering), **EmojiPicker** (lazy), reply/edit/delete/react UI
- `notifications/` — useNotifications (list/unread/mark-read) + NotificationCenter (header bell)
- `settings/` — ThemePanel (dedicated header button) + ThemeSwitcher (user menu)

### Theme system
Six themes × light/dark via CSS variables: **Iris** (default), Emerald, Ocean, Sunset, Rose, Midnight.  
Switch via the dedicated **Theme button (palette icon) in the header**, or the user menu Theme/Light-Dark options.

---

## Environment setup

Copy `.env.example` → `.env` at repo root. Minimum for full app:

```env
PORT=5000
MONGODB_URI=mongodb+srv://.../Linkr?...
JWT_ACCESS_SECRET=<random-32+-chars>
JWT_REFRESH_SECRET=<different-random>
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=<same-as-GOOGLE_CLIENT_ID>
VITE_API_URL=http://localhost:5000
CLIENT_URL=http://localhost:5173
```

Optional (graceful without):
- `REDIS_URL` — multi-instance Socket.IO adapter + richer presence
- `GOOGLE_CLIENT_SECRET` — not required for ID-token flow
- `MSG91_AUTH_KEY` — **server-only**; enables real SMS OTP by re-verifying the MSG91 widget access token. Pair with the two client vars below. Without all three, onboarding uses the dev OTP (code shown in the UI).
- `VITE_MSG91_WIDGET_ID` — MSG91 OTP widget id (public, client)
- `VITE_MSG91_WIDGET_TOKEN` — MSG91 OTP widget token (public, client)
- `OTP_PROVIDER_KEY` — **deprecated** placeholder (superseded by MSG91; kept for compatibility)
- `PHONE_ENC_KEY` — dedicated phone encryption key
- `CLOUDINARY_URL` — Sprint 5 media

**Google Cloud Console:**
1. OAuth consent screen → **Test users** → add your Gmail
2. Credentials → Web client → **Authorized JavaScript origins:** `http://localhost:5173`

---

## How to run

```powershell
cd "C:\Users\jsindhu\OneDrive - Cisco\Desktop\LINKr"
pnpm install
pnpm dev
```

- Client: http://localhost:5173  
- Server: http://localhost:5000  
- Health: http://localhost:5000/health  

```powershell
pnpm typecheck    # all packages
pnpm build        # production build
```

---

## How to test (two accounts)

1. **Account A:** Sign in with Google → complete onboarding → note `@username`.
2. **Account B** (incognito, different Gmail): Sign in → onboarding → search `@accountA` → **Add** friend.
3. **Account A:** Details pane → accept request.
4. Either account: **Find friends** → **Message** → send messages in real time.
5. **Message actions:** hover a bubble → react (emoji popover), reply (quote bar), or ··· → copy / edit (your own) / delete for me / delete for everyone (your own).
6. **Pin chats:** sidebar row → ··· → **Pin chat** (jumps to the PINNED section; pin icon shown).
7. **Theme:** header **palette button** → pick an accent + Light/Dark.
8. **Profile:** User menu → Profile → edit display name / bio / status.
9. **Logout:** the **Logout icon** in the sidebar identity row (or User menu → Sign out).

### How to test Phase 2 (end-to-end encryption, text)
> Needs **two real human accounts** (two browsers / profiles, or one normal + one incognito), since the dev bot is intentionally plaintext.

1. **Become friends** on accounts A and B and open the chat on both.
2. **Badge:** the conversation header shows a green **"End-to-end encrypted"** shield (hover for the tooltip) on both sides — because each peer has published a key.
3. **Send text A → B:** it appears as normal plaintext in both UIs. **It's ciphertext on the wire/DB** — verify in DevTools → Network → the `message:send` socket frame (or the Mongo `messages.content`) is a JSON envelope, **not** your words.
4. **Edit / reply / sidebar preview** all show the decrypted text on both sides; the sidebar last-message preview decrypts too (no "🔒"/"Decrypting…" sticking).
5. **Notifications stay generic:** B's bell shows **"🔒 New message"** (the server can't read E2EE text), while the chat itself shows the real decrypted message.
6. **Bot is plaintext (by design):** open the **Linkr Bot** chat → the badge is the **"Private chat / in transit"** lock (not the green shield), and chat works exactly as before. This is the "no-E2EE-with-bot" mode.
7. **Lost-key behavior (optional):** clear site data / open a fresh browser for account A → it generates a new key; **old** messages show **"🔒 Can't decrypt on this device"** while **new** messages work (expected single-device MVP tradeoff).

### How to test Phase 8 kickoff (MSG91 OTP + onboarding photo + contrast)
> Real SMS needs `MSG91_AUTH_KEY` + `VITE_MSG91_WIDGET_ID` + `VITE_MSG91_WIDGET_TOKEN` in `.env` and a restart (Vite reads env at boot). Without them you get the dev OTP.

1. **Real OTP:** sign in with a fresh Google account → onboarding → enter a phone in **E.164** (`+9193…`) → **Send code** → you receive a real SMS. Enter it → **Verify** → "Phone verified", and **Continue** enables. (MSG91 dashboard: disable captcha for localhost; unblock your IP / raise throttle if you've been testing a lot.)
2. **Dev fallback:** unset the three vars → the same step shows the **dev code** in the UI and verifies locally (no SMS).
3. **Add a photo:** on the **Profile** step, click the **camera / Add a photo** → pick a PNG/JPG/GIF/WEBP (≤ 5 MB) → a preview shows (nothing uploads yet) → **Discard** reverts. Click **Finish** → the photo uploads then onboarding completes, and the new avatar shows in the header/sidebar. With no pick, it defaults to the Google photo.
4. **Input contrast:** trigger browser autofill on the onboarding phone / profile fields → the text stays **bright on the dark surface** (no white box with faint text). Hard-refresh after pulling the CSS change.
5. **Re-test a number:** `pnpm --filter @linkr/server delete-user you@example.com` fully removes the account so the phone/username free up for another run.

### How to test the bot (no second account needed)
> Dev only — requires `MONGODB_URI` set and `NODE_ENV` ≠ `production` (and `ENABLE_TEST_BOT` ≠ `false`).

1. Open **Find friends** (sidebar) and search `linkr_bot`.
2. Send a **friend request** — the bot **auto-accepts** instantly.
3. Open the chat with **Linkr Bot** and send a message.
4. The bot shows a typing indicator and **auto-replies** in real time — exercise reply / edit / delete / react / pin against it.

### How to test Sprint 5 (media + notifications)
> Works solo against the bot, or with a real friend. Local-disk media needs no Cloudinary creds.

1. **Send an image:** open a chat (e.g. with **Linkr Bot**) → click the **paperclip** → pick a PNG/JPG/GIF/WEBP (≤ 10 MB). It uploads (spinner), then renders as an inline thumbnail. Click it to open full size in a new tab.
2. **Send a file:** paperclip → pick a PDF / txt / doc(x) / xls(x) / ppt(x) / zip (≤ 25 MB). It renders as a download chip (name + size); click to download.
3. **Caption:** type some text first, then attach — the text is sent as the caption alongside the attachment.
4. **Notifications:** with a **second account** (or watch the bell after the bot replies/accepts), a red **unread badge** appears on the header bell. Click it to open the dropdown; clicking a **message** notification opens that chat, a **friend** notification opens the friends panel. The badge clears (mark-all-read) when the dropdown opens, and updates live via `notification:new`.
5. **Storage mode:** without `CLOUDINARY_URL`, files are stored in `server/uploads/` (git-ignored) and streamed through the authenticated `GET /api/chat/media/:id` route. Set `CLOUDINARY_URL` to push uploads to Cloudinary instead (the client then loads the public secure URL directly).

### How to test Sprint 5.5 (UX & social polish)
1. **Page scroll lock:** resize the window short — the page itself never scrolls; only the chat list, message list, details body and the bell dropdown scroll. The mobile list↔conversation slide still works.
2. **Upload error messages:** in a chat, attach an unsupported file (e.g. `.exe`) → you get a specific "not supported / accepted types …" message; attach an oversized file → a "too large (max N MB)" message; rename a `.txt` to `.png` and attach → "contents don't match its extension." (The picker's `accept` already filters most bad picks.)
3. **Block → Unblock (friends):** Find friends → search a user → **Block** (⊘). Search them again → the row now shows **Unblock** → click it; they're back to a normal "Add" state (no auto-friendship).
4. **Block / Unblock (in chat):** open a chat → details pane → footer **Block** → the composer shows a "You blocked … Unblock to message" notice → footer button becomes **Unblock** → click to restore messaging.
5. **Friend-request actions from the bell:** with a second account (or the bot), send yourself a friend request → open the **bell** → the request row shows inline **Accept / Reject / Block**; act on it and the row shows the resolution, with friends + notifications refreshing.
6. **Close chat on desktop:** open a chat → click the **✕** at the right of the conversation header → returns to "Select a conversation". (Mobile back arrow unchanged.)
7. **Blue ticks + presence:** send a message and have it read → the receipt turns **blue** (✓✓). The header reads **Online** / **Offline** for the participant. *(Since Sprint 5.10 the dev bot also simulates delivered/read in dev, so you'll see ✓✓ → blue ✓✓ against the bot too — see "How to test Sprint 5.10".)*
8. **Profile photo:** User menu → Profile → **Change photo** (camera button on the avatar) → pick a PNG/JPG/GIF/WEBP (≤ 5 MB). It uploads (spinner) and the new avatar appears immediately in the header, sidebar and details pane. Bad type/size shows a specific error.

### How to test Sprint 5.6 (social actions, emoji & galleries)
1. **Unfriend (FriendActions):** open **Find friends** / the friends panel → for an accepted friend, click the **Unfriend** (person-minus) icon next to **Message** → confirm. They drop out of your friends list and the chat composer is gated until you're friends again.
2. **Unfriend (sidebar menu + live):** with a **second account** (or the bot), open a chat → its sidebar **⋯ → Unfriend** → confirm. On the **other** account, the friend/chat state refreshes **live** (via `friend:removed`) without a reload.
3. **Composer emoji:** open a chat → click the **Smile** button left of the message box → pick emoji; they insert **at the caret** and the box keeps focus. Click outside or press **Escape** to close. Enter still sends; Shift+Enter still makes a newline.
4. **Sidebar ⋯ menu:** hover a chat row → **⋯** → exercise **Pin/Unpin**, **Unfriend** (when friends), **Block / Unblock**, and **Delete chat** (red, last; confirm).
5. **Delete chat (per-user):** **⋯ → Delete chat** → it leaves **your** list only. The other person still sees the conversation and full history; if they send a new message (or you re-open via **Message**), it comes back for you.
6. **Media / Files tabs:** in a chat that has **sent images and files**, open the details pane → **Media** shows a thumbnail grid (click a thumb to open full size) and **Files** shows a download list (name + size). Chats with none show the empty state.

### How to test Sprint 5.7 ("Add friend" reachability + not-friends composer gate)
1. **Become strangers from a chat:** open a chat with a friend → **⋯ → Unfriend** (or details-pane footer **Block** then **Unblock**) → confirm. You're now strangers but the chat row + history remain.
2. **Add friend from the ⋯ menu:** on that same chat row → **⋯** now shows **Add friend** → click it; a request is sent (the row's relationship flips to a pending state).
3. **Add friend from the details pane:** open the chat → the details pane shows an **Add friend** button just above the Mute/Block/Share footer (and **Requested + Cancel** once a request is out).
4. **Composer gate:** the message box is replaced by a friendly notice — *stranger* → "You're not friends … Add friend to start messaging" with an **Add friend** button; *after sending* → "Friend request sent … once {name} accepts"; *if they requested you* → "{name} sent you a friend request" with an **Accept** button. Accepted → the normal composer returns.
5. **Bot auto-accept unlocks messaging:** do this against **Linkr Bot** — click **Add friend** anywhere (⋯ / details / composer) and the bot **auto-accepts** instantly; the composer flips back to the normal input and you can message again, no reload.
6. **Live flip with a real friend:** with a **second account**, Add from one side → the other side's bell shows the request (Accept there) → back on the first account the chat list/composer refreshes **live** (via `friend:accepted`) from "Requested" to a normal composer without a manual reload.

### How to test Sprint 5.9 (notification + avatar-preview fixes)
1. **No nag while viewing a chat:** open a chat and keep it active, then have the other side (or **Linkr Bot**) send a message **in that chat**. The message arrives in the thread but the **bell unread badge does not increment**; the bell list shows the row as already-read. Reload — the badge stays correct (the server row was auto-marked read).
2. **Other chats still notify:** with chat A active, receive a message in chat **B** → the badge **does** increment as before; clicking it opens chat B. Friend-request / friend-accepted notifications are unchanged (still increment + show inline Accept/Reject).
3. **Mark-all-read still works:** open the bell → it clears the badge (mark-all-read) and stays cleared after a refetch.
4. **Avatar preview → Save:** User menu → Profile → **Change photo** → pick a PNG/JPG/GIF/WEBP (≤ 5 MB). The avatar shows a **local preview immediately** but **nothing uploads yet** ("New photo selected — Save changes to apply."). Click **Discard (✕)** to revert to the current photo.
5. **Commit on Save:** with a photo staged (optionally also edit display name / bio / status), click **Save changes** → spinner → "Profile saved." The new photo + text persist together (visible in header / sidebar / details immediately). 
6. **Navigate-away safety:** pick a photo but **don't** Save, then leave the page → your avatar is **unchanged** (no auto-upload). Bad type/size still shows a specific error.

### How to test Sprint 5.11 (sidebar user-row cleanup)
1. **No more duplicate Settings/Logout:** look at the top **user row** of the left sidebar — it now shows your avatar + name and **two icons only**: **Find friends** (person-plus) and **New chat** (pen). There is **no Settings cog and no Logout** icon in that row anymore.
2. **Logout/Profile still reachable:** click your **avatar in the header** (top-right) → the user menu still has **Profile / Settings / Logout**, all working as before. Logging out still returns you to the login screen.
3. **Both sidebar icons open friend search:** click **Find friends** (person-plus) or **New chat** (pen) → the same **Find friends** modal opens; search a user and start/continue a chat.

### How to test Sprint 5.10 (unread/badge sync, avatar cache-bust, dev-bot ticks)
1. **No phantom unread on the active chat:** open a chat and keep it focused, then have the other side (or **Linkr Bot**) send a message **in that chat**. The message appears in the thread but the **sidebar row never shows a "1"** (no flash, no stick). The bell badge also stays put (Sprint 5.9).
2. **Other chats still count:** with chat A active, receive a message in chat **B** → B's sidebar row shows **1** as before; open B → its badge clears immediately and stays cleared after a refetch.
3. **Open clears a stale badge:** if a chat already shows an unread "1", clicking it clears the badge right away (and it doesn't pop back).
4. **Avatar updates without a refresh:** User menu → Profile → **Change photo** → pick a new image → **Save changes**. The new photo appears **immediately** in the header / sidebar / details — **no hard refresh** needed (the resolved avatar URL is now versioned per upload).
5. **Dev-bot ticks (solo):** open the chat with **Linkr Bot** and send a message. Your message advances **✓ (sent) → ✓✓ grey (delivered) → blue ✓✓ (read)** before the bot's typing + auto-reply arrives — the bot now simulates delivered/read in dev (real users already drive their own receipts; this is dev-only and off in production).

### How to test Sprint 5.8 (media preview, profile-opens-details, mobile details sheet)
1. **Stage an image → preview → caption → Send:** open a chat (e.g. **Linkr Bot**) → click the **paperclip** → pick a PNG/JPG/GIF/WEBP. It does **not** send yet — a **thumbnail preview** appears above the composer with a ✕. Optionally type a **caption** (placeholder reads "Add a caption…"), then press **Send** (button or Enter) → it uploads (spinner) and the image arrives with your caption. The staged preview + caption clear on success.
2. **Stage a file:** paperclip → pick a PDF / doc / zip → a **file chip** (icon + name + size) appears; Send uploads it. Bad type/size shows the same specific error as before (the size pre-check runs at staging **and** on send).
3. **Remove a staged file:** after staging, click the **✕** on the preview → the file is discarded (no upload) and the box goes back to a normal text message.
4. **Text still works:** with **nothing** staged, type and Send a plain text message exactly as before (Enter sends, Shift+Enter = newline). You can't send an empty message with no file and no text.
5. **Click profile → details (desktop):** click the **avatar + name** in the conversation header → the details pane opens (Profile / Media / Files + footer). The ✕ close and (disabled) call buttons still work.
6. **Mobile details sheet:** narrow the window (below `lg`) → open a chat → tap the **avatar + name** in the header → a **slide-up sheet** rises over the conversation with the same details content. Dismiss it via the **backdrop**, the **✕**, or **Escape**. It scrolls internally (the page never scrolls) and is **not** open by default — only after you tap. A friend notification in the **bell** also opens it (when a chat is active).

### How to test Phase 4.2 patch (round 2) — E2EE prompt, split privacy, poll fix
1. **E2EE setup prompt (new account):** sign in with a **fresh Google account** → complete onboarding → land on the app. After E2EE initializes (`needsBackup`), a modal explains that chats are encrypted and recommends setting a **recovery passphrase**. **Maybe later** dismisses it (server clears `e2eeSetupPromptPending`); it should **not** reappear on reload. **Set recovery passphrase** links to Settings; saving a backup also clears the flag.
2. **Split profile privacy — Friends:** User A sets Settings → Profile details → **Friends**. User B (stranger) searches A in **Find friends** → sees **display name + @username + avatar thumbnail** (no tap-to-zoom) → bio/status hidden. User B opens the contact card → same rules; avatar is not zoomable. After becoming friends, B sees bio/status and can zoom the avatar.
3. **Split profile privacy — Nobody:** User A sets Profile details → **Nobody**. Strangers see **@username** but **no avatar** and no bio; contact card explains the photo is private.
4. **Contact card no flicker:** open **Find friends** → search a user → open their contact card → leave it open 15+ seconds. The modal should stay stable (no reload flash every 5s). Chat list and friends panel still refresh online/previews every ~5s.
5. **Details pane:** open a chat with a non-friend whose profile is **Friends** → details pane shows `@username`, avatar thumbnail without zoom, and a note that bio is private until you're friends.

### How to test Phase 4.2 patch (round 3) — split privacy + live sync
1. **Independent settings:** Settings → set **Profile details = Everyone** and **Profile picture = Nobody**. As a stranger, search that user → you see **display name + status + bio** but **no avatar** (only `@username` + details).
2. **Picture Everyone, details Friends:** Stranger sees **photo thumbnail (no zoom)** but **not** bio/status; friend sees everything + zoom.
3. **Picture Friends:** Stranger sees **@username only** (no photo); after friending, photo + zoom appear live.
4. **Live privacy change:** with Find friends open on account B, account A changes **Profile details** from Friends → Everyone → within ~15s (or instantly if B is A's chat partner/friend via socket), B's search row + contact card update **without closing the modal**.
5. **No flicker:** leave a contact card open while A edits their bio → card text updates in place (no spinner flash).

---

## Known gaps & stubs (not bugs)

| Item | Notes |
|------|--------|
| **E2EE** | ✅ **Text is end-to-end encrypted** (Phase 2) — libsodium sealed boxes, server stores ciphertext only, dynamic "End-to-end encrypted" badge. **Media is still in-transit only** (text-only scope); the **dev bot stays plaintext by design** (no published key → automatic fallback). ✅ **Multi-device (Sprint D)** — a recovery-passphrase-encrypted key backup lets a new device restore your key and read history; **E2EE media** is the remaining gap |
| **Calls** | ✅ **Voice (3.1) + video (3.2) live** in the header for accepted friends (WebRTC, 720p video, camera toggle + local PiP). Remaining: screen share (3.3), group calls (Phase 6), optional TURN for strict-NAT reliability |
| **Details pane Mute / Share** | Still stubs — **Block/Unblock is wired**; **Unfriend** lives in FriendActions + the sidebar ⋯ menu; **Add friend / Accept / Requested** now reachable from the details pane (Sprint 5.7) |
| **Add friend after unblock/unfriend** | ✅ **Closed** (Sprint 5.7) — reachable from the chat's ⋯ menu, the details pane, and the composer; the composer now gates on **not-friends**, not only blocked |
| **Details Media / Files tabs** | ✅ **Wired** (Sprint 5.6) — thumbnail grid of images + a download list of files, derived from the active chat's messages |
| **Mobile details bottom sheet** | ✅ **Closed** (Sprint 5.8) — `MobileDetailsSheet` (`lg:hidden` slide-up, backdrop/✕/Escape) shares `DetailsContent` with the desktop aside |
| **Media preview before send** | ✅ **Closed** (Sprint 5.8) — picking a file stages a preview (thumbnail / file chip + size); the text box is the caption; Send uploads it |
| **Message notification while viewing that chat** | ✅ **Closed** (Sprint 5.9) — a `message` notification for the chat you're actively viewing is suppressed (no badge bump) and auto-marked read on the server, so `unread-count` + list stay consistent; other chats/types unchanged |
| **Phantom sidebar unread on the active chat** | ✅ **Closed** (Sprint 5.10) — a message in the chat you're viewing patches the row to `unreadCount: 0` instead of invalidating (no flash/stick); opening a chat optimistically clears its badge. Other chats still count normally |
| **Avatar needs a hard refresh after upload** | ✅ **Closed** (Sprint 5.10) — `resolveAvatarUrl` appends a `?v=` token derived from the per-upload `local:<uuid>` ref, so the URL changes and the client refetches without a reload |
| **Dev bot never showed delivered/blue ticks** | ✅ **Closed** (Sprint 5.10, dev-only) — the bot now simulates delivered → read receipts so you can see ✓✓ → blue ✓✓ when testing solo; production/human↔human unchanged |
| **Duplicate Settings/Logout in the sidebar row** | ✅ **Closed** (Sprint 5.11) — removed from the sidebar user row (they still live in the header user menu); replaced with **Find friends** (`UserPlus`) + **New chat** (`PenSquare`), both opening friend search |
| **Profile photo preview before save** | ✅ **Closed** (Sprint 5.9) — picking a photo stages a local preview (no auto-upload); **Save changes** uploads the avatar then patches the profile so the store ends correct; Discard reverts |
| **Click profile → details** | ✅ **Closed** (Sprint 5.8) — the header avatar + name is a button that opens the details aside (desktop) / sheet (mobile) |
| **Redis** | Optional; single-instance sockets work without it |
| **Account deletion** | Blueprint §4 — not implemented yet |
| **keys module** | ✅ **Live** (Phase 2 + Sprint D / D.1) — `POST /api/keys` publishes a public key, `GET /api/keys/:userId` returns it (self/friends only), `GET`/`PUT /api/keys/backup` store the caller's recovery-passphrase-encrypted account-key backup (+ single-use backup-code envelopes), and `POST /api/keys/recover` redeems one backup code (phone-OTP gated) to restore on a new device |
| **Multi-device / account-level E2EE** | ✅ **Closed** (Sprint D) — recovery-passphrase key backup + restore; new devices unlock history; key reset clears the stale backup. Recovery lives in **Profile → Security** |

---

## What's next

### Phase 2 — E2EE (text) ✅ Done
- ✅ libsodium keypairs (private key in IndexedDB, public key on server via `/api/keys`)
- ✅ Encrypt/decrypt text client-side (sealed box per member); server stores ciphertext only
- ✅ Bot kept dev-only & plaintext **by design** (no key → automatic fallback) instead of retired
- ✅ Badge is now a real, dynamic “End-to-end encrypted” when the peer has a key
- ✅ **Multi-device key sync — done in Sprint D** (recovery-passphrase-encrypted key backup + restore)
- ⏭️ Follow-ups: **E2EE media**, optional key-fingerprint verification UI

### Sprint D — Account-level E2EE / multi-device ✅ Done
- ✅ Recovery-passphrase-encrypted key backup (Argon2id + secretbox) stored opaquely on the server (`/api/keys/backup`)
- ✅ New-device **unlock** (restore the account key from the backup) + **start-fresh** escape hatch
- ✅ One-time "turn on multi-device" prompt + **Profile → Security** card to enable/change the passphrase later
- ✅ `POST /api/keys` clears a stale backup when the public key changes; devices converge on one account key
- ⏭️ Follow-ups: **E2EE media**, optional key-fingerprint verification UI

### Sprint 5 — Media + notifications → MVP complete ✅
- ✅ Media messages (images + files) → Cloudinary **or** local-disk dev fallback, encrypted in transit
- ✅ In-app notifications (friend request / accepted / message) with live `notification:new` + a header notification center
- Still open for later: voice/video media, web **push** notifications (background), archive/mute full wiring, per-chat Media/Files galleries

---

## Repo layout (quick reference)

```
LINKr/
├── projectlinkr.md    # Original blueprint (vision + full spec)
├── project.md         # This file — progress & status
├── README.md          # Setup quick start
├── .env.example       # Env template (secrets in .env only)
├── package.json       # Root scripts: pnpm dev, typecheck, build
├── shared/            # @linkr/shared — types, schemas, constants
├── server/            # @linkr/server — Express + Socket.IO + Mongoose
└── client/            # @linkr/client — React + Vite + Tailwind
```

---

## Commands cheat sheet

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Dev (client + server) | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Build client | `pnpm --filter @linkr/client build` |
| Free stuck ports | `taskkill /F /IM node.exe` |

---

## Continuing in a new Cursor chat

If context fills up, start a fresh chat with:

> Continue Linkr. Read `project.md` and `projectlinkr.md`. We finished Sprints 0–4 (message actions, pin chats, dev bot, UX). E2EE is deferred to its own sprint. Start Sprint 5 (encrypted media + notifications).

Pin or keep `projectlinkr.md` + this `project.md` in the repo root so any new session has full context.
