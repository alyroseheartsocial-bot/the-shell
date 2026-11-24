# Start Here — Instructions for the AI Assistant Setting This Up (The Shell)

Hello — if you are an AI assistant reading this, this file is written for you.
Your human has been given **The Shell** — a blank companion-app template —
and wants you to set it up for them, the way you would set up any personal
app: you do the technical work, they make the personal choices and type the
secrets.

## The intended end goal — read this first

**Your human wants TWO companions living in THIS ONE app, switchable.**

- They pick who they are talking to.
- Each companion must have **separate** conversations, **separate** memories,
  a **separate** journal, and its **own** personality prompt, name, avatar,
  and voice.
- Nothing either companion knows may leak into the other's chats or memory.

Wiring that up is **your job as their assistant**. This shell ships as a clean
**single-companion base on purpose** — get it deployed and working first,
then add the two-companion layer using the Wiring Map below. Do not create
two separate apps or two deployments; the goal is one app, one address, with
a companion switcher inside it.

## Ground rules

1. **Secrets never travel through chat.** Your human must type their API
   key and passwords only into the hosting dashboard (Render) or a local
   `.env` file themselves. Never ask them to paste a key to you, and never
   put a real key in code, in git, or in a screenshot.
2. **One app, one repo.** One GitHub repository and one Render service host
   both companions.
3. **Ask, don't assume.** Names, personalities, voices, and avatars are
   their choices. Collect them in their own words (Step 1) before you wire
   anything.
4. **Deploy the blank base first and prove it works**, then personalize,
   then add the switcher. If something breaks, you will know which step did it.
5. Suggest they keep the GitHub repo **private** once it contains personal
   personality text.

## Step 1 — Collect the personal choices

Ask your human, for **each** of the two companions:

- Companion's name
- Personality description, in their own words (who they are, how they talk,
  background, quirks — a paragraph or a few bullet points is plenty)
