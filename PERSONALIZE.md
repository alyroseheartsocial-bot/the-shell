# Make It Yours — Personalization Checklist (The Shell)

Work through these five spots and the blank shell becomes *your* companion.
Nothing else in the codebase needs to change for a single companion.

## 1. Personality, companion name, and greeting — in the app

- Deploy the shell first (see `README.md`), sign in, and open **Profile → Your Companion**.
- Set the **companion name**, **personality** (who they are, how they talk, what they enjoy, any background you want them to hold), and an optional **greeting** (shown on an empty chat instead of the default welcome line).
- These are saved with your profile and apply on the next message — no code edit, agent, or redeploy needed. Leaving personality blank keeps the shell's generic default.
- The `COMPANION_PERSONALITY` constant and `COMPANION_NAME` environment variable in `server.ts` are now only fallbacks for a fresh, unpersonalized shell.

## 1b. Import a companion — moving from another app (optional, fastest start)

- Open **Profile → Your Companion → Import a companion**.
- Paste the companion's profile, character card, or memory notes into the box, or pick a `.txt`, `.md`, or `.json` file — whichever you use fills the same box. A tidy JSON shape is shown on that screen (with a copy button), but messy free-form notes work too: they become the personality, and bullet/numbered lines (or lines under a "Memories" heading) are pulled out as Memory Vault entries.
- Check the one review screen — fields are pre-filled and editable, memories start ticked (ones already in your Vault start unticked), then tap **Import**. Profile fields replace your current values, memories are only ever added, and nothing is deleted. The companion is live in chat immediately.

## 2. Names in the app profile

- In the running app, open **Profile**: set **your callsign** (the name the companion calls you) and your bio/notes.
- Profile changes apply after sign-in when cloud sync is on; signed-out visitors always see the generic blank defaults (including the generic companion).

## 3. Avatars — in the app

- Companion picture: upload it in **Profile → Your Companion** (it is shrunk to fit inside the profile, same as your photo). The placeholder is `public/assets/companion_avatar.svg`.
- Your picture: upload it in **Profile**, or replace `public/assets/guest_avatar.svg` (the generic placeholder).

## 4. Voice and model

- Voice: pick any voice in **Profile** — the choices are defined as `VALID_VOICE_PRESETS` in `src/lib/helpers.ts` (default `Kore`), and the same list is mirrored by `VALID_VOICES` in `server.ts`. Keep the two lists in sync if you edit them.
- Text model: `DEFAULT_GEMINI_MODEL` in `src/lib/models.ts` (the in-app model switcher can change it per session).

### BYOAPI — bring your own text provider (optional)

Don't want Google for the brain? Set these in your **host dashboard** (never in the app — keys stay server-side), then restart/redeploy:

- `AI_PROVIDER=openai-compatible`
- `AI_API_KEY=` your key for that provider (or `OPENAI_API_KEY`)
- `AI_BASE_URL=` the provider's base URL — default `https://api.openai.com/v1`; Groq is `https://api.groq.com/openai/v1`, OpenRouter is `https://openrouter.ai/api/v1`, Mistral is `https://api.mistral.ai/v1`, Together is `https://api.together.xyz/v1`, a local Ollama is `http://localhost:11434/v1`
- `AI_MODEL=` a model that provider offers (required in this mode)

Chat, Creative Room, check-ins, journal, summaries and the small text helpers then run on that provider, using the same in-app companion name/personality. Honest limits of BYOAPI mode:

- **Voice stays Gemini:** live calls, read-aloud and transcription need `GEMINI_API_KEY` as well; without one, live calls and transcription return a clear "voice needs a Gemini key" message, read-aloud falls back to your browser's built-in voice, and text chat keeps working.
- **No live tools / plugins / attachment vision:** the companion can't call save-to-memory or draw mid-chat as a tool, web-search/URL plugins are skipped, and image/PDF attachments can't be viewed (text documents still work). Background memory saving after a chat still runs. Explicit "draw me…" requests in chat still render via the image providers.
- **Structured replies are best-effort:** memory/journal/summary requests ask for JSON and parse defensively — a model that ignores JSON instructions may save fewer memories.
- Image generation is unchanged (Cloudflare → Pollinations → SVG).

Leave `AI_PROVIDER` unset and everything is Gemini, exactly as before. `/api/health` reports the active `textProvider` and `textModel` (never a key).

## 5. Colours and themes — change them freely

The whole look is meant to be customized. Nothing about the colours is
locked to the included skins (Terminal, Warm Hearth, Christmas, Midnight,
Sunset, Forest, and Ocean).

- **Pick a skin in the app:** the picker is the **Appearance · Theme** card
  in the **System** view. The choice is set-and-stay (saved per device in
  the `companion_theme_v1` localStorage key) until someone changes it.
- **Recolour an existing skin:** edit its block in `src/index.css`. Each
  theme is a `:root[data-theme='<id>']` block of named colour slots
  (`--bg-app`, `--bg-panel`, `--bg-bubble-user`, `--bg-bubble-companion`,
  `--accent`, `--accent-2`, `--glow`, `--gradient-cta`, `--text-main`, etc.).
  Change the slot values and that skin changes everywhere — no other files
  need to change.
- **Add a brand-new skin:** (1) add a `:root[data-theme='yourid']` block in
  `src/index.css`, (2) add `'yourid'` to the `ThemeId` type, a matching entry
  (with picker swatches + `chromeColor`) to `THEME_SKINS`, and the id check in
  `loadSavedTheme()` — all in `src/App.tsx`, (3) add the same id to the
  pre-paint theme script in `index.html` so the app never flashes the wrong
  skin on load.
- **Different colour per companion (optional, for the two-companion
  version):** store the theme choice per companion (e.g. a
  `companion_theme_<companionId>` key set when the active companion changes)
  instead of the single shared key, and each companion can have their own
  colour identity.
- App name/icon shown on home screens: PWA manifest in `vite.config.ts` and titles in `index.html`; icons in `public/`.
