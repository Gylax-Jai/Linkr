# Linkr — Project Blueprint

> A privacy-first, real-time messaging platform (MERN + TypeScript).
> Find people by username, connect via friend requests, then chat / call / screen-share — all end-to-end encrypted.
>
> This document captures everything decided in planning. Portable — keep it in the Linkr workspace root.

---

## 1. Project Identity
- **Name:** Linkr
- **Tagline:** "Connect privately. Talk freely."
- **Type:** Large-scale, resume-worthy, launch-capable product
- **Platform:** Web first → React Native mobile later
- **Brand color:** Iris Violet `#7C5CFC` (gradient `#7C5CFC → #9D7BFF`)
- **Why violet:** Unique vs WhatsApp green / Messenger blue / Telegram cyan — looks like a fresh new brand.

---

## 2. What We're Building
A WhatsApp-style messenger that is MORE than a clone:
- **Privacy-first:** strangers can be *found* but cannot *message/call* until a friend request is accepted.
- **End-to-end encrypted** chat (server only stores unreadable ciphertext).
- Works fully in the **browser** (web first), React Native mobile later.
- **AI-ready** architecture (added in a later phase, opt-in / on-device to respect E2EE).
- Built with **simple, modular, layered code** so debugging is easy (a small bug never forces a full rewrite).

---

## 3. Tech Stack
- **Frontend:** React + Vite + TypeScript, Tailwind CSS + shadcn/ui, Zustand + React Query
- **Realtime:** Socket.IO + Redis adapter
- **Backend:** Node + Express + TypeScript
- **Database:** MongoDB Atlas + Mongoose
- **Cache / Presence:** Redis
- **Auth:** Google OAuth 2.0 + JWT (access + refresh)
- **Phone verification:** OTP via MSG91 OTP widget (server re-verifies the access token); dev OTP fallback
- **E2EE:** libsodium (client-side) — Phase 1
- **Media:** Cloudinary (encrypted blobs)
- **Calls / Screen share (Phase 2):** WebRTC + coturn (TURN server)
- **Validation:** Zod (shared client + server)
- **Deploy:** Vercel (web), Render/Railway (API), MongoDB Atlas (DB)

---

## 4. Account & Identity Rules
- Sign up with **Google (Gmail)** — no passwords stored.
- Profile: full name, unique **@username** (3–20 chars, letters/numbers/_), **phone (OTP-verified)**, avatar, bio, status.
- **Uniqueness:** username unique, email unique, phone unique.
- **ONE account per phone number.** To make a second account you must delete the first.
- **Account deletion:** re-auth (Google) → 30-day soft delete → then hard delete → frees the phone + username for reuse.
- Phone numbers stored encrypted at rest; never shown in search results.

---

## 5. Privacy & Friendship Model (CORE RULE)
States: `none → requested → accepted` (or `rejected` / `cancelled` / `blocked`)

| Action                          | Stranger | Pending | Friend | Blocked |
|---------------------------------|:--------:|:-------:|:------:|:-------:|
| See basic profile (name/@/pic)  |   Yes    |   Yes   |  Yes   |   No    |
| See bio / status / last-seen    |   No*    |   No*   |  Yes*  |   No    |
| Send friend request             |   Yes    |   --    |   --   |   No    |
| Send message                    |   No     |   No    |  Yes   |   No    |
| Call / video / screen share     |   No     |   No    |  Yes   |   No    |

`*` also governed by user privacy settings: everyone / friends / nobody.

**Enforcement:** server-side on EVERY API route and EVERY socket event (`requireFriendship` middleware).
Even if the frontend is hacked, the server rejects with `403 NOT_FRIENDS`.

---