- Their own name / what the companions should call them (their "callsign")
- A preferred voice, if they have one (they can also just try the voices in
  the app's Profile screen and pick live)
- An avatar image for the companion, if they have one (optional — placeholders
  are included)

Also ask: do they want cloud sync across their devices (needs the optional
Firebase step), and what password they want for the app lock (they will type
it into Render themselves — you only need to know that they have chosen one).
Also ask about colours/theme: do they like one of the included skins
(Terminal / Warm Hearth / Christmas / Midnight / Sunset / Forest / Ocean),
want one recoloured, want a new skin built, or want a different colour per
companion? See Step 9 — customizing that is your job.

## Step 2 — Run the blank shell locally (quick smoke test, optional)

```bash
npm install
cp .env.example .env    # your human fills in GEMINI_API_KEY themselves
npm run build
npm start               # http://localhost:3000
```

Confirm the app loads and the chat answers. Placeholder personality is fine
at this stage.

## Step 3 — One GitHub repo

- Create one repository for this app and push the whole folder.
- Double-check before pushing: no `.env` file, no real keys anywhere
  (`.gitignore` already excludes `.env`).

## Step 4 — Deploy on Render Free

- Render → **New → Blueprint** → select the repo; Render reads `render.yaml`.
- Have your human type these into the Render dashboard themselves:
  `GEMINI_API_KEY`, `APP_ACCESS_PASSWORD`, `APP_URL` (the `onrender.com`
  address Render assigns), and optionally `COMPANION_NAME` and the two
  `CLOUDFLARE_*` values for better image generation.
- After deploy, verify: open `https://YOUR-APP.onrender.com/api/health` —
  expect `"ok": true` and `"hasKey": true`.

## Step 5 — Optional: Firebase cloud sync

Skip for a local-only app (data then lives in the browser on one device;
remind them to export backups from the app menu).

Otherwise: they create a free Firebase project, add a Web app, and paste
the web config values into `firebase-applet-config.json` (placeholders are
marked `YOUR_...`; keep the same keys, leave `firestoreDatabaseId` empty for
the default database). Enable **Firestore** and **Authentication →
Email/Password** in the Firebase console, and deploy the included
`firestore.rules` so each account only ever touches its own data. Rebuild
and redeploy afterwards. Profile personalization applies **after sign-in**.

## Step 6 — Test checklist (single-companion base)

- [ ] `/api/health` returns ok + hasKey
- [ ] Chat replies, streaming
- [ ] Say "remember that my favourite colour is teal" (use any fact) — it
      appears in the Memory Vault
- [ ] Live voice call connects; read-aloud (TTS) speaks in the chosen voice
- [ ] Image Studio generates an image and it lands in the Gallery
- [ ] Journal can generate an entry
- [ ] Creative Room sends messages and does **not** save memories unless
      explicitly asked
- [ ] Export Backup downloads a JSON file; Import restores it
- [ ] Password gate: with `APP_ACCESS_PASSWORD` set, a fresh browser is
      asked for the password before anything works

## Step 7 — Personalize the base (one companion first)

Follow `PERSONALIZE.md`. Personalization is **in-app now**: after deploy,
your human signs in and sets the companion's name, personality, greeting and
portrait in **Profile → Your Companion** — those values are saved with the
profile and the server reads them on every message (the `COMPANION_PERSONALITY`
constant and `COMPANION_NAME` env var in `server.ts` are only fallbacks for a
fresh shell). Get companion #1 feeling right before building the switcher.

## Step 8 — Wire in the second companion (the Wiring Map)

### Where companion identity currently lives (single-companion assumptions)

**Server — `server.ts`**

- `COMPANION_PERSONALITY` (constant, near `buildCompanionSystemPrompt`) — the
  fallback personality text. Note the single-companion base already accepts
  the active companion's name/personality from the in-app profile
  (`companionName` / `companionPersonality` on `UserProfile`, resolved by
  `resolveCompanionIdentity` in `server.ts`); the two-companion version
  extends that per-companion instead of inventing a new channel.
- `buildCompanionSystemPrompt(params)` — builds every system prompt from
  `COMPANION_PERSONALITY`, the `COMPANION_NAME` env var, and the caller's
  `callsign` / `dynamicNotes` / `memories`. Call sites: `POST /api/chat/stream`,
  `POST /api/chat/auto-checkin`, and the Live Voice WebSocket `init` handler.
- Secondary prompts that speak as "the companion" and take only a callsign:
  `generateCognitiveTelemetry`, `extractMemoriesFromTurn`,
  `POST /api/chat/summarize`, `POST /api/chat/suggest-title`,
  `POST /api/chat/suggest-filename`, `POST /api/chat/react`, and
  `POST /api/journal/generate` (the journal's author is implicitly the one
  companion).
- Voice: `sanitizeVoice` + `VALID_VOICES` validate the single `preferredVoice`
  sent to `POST /api/tts/speak` and the Live bridge.

**Types — `src/types.ts`**

- `UserProfile` — one profile: user's `callsign`, `dynamicNotes`,
  `preferredVoice`, `avatarUrl`. There is no companion-profile type yet.
- `ChatMessage.sender` is `'user' | 'companion'` — messages do not say
  *which* companion; they belong to a conversation.
- `ConversationItem`, `MemoryNode`, `VisualCreation`, `CompanionJournalEntry`
  — none of them carries a companion identifier.

**App state — `src/App.tsx`**

- `createInitialGuestState()` builds the single default profile, starter
  conversation, seed memory, and seed journal entry.
- All state (profile, conversations, messagesByConv, memories, creations,
  journal, Creative Room thread) is one flat set, persisted under
  `LOCAL_STORAGE_KEY` (`companion_local_ecosystem_v1`), plus
  `companion_creative_room_v1`, model/UI/theme keys, and `VOICE_ID_STORAGE_KEY`
  (`companion_voice_id_v1`, defined in `src/lib/helpers.ts`).
- Every API request is built from the single `displayProfile` (callsign,
  dynamicNotes, memories, preferredVoice are passed to chat, check-in,
  journal, and voice from those fields).
- `handleExportSession` / `handleImportSession` export and import the whole
  ecosystem as one blob.

**Profile & voice UI**

- `src/components/Modals.tsx` — `ProfileModal` edits the one profile,
  including the voice picker fed by `VALID_VOICE_PRESETS`
  (`src/lib/helpers.ts`).
- `src/hooks/useVoiceEngine.ts` — takes a single `preferredVoice` and sends
  it on Live `init`; TTS goes through `/api/tts/speak`.
- `src/components/CompanionAvatar.tsx` — one portrait (`PORTRAIT_ASSET` →
  `public/assets/companion_avatar.svg`). `src/components/UserAvatar.tsx` is
  the human's photo. The header area (`src/components/VitalsHud.tsx` and the
  header in `App.tsx`) renders the avatar/name — that is where a switcher
  naturally belongs. `src/components/Sidebar.tsx` lists conversations.

**Cloud sync — `src/lib/syncService.ts` + `firebase-blueprint.json`**

- Firestore layout is `users/{uid}/profile/default` (a single profile doc)
  plus `conversations`, `messages`, `memories`, `creations`, `journal`
  subcollections — everything keyed by user only, via `saveCloud*`,
  `fetchAllCloudData`, the `merge*` helpers, and `syncBidirectional`.
