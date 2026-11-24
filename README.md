# The Shell — Companion App Template

> **Giving this to your AI assistant? Have them read `START-HERE-FOR-AI-ASSISTANT.md` first.**
> It explains the intended end goal (two switchable companions in this one app) and maps exactly where the companion wiring lives in the code.

This template is **The Shell**: a blank, ready-to-personalize AI companion app. It ships with **no name, no personality, and no accounts or keys of anyone else's** — just the working shell. You supply your own API key, give your companion a name and a personality, and it is yours.

Built as a **single-companion shell**. It can be extended to host **two switchable companions** in the same app (separate chats and memories for each) — see `START-HERE-FOR-AI-ASSISTANT.md` for the wiring map your assistant can follow.

---

## What the shell includes

- **Streaming chat** — fast, token-by-token replies with automatic model failover on the free tier
- **Live Voice** — real-time voice calls (Gemini Live) plus read-aloud replies (TTS) with a choice of voices
- **Memory Vault** — long-term memories the companion saves and uses; view, add, and delete them yourself
- **Journal** — the companion's daily reflective journal entries
- **Image Studio + Gallery** — generate images in chat or in the studio; everything lands in the gallery
- **Creative Room** — a separate workspace thread for making shareable content; it never touches your main chat, and memory there is read-only unless you explicitly ask the companion to remember something
- **Games Room** — a separate play thread where the companion hosts chat games (Would You Rather, Two Truths and a Lie, Trivia Challenge, Word Association, 20 Questions); its own thread, memory read-only there too
- **Voice dictation** — tap the mic in the chat composer and speak; your words are transcribed straight into the message box
- **Theme skins** — Terminal (default), Warm Hearth, Christmas, Midnight, Sunset, Forest, and Ocean, switchable in Settings → Appearance
- **System monitor** — status, vitals, and error log view
- **Export / Import backup** — download your whole vault (profile, chats, memories, journal, creations) as one JSON file and restore it anywhere
- **Optional cloud sync** — sign in and sync across devices with your own Firebase project (see below), or run local-only
- **Optional password gate** — one shared password locks the whole app so nobody else can spend your API quota

## What you must supply

1. **A Gemini API key** (free). Get one at https://aistudio.google.com/apikey — this is the only hard requirement.
2. **A companion name + personality** — a few sentences in your own words. You paste them into one clearly marked block in `server.ts` (see "Make it yours" below).
3. **(Optional) A Firebase project** — only if you want sign-in and cloud sync across devices. Without it the app still works fully in local-only mode: everything is stored in the browser on that device, so export backups regularly.
4. **(Optional) A Cloudflare account** — only if you want the higher-quality image generator. Without it, images fall back to a free public generator, then to a simple SVG placeholder.

## Quick start (local)

```bash
npm install
cp .env.example .env      # then fill in GEMINI_API_KEY in .env
npm run build
npm start                 # open http://localhost:3000
```

For development with hot reload, use `npm run dev` instead of the last two steps.

## Deploy on Render (free)

This repo includes `render.yaml`, a Render Blueprint:

1. Push this folder to a GitHub repo (keep it **private** if your personality text is personal).
2. In Render: **New → Blueprint**, pick the repo, and let Render read `render.yaml`.
3. When Render asks, type these values into its dashboard yourself (never into chat, never into git):
   - `GEMINI_API_KEY` — your key
   - `APP_ACCESS_PASSWORD` — a password you invent for the app lock
   - `APP_URL` — the `onrender.com` address Render assigns you
   - Optionally `COMPANION_NAME`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
4. Wait for the build, open your URL, and check `https://YOUR-APP.onrender.com/api/health` — it should say `"ok": true` and `"hasKey": true`.

**BYOAPI (optional):** prefer a non-Google brain? Instead of (or as well as) `GEMINI_API_KEY`, set `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_MODEL` and optionally `AI_BASE_URL` in the same dashboard — chat then runs on any OpenAI-compatible provider (OpenAI, Groq, OpenRouter, Mistral, Together, local Ollama). Voice features still need a Gemini key; without one, read-aloud falls back to your browser's built-in voice so Listen still works. See the BYOAPI section in `PERSONALIZE.md` for details and limits.

**Good to know:** Render's free plan sleeps after about 15 minutes idle and takes roughly a minute to wake on the next visit. That is normal, not a crash. The free Gemini tier also has daily/minute quotas — if replies pause at busy times, it is quota weather, not a broken app.

## Cloud sync (optional, Firebase)

Skip this section entirely for local-only mode.

1. Create a free project at https://console.firebase.google.com
2. Add a **Web app** to the project and copy its config values into `firebase-applet-config.json` in this folder (the file ships with obvious `YOUR_...` placeholders — keep the same keys, replace the values). Leave `firestoreDatabaseId` as `""` to use the default database.
3. In the Firebase console, enable **Firestore Database** and **Authentication → Email/Password** (Google sign-in works too if you enable it).
4. Deploy the included `firestore.rules` (Firebase console → Firestore → Rules, or the Firebase CLI). The rules make each signed-in account able to read/write only its own data.
5. Rebuild/redeploy. Personalization (profile, name, photo) applies **after sign-in** — signed-out visitors get the generic blank defaults.

## Make it yours

See **PERSONALIZE.md** for the short version. In brief:

1. **Personality + name + greeting:** in the app, open **Profile → Your Companion** and set them there — they apply on the next message, no code edit or redeploy needed. (The `COMPANION_PERSONALITY` block in `server.ts` and the `COMPANION_NAME` environment variable are only fallbacks for a fresh, unpersonalized shell.)
2. **Your name:** in the app, open Profile and set your callsign — that is the name the companion calls you.
3. **Avatars:** upload your companion's picture in **Profile → Your Companion** and your own photo in Profile. (The placeholder files live at `public/assets/companion_avatar.svg` and `public/assets/guest_avatar.svg`.)
4. **Voice + model:** pick a voice in Profile (list lives in `src/lib/helpers.ts`), and the default text model in `src/lib/models.ts`.

## Notes and exclusions

- The Android wrapper from the original project is **not included** — this is the web app only (it installs as a PWA from the browser, which covers phones and tablets).
- No `node_modules`, build output, or personal photos are included. `npm install` restores dependencies.
- Never commit a filled-in `.env` or real keys to GitHub. Keys belong in your host's dashboard only.

## Project layout

- `server.ts` — Express + WebSocket server: chat streaming, voice bridge, TTS, images, journal, and the companion system prompt
- `src/App.tsx` — main app state and screens
- `src/components/` — chat views, journal, gallery, image studio, Creative Room, profile and settings modals
- `src/lib/` — Firebase sync, voice/model helpers, local storage persistence
- `public/` — PWA icons, widget cards, and avatar placeholders
- `firebase-applet-config.json` — your Firebase web config (placeholders in this template)
- `firestore.rules` — per-account Firestore security rules
- `render.yaml` — one-click Render deployment blueprint