## 6. UI & Theme System
- **Signature primary:** Iris Violet `#7C5CFC`.
- **User-selectable themes** (each in light + dark), saved to profile + localStorage:
  - **Iris** (default) `#7C5CFC` — premium violet
  - **Emerald** `#10B981` — calm/fresh
  - **Ocean** `#0EA5E9` — cool/professional
  - **Sunset** `#F97316` — warm/energetic
  - **Rose** `#F43F5E` — bold/playful
  - **Midnight** `#6366F1` on near-black — sleek dark
- **How:** all colors are CSS variables; switching a theme swaps the variable set (zero component changes).
- **Layout:** 3-pane desktop (chat list · conversation · details), single-pane mobile.
- **Fonts:** Inter (UI) + JetBrains Mono (usernames/code).
- **Components:** shadcn/ui + Tailwind, rounded-2xl bubbles, soft shadows, smooth transitions.
- A small **lock "End-to-end encrypted"** badge per chat (builds trust).

---

## 7. Feature List

### Phase 1 — MVP  ✅ **complete** (status tracked live in `project.md`)
- [x] Google login + JWT sessions
- [x] Onboarding: username + phone OTP (MSG91 real SMS + dev fallback) + profile (with photo)
- [x] User search by username (privacy-limited)
- [x] Friend requests: send / accept / reject / cancel
- [x] Messaging unlocked ONLY after friendship
- [x] Real-time 1:1 chat (Socket.IO)
- [x] Delivery / read receipts, typing, online / last-seen
- [x] Message actions: reply, pin, edit, delete (me/everyone), react, copy  *(forward — deferred to Phase 4)*
- [x] Pin chats, block / unblock, unfriend  *(archive, mute, report — deferred to Phase 4)*
- [x] End-to-end encryption (libsodium) — **text** (media E2EE is future work)
- [x] Media: image / file (encrypted in transit)  *(video / voice note — future)*
- [~] Notifications: in-app notification center done  *(web push — Phase 5)*
- [x] Theme system (6 themes, light/dark)

### Phase 2 — Calls, Screen share, Groups, Differentiators
- [ ] Voice + video calls (WebRTC) — friends only
- [ ] Screen sharing (getDisplayMedia + replaceTrack + TURN for reliability)
- [ ] Group chats + group calls, admins
- [ ] Status / Stories (24h)
- [ ] Scheduled messages, disappearing messages
- [ ] Channels / Communities (broadcast)
- [ ] Polls, live location
- [ ] In-chat search, starred messages

### Phase 3 — AI + Hardening + Mobile
- [ ] AI assistant, smart replies, summaries, translation
- [ ] Voice-note transcription
- [ ] Spam / scam detection
- [ ] React Native (Expo) mobile app

---

## 8. Screen Sharing (Phase 2 design)
- Built on WebRTC (screen share = just another media track).
1. `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })` captures the screen.
2. Swap the outgoing video track via `RTCRtpSender.replaceTrack()` — smooth switch, no renegotiation flicker.
3. Signal the peer with `screen:start` / `screen:stop` so their UI updates.
4. On stop, `replaceTrack()` back to the camera.
- **coturn (TURN server)** ensures it works on restrictive/corporate networks.
- Isolated in one module: `client/src/features/screenShare/`.

---

## 9. End-to-End Encryption (Phase 1)
- **Library:** libsodium (NaCl) — simple + debuggable; upgradeable to full Signal Protocol later.
- **Keys:** each user generates a public/private keypair on device.
  - Public key → uploaded to server (so others can encrypt to you).
  - Private key → NEVER leaves device; stored in browser IndexedDB.