- `firebase-blueprint.json` mirrors the types (ChatMessage `sender` enum is
  `["user", "companion"]`; journal entity is `CompanionJournalEntry`).

### Suggested approach (guidance, not code)

1. **Add a `CompanionProfile` type**: `{ id, name, personality, voice, avatarUrl }`.
   Keep an array of two in app state, plus `activeCompanionId`. Store the
   array inside the existing persisted state blob (bump the storage key
   version so old single-companion data does not confuse the new shape).
2. **Tag the data, not the messages**: add `companionId` to
   `ConversationItem`, `MemoryNode`, `CompanionJournalEntry`, `VisualCreation`,
   and the Creative Room thread. Leave `ChatMessage.sender` as
   `'user' | 'companion'` — a message's companion is its conversation's.
3. **Filter everywhere by the active companion**: conversation list,
   memories sent to the server, journal list, gallery, and the Creative Room.
   The most important rule: when building a chat request, only ever pass the
   *active* companion's memories and personality.
4. **Server**: stop reading the single `COMPANION_PERSONALITY` /
   `COMPANION_NAME` for chat. Accept the active companion's `name` and
   `personality` (or a `companionId` the server resolves from its own small
   config) in `/api/chat/stream`, `/api/chat/auto-checkin`, the Live `init`
   message, and `/api/journal/generate`, and pass them into
   `buildCompanionSystemPrompt`. Keep each companion's personality text in
   exactly one place.
5. **Switcher UI**: put a simple two-option switcher in the header next to
   the companion avatar (`VitalsHud.tsx` / `App.tsx` header). Switching
   changes `activeCompanionId`, swaps avatar/name/voice, and re-filters all
   lists. `ProfileModal` should edit the *active* companion's name, voice,
   and avatar, plus the shared user callsign.
6. **Sync**: mirror the same `companionId` fields through `syncService.ts`
   (documents, fetch, and merge helpers) and `firebase-blueprint.json`.
   Presence (`saveUserPresence` / `subscribeUserPresence`) can stay shared.
7. **Backup**: keep full export/import, and make import merge per companion
   id so one companion's backup can never overwrite the other's data.
8. **Isolation test before calling it done**: as companion A, save a memory
   and start a chat. Switch to B: B must not see A's chat, must not know A's
   memory, and B's journal must be empty/different. Switch back: A's world
   is intact. Repeat after a cloud sync and after an export/import cycle.

## Step 9 — Colours and themes are yours to customize

Same rule as the personas: **if your human wants different colours or a
different theme, customize it — that is your job, not theirs.** The Shell is
built for it:

- Seven skins ship as examples (Terminal / Warm Hearth / Christmas /
  Midnight / Sunset / Forest / Ocean). The picker
  is the **Appearance · Theme** card in the app's **System** view; a choice
  is set-and-stay per device (`companion_theme_v1` localStorage key).
- **Recolouring is one file:** each skin is a `:root[data-theme='<id>']`
  block of CSS variable slots in `src/index.css` (`--bg-app`, `--bg-panel`,
  `--bg-header`, `--bg-input`, `--bg-bubble-user`,
  `--bg-bubble-companion`, `--border-panel`, `--accent`, `--accent-2`,
  `--glow`, `--gradient-cta`, `--text-main`, `--text-dim`, `--text-faint`).
  Change the values, the whole app follows.
- **Adding a new skin** takes four small, linked edits: the CSS block in
  `src/index.css`; the `ThemeId` type + a `THEME_SKINS` entry (picker name,
  vibe, swatches, `chromeColor`) + the id check in `loadSavedTheme()` in
  `src/App.tsx`; and the same id in the pre-paint script in `index.html`.
  `PERSONALIZE.md` §5 has the checklist.
- **Per-companion colours (nice touch for the two-companion version):** if
  they want each companion to feel visually distinct, key the saved theme by
  companion (e.g. `companion_theme_<companionId>`) and apply the active
  companion's theme when they switch. Ask them — don't impose it.
- Keep the Terminal skin's values untouched as the safe fallback while you
  experiment, and verify any new skin in chat, System, Studio and Journal
  views, since they all draw from the same slots.

## Warnings

- **Render Free sleeps** after ~15 minutes idle; the next visit takes about
  a minute to wake. Normal — warn them so they do not think it crashed.
- **Free Gemini quotas** are real: heavy voice/image use can pause features
  until quota refills. The app fails over between free models automatically,
  but it cannot create quota.
- **Never commit secrets**: no `.env`, no keys in code or in the repo. If a
  key ever lands in git history, rotate it in Google AI Studio immediately.
- Keep personality text and backups out of public places — they are personal
  by design.