- **Send:** encrypt on sender's device → server stores/relays only ciphertext.
- **Receive:** decrypt with recipient's private key.
- **Media:** encrypted on device before upload to Cloudinary.
- **Groups (Phase 2):** sender keys.
- **Trade-offs (because server can't read messages):**
  - Server-side AI → run on-device or opt-in per chat.
  - Cloud message search → on-device over local decrypted cache.
  - Push content → "New message" only, decrypt on open.
  - Multi-device → encrypted key-sync between your own devices.
- Isolated in `client/src/lib/crypto/` for easy audit/swap.

---

## 10. Folder Structure (monorepo)

```
linkr/
├── package.json                 # root: workspaces + scripts
├── pnpm-workspace.yaml
├── .env.example
├── projectlinkr.md              # THIS file
├── README.md
│
├── shared/                      # shared by client + server
│   └── src/
│       ├── types/               # User, Message, Friendship, Chat
│       ├── schemas/             # Zod schemas (both sides)
│       └── constants/           # socket event names, enums, limits
│
├── client/                      # React + Vite + TS
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/              # routes + guards
│       ├── features/            # ONE folder per feature
│       │   ├── auth/
│       │   ├── onboarding/
│       │   ├── profile/
│       │   ├── friends/
│       │   ├── chat/
│       │   ├── presence/
│       │   ├── calls/           # Phase 2
│       │   ├── screenShare/     # Phase 2
│       │   └── settings/        # theme picker, delete account
│       ├── components/
│       │   ├── ui/              # shadcn components
│       │   └── layout/          # AppShell, Sidebar, ChatPane
│       ├── lib/
│       │   ├── api/             # axios + JWT refresh
│       │   ├── socket/          # typed socket client
│       │   ├── crypto/          # E2EE (keys, encrypt, decrypt, storage)
│       │   ├── theme/           # theme provider + themes.css
│       │   └── store/           # zustand stores
│       ├── hooks/
│       └── styles/              # globals.css, themes.css
│
└── server/                      # Express + TS
    ├── package.json
    └── src/
        ├── index.ts             # HTTP + Socket.IO bootstrap
        ├── app.ts               # express + middleware
        ├── config/              # db, redis, oauth, cloudinary, env
        ├── models/              # User, Friendship, Chat, Message, Otp
        ├── modules/             # feature = route + controller + service
        │   ├── auth/            # + otp.service.ts
        │   ├── users/           # profile, search, privacy, delete
        │   ├── friends/         # request/accept/reject/block
        │   ├── chat/            # chats + messages (ciphertext)
        │   └── keys/            # public keys for E2EE
        ├── sockets/             # chat, presence, friends
        ├── middleware/          # auth, requireFriendship, validate, rateLimit, errorHandler
        └── utils/               # logger, jwt, helpers
```

---

## 11. Real-time Events (Socket.IO)
```
Presence:   user:online / user:offline / user:typing
Friends:    friend:request → friend:accepted / friend:rejected
Chat:       message:send → message:new → message:delivered → message:read
            message:pin / message:delete / message:react / message:edit
Calls:      call:initiate / call:accept / call:reject / call:end
            (WebRTC: webrtc:offer / answer / ice-candidate)
Screen:     screen:start / screen:stop
```
Every event re-checks friendship/permission server-side first.

---

## 12. Data Models
```js
User {
  _id, googleId, email,
  username (unique, indexed), displayName, avatar, bio, status,
  lastSeen, online,
  privacy: { lastSeen:'everyone|friends|nobody', profile:'everyone|friends', whoCanRequest:'everyone|nobody' },
  createdAt
}

Friendship {                         // one doc per relationship
  _id, requester, recipient,
  status: 'pending'|'accepted'|'rejected'|'blocked',
  actionBy, createdAt, updatedAt
}                                    // unique index on (requester, recipient)

Chat {
  _id, type:'1:1'|'group', members[], admins[],
  name, avatar, pinnedBy[], lastMessage, createdAt
}

Message {
  _id, chatId, sender,
  type:'text'|'image'|'video'|'file'|'voice',
  content, mediaUrl, replyTo, reactions[],
  pinned, deletedFor[], deletedForEveryone,
  status:'sent'|'delivered'|'read', readBy[], createdAt, editedAt
}

Otp { _id, phone, codeHash, expiresAt, attempts }
```

---

## 13. Environment Variables (.env.example)
```
# Server
PORT=5000
MONGODB_URI=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLOUDINARY_URL=
OTP_PROVIDER_KEY=            # deprecated placeholder (kept for compatibility)
MSG91_AUTH_KEY=             # MSG91 OTP widget — server-only; verifies the widget access token
CLIENT_URL=http://localhost:5173

# Client (VITE_ prefix)
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=
VITE_MSG91_WIDGET_ID=       # MSG91 OTP widget id (public)
VITE_MSG91_WIDGET_TOKEN=    # MSG91 OTP widget token (public)
```
All secrets via env only — NEVER hardcoded in source. **OTP:** when `MSG91_AUTH_KEY` +
`VITE_MSG91_WIDGET_ID` + `VITE_MSG91_WIDGET_TOKEN` are set, onboarding uses the MSG91 OTP widget for
real SMS verification (widget sends/verifies the code client-side, returns a JWT access token; the
server re-verifies it with the Authkey and reads the trusted phone). When unset, the built-in dev OTP
flow runs (a `devCode` hint is returned in non-production) so local dev needs no SMS provider.

---

## 14. Accounts to Create (your setup)
- [ ] Node.js + pnpm installed
- [ ] MongoDB Atlas free cluster      → MONGODB_URI
- [ ] Google Cloud OAuth credentials  → GOOGLE_CLIENT_ID / SECRET
- [ ] Cloudinary account              → CLOUDINARY_URL
- [ ] Redis (Upstash free or local)   → REDIS_URL
- [x] OTP provider (MSG91 OTP widget) → MSG91_AUTH_KEY + VITE_MSG91_WIDGET_ID/TOKEN (optional; dev OTP fallback)

Minimum to start Sprint 0 + login: Node/pnpm + MongoDB Atlas + Google OAuth.

---

## 15. Build Roadmap (sprints)
> Live, detailed status (per-sprint notes, gaps, how-to-test) lives in `project.md`. Summary:
- **Sprint 0:** ✅ Monorepo + shared types + env + DB/Redis connect + AppShell + theme system (6 themes)
- **Sprint 1:** ✅ Google OAuth + onboarding (username + phone OTP + profile)
- **Sprint 2:** ✅ Friends (search, request, accept/reject, block) + privacy enforcement
- **Sprint 3:** ✅ Real-time 1:1 chat + presence/typing/receipts
- **Sprint 4:** ✅ Message actions (pin/delete/edit/react) + pin chats *(forward deferred)*
- **Sprint 5:** ✅ Media (image/file, in-transit) + in-app notifications → **MVP COMPLETE** (+ polish 5.5–5.11)
- **E2EE (text):** ✅ libsodium sealed boxes; server stores ciphertext only *(media E2EE + multi-device sync are future work)*
- **Phase 8 (kickoff):** ✅ Real SMS OTP (MSG91 widget + server token verify) + onboarding photo + input contrast fix
- **Next — Calls/Groups:** Voice/video (WebRTC) + screen share + groups + differentiators
- **Next — AI + mobile:** AI assistant + React Native app
- **Next — Production & scale:** deploy (Vercel + Render/Railway + Atlas), Cloudinary, Redis multi-instance, HTTPS/WSS, monitoring, CI/CD

---

## 16. Design Principles
- Simple, layered, modular code: `route → controller → service → model`.
- One feature = one folder → easy debugging, no full rewrites on small bugs.
- TypeScript everywhere → catch mistakes before runtime.
- One global error handler + Zod validation at the edges.
- Scalable: Redis-backed sockets + stateless JWT + cloud media.
- AI-ready & E2EE-isolated for clean future additions.

---

## 17. How to Continue This Project
1. Open the **Linkr** folder in Cursor (File → Open Folder).
2. Reopen the planning chat from Cursor chat **history** (pinned), or start a fresh Agent chat.
3. Switch to **Agent mode** and say: **"start Sprint 0."**
4. Provide the accounts from section 14 when prompted.
