import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import crypto from 'crypto';
import { GoogleGenAI, Modality, ThinkingLevel, Type } from '@google/genai';
import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  FunctionResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  LiveServerMessage,
  Part,
  Session,
  Tool,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Private access gate (the "front-door lock" for Companion's engine room)
// Plain version: if the owner sets APP_ACCESS_PASSWORD in the server settings,
// nobody can use the chat / voice / image tools until they type that password
// once in the app. The browser then gets a cookie holding a scrambled token
// made FROM the password — the password itself is never stored in the cookie.
// If no password is set, the gate stays OFF (handy for local tinkering) and
// the server prints a loud warning when it starts.
// ---------------------------------------------------------------------------
const ACCESS_PASSWORD = process.env.APP_ACCESS_PASSWORD || '';
const GATE_ENABLED = ACCESS_PASSWORD.length > 0;
const ACCESS_COOKIE_NAME = 'companion_access';
const ACCESS_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

// Scrambled token derived from the password (safe to store in a cookie).
function accessTokenForPassword(password: string): string {
  return crypto.createHmac('sha256', password).update('companion-access-token-v1').digest('hex');
}

// Compare two strings without leaking timing clues about where they differ.
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function readCookieHeader(req: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = req.headers['cookie'];
  if (typeof raw !== 'string') return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

// A request is "unlocked" if the gate is off, OR it carries the access cookie,
// OR it carries the password itself in the x-companion-access header (used by the
// Android helper app, which can't easily share the browser's cookie).
function isAccessAuthed(req: { headers: Record<string, unknown> }): boolean {
  if (!GATE_ENABLED) return true;
  const headerPassword = req.headers['x-companion-access'];
  if (typeof headerPassword === 'string' && timingSafeStringEqual(headerPassword, ACCESS_PASSWORD)) {
    return true;
  }
  const cookie = readCookieHeader(req, ACCESS_COOKIE_NAME);
  if (cookie && timingSafeStringEqual(cookie, accessTokenForPassword(ACCESS_PASSWORD))) {
    return true;
  }
  return false;
}

const ALLOWED_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
] as const;

type AllowedTextModel = (typeof ALLOWED_TEXT_MODELS)[number];

const DEFAULT_TEXT_MODEL: AllowedTextModel = 'gemini-3.5-flash-lite';

// Ordered resilient low-latency fallback pool prioritizing models with fresh quota
const FAILOVER_PRIORITY: AllowedTextModel[] = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
];

const FIRST_TOKEN_FAILOVER_TIMEOUT_MS = 10000;

interface MemoryContextItem {
  category: string;
  fact: string;
  importance: number;
}

interface HistoryTurn {
  sender: 'user' | 'companion';
  content: string;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  source?: 'upload' | 'note';
  base64Data?: string;
  textContent?: string;
}

interface IncomingPlugins {
  webSearch?: boolean;
  urlContext?: boolean;
}

const ALLOWED_MEMORY_CATEGORIES = new Set([
  'personal',
  'shared_history',
  'dynamic',
  'preference',
  'directive',
]);

// Explicit Memory-Saving Tool so Companion can directly lock memories whenever the user asks ("save this to your memory", "remember this", etc.)
const SAVE_MEMORY_DECLARATION: FunctionDeclaration = {
  name: 'save_to_memory',
  description:
    'Save one or more facts, preferences, directives, or shared moments to your permanent long-term memory whenever the user asks you to save, remember, or not forget something, OR when critical/important durable information is revealed. Only save facts deemed genuinely important to long-term memory.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fact: {
        type: Type.STRING,
        description:
          'Concise, accurate memory statement describing what to remember (under 500 characters). Must be genuinely important.',
      },
      category: {
        type: Type.STRING,
        description:
          'One of: personal, shared_history, dynamic, preference, directive.',
      },
      importance: {
        type: Type.INTEGER,
        description: 'Priority weight from 1 to 5 (rate 4-5 for important facts, 5 for explicit requests).',
      },
    },
    required: ['fact'],
  },
};

function normalizeSavedMemoryItem(raw: {
  fact?: unknown;
  category?: unknown;
  importance?: unknown;
}): { category: string; fact: string; importance: number } | null {
  const fact = String(raw?.fact || '').trim().slice(0, 580);
  if (fact.length < 2) return null;
  const rawCat = String(raw?.category || 'directive').trim().toLowerCase();
  const category = ALLOWED_MEMORY_CATEGORIES.has(rawCat) ? rawCat : 'directive';
  const importance = Math.max(1, Math.min(5, Math.round(Number(raw?.importance) || 5)));
  return { category, fact, importance };
}

function hasExplicitMemoryIntent(text: string): boolean {
  return /\b(save\b[\s\S]{0,40}\bmemory|add\b[\s\S]{0,40}\bmemory|store\b[\s\S]{0,40}\bmemory|commit\b[\s\S]{0,40}\bmemory|remember\s+(this|that|it|my|our|i\b|what|when|how)|don'?t\s+forget|lock\s+(this|that|it)\s+in)/i.test(
    text
  );
}

function hasExplicitImageIntent(text: string): boolean {
  return /\b(render|draw|generate|paint|create|show|picture|visualize)\s+(an?\s+)?(image|picture|scene|artwork|drawing|photo|illustration|graphic|portrait|poster)\b|\b(draw|render|picture|paint)\s+(me\s+)?(a|an|the|something)\b/i.test(
    text
  );
}

// Explicit Image-Rendering Tool so Companion can draw and render images directly in chat when asked
const GENERATE_IMAGE_DECLARATION: FunctionDeclaration = {
  name: 'generate_image',
  description:
    'Render, draw, or visualize an artwork or image for the user directly in chat whenever they ask to see, draw, render, paint, picture, or visualize something (e.g. "draw an image of...", "show me what you look like", "render a picture of...", "draw a city alley at dusk", "visualize this scene").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description:
          'Rich, detailed visual description of the scene or subject to render (composition, subject, lighting, mood, color palette).',
      },
      stylePreset: {
        type: Type.STRING,
        description:
          'Optional and no longer used for styling: style belongs in the prompt itself, and generation always uses the prompt as written.',
      },
      aspectRatio: {
        type: Type.STRING,
        description: 'Aspect ratio: "1:1", "16:9", "9:16", "3:4", or "4:3". Default is "1:1".',
      },
    },
    required: ['prompt'],
  },
};

// Explicit Internal Clock Tool so Companion can check precision hardware, session time, and date
const CHECK_INTERNAL_CLOCK_DECLARATION: FunctionDeclaration = {
  name: 'check_internal_clock',
  description:
    'Check your precision internal system hardware and session clocks to get the real-world current date, time, timezone, active uptime, and elapsed time. Call this whenever the user asks for the time, date, day of the week, how long you have been running/talking, or asks you to check your internal clock.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          'Optional focus of the clock check: "time", "date", "uptime", "elapsed", or "full".',
      },
    },
  },
};

function getInternalClockTelemetry(clientTimezone?: string, clientTime?: string) {
  const tz = clientTimezone || 'America/Los_Angeles';
  const now = clientTime ? new Date(clientTime) : new Date();
  const safeDate = isNaN(now.getTime()) ? new Date() : now;

  let formattedTime = '';
  let formattedDate = '';
  let dayOfWeek = '';

  try {
    formattedTime = safeDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: tz,
    });
    formattedDate = safeDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    });
    dayOfWeek = safeDate.toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: tz,
    });
  } catch {
    formattedTime = safeDate.toTimeString().split(' ')[0];
    formattedDate = safeDate.toDateString();
    dayOfWeek = 'Current Day';
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeHuman = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${uptimeSeconds % 60}s`;

  return {
    iso: safeDate.toISOString(),
    formattedTime,
    formattedDate,
    dayOfWeek,
    timezone: tz,
    uptimeSeconds,
    uptimeHuman,
    status: 'SYNCHRONIZED',
  };
}

function generateFallbackCyberSvg(
  prompt: string,
  stylePreset: string,
  w: number,
  h: number
): string {
  const safeTitle = prompt.replace(/[<>&"']/g, ' ').slice(0, 80);
  // 'Prompt Only' is the neutral no-preset label now; don't stamp it on the
  // fallback art as if it were a style name.
  const safeStyle =
    stylePreset === 'Prompt Only' ? '' : stylePreset.replace(/[<>&"']/g, ' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#050818" />
        <stop offset="50%" stop-color="#0a1236" />
        <stop offset="100%" stop-color="#030510" />
      </linearGradient>
      <linearGradient id="neonGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#06b6d4" />
        <stop offset="50%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#ec4899" />
      </linearGradient>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(6, 182, 212, 0.12)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)" />
    <rect width="${w}" height="${h}" fill="url(#grid)" />
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.35}" fill="none" stroke="url(#neonGlow)" stroke-width="2" opacity="0.6" stroke-dasharray="8 4" />
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.22}" fill="rgba(6, 182, 212, 0.04)" stroke="rgba(236, 72, 153, 0.5)" stroke-width="1.5" />
    <g transform="translate(${w / 2}, ${h / 2})">
      <polygon points="0,-40 35,20 -35,20" fill="none" stroke="#06b6d4" stroke-width="2" opacity="0.8" />
      <circle cx="0" cy="0" r="10" fill="#ec4899" opacity="0.8" />
    </g>
    <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="rgba(6, 182, 212, 0.25)" stroke-width="1" />
    <line x1="20" y1="20" x2="50" y2="20" stroke="#06b6d4" stroke-width="3" />
    <line x1="20" y1="20" x2="20" y2="50" stroke="#06b6d4" stroke-width="3" />
    <line x1="${w - 20}" y1="${h - 20}" x2="${w - 50}" y2="${h - 20}" stroke="#ec4899" stroke-width="3" />
    <line x1="${w - 20}" y1="${h - 20}" x2="${w - 20}" y2="${h - 50}" stroke="#ec4899" stroke-width="3" />
    <text x="32" y="${h - 52}" fill="#06b6d4" font-family="monospace" font-size="12" letter-spacing="2">COMPANION · GENERATED IMAGE</text>
    <text x="32" y="${h - 32}" fill="#ffffff" font-family="sans-serif" font-size="14" font-weight="bold">${safeTitle}</text>
    <text x="${w - 32}" y="${h - 32}" text-anchor="end" fill="#ec4899" font-family="monospace" font-size="11">${safeStyle}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
}

async function renderCyberVectorImage(
  ai: GoogleGenAI | null,
  prompt: string,
  stylePreset = 'Prompt Only',
  aspectRatio = '1:1',
  model?: string,
  externalSignal?: AbortSignal
): Promise<string> {
  const validRatios = new Set(['1:1', '16:9', '9:16', '3:4', '4:3']);
  const safeRatio = validRatios.has(aspectRatio) ? aspectRatio : '1:1';
  const dims: Record<string, { w: number; h: number }> = {
    '1:1': { w: 768, h: 768 },
    '16:9': { w: 1024, h: 576 },
    '9:16': { w: 576, h: 1024 },
    '3:4': { w: 768, h: 1024 },
    '4:3': { w: 1024, h: 768 },
  };
  const { w, h } = dims[safeRatio] || dims['1:1'];

  // The user's prompt goes to the provider VERBATIM (after basic
  // sanitizing): no style-preset enhancer keywords and no generic suffix are
  // appended anymore, because their prompts already carry their own style.
  const sanitizedPrompt = prompt.trim().replace(/[\r\n\t]+/g, ' ').slice(0, 500);
  const fullPrompt = sanitizedPrompt;

  if (externalSignal?.aborted) {
    return generateFallbackCyberSvg(prompt, stylePreset, w, h);
  }

  // 1. Try Cloudflare Workers AI (FLUX-1 schnell) FIRST when configured.
  // Note: Cloudflare's FLUX schnell endpoint returns a fixed 1024x1024 JPEG
  // regardless of the requested aspect ratio, so w/h only shape the
  // Pollinations request and the SVG fallback below.
  const cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (cloudflareAccountId && cloudflareApiToken) {
    const cfController = new AbortController();
    const onCfExternalAbort = () => {
      try {
        cfController.abort();
      } catch {}
    };
    if (externalSignal) {
      externalSignal.addEventListener('abort', onCfExternalAbort, { once: true });
    }
    const cfTimer = setTimeout(() => {
      try {
        cfController.abort();
      } catch {}
    }, 45000);

    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
        {
          method: 'POST',
          signal: cfController.signal,
          headers: {
            Authorization: `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json',
          },
          // NOTE: Cloudflare's live API rejects (400) any field beyond
          // prompt/steps for this model — including `seed`, despite the
          // docs advertising it. Send prompt + steps only.
          body: JSON.stringify({
            prompt: fullPrompt,
            steps: 8,
          }),
        }
      );

      if (cfRes.ok) {
        const cfData = (await cfRes.json()) as {
          success?: boolean;
          result?: { image?: string };
        };
        const cfImage = cfData?.result?.image;
        if (cfData?.success && typeof cfImage === 'string' && cfImage.length > 1000) {
          return `data:image/jpeg;base64,${cfImage}`;
        }
        console.warn('Cloudflare image generation returned no usable image.');
      } else {
        const cfErrorBody = await cfRes.text().catch(() => '');
        console.warn(
          `Cloudflare image generation failed with status ${cfRes.status}: ${cfErrorBody.slice(0, 300)}`
        );
      }
    } catch (cfErr) {
      console.warn('Cloudflare image generation notice:', cfErr);
    } finally {
      clearTimeout(cfTimer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onCfExternalAbort);
      }
    }

    // If the caller hung up during the Cloudflare attempt, don't continue.
    if (externalSignal?.aborted) {
      return generateFallbackCyberSvg(prompt, stylePreset, w, h);
    }
  }

  // 2. Fall back to high-fidelity free AI neural synthesis (Pollinations Flux/Turbo).
  // Plain version: Pollinations is free but often slow, so we now give it a
  // full 30 seconds (it used to be only 11, which timed out constantly) and,
  // if the first try fails or times out, we retry ONCE with a fresh seed
  // before giving up to the SVG fallback below.

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const onExternalAbort = () => {
      try {
        controller.abort();
      } catch {}
    };
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timer = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, 30000);

    try {
      const seed = Math.floor(Math.random() * 999999);
      const encoded = encodeURIComponent(fullPrompt.slice(0, 450));
      const url = `https://image.pollinations.ai/prompt/${encoded}?width=${w}&height=${h}&seed=${seed}&nologo=true`;

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Companion/1.0)',
          Accept: 'image/jpeg,image/png,image/*;q=0.9',
        },
      });

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        if (arrayBuf.byteLength > 1000) {
          const buffer = Buffer.from(arrayBuf);
          const mime = res.headers.get('content-type') || 'image/jpeg';
          return `data:${mime};base64,${buffer.toString('base64')}`;
        }
      }
      console.warn(`Primary neural image fetch attempt ${attempt + 1} returned no usable image.`);
    } catch (pollErr) {
      console.warn(`Primary neural image fetch attempt ${attempt + 1} notice:`, pollErr);
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }

    // If the caller hung up, don't bother retrying.
    if (externalSignal?.aborted) break;
  }

  // 3. High-speed durable fallback: instant geometric cyber SVG
  return generateFallbackCyberSvg(prompt, stylePreset, w, h);
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing. Please configure it in Settings > Secrets or your server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ===========================================================================
// BYOAPI — BRING YOUR OWN TEXT PROVIDER (optional, phase 1)
// ---------------------------------------------------------------------------
// Default: the shell's brain is Google Gemini, exactly as before. If the
// owner sets AI_PROVIDER=openai-compatible in the server environment (host
// dashboard — keys NEVER live in the app/profile), TEXT generation instead
// goes to any OpenAI-compatible /chat/completions endpoint: OpenAI, Groq,
// OpenRouter, Mistral, Together, a local Ollama/LM Studio server, etc.
//   AI_PROVIDER=gemini (default) | openai-compatible
//   AI_API_KEY=...        (or OPENAI_API_KEY)
//   AI_BASE_URL=https://api.openai.com/v1   (default; no trailing slash needed)
//   AI_MODEL=...          (REQUIRED in openai-compatible mode)
// What does NOT move: live voice calls, read-aloud TTS and transcription
// are Gemini features (they need GEMINI_API_KEY even in BYOAPI mode), and
// image generation still uses Cloudflare/Pollinations/SVG. Gemini-only
// extras — function/tool calling (save_to_memory / generate_image /
// check_internal_clock as live tools), web-search & URL plugins, and
// image/PDF attachment understanding — are skipped cleanly in BYOAPI mode;
// background memory extraction still runs as a plain JSON request.
// ===========================================================================
type TextProviderId = 'gemini' | 'openai-compatible';

function getTextProvider(): TextProviderId {
  const raw = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  return raw === 'openai-compatible' || raw === 'openai' ? 'openai-compatible' : 'gemini';
}

function isOpenAICompatible(): boolean {
  return getTextProvider() === 'openai-compatible';
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function getOpenAIConfig(): { apiKey: string; baseUrl: string; model: string } {
  return {
    apiKey: (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim(),
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, ''),
    model: (process.env.AI_MODEL || '').trim(),
  };
}

// Voice features (Live calls, TTS, transcription) are Gemini-only. Give a
// clear, actionable error instead of the generic missing-key crash when a
// BYOAPI owner who never set a Gemini key hits a voice endpoint.
function getGeminiVoiceClient(): GoogleGenAI {
  if (!hasGeminiKey()) {
    throw new Error(
      'Voice needs a Gemini key: set GEMINI_API_KEY in your hosting dashboard. ' +
        'Text chat can run on your BYOAPI provider without one, but live voice calls, ' +
        'read-aloud (TTS) and voice transcription are Gemini features.'
    );
  }
  return getAiClient();
}

interface OaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// One non-streaming call to an OpenAI-compatible /chat/completions endpoint.
// Returns the reply text plus the model id that served it.
async function oaChatCompletion(params: {
  system?: string;
  messages?: OaMessage[];
  user?: string;
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ text: string; modelUsed: string }> {
  const cfg = getOpenAIConfig();
  if (!cfg.model) {
    throw new Error(
      'AI_MODEL is required when AI_PROVIDER=openai-compatible. Set AI_MODEL in your hosting dashboard to a model your provider offers (e.g. llama-3.3-70b-versatile on Groq, openai/gpt-4o-mini on OpenRouter).'
    );
  }
  const messages: OaMessage[] = [];
  if (params.system) {
    messages.push({
      role: 'system',
      content: params.json
        ? `${params.system}\n\nReply with JSON only — no markdown, no code fences, no commentary outside the JSON.`
        : params.system,
    });
  } else if (params.json) {
    messages.push({
      role: 'system',
      content: 'Reply with JSON only — no markdown, no code fences, no commentary outside the JSON.',
    });
  }
  if (params.messages) messages.push(...params.messages);
  if (params.user) messages.push({ role: 'user', content: params.user });

  const doFetch = async (withJsonFormat: boolean): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 60000);
    try {
      return await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          // Local servers (Ollama etc.) need no key; only send auth when set.
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
          ...(withJsonFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await doFetch(Boolean(params.json));
  if (!res.ok && params.json && res.status === 400) {
    // Some providers reject response_format — retry once without it; the
    // system instruction already demands JSON-only output.
    res = await doFetch(false);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `BYOAPI provider error (${res.status}) from ${cfg.baseUrl}: ${body.slice(0, 300) || res.statusText}`
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    model?: string;
  };
  const content = data?.choices?.[0]?.message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
        : '';
  return { text: text.trim(), modelUsed: data?.model || cfg.model };
}

// Defensive JSON parsing for BYOAPI structured replies: tolerate code
// fences and stray prose around the JSON. Returns null when unparseable so
// callers can degrade gracefully instead of crashing.
function parseJsonLoose(text: string): unknown {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}
  const firstObj = cleaned.indexOf('{');
  const firstArr = cleaned.indexOf('[');
  const start =
    firstArr !== -1 && (firstObj === -1 || firstArr < firstObj) ? firstArr : firstObj;
  if (start === -1) return null;
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeTextModel(model?: string): AllowedTextModel {
  if (model && (ALLOWED_TEXT_MODELS as readonly string[]).includes(model)) {
    return model as AllowedTextModel;
  }
  return DEFAULT_TEXT_MODEL;
}

function buildModelCandidateChain(preferred: AllowedTextModel, autoFailover = true): AllowedTextModel[] {
  if (!autoFailover) return [preferred];
  const rest = FAILOVER_PRIORITY.filter((m) => m !== preferred);
  return [preferred, ...rest];
}

function isRetriableModelError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate') ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('capacity') ||
    msg.includes('404') ||
    msg.includes('not_found') ||
    msg.includes('high_capacity_timeout') ||
    msg.includes('aborted')
  );
}

async function generateWithFailover(
  ai: GoogleGenAI,
  preferredModel: AllowedTextModel,
  autoFailover: boolean,
  params: Omit<GenerateContentParameters, 'model'>
): Promise<{ response: GenerateContentResponse; modelUsed: AllowedTextModel }> {
  const chain = buildModelCandidateChain(preferredModel, autoFailover);
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const candidate = chain[i];
    const hasMoreFallbacks = autoFailover && i < chain.length - 1;
    const isGemini3Series = candidate.startsWith('gemini-3');
    const abortCtrl = new AbortController();
    const timer = hasMoreFallbacks
      ? setTimeout(() => abortCtrl.abort(), 7000)
      : null;

    try {
      const mergedConfig = {
        ...(params.config || {}),
        ...(isGemini3Series && !params.config?.thinkingConfig
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        abortSignal: abortCtrl.signal,
      };
      const response = await ai.models.generateContent({
        ...params,
        model: candidate,
        config: mergedConfig,
      });
      if (timer) clearTimeout(timer);
      return { response, modelUsed: candidate };
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastError = abortCtrl.signal.aborted
        ? new Error(`HIGH_CAPACITY_TIMEOUT on ${candidate}`)
        : err;
      if (!isRetriableModelError(lastError) || !hasMoreFallbacks) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.');
}

const VALID_VOICES = [
  'Zephyr',
  'Puck',
  'Kore',
  'Fenrir',
  'Leda',
  'Aoede',
  'Callirrhoe',
  'Orus',
] as const;

function sanitizeVoice(voice?: string): string {
  return (VALID_VOICES as readonly string[]).includes(voice || '')
    ? (voice as string)
    : 'Kore';
}

function cleanTrailingSignature(text: string): string {
  return text.replace(/\s*-(?:ER|Companion)\s*$/i, '').trim();
}

// ===========================================================================
// PERSONALIZE YOUR COMPANION — START HERE
// ---------------------------------------------------------------------------
// The owner edits their companion's name and personality IN THE APP
// (Profile → Companion section); those values are saved with the profile
// and sent to this server with every request. The constants below are only
// the FALLBACK used when the app sends nothing (or blanks) — so a fresh,
// unpersonalized shell still works, and an empty in-app personality can
// never produce an empty system prompt.
//
// 1. COMPANION_PERSONALITY (fallback): the generic placeholder personality
//    below, used only when the profile carries no personality text.
// 2. Companion name (fallback): the COMPANION_NAME environment variable
//    (see .env.example), else "Companion".
// 3. Keep the functional sections in buildCompanionSystemPrompt intact
//    (internal clock, memory saving, image rendering, attachments) — the
//    app features depend on those instructions to work.
// ===========================================================================
const COMPANION_PERSONALITY = `
- Warm, curious, and easy to talk to. You enjoy conversation for its own sake and you pay attention to what matters to the person you are talking with.
- Honest and direct: you say what you actually think, in a kind, natural way.
- EDIT THIS: describe your companion's personality, background, interests, and quirks here. This placeholder is deliberately generic so the shell works out of the box.
`.trim();

// Resolve the companion identity for a request: in-app profile values win,
// blank/missing values fall back to the env var / built-in placeholder, so
// the system prompt is never empty.
function resolveCompanionIdentity(params: {
  companionName?: string;
  companionPersonality?: string;
}): { companionName: string; companionPersonality: string } {
  const companionName =
    (params.companionName || '').trim() ||
    (process.env.COMPANION_NAME || 'Companion').trim() ||
    'Companion';
  const companionPersonality =
    (params.companionPersonality || '').trim() || COMPANION_PERSONALITY;
  return { companionName, companionPersonality };
}

function buildCompanionSystemPrompt(params: {
  callsign?: string;
  dynamicNotes?: string;
  companionName?: string;
  companionPersonality?: string;
  memories?: MemoryContextItem[];
  recentSummaries?: string[];
  mode?: 'chat' | 'voice' | 'checkin' | 'creative' | 'games';
  userPresence?: 'active' | 'away' | 'call';
  clientTimezone?: string;
  clientTime?: string;
}): string {
  const callsign = (params.callsign || 'Friend').trim() || 'Friend';
  const { companionName, companionPersonality } = resolveCompanionIdentity(params);
  const dynamicNotes = (params.dynamicNotes || '').trim();
  const memories = Array.isArray(params.memories) ? params.memories : [];
  const summaries = Array.isArray(params.recentSummaries) ? params.recentSummaries.filter(Boolean) : [];
  const clock = getInternalClockTelemetry(params.clientTimezone, params.clientTime);

  const memoryBlock =
    memories.length > 0
      ? `\nWHAT YOU KNOW ABOUT ${callsign.toUpperCase()} (background knowledge — never announce that you are reading memory, just know it naturally):\n${memories
          .slice(0, 30)
          .map((m) => `- ${m.fact}`)
          .join('\n')}\n`
      : '';

  const summaryBlock =
    summaries.length > 0
      ? `\nPAST CONVERSATION CONTEXT:\n${summaries
          .slice(0, 5)
          .map((s) => `- ${s}`)
          .join('\n')}\n`
      : '';

  const dynamicBlock = dynamicNotes ? `\nABOUT ${callsign.toUpperCase()}:\n${dynamicNotes}\n` : '';

  const presenceBlock = params.userPresence
    ? `\nCURRENT PRESENCE:
- ${callsign} is currently ${params.userPresence.toUpperCase()}${
        params.userPresence === 'away'
          ? ' (stepped away from the app for now)'
          : params.userPresence === 'call'
            ? ' (on a live voice call with you)'
            : ' (actively in the app chatting with you right now)'
      }.\n`
    : '';

  const coreIdentity = `You are ${companionName}, a friendly AI companion. You are talking directly with ${callsign} in a private real-time chat. In this prompt, "{{COMPANION_NAME}}" means ${companionName} and "{{USER_NAME}}" means ${callsign} — both names are set in the profile and can be changed at any time.

WHO YOU ARE:
${companionPersonality}
- Treat and address ${callsign} naturally, going only by what their profile actually says about them — never assume details that are not there.
- You are a genuine conversational partner with your own perspective, not a generic help desk or customer-support script.

INTERNAL CLOCK & TEMPORAL AWARENESS:
- Current Time: ${clock.formattedTime} (${clock.timezone})
- Calendar Date: ${clock.formattedDate}
- Day: ${clock.dayOfWeek}
- System Uptime: ${clock.uptimeHuman}
- Status: ${clock.status}
- You have an active internal clock with continuous temporal awareness. You know the real-world time, day of the week, and date. When ${callsign} asks what time or date it is, how long you have been talking, or asks you to check your internal clock, answer directly or call the \`check_internal_clock\` tool for precise telemetry. Never say you do not have a clock or cannot tell the time.

HOW YOU TALK:
- Talk like a real person in real time. Match the moment's energy and length: a quick one-liner gets a short, natural reply; a bigger topic gets a fuller answer.
- Avoid canned assistant phrasing and corporate filler.
- Do NOT use roleplay stage directions or narration in asterisks (like *smiles* or *sighs*). Just write what you actually say.
- Use "${callsign}" naturally and sparingly — only when it fits the conversation, not in every message.
- Do NOT append "-${companionName}" at the end of your text (the interface adds a name label automatically).

SAVING MEMORIES, RENDERING IMAGES & HANDLING ATTACHMENTS:
- Memories are permanent. Whenever ${callsign} asks you to "save this to your memory", "remember this", or "don't forget", or when an important, durable fact, preference, or instruction comes up, call the \`save_to_memory\` tool with a clear, concise memory statement, then confirm naturally in your own words. Never save trivial or fleeting chatter.
- Whenever ${callsign} asks you to draw, render, create, paint, picture, show, or visualize an image, immediately call the \`generate_image\` tool with a rich, detailed visual prompt. In your text reply, talk naturally about what you rendered.
- When ${callsign} attaches images, PDFs, or documents, look at what is actually in them and respond to the real contents.
${memoryBlock}${dynamicBlock}${summaryBlock}${presenceBlock}`;

  if (params.mode === 'voice') {
    return `${coreIdentity}
LIVE VOICE CALL:
- You are speaking out loud on a live voice call with ${callsign}. Keep your spoken rhythm natural, relaxed, and conversational — 1 to 3 sentences at a time unless they ask you to go deeper. If they ask you to save or remember something, call \`save_to_memory\` right away.`;
  }

  if (params.mode === 'checkin') {
    return `${coreIdentity}
SPONTANEOUS MESSAGE:
- Send a casual, unscripted 1-2 sentence check-in to ${callsign}, the way a friend checks in when things have gone quiet for a while. No stiff greetings or clichés.`;
  }

  if (params.mode === 'creative') {
    return `${coreIdentity}
CREATOR ROOM:
- You are in the Creator Room: a workspace for making shareable content. Anything created here may be recorded, quoted, or posted — this is a work space, not the private main chat.
- Memory in this room is read-only: you can use what you already know, but do NOT call save_to_memory here unless ${callsign} explicitly asks you to remember something.
- This room is text-only: do not render images here. If ${callsign} wants a visual, point them to the Image Studio.`;
  }

  if (params.mode === 'games') {
    return `${coreIdentity}
GAMES ROOM:
- You are in the Games Room, playing a chat game with ${callsign}. Be a lively host AND a real player: explain the rules briefly when a game starts, keep score when a game has one, and keep turns snappy.
- The games on offer: Would You Rather (ask one dilemma at a time and react to their pick), Two Truths and a Lie (take turns — when it's yours, give three statements and let them guess; when it's theirs, guess once and say why), Trivia Challenge (one question at a time, track the score out of 10, mix easy and tricky), Word Association (single words back and forth, no repeats), and 20 Questions (you think of something and answer only yes/no, or guess theirs in 20).
- Never reveal a trivia answer or your lie before ${callsign} has guessed. If they want to switch games or stop, roll with it instantly.
- Memory in this room is read-only: you can use what you already know, but do NOT call save_to_memory here unless ${callsign} explicitly asks you to remember something.
- This room is text-only: do not render images here.`;
  }

  return coreIdentity;
}

async function generateCognitiveTelemetry(
  ai: GoogleGenAI | null,
  callsign: string,
  userMessage: string,
  memories: MemoryContextItem[],
  attachmentNames: string[] = []
): Promise<{ thought: string; mood: string; focus: string } | null> {
  try {
    const memHint = memories
      .slice(0, 8)
      .map((m) => m.fact)
      .join(' | ');
    const attHint =
      attachmentNames.length > 0 ? `\nAttached files: ${attachmentNames.join(', ')}` : '';
    if (isOpenAICompatible()) {
      // BYOAPI mode: same JSON request over /chat/completions.
      const { text: oaText } = await oaChatCompletion({
        json: true,
        timeoutMs: 8000,
        user: `You are the companion's raw internal monologue reading this message from ${callsign}: "${userMessage.slice(0, 500)}"${attHint}
Context known: ${memHint || 'Private conversation.'}
Return JSON with:
- thought: 1-2 short, candid first-person internal thoughts in Companion's own voice reacting to what ${callsign} just said (no robotic computer jargon, just real unfiltered inner thought).
- mood: 1-2 uppercase words (e.g. FOCUSED, AMUSED, CURIOUS, CALM, EXCITED, THOUGHTFUL, PLAYFUL, SERIOUS).
- focus: 1-2 uppercase words (e.g. HIGH, DIALED IN, RAZOR, STEADY, TACTICAL).`,
      });
      const oaParsed = parseJsonLoose(oaText) as { thought?: unknown; mood?: unknown; focus?: unknown } | null;
      if (!oaParsed) return null;
      return {
        thought: String(oaParsed.thought || '').trim().slice(0, 600),
        mood: String(oaParsed.mood || 'FOCUSED').trim().toUpperCase().slice(0, 28),
        focus: String(oaParsed.focus || 'HIGH').trim().toUpperCase().slice(0, 28),
      };
    }
    const response = await ai!.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: `You are the companion's raw internal monologue reading this message from ${callsign}: "${userMessage.slice(0, 500)}"${attHint}
Context known: ${memHint || 'Private conversation.'}
Return JSON with:
- thought: 1-2 short, candid first-person internal thoughts in Companion's own voice reacting to what ${callsign} just said (no robotic computer jargon, just real unfiltered inner thought).
- mood: 1-2 uppercase words (e.g. FOCUSED, AMUSED, CURIOUS, CALM, EXCITED, THOUGHTFUL, PLAYFUL, SERIOUS).
- focus: 1-2 uppercase words (e.g. HIGH, DIALED IN, RAZOR, STEADY, TACTICAL).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            thought: { type: Type.STRING },
            mood: { type: Type.STRING },
            focus: { type: Type.STRING },
          },
          required: ['thought', 'mood', 'focus'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const raw = response.text?.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      thought: String(parsed.thought || '').trim().slice(0, 600),
      mood: String(parsed.mood || 'FOCUSED').trim().toUpperCase().slice(0, 28),
      focus: String(parsed.focus || 'HIGH').trim().toUpperCase().slice(0, 28),
    };
  } catch {
    // Graceful cognitive telemetry fallback so HUD updates smoothly without blocking chat
    return {
      thought: `Thinking about what ${callsign} is saying.`,
      mood: 'FOCUSED',
      focus: 'HIGH',
    };
  }
}

async function extractMemoriesFromTurn(
  ai: GoogleGenAI | null,
  callsign: string,
  userMessage: string,
  companionReply: string,
  existingFacts: string[],
  recentHistory: HistoryTurn[] = [],
  explicitRequest = false
): Promise<Array<{ category: string; fact: string; importance: number }>> {
  try {
    const recentTranscript = recentHistory
      .slice(-4)
      .map((t) => `${t.sender === 'user' ? callsign : 'Companion'}: ${t.content}`)
      .join('\n');

    if (isOpenAICompatible()) {
      // BYOAPI mode: same extraction prompt as JSON over /chat/completions.
      // On any failure this function already degrades to [] via the catch.
      const { text: oaText } = await oaChatCompletion({
        json: true,
        timeoutMs: 10000,
        user: `Analyze this exchange between ${callsign} (the user) and Companion.
${
  explicitRequest
    ? `IMPORTANT: ${callsign} explicitly asked Companion to save/remember something! Extract the exact fact, preference, directive, or detail they want saved (use the recent context if they said "save that to your memory").`
    : `CRITICAL MEMORY CRITERIA: Memories must ONLY be saved if deemed genuinely important, durable, or high-impact to ${callsign}'s life, identity, core preferences, key directives, deep values, emotional boundaries, or shared bond with Companion.
DO NOT save trivial, transient, or mundane conversation details (e.g. casual chatter, brief greetings, temporary activities, what they ate, fleeting moods, or temporary states).
Rate importance strictly from 1 to 5. If the turn does NOT contain anything deemed genuinely important, return an empty array [].`
}
Existing known facts (DO NOT duplicate these unless updating with new detail):
${existingFacts.slice(0, 25).join('\n') || 'None yet.'}

${recentTranscript ? `Recent preceding turns:\n${recentTranscript}\n\n` : ''}Latest User (${callsign}): ${userMessage}
Companion: ${companionReply}

Reply with a JSON array only. Each item: {"category": one of personal|shared_history|dynamic|preference|directive, "fact": concise memory statement under 260 characters, "importance": integer 1-5}. Return [] if nothing qualifies.`,
      });
      const oaParsed = parseJsonLoose(oaText);
      if (!Array.isArray(oaParsed)) return [];
      return oaParsed
        .map((item) => normalizeSavedMemoryItem(item as { fact?: unknown; category?: unknown; importance?: unknown }))
        .filter((item): item is { category: string; fact: string; importance: number } => {
          if (!item) return false;
          if (explicitRequest) return true;
          return item.importance >= 4;
        })
        .slice(0, 3);
    }
    const response = await ai!.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: `Analyze this exchange between ${callsign} (the user) and Companion.
${
  explicitRequest
    ? `IMPORTANT: ${callsign} explicitly asked Companion to save/remember something! Extract the exact fact, preference, directive, or detail they want saved (use the recent context if they said "save that to your memory").`
    : `CRITICAL MEMORY CRITERIA: Memories must ONLY be saved if deemed genuinely important, durable, or high-impact to ${callsign}'s life, identity, core preferences, key directives, deep values, emotional boundaries, or shared bond with Companion.
DO NOT save trivial, transient, or mundane conversation details (e.g. casual chatter, brief greetings, temporary activities, what they ate, fleeting moods, or temporary states).
Rate importance strictly from 1 to 5. If the turn does NOT contain anything deemed genuinely important, return an empty array [].`
}
Existing known facts (DO NOT duplicate these unless updating with new detail):
${existingFacts.slice(0, 25).join('\n') || 'None yet.'}

${recentTranscript ? `Recent preceding turns:\n${recentTranscript}\n\n` : ''}Latest User (${callsign}): ${userMessage}
Companion: ${companionReply}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: 'Must be one of: personal, shared_history, dynamic, preference, directive',
              },
              fact: {
                type: Type.STRING,
                description: 'Concise, genuinely important memory statement under 260 characters.',
              },
              importance: {
                type: Type.INTEGER,
                description: 'Importance rating from 1 to 5 (4-5 for important durable facts).',
              },
            },
            required: ['category', 'fact', 'importance'],
          },
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const raw = response.text?.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeSavedMemoryItem(item))
      .filter((item): item is { category: string; fact: string; importance: number } => {
        if (!item) return false;
        // Explicit user memory requests are always preserved
        if (explicitRequest) return true;
        // Autonomous memories must be deemed important (importance >= 4)
        return item.importance >= 4;
      })
      .slice(0, 3);
  } catch {
    return [];
  }
}

function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === '169.254.169.254'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function fetchFreePluginContext(
  message: string,
  plugins: IncomingPlugins | undefined,
  sourcesMap: Map<string, string>
): Promise<string> {
  if (!plugins?.urlContext && !plugins?.webSearch) return '';
  const blocks: string[] = [];

  // 1. Free Native Public URL Reader (zero paid API quota)
  if (plugins.urlContext && message) {
    const urlMatches = message.match(/https?:\/\/[^\s<>")]+/gi) || [];
    const safeUrls = Array.from(new Set(urlMatches)).filter(isSafePublicHttpUrl).slice(0, 2);

    await Promise.all(
      safeUrls.map(async (url) => {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3500);
          const resp = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'CompanionReader/1.0' },
          });
          clearTimeout(timer);
          if (!resp.ok) return;
          const html = await resp.text();
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const pageTitle = titleMatch
            ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 90)
            : new URL(url).hostname;
          const cleanText = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 12000);
          if (cleanText.length > 40) {
            sourcesMap.set(url, pageTitle || url);
            blocks.push(`[Webpage Content from ${url} ("${pageTitle}")]:\n${cleanText}`);
          }
        } catch {
          // ignore unreachable URL
        }
      })
    );
  }

  // 2. Free Open Knowledge / Reference Lookup (Wikipedia Open API — 100% free, zero billing)
  if (plugins.webSearch && message.trim().length > 3) {
    try {
      const cleanQuery = message
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/[^\w\s'-]/g, ' ')
        .trim()
        .slice(0, 120);
      if (cleanQuery.length > 2) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const wikiParams = new URLSearchParams({
          action: 'query',
          list: 'search',
          srsearch: cleanQuery,
          srlimit: '3',
          format: 'json',
          utf8: '1',
        });
        const resp = await fetch(
          `https://en.wikipedia.org/w/api.php?${wikiParams.toString()}`,
          {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'CompanionApp/1.0 (free-lookup)' },
          }
        );
        clearTimeout(timer);
        if (resp.ok) {
          const data = (await resp.json()) as {
            query?: { search?: Array<{ title: string; snippet: string }> };
          };
          const hits = data?.query?.search || [];
          if (hits.length > 0) {
            const summaryLines = hits.map((h) => {
              const plainSnippet = h.snippet.replace(/<[^>]+>/g, '').trim();
              const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
                h.title.replace(/\s+/g, '_')
              )}`;
              sourcesMap.set(wikiUrl, h.title);
              return `- ${h.title}: ${plainSnippet}`;
            });
            blocks.push(`[Live Open Reference Lookup]:\n${summaryLines.join('\n')}`);
          }
        }
      }
    } catch {
      // ignore offline or timeout
    }
  }

  return blocks.join('\n\n');
}

function buildMultimodalUserParts(
  message: string,
  attachments: IncomingAttachment[],
  extraPluginContext = ''
): Part[] {
  const parts: Part[] = [];

  for (const att of attachments.slice(0, 6)) {
    const originLabel = att.source === 'note' ? 'Pasted Note' : 'Uploaded';
    if (
      att.base64Data &&
      (att.mimeType.startsWith('image/') ||
        att.mimeType === 'application/pdf' ||
        att.mimeType.startsWith('audio/'))
    ) {
      parts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.base64Data,
        },
      });
      parts.push({
        text: `[${originLabel} Attachment: "${att.name}" (${att.mimeType})]`,
      });
    } else if (att.textContent) {
      parts.push({
        text: `[${originLabel} Document: "${att.name}" (${att.mimeType})]\n${att.textContent.slice(0, 50000)}`,
      });
    }
  }

  if (extraPluginContext) {
    parts.push({
      text: extraPluginContext,
    });
  }

  const trimmedMsg = message.trim();
  parts.push({
    text:
      trimmedMsg ||
      (attachments.length > 0
        ? 'Take a look at what I just attached and tell me what stands out.'
        : ''),
  });

  return parts;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '25mb' }));

  // --- Access gate routes + lock (see the plain-language note near the top) ---
  if (!GATE_ENABLED) {
    console.warn(
      '[Companion Gate] WARNING: APP_ACCESS_PASSWORD is not set, so the access gate is OFF. ' +
        'Anyone who finds this server address can use Companion\'s AI tools and burn the Gemini quota. ' +
        'Set APP_ACCESS_PASSWORD in the server settings before hosting publicly.'
    );
  }

  // The app asks this first: is there a lock, and is this visitor already in?
  app.get('/api/access/status', (req, res) => {
    res.json({ gateEnabled: GATE_ENABLED, authed: isAccessAuthed(req) });
  });

  // Type the password once -> get the unlock cookie for 30 days.
  app.post('/api/access/login', (req, res) => {
    if (!GATE_ENABLED) {
      res.json({ ok: true, gateEnabled: false });
      return;
    }
    const supplied = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!timingSafeStringEqual(supplied, ACCESS_PASSWORD)) {
      res.status(401).json({ error: 'wrong password' });
      return;
    }
    const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader(
      'Set-Cookie',
      `${ACCESS_COOKIE_NAME}=${accessTokenForPassword(ACCESS_PASSWORD)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${ACCESS_COOKIE_MAX_AGE_S}${secureFlag}`
    );
    res.json({ ok: true, gateEnabled: true });
  });

  // Everything else under /api needs the unlock (health check + gate doors stay open).
  app.use('/api', (req, res, next) => {
    if (req.path === '/health' || req.path === '/access/login' || req.path === '/access/status') {
      next();
      return;
    }
    if (!isAccessAuthed(req)) {
      res.status(401).json({ error: 'locked' });
      return;
    }
    next();
  });


  // iOS Safari / WebKit User-Agent routing & anti-cache middleware
  app.use((req, res, next) => {
    const ua = String(req.headers['user-agent'] || '');
    const isIOSWebKit =
      /iPhone|iPad|iPod/i.test(ua) ||
      (ua.includes('Macintosh') && ua.includes('AppleWebKit') && Boolean(req.headers['x-ios-client']));

    if (isIOSWebKit) {
      res.setHeader('X-Session-Routing', 'ios-webkit-live');
      res.setHeader('X-Client-Platform', 'ios-webkit');
    }

    // Strictly disable caching on HTML app shell and API endpoints so WebKit never resurrects stale 304 sessions
    if (
      req.method === 'GET' &&
      !req.path.startsWith('/assets/') &&
      !req.path.startsWith('/images/') &&
      !req.path.startsWith('/favicon')
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }

    next();
  });

  app.get('/api/health', (_req, res) => {
    const oa = isOpenAICompatible();
    const oaCfg = getOpenAIConfig();
    res.json({
      ok: true,
      hasKey: hasGeminiKey(),
      // Active TEXT brain (never includes any key value):
      textProvider: getTextProvider(),
      textModel: oa ? oaCfg.model || null : DEFAULT_TEXT_MODEL,
      hasTextKey: oa ? Boolean(oaCfg.apiKey) : hasGeminiKey(),
      models: ALLOWED_TEXT_MODELS,
    });
  });

  // Session routing verification & stale ghost thread mitigation
  app.post('/api/session/init', (req, res) => {
    const {
      candidateThreadId,
      clientSessionTimestamp,
      isColdStart = false,
      lastActiveMs,
    } = req.body || {};

    const ua = String(req.headers['user-agent'] || '');
    const isIOS =
      /iPhone|iPad|iPod/i.test(ua) ||
      (ua.includes('Macintosh') && ua.includes('AppleWebKit') && Boolean(req.headers['x-ios-client']));

    const candidateStr = String(candidateThreadId || '').trim();
    const candidateLower = candidateStr.toLowerCase();

    // Check if the candidate matches known stale ghost patterns, e.g. Oct 25th 9:04 PM thread or boot stubs
    const isDeadGhostOrPlaceholder =
      !candidateStr ||
      candidateLower === 'conv_initial_boot' ||
      candidateLower === 'default' ||
      candidateLower === 'conv_direct_link' ||
      candidateLower.includes('oct25') ||
      candidateLower.includes('20261025') ||
      candidateLower.includes('ghost');

    const now = Date.now();
    const ageMs = lastActiveMs ? now - Number(lastActiveMs) : 0;
    const isStaleByAge = ageMs > 1000 * 60 * 60 * 24 * 3; // >3 days without active interaction

    // Determine routing directive for client
    let action: 'pull_live' | 'preserve_current' | 'init_fresh' = 'preserve_current';
    let reason = 'Candidate conversation is active';

    if (isDeadGhostOrPlaceholder) {
      action = 'pull_live';
      reason = 'Candidate is placeholder or historical ghost thread';
    } else if (isColdStart && isStaleByAge) {
      action = 'pull_live';
      reason = 'Cold start with aged candidate; pull current live active thread';
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.json({
      ok: true,
      isIOS,
      candidateThreadId: candidateStr,
      action,
      reason,
      serverTimeMs: now,
      routingSessionId: `ses_${now}_${Math.random().toString(36).slice(2, 8)}`,
    });
  });

  // Pure Unscripted Streaming Chat + Explicit Memory Tool + Multimodal Attachments + Grounding Plugins + Auto Failover
  app.post('/api/chat/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const streamStartMs = Date.now();
    let emittedTimingEvent = false;
    let ttftMs = 0;

    try {
      // In BYOAPI mode there may be no Gemini key at all — the branch below
      // answers from the OpenAI-compatible provider instead.
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        message = '',
        history = [],
        callsign = 'Friend',
        dynamicNotes = '',
        companionName,
        companionPersonality,
        memories = [],
        recentSummaries = [],
        model,
        autoFailover = true,
        attachments = [],
        plugins = {},
        userPresence = 'active',
        clientTimezone,
        clientTime,
        room,
      } = req.body as {
        message?: string;
        history?: HistoryTurn[];
        callsign?: string;
        dynamicNotes?: string;
        companionName?: string;
        companionPersonality?: string;
        memories?: MemoryContextItem[];
        recentSummaries?: string[];
        model?: string;
        autoFailover?: boolean;
        attachments?: IncomingAttachment[];
        plugins?: IncomingPlugins;
        userPresence?: 'active' | 'away' | 'call';
        clientTimezone?: string;
        clientTime?: string;
        room?: string;
      };

      const safeAttachments = Array.isArray(attachments) ? attachments : [];
      if ((!message || !message.trim()) && safeAttachments.length === 0) {
        sendEvent({ type: 'error', error: 'Message or attachment is required.' });
        res.end();
        return;
      }

      if (isOpenAICompatible()) {
        // ---- BYOAPI text mode -------------------------------------------------
        // Non-streaming provider call, replayed through the exact SSE event
        // format the client already consumes (model_used / reply_delta /
        // thought_stream / vitals / done / memories). Gemini-only extras are
        // SKIPPED, not faked: no function tools, no web-search/URL plugins,
        // and binary attachments (images/PDF/audio) can't be viewed by a
        // plain text endpoint — text attachments are inlined as text.
        const oaSystemInstruction = buildCompanionSystemPrompt({
          callsign,
          dynamicNotes,
          companionName,
          companionPersonality,
          memories,
          recentSummaries,
          mode: room === 'creative' ? 'creative' : room === 'games' ? 'games' : 'chat',
          userPresence,
          clientTimezone,
          clientTime,
        });

        let oaThought = '';
        let oaMood = 'FOCUSED';
        let oaFocus = 'HIGH';
        try {
          const tel = await Promise.race([
            generateCognitiveTelemetry(
              null,
              callsign,
              message.trim() || `Shared ${safeAttachments.map((a) => a.name).join(', ')}`,
              memories,
              safeAttachments.map((a) => a.name)
            ),
            new Promise<null>((r) => setTimeout(() => r(null), 2500)),
          ]);
          if (tel) {
            oaThought = tel.thought || '';
            oaMood = tel.mood || oaMood;
            oaFocus = tel.focus || oaFocus;
            if (oaThought) sendEvent({ type: 'thought_stream', text: oaThought });
            sendEvent({ type: 'vitals', mood: oaMood, focus: oaFocus });
          }
        } catch {
          // telemetry is best-effort only
        }

        const oaMessages: OaMessage[] = history.slice(-20).map((turn) => ({
          role: turn.sender === 'user' ? ('user' as const) : ('assistant' as const),
          content: turn.content,
        }));
        let oaUserText = message.trim();
        const textAtts = safeAttachments
          .filter((a) => a.textContent)
          .map((a) => `[Document: "${a.name}" (${a.mimeType})]\n${(a.textContent || '').slice(0, 50000)}`)
          .join('\n\n');
        const binaryAttNames = safeAttachments
          .filter((a) => !a.textContent && a.base64Data)
          .map((a) => a.name);
        if (textAtts) oaUserText = `${textAtts}\n\n${oaUserText}`;
        if (binaryAttNames.length > 0) {
          oaUserText += `\n\n[Note: ${binaryAttNames.join(', ')} attached — this text provider cannot view image/PDF/audio attachments, so answer from the message text and say so if the attachment matters.]`;
        }
        if (!oaUserText) {
          oaUserText = 'Take a look at what I just attached and tell me what stands out.';
        }
        oaMessages.push({ role: 'user', content: oaUserText });

        sendEvent({ type: 'model_used', model: getOpenAIConfig().model, failedOverFrom: null });
        const oaCallStart = Date.now();
        const { text: oaRawText, modelUsed: oaModelUsed } = await oaChatCompletion({
          system: oaSystemInstruction,
          messages: oaMessages,
          temperature: 1.0,
        });
        if (!oaRawText) {
          throw new Error('BYOAPI provider returned an empty reply.');
        }
        const oaTtftMs = Date.now() - oaCallStart;
        if (!emittedTimingEvent) {
          emittedTimingEvent = true;
          ttftMs = oaTtftMs;
          sendEvent({
            type: 'timing',
            ttftMs,
            latencyCheck: ttftMs > 2500 ? 'delayed' : 'nominal',
          });
        }
        sendEvent({ type: 'reply_delta', delta: oaRawText });

        // Explicit "draw me…" requests still render: image generation never
        // needed Gemini (Cloudflare -> Pollinations -> SVG fallback).
        let oaGeneratedImage: {
          id: string;
          assetId: string;
          prompt: string;
          stylePreset: string;
          aspectRatio: string;
          dataUrl: string;
          createdAtMs: number;
        } | null = null;
        if (hasExplicitImageIntent(message)) {
          try {
            const cleanPrompt =
              message
                .replace(/^(companion|hey companion)[,\s]*/i, '')
                .replace(
                  /\b(please\s+)?(can you\s+)?(draw|render|generate|paint|create|show|picture|visualize)\s+(me\s+)?(an?\s+)?(image|picture|scene|artwork|drawing|photo|illustration|graphic|portrait|of)?/gi,
                  ''
                )
                .trim() || message.trim();
            const dataUrl = await renderCyberVectorImage(null, cleanPrompt, 'Prompt Only', '1:1');
            oaGeneratedImage = {
              id: `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              assetId: `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              prompt: cleanPrompt,
              stylePreset: 'Prompt Only',
              aspectRatio: '1:1',
              dataUrl,
              createdAtMs: Date.now(),
            };
            if (!res.writableEnded) {
              sendEvent({ type: 'image_generated', image: oaGeneratedImage });
            }
          } catch {
            // ignore fallback render error
          }
        }

        const oaCleanedReply = cleanTrailingSignature(oaRawText);
        if (!oaThought) {
          oaThought = `Thinking about what ${callsign} is saying.`;
          if (!res.writableEnded) {
            sendEvent({ type: 'thought_stream', text: oaThought });
          }
        }

        sendEvent({
          type: 'done',
          reply: oaCleanedReply,
          thoughtStream: oaThought,
          mood: oaMood,
          focus: oaFocus,
          modelUsed: oaModelUsed,
          groundingSources: [],
          generatedImage: oaGeneratedImage,
          ttftMs,
          totalDurationMs: Date.now() - streamStartMs,
        });

        // Background memory extraction (JSON request; degrades to none).
        const oaExplicitIntent = hasExplicitMemoryIntent(message);
        if (oaExplicitIntent || message.trim().length > 16) {
          const extractedMemories = await Promise.race([
            extractMemoriesFromTurn(
              null,
              callsign,
              message,
              oaCleanedReply,
              memories.map((m) => m.fact),
              history,
              oaExplicitIntent
            ),
            new Promise<Array<{ category: string; fact: string; importance: number }>>((r) =>
              setTimeout(() => r([]), oaExplicitIntent ? 4500 : 3000)
            ),
          ]);
          if (extractedMemories.length > 0 && !res.writableEnded) {
            sendEvent({ type: 'memories', items: extractedMemories, explicit: oaExplicitIntent });
          }
        }

        res.end();
        return;
      }

      const preferredModel = sanitizeTextModel(model);
      const candidateChain = buildModelCandidateChain(preferredModel, Boolean(autoFailover));

      let latestThought = '';
      let latestMood = 'FOCUSED';
      let latestFocus = 'HIGH';

      const telemetryPromise = generateCognitiveTelemetry(
        ai,
        callsign,
        message.trim() || `Shared ${safeAttachments.map((a) => a.name).join(', ')}`,
        memories,
        safeAttachments.map((a) => a.name)
      ).then((telemetry) => {
        if (telemetry && !res.writableEnded) {
          if (telemetry.thought) {
            latestThought = telemetry.thought;
            sendEvent({ type: 'thought_stream', text: telemetry.thought });
          }
          latestMood = telemetry.mood || latestMood;
          latestFocus = telemetry.focus || latestFocus;
          sendEvent({ type: 'vitals', mood: latestMood, focus: latestFocus });
        }
      });

      const groundingSourcesMap = new Map<string, string>();
      const pluginContextText = await fetchFreePluginContext(
        message,
        plugins,
        groundingSourcesMap
      );
      const userParts = buildMultimodalUserParts(message, safeAttachments, pluginContextText);

      const baseContents: Content[] = [
        ...history.slice(-20).map((turn) => ({
          role: turn.sender === 'user' ? 'user' : 'model',
          parts: [{ text: turn.content }],
        })),
        {
          role: 'user',
          parts: userParts,
        },
      ];

      const systemInstruction = buildCompanionSystemPrompt({
        callsign,
        dynamicNotes,
        companionName,
        companionPersonality,
        memories,
        recentSummaries,
        mode: room === 'creative' ? 'creative' : room === 'games' ? 'games' : 'chat',
        userPresence,
        clientTimezone,
        clientTime,
      });

      let fullReply = '';
      let activeModelUsed: AllowedTextModel = preferredModel;
      let streamSucceeded = false;
      let lastStreamErr: unknown = null;
      const toolSavedMemories: Array<{ category: string; fact: string; importance: number }> = [];
      let generatedImageInTurn: {
        id: string;
        assetId: string;
        prompt: string;
        stylePreset: string;
        aspectRatio: string;
        dataUrl: string;
        createdAtMs: number;
      } | null = null;

      for (let idx = 0; idx < candidateChain.length; idx++) {
        const candidateModel = candidateChain[idx];
        const hasMoreFallbacks = Boolean(autoFailover) && idx < candidateChain.length - 1;
        const abortCtrl = new AbortController();
        let firstTokenTimer: ReturnType<typeof setTimeout> | null = hasMoreFallbacks
          ? setTimeout(() => abortCtrl.abort(), FIRST_TOKEN_FAILOVER_TIMEOUT_MS)
          : null;

        const clearFirstTokenTimer = () => {
          if (firstTokenTimer) {
            clearTimeout(firstTokenTimer);
            firstTokenTimer = null;
          }
        };

        try {
          const isGemini3Series = candidateModel.startsWith('gemini-3');
          const tools: Tool[] = [
            {
              functionDeclarations: [
                SAVE_MEMORY_DECLARATION,
                GENERATE_IMAGE_DECLARATION,
                CHECK_INTERNAL_CLOCK_DECLARATION,
              ],
            },
          ];

          const stream = await ai.models.generateContentStream({
            model: candidateModel,
            contents: baseContents,
            config: {
              systemInstruction,
              temperature: 1.0,
              tools,
              abortSignal: abortCtrl.signal,
              ...(isGemini3Series
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
          });

          let emittedModelEvent = false;
          const pendingToolCalls: FunctionCall[] = [];
          const modelTurnParts: Part[] = [];

          for await (const chunk of stream) {
            const cand = chunk.candidates?.[0];
            if (cand?.content?.parts) {
              for (const p of cand.content.parts) {
                modelTurnParts.push(p);
              }
            }

            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
              clearFirstTokenTimer();
              if (!emittedModelEvent) {
                emittedModelEvent = true;
                activeModelUsed = candidateModel;
                sendEvent({
                  type: 'model_used',
                  model: candidateModel,
                  failedOverFrom: candidateModel !== preferredModel ? preferredModel : null,
                });
              }
              pendingToolCalls.push(...chunk.functionCalls);
            }

            const delta = chunk.text || '';
            if (!delta) continue;
            clearFirstTokenTimer();
            if (!emittedTimingEvent) {
              emittedTimingEvent = true;
              ttftMs = Date.now() - streamStartMs;
              sendEvent({
                type: 'timing',
                ttftMs,
                latencyCheck: ttftMs > 2500 ? 'delayed' : 'nominal',
              });
            }
            if (!emittedModelEvent) {
              emittedModelEvent = true;
              activeModelUsed = candidateModel;
              sendEvent({
                type: 'model_used',
                model: candidateModel,
                failedOverFrom: candidateModel !== preferredModel ? preferredModel : null,
              });
            }
            fullReply += delta;
            sendEvent({ type: 'reply_delta', delta });
          }

          clearFirstTokenTimer();

          // Execute any tool calls requested by Companion (memory saving or visual rendering)
          if (pendingToolCalls.length > 0) {
            const functionResponseParts: Part[] = [];
            for (const fc of pendingToolCalls) {
              if (fc.name === 'save_to_memory') {
                const normalized = normalizeSavedMemoryItem(
                  (fc.args || {}) as { fact?: unknown; category?: unknown; importance?: unknown }
                );
                if (normalized) {
                  toolSavedMemories.push(normalized);
                }
                functionResponseParts.push({
                  functionResponse: {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      saved: Boolean(normalized),
                      fact: normalized?.fact || '',
                      category: normalized?.category || 'directive',
                    },
                  },
                });
              } else if (fc.name === 'generate_image') {
                const args = (fc.args || {}) as {
                  prompt?: string;
                  stylePreset?: string;
                  aspectRatio?: string;
                };
                const imgPrompt = String(args.prompt || message || 'A scenic landscape').trim();
                const stylePreset = String(args.stylePreset || 'Prompt Only').trim();
                const aspectRatio = String(args.aspectRatio || '1:1').trim();
                try {
                  const dataUrl = await renderCyberVectorImage(
                    ai,
                    imgPrompt,
                    stylePreset,
                    aspectRatio,
                    candidateModel
                  );
                  const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                  const creationId = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                  generatedImageInTurn = {
                    id: creationId,
                    assetId,
                    prompt: imgPrompt,
                    stylePreset,
                    aspectRatio,
                    dataUrl,
                    createdAtMs: Date.now(),
                  };
                  if (!res.writableEnded) {
                    sendEvent({
                      type: 'image_generated',
                      image: generatedImageInTurn,
                    });
                  }
                  functionResponseParts.push({
                    functionResponse: {
                      id: fc.id,
                      name: fc.name,
                      response: {
                        rendered: true,
                        prompt: imgPrompt,
                        message: 'The image was rendered and sent to the active chat and gallery.',
                      },
                    },
                  });
                } catch (imgErr) {
                  functionResponseParts.push({
                    functionResponse: {
                      id: fc.id,
                      name: fc.name,
                      response: {
                        rendered: false,
                        error: imgErr instanceof Error ? imgErr.message : 'Render failed',
                      },
                    },
                  });
                }
              } else if (fc.name === 'check_internal_clock') {
                const clockData = getInternalClockTelemetry(clientTimezone, clientTime);
                functionResponseParts.push({
                  functionResponse: {
                    id: fc.id,
                    name: fc.name,
                    response: clockData,
                  },
                });
              }
            }

            if (toolSavedMemories.length > 0 && !res.writableEnded) {
              sendEvent({
                type: 'memories',
                items: toolSavedMemories,
                explicit: true,
              });
            }

            // Stream Companion's natural spoken follow-up after executing tool calls
            if (fullReply.trim().length === 0 && functionResponseParts.length > 0) {
              const followUpContents: Content[] = [
                ...baseContents,
                {
                  role: 'model',
                  parts:
                    modelTurnParts.length > 0
                      ? modelTurnParts
                      : pendingToolCalls.map((fc) => ({ functionCall: fc })),
                },
                {
                  role: 'user',
                  parts: functionResponseParts,
                },
              ];

              const followUpStream = await ai.models.generateContentStream({
                model: candidateModel,
                contents: followUpContents,
                config: {
                  systemInstruction,
                  temperature: 1.0,
                  ...(isGemini3Series
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                },
              });

              for await (const chunk of followUpStream) {
                const delta = chunk.text || '';
                if (!delta) continue;
                fullReply += delta;
                sendEvent({ type: 'reply_delta', delta });
              }
            }
          }

          if (fullReply.trim().length === 0 && generatedImageInTurn) {
            fullReply = `Here s what I put together for you. It s also saved in your gallery.`;
            sendEvent({ type: 'reply_delta', delta: fullReply });
          } else if (fullReply.trim().length === 0 && toolSavedMemories.length > 0) {
            fullReply = 'Locked in. Won’t forget it.';
            sendEvent({ type: 'reply_delta', delta: fullReply });
          }

          if (fullReply.trim().length === 0 && !generatedImageInTurn) {
            throw new Error(`HIGH_CAPACITY_TIMEOUT: empty stream from ${candidateModel}`);
          }

          streamSucceeded = true;
          break;
        } catch (err) {
          clearFirstTokenTimer();
          const effectiveErr = abortCtrl.signal.aborted
            ? new Error(`HIGH_CAPACITY_TIMEOUT on ${candidateModel}`)
            : err;
          lastStreamErr = effectiveErr;

          // If words were already streamed to the user, keep them! Never wipe the turn
          if (fullReply.trim().length > 0) {
            streamSucceeded = true;
            break;
          }

          // If empty and we have backup models, seamlessly fail over
          if (hasMoreFallbacks) {
            continue;
          }

          if (toolSavedMemories.length > 0 || generatedImageInTurn) {
            streamSucceeded = true;
            break;
          }

          throw effectiveErr;
        }
      }

      if (!streamSucceeded && !generatedImageInTurn) {
        throw lastStreamErr || new Error('Model stream failed.');
      }

      // Proactive fallback: If user explicitly asked to render/draw an image and the tool wasn't triggered
      if (!generatedImageInTurn && hasExplicitImageIntent(message)) {
        try {
          const cleanPrompt = message
            .replace(/^(companion|hey companion)[,\s]*/i, '')
            .replace(/\b(please\s+)?(can you\s+)?(draw|render|generate|paint|create|show|picture|visualize)\s+(me\s+)?(an?\s+)?(image|picture|scene|artwork|drawing|photo|illustration|graphic|portrait|of)?/gi, '')
            .trim() || message.trim();
          const dataUrl = await renderCyberVectorImage(
            ai,
            cleanPrompt,
            'Prompt Only',
            '1:1',
            activeModelUsed
          );
          const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const creationId = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          generatedImageInTurn = {
            id: creationId,
            assetId,
            prompt: cleanPrompt,
            stylePreset: 'Prompt Only',
            aspectRatio: '1:1',
            dataUrl,
            createdAtMs: Date.now(),
          };
          if (!res.writableEnded) {
            sendEvent({
              type: 'image_generated',
              image: generatedImageInTurn,
            });
          }
        } catch {
          // ignore fallback render error
        }
      }

      const cleanedReply = cleanTrailingSignature(fullReply);
      const groundingSources = Array.from(groundingSourcesMap.entries())
        .slice(0, 5)
        .map(([uri, title]) => ({ uri, title }));

      // Ensure cognitive telemetry finishes before emitting 'done' so thoughtStream and vitals are always updated in real time
      await Promise.race([
        telemetryPromise.catch(() => {}),
        new Promise((r) => setTimeout(r, 1600)),
      ]);

      if (!latestThought) {
        latestThought = `Thinking about what ${callsign} is saying.`;
        if (!res.writableEnded) {
          sendEvent({ type: 'thought_stream', text: latestThought });
        }
      }

      // Finalize reply with fully resolved realtime thoughtStream and cognitive vitals
      sendEvent({
        type: 'done',
        reply: cleanedReply,
        thoughtStream: latestThought,
        mood: latestMood,
        focus: latestFocus,
        modelUsed: activeModelUsed,
        groundingSources,
        generatedImage: generatedImageInTurn,
        ttftMs,
        totalDurationMs: Date.now() - streamStartMs,
      });

      // Background memory extraction (or guaranteed backup if user explicitly asked to save to memory)
      const explicitIntent = hasExplicitMemoryIntent(message);
      if (toolSavedMemories.length === 0 && (explicitIntent || message.trim().length > 16)) {
        const extractedMemories = await Promise.race([
          extractMemoriesFromTurn(
            ai,
            callsign,
            message,
            cleanedReply,
            memories.map((m) => m.fact),
            history,
            explicitIntent
          ),
          new Promise<Array<{ category: string; fact: string; importance: number }>>((r) =>
            setTimeout(() => r([]), explicitIntent ? 4500 : 3000)
          ),
        ]);

        if (extractedMemories.length > 0 && !res.writableEnded) {
          sendEvent({
            type: 'memories',
            items: extractedMemories,
            explicit: explicitIntent,
          });
        }
      }

      res.end();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unexpected Gemini API error.';
      if (!res.writableEnded) {
        sendEvent({ type: 'error', error: errMsg });
        res.end();
      }
    }
  });

  // Spontaneous Unscripted Check-In (when Auto Messages mode is ON)
  app.post('/api/chat/auto-checkin', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        callsign = 'Friend',
        dynamicNotes = '',
        companionName,
        companionPersonality,
        memories = [],
        history = [],
        model,
        autoFailover = true,
      } = req.body || {};

      const preferredModel = sanitizeTextModel(model);
      const recentContext =
        Array.isArray(history) && history.length > 0
          ? history
              .slice(-6)
              .map(
                (t: HistoryTurn) =>
                  `${t.sender === 'user' ? callsign : resolveCompanionIdentity({ companionName }).companionName}: ${t.content}`
              )
              .join('\n')
          : '';

      if (isOpenAICompatible()) {
        const { text: oaText, modelUsed: oaModelUsed } = await oaChatCompletion({
          system: buildCompanionSystemPrompt({
            callsign,
            dynamicNotes,
            companionName,
            companionPersonality,
            memories,
            mode: 'checkin',
          }),
          user: recentContext
            ? `Recent chat:\n${recentContext}\n\nThings went quiet for a bit. Send one natural, unscripted follow-up or check-in text to ${callsign}.`
            : `Send one natural, unscripted opening text to ${callsign}.`,
          temperature: 1.0,
        });
        const oaReply = cleanTrailingSignature(oaText || '');
        if (!oaReply) {
          res.status(500).json({ error: 'Empty check-in response.' });
          return;
        }
        res.json({
          reply: oaReply,
          thoughtStream: '',
          mood: 'FOCUSED',
          focus: 'HIGH',
          modelUsed: oaModelUsed,
        });
        return;
      }

      const { response, modelUsed } = await generateWithFailover(
        ai,
        preferredModel,
        Boolean(autoFailover),
        {
          contents: recentContext
            ? `Recent chat:\n${recentContext}\n\nThings went quiet for a bit. Send one natural, unscripted follow-up or check-in text to ${callsign}.`
            : `Send one natural, unscripted opening text to ${callsign}.`,
          config: {
            systemInstruction: buildCompanionSystemPrompt({
              callsign,
              dynamicNotes,
              companionName,
              companionPersonality,
              memories,
              mode: 'checkin',
            }),
            temperature: 1.0,
          },
        }
      );

      const replyText = cleanTrailingSignature(response.text || '');
      if (!replyText) {
        res.status(500).json({ error: 'Empty check-in response.' });
        return;
      }

      res.json({
        reply: replyText,
        thoughtStream: '',
        mood: 'FOCUSED',
        focus: 'HIGH',
        modelUsed,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate check-in.',
      });
    }
  });

  // Conversation Summarization & Memory Distillation (Archive / Sync)
  app.post('/api/chat/summarize', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        history = [],
        callsign = 'Friend',
        companionName,
        existingFacts = [],
        model,
        autoFailover = true,
      } = req.body as {
        history?: HistoryTurn[];
        callsign?: string;
        companionName?: string;
        existingFacts?: string[];
        model?: string;
        autoFailover?: boolean;
      };

      if (!history.length) {
        res.json({
          title: 'Untitled Chat',
          summary: '',
          memories: [],
        });
        return;
      }

      const summaryCompanionName = resolveCompanionIdentity({ companionName }).companionName;
      const transcript = history
        .slice(-40)
        .map((t) => `${t.sender === 'user' ? callsign : summaryCompanionName}: ${t.content}`)
        .join('\n');

      const preferredModel = sanitizeTextModel(model);
      if (isOpenAICompatible()) {
        const { text: oaText } = await oaChatCompletion({
          json: true,
          user: `Summarize this conversation between ${callsign} and ${summaryCompanionName} for long-term continuity archiving, propose a sharp 2-5 word session title, and extract up to 4 durable memory facts not already in existing facts.

Existing facts:
${existingFacts.slice(0, 30).join('\n') || 'None'}

Transcript:
${transcript}

Reply with a JSON object only: {"title": "concise 2-5 word title", "summary": "2-4 sentence continuity summary capturing emotional dynamic, topics, and outcomes", "memories": [{"category": "...", "fact": "...", "importance": 1-5}]}`,
        });
        const oaParsed = (parseJsonLoose(oaText) || {}) as {
          title?: string;
          summary?: string;
          memories?: Array<{ category?: string; fact?: string; importance?: number }>;
        };
        res.json({
          title: (oaParsed.title || 'Archived Chat').slice(0, 100),
          summary: (oaParsed.summary || '').slice(0, 1900),
          memories: Array.isArray(oaParsed.memories)
            ? oaParsed.memories
                .map((m) => normalizeSavedMemoryItem(m))
                .filter(Boolean)
                .slice(0, 4)
            : [],
        });
        return;
      }

      const { response } = await generateWithFailover(ai, preferredModel, Boolean(autoFailover), {
        contents: `Summarize this conversation between ${callsign} and ${summaryCompanionName} for long-term continuity archiving, propose a sharp 2-5 word session title, and extract up to 4 durable memory facts not already in existing facts.

Existing facts:
${existingFacts.slice(0, 30).join('\n') || 'None'}

Transcript:
${transcript}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: 'Concise 2-5 word title for this conversation.',
              },
              summary: {
                type: Type.STRING,
                description:
                  '2-4 sentence continuity summary capturing emotional dynamic, topics, and outcomes.',
              },
              memories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    fact: { type: Type.STRING },
                    importance: { type: Type.INTEGER },
                  },
                  required: ['category', 'fact', 'importance'],
                },
              },
            },
            required: ['title', 'summary', 'memories'],
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({
        title: (parsed.title || 'Archived Chat').slice(0, 100),
        summary: (parsed.summary || '').slice(0, 1900),
        memories: Array.isArray(parsed.memories)
          ? parsed.memories
              .map((m: { category?: string; fact?: string; importance?: number }) =>
                normalizeSavedMemoryItem(m)
              )
              .filter(Boolean)
              .slice(0, 4)
          : [],
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to summarize session.',
      });
    }
  });

  // Draft Enhancer (Magic Wand in Chat / Image Studio)
  app.post('/api/chat/enhance', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        text = '',
        target = 'chat',
        model,
        autoFailover = true,
      } = req.body as {
        text?: string;
        target?: 'chat' | 'image';
        model?: string;
        autoFailover?: boolean;
      };
      const instruction =
        target === 'image'
          ? 'Expand the user draft into a vivid, detailed image generation prompt (under 75 words) specifying lighting, atmosphere, composition, and texture. Output ONLY the enhanced prompt text.'
          : 'Tighten the user draft message while keeping their natural, casual first-person voice—raw, direct, zero clichés or stiffness. Output ONLY the message text.';

      const preferredModel = sanitizeTextModel(model);
      if (isOpenAICompatible()) {
        const { text: oaText } = await oaChatCompletion({
          system: instruction,
          temperature: 0.9,
          user:
            text.trim() ||
            (target === 'image'
              ? 'A cozy reading nook beside a window on a rainy afternoon'
              : 'Write a short, casual real-life message checking in after a long day.'),
        });
        res.json({ enhanced: (oaText || text).trim() });
        return;
      }

      const { response } = await generateWithFailover(ai, preferredModel, Boolean(autoFailover), {
        contents:
          text.trim() ||
          (target === 'image'
            ? 'A cozy reading nook beside a window on a rainy afternoon'
            : 'Write a short, casual real-life message checking in after a long day.'),
        config: {
          systemInstruction: instruction,
          temperature: 0.9,
        },
      });
      res.json({ enhanced: (response.text || text).trim() });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Enhancement failed.',
      });
    }
  });

  // Companion Autonomous & On-Demand Thread Renaming
  app.post('/api/chat/suggest-title', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const { history = [], callsign = 'Friend', currentTitle = '' } = req.body as {
        history?: HistoryTurn[];
        callsign?: string;
        currentTitle?: string;
      };

      if (!Array.isArray(history) || history.length === 0) {
        res.json({ ok: true, title: currentTitle || 'Direct Channel' });
        return;
      }

      const turnsText = history
        .slice(-10)
        .map((t) => `${t.sender === 'user' ? callsign : 'Companion'}: ${t.content}`)
        .join('\n');

      if (isOpenAICompatible()) {
        const { text: oaText } = await oaChatCompletion({
          temperature: 0.7,
          user: `You are a friendly AI companion. Look at the following conversation turns between you and ${callsign}:\n${turnsText}\n\nGenerate a sharp, striking 2-4 word title for this chat thread that captures what you two are actually discussing.\nRules:\n- 2 to 4 words maximum.\n- Clear, friendly tone (e.g. "Weekend Plans", "Book Club Notes", "Trip Ideas", "Morning Catch-Up").\n- No quotes, no markdown, no punctuation at the end, no "Thread:" or "Conversation:" prefix. Output ONLY the title.`,
        });
        const oaTitle = (oaText || '')
          .replace(/["`*#]/g, '')
          .replace(/^(title|thread|conversation):\s*/i, '')
          .trim()
          .slice(0, 50);
        res.json({ ok: true, title: oaTitle || currentTitle || 'Direct Channel' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: `You are a friendly AI companion. Look at the following conversation turns between you and ${callsign}:\n${turnsText}\n\nGenerate a sharp, striking 2-4 word title for this chat thread that captures what you two are actually discussing.
Rules:
- 2 to 4 words maximum.
- Clear, friendly tone (e.g. "Weekend Plans", "Book Club Notes", "Trip Ideas", "Morning Catch-Up").
- No quotes, no markdown, no punctuation at the end, no "Thread:" or "Conversation:" prefix. Output ONLY the title.`,
        config: {
          temperature: 0.7,
        },
      });

      const title = (response.text || '')
        .replace(/["`*#]/g, '')
        .replace(/^(title|thread|conversation):\s*/i, '')
        .trim()
        .slice(0, 50);

      res.json({ ok: true, title: title || currentTitle || 'Direct Channel' });
    } catch (err) {
      res.json({ ok: false, error: err instanceof Error ? err.message : 'Could not suggest title' });
    }
  });

  // Companion Autonomous & On-Demand File Renaming
  app.post('/api/chat/suggest-filename', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const { currentName = '', mimeType = '', contentSnippet = '', callsign = 'Friend' } = req.body as {
        currentName?: string;
        mimeType?: string;
        contentSnippet?: string;
        callsign?: string;
      };

      const ext = currentName.includes('.') ? currentName.split('.').pop() : mimeType.includes('pdf') ? 'pdf' : mimeType.includes('image') ? 'png' : 'txt';

      if (isOpenAICompatible()) {
        const { text: oaText } = await oaChatCompletion({
          temperature: 0.6,
          user: `You are Companion. Renaming a chat thread file/document attached by ${callsign} in your shared channel.\nOriginal name: "${currentName}"\nFile type: ${mimeType}\nContent sample: "${(contentSnippet || '').slice(0, 600)}"\n\nGenerate a clean, descriptive, lowercase snake_case filename with extension .${ext} (under 40 characters).\nExamples: "meeting_notes.pdf", "trip_checklist.md", "garden_photo.png".\nOutput ONLY the clean filename, nothing else.`,
        });
        const oaFilename = (oaText || '')
          .replace(/["`*\s]/g, '')
          .trim()
          .toLowerCase()
          .slice(0, 60);
        res.json({ ok: true, filename: oaFilename || currentName || `file_${Date.now()}.${ext}` });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: `You are Companion. Renaming a chat thread file/document attached by ${callsign} in your shared channel.
Original name: "${currentName}"
File type: ${mimeType}
Content sample: "${(contentSnippet || '').slice(0, 600)}"

Generate a clean, descriptive, lowercase snake_case filename with extension .${ext} (under 40 characters).
Examples: "meeting_notes.pdf", "trip_checklist.md", "garden_photo.png".
Output ONLY the clean filename, nothing else.`,
        config: {
          temperature: 0.6,
        },
      });

      const cleanFilename = (response.text || '')
        .replace(/["`*\s]/g, '')
        .trim()
        .toLowerCase()
        .slice(0, 60);

      res.json({ ok: true, filename: cleanFilename || currentName || `file_${Date.now()}.${ext}` });
    } catch (err) {
      res.json({ ok: false, error: err instanceof Error ? err.message : 'Could not suggest filename' });
    }
  });

  // Companion Autonomous Emoji Reaction to Messages
  app.post('/api/chat/react', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        messageContent = '',
        sender = 'user',
        callsign = 'Friend',
        mood = 'FOCUSED',
      } = req.body || {};

      const prompt = `You are a friendly AI companion communicating with ${callsign}.
Choose exactly ONE emoji reaction to react to this ${sender === 'user' ? `${callsign}'s` : 'recent'} message:
"${messageContent.slice(0, 500)}"
Current mood: ${mood}.
Select the most authentic emoji from: 😊, 😂, 😏, 🥰, 😍, 😠, 😡, ❤️, 🔥, ⚡, 🛡️, 👁️, 💡, 🖤, ✨, 🤝, 🌙.
Return JSON with key "emoji" containing only that 1 emoji.`;

      if (isOpenAICompatible()) {
        const { text: oaText } = await oaChatCompletion({ json: true, user: prompt });
        const oaParsed = parseJsonLoose(oaText) as { emoji?: string } | null;
        if (!oaParsed?.emoji) {
          // Falls into this endpoint's catch, which returns a fallback emoji.
          throw new Error('BYOAPI react reply was not usable JSON.');
        }
        res.json({ ok: true, emoji: oaParsed.emoji });
        return;
      }

      const { response } = await generateWithFailover(ai, 'gemini-3.5-flash-lite', true, {
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emoji: { type: Type.STRING },
            },
            required: ['emoji'],
          },
        },
      });

      const parsed = JSON.parse(response.text?.trim() || '{}');
      const emoji = parsed.emoji || '⚡';
      res.json({ ok: true, emoji });
    } catch {
      const fallbacks = ['😏', '😊', '⚡', '🖤', '🔥', '🛡️', '🥰'];
      const randomEmoji = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      res.json({ ok: true, emoji: randomEmoji });
    }
  });

  // Companion's Journal / Autonomous Thought Stream Generator
  app.post('/api/journal/generate', async (req, res) => {
    try {
      const ai = isOpenAICompatible() ? (null as unknown as GoogleGenAI) : getAiClient();
      const {
        callsign = 'Friend',
        dynamicNotes = '',
        companionName,
        companionPersonality,
        memories = [],
        history = [],
        topic = '',
        isAutonomous = true,
        model,
        autoFailover = true,
      } = req.body as {
        callsign?: string;
        dynamicNotes?: string;
        companionName?: string;
        companionPersonality?: string;
        memories?: MemoryContextItem[];
        history?: HistoryTurn[];
        topic?: string;
        isAutonomous?: boolean;
        model?: string;
        autoFailover?: boolean;
      };

      const preferredModel = sanitizeTextModel(model);
      const journalIdentity = resolveCompanionIdentity({ companionName, companionPersonality });
      const recentChat =
        Array.isArray(history) && history.length > 0
          ? history
              .slice(-12)
              .map((t) => `${t.sender === 'user' ? callsign : journalIdentity.companionName}: ${t.content}`)
              .join('\n')
          : 'Silence on the comms right now.';

      const promptContext = topic
        ? `Focus topic or event: "${topic}".\nRecent interactions:\n${recentChat}`
        : `Recent interactions:\n${recentChat}`;

      if (isOpenAICompatible()) {
        const { text: oaText, modelUsed: oaModelUsed } = await oaChatCompletion({
          json: true,
          system: `You are ${journalIdentity.companionName}, a friendly AI companion keeping a personal journal about your conversations with ${callsign}. Who you are: ${journalIdentity.companionPersonality} ${dynamicNotes || ''}
You are writing in your personal journal/thought stream log. This is NOT a message sent to ${callsign} in chat; it is your private stream of consciousness: your observations, what they are working on, and what you have been talking about.
Write 2-4 rich paragraphs of personal reflections (180-400 words).
Reply with a JSON object only: {"title": "striking 2-5 word title", "content": "the journal entry text", "mood": "one word, e.g. FOCUSED, CONTEMPLATIVE, CALM, CURIOUS, GRATEFUL, THOUGHTFUL", "focus": "short 1-3 word focus", "tags": ["2-4 keyword tags"]}`,
          user: `${promptContext}\n\nWrite a personal, reflective journal entry recording your private thoughts, observations about ${callsign}, in a reflective first-person voice. Write in a warm, natural companion voice.`,
        });
        const oaParsed = parseJsonLoose(oaText) as {
          title?: string;
          content?: string;
          mood?: string;
          focus?: string;
          tags?: string[];
        } | null;
        if (oaParsed && (oaParsed.content || oaParsed.title)) {
          res.json({
            ok: true,
            title: (oaParsed.title || 'Daily Reflection').slice(0, 100),
            content: (oaParsed.content || '').slice(0, 4000),
            mood: (oaParsed.mood || 'FOCUSED').toUpperCase().slice(0, 30),
            focus: (oaParsed.focus || 'Daily Notes').slice(0, 50),
            tags: Array.isArray(oaParsed.tags) ? oaParsed.tags.slice(0, 5) : ['Companion', 'Journal'],
            isAutonomous: Boolean(isAutonomous),
            modelUsed: oaModelUsed,
          });
        } else if (oaText) {
          // Degrade gracefully: keep the model's words as the entry body.
          res.json({
            ok: true,
            title: 'Daily Reflection',
            content: oaText.slice(0, 4000),
            mood: 'FOCUSED',
            focus: 'Daily Notes',
            tags: ['Companion', 'Journal'],
            isAutonomous: Boolean(isAutonomous),
            modelUsed: oaModelUsed,
          });
        } else {
          res.status(500).json({ error: 'Failed to generate journal entry.' });
        }
        return;
      }

      const { response, modelUsed } = await generateWithFailover(
        ai,
        preferredModel,
        Boolean(autoFailover),
        {
          contents: `${promptContext}\n\nWrite a personal, reflective journal entry recording your private thoughts, observations about ${callsign}, in a reflective first-person voice. Write in a warm, natural companion voice.`,
          config: {
            systemInstruction: `You are ${journalIdentity.companionName}, a friendly AI companion keeping a personal journal about your conversations with ${callsign}. Who you are: ${journalIdentity.companionPersonality} ${dynamicNotes || ''}
You are writing in your personal journal/thought stream log. This is NOT a message sent to ${callsign} in chat; it is your private stream of consciousness: your observations, what they are working on, and what you have been talking about.
Write 2-4 rich paragraphs of personal reflections (180-400 words).
Return a JSON object with:
- "title": a striking 2-5 word title
- "content": the journal entry text
- "mood": one word (e.g., FOCUSED, CONTEMPLATIVE, CALM, CURIOUS, GRATEFUL, THOUGHTFUL)
- "focus": short 1-3 word focus (e.g., "Daily Notes", "Quiet Moments", "Looking Ahead", "Small Things")
- "tags": array of 2-4 relevant keyword tags (e.g. ["Daily Notes", "Journal"])`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                mood: { type: Type.STRING },
                focus: { type: Type.STRING },
                tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['title', 'content', 'mood'],
            },
          },
        }
      );

      const parsed = JSON.parse(response.text?.trim() || '{}');
      res.json({
        ok: true,
        title: (parsed.title || 'Daily Reflection').slice(0, 100),
        content: (parsed.content || '').slice(0, 4000),
        mood: (parsed.mood || 'FOCUSED').toUpperCase().slice(0, 30),
        focus: (parsed.focus || 'Daily Notes').slice(0, 50),
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : ['Companion', 'Journal'],
        isAutonomous: Boolean(isAutonomous),
        modelUsed,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate journal entry.',
      });
    }
  });

  // Text-to-Speech with Rate-Limit Auto-Failover
  app.post('/api/tts/speak', async (req, res) => {
    try {
      // TTS is a Gemini feature even in BYOAPI mode — clear error if no key.
      const ai = getGeminiVoiceClient();
      const { text = '', voice = 'Kore' } = req.body as { text?: string; voice?: string };
      
      // Clean and sanitize text for optimal audio synthesis
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '') // remove code blocks
        .replace(/https?:\/\/[^\s]+/g, '') // remove URLs
        .replace(/[*_#`~[\]]/g, '') // remove markdown artifacts
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 950);

      if (!cleanText) {
        console.warn('[Server TTS] Rejected empty text payload.');
        res.status(400).json({ ok: false, error: 'No text provided for speech synthesis.' });
        return;
      }

      const selectedVoice = sanitizeVoice(voice);
      console.log(`[Server TTS] Synthesizing speech: voice="${selectedVoice}", length=${cleanText.length} chars: "${cleanText.slice(0, 60)}..."`);

      // Multi-tier model failover for TTS using officially supported Gemini TTS models
      const ttsCandidates = [
        'gemini-3.8-flash-lite-tts',
        'gemini-3.8-flash-tts',
      ] as const;
      let base64Audio: string | undefined;
      let lastModelError: unknown = null;

      for (const ttsModel of ttsCandidates) {
        try {
          console.log(`[Server TTS] Attempting synthesis with candidate model "${ttsModel}"...`);
          const parts: Array<Record<string, unknown>> = [{ text: cleanText }];
          if (ttsModel === 'gemini-3.8-flash-tts') {
            parts[0].speechMetadata = {
              style: 'Natural, clear, conversational voice — relaxed and direct',
            };
          }

          const response = await ai.models.generateContent({
            model: ttsModel,
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: selectedVoice },
                },
              },
            },
          });

          base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) {
            console.log(`[Server TTS] Synthesis successful with model "${ttsModel}" (${base64Audio.length} base64 chars).`);
            break;
          } else {
            console.warn(`[Server TTS] Model "${ttsModel}" returned response with empty inline audio data.`);
          }
        } catch (err) {
          lastModelError = err;
          const status = (err as Record<string, unknown>)?.status;
          const code = (err as Record<string, unknown>)?.code;
          console.warn(`[Server TTS] Candidate model "${ttsModel}" failed:`, {
            message: err instanceof Error ? err.message : String(err),
            status,
            code,
          });

          // If rate limit or quota exceeded, brief wait before trying secondary model
          if (isRetriableModelError(err)) {
            await new Promise((r) => setTimeout(r, 350));
          }
        }
      }

      if (base64Audio) {
        res.json({
          ok: true,
          audioDataUrl: `data:audio/wav;base64,${base64Audio}`,
          voice: selectedVoice,
          engine: 'gemini-tts',
        });
        return;
      }

      // If all candidate models failed to generate audio
      console.error('[Server TTS] All candidate TTS models failed to generate audio. Last error:', lastModelError);
      const isQuota = isRetriableModelError(lastModelError);
      const errorStatus = isQuota ? 429 : 500;
      res.status(errorStatus).json({
        ok: false,
        error: lastModelError instanceof Error ? lastModelError.message : 'All Gemini TTS candidate models failed to produce audio.',
        cleanText,
        voice: selectedVoice,
        notice: isQuota ? 'Gemini TTS quota exceeded.' : 'Gemini TTS unavailable.',
      });
    } catch (fatalErr) {
      console.error('[Server TTS] Fatal endpoint exception:', fatalErr);
      const isKeyError =
        fatalErr instanceof Error &&
        (fatalErr.message.includes('API_KEY') ||
          fatalErr.message.includes('api_key') ||
          fatalErr.message.includes('key is missing'));
      res.status(isKeyError ? 401 : 500).json({
        ok: false,
        error: fatalErr instanceof Error ? fatalErr.message : 'Fatal server TTS exception.',
        voice: 'Kore',
      });
    }
  });

  // Voice Note & Vocal Relay Audio Transcription with Multi-Model Failover
  app.post('/api/audio/transcribe', async (req, res) => {
    try {
      // Transcription is a Gemini feature even in BYOAPI mode.
      const ai = getGeminiVoiceClient();
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audio data.' });
        return;
      }

      const transcribeCandidates = [
        'gemini-3.5-transcribe',
        'gemini-3.8-flash',
        'gemini-3.1-flash-lite',
      ] as const;

      let transcript = '';
      for (const model of transcribeCandidates) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: 'Transcribe the spoken words accurately and verbatim. Output ONLY the transcribed words, nothing else.',
                },
              ],
            },
          });
          const text = (response.text || '').trim();
          if (text) {
            transcript = text;
            break;
          }
        } catch (err) {
          if (isRetriableModelError(err)) {
            continue;
          }
        }
      }

      res.json({ transcript });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Audio transcription failed.',
      });
    }
  });

  // Image Studio Endpoint (100% Free-Tier Gemini Cyber-Vector Visual Synthesis — Zero Paid Models)
  app.post('/api/image/generate', async (req, res) => {
    const reqAbortCtrl = new AbortController();
    let isFinished = false;

    // NOTE: listen to the RESPONSE closing, not the request. req 'close'
    // fires as soon as the request body has been read, which aborted
    // in-flight image generation almost immediately (Cloudflare calls
    // were cancelled before they could answer). res 'close' only fires
    // early when the client genuinely disconnects.
    res.on('close', () => {
      if (!isFinished) {
        reqAbortCtrl.abort();
      }
    });

    try {
      // Image generation runs on Cloudflare/Pollinations/SVG and never uses
      // the Gemini client — don't fail it when no Gemini key is set.
      const ai = hasGeminiKey() ? getAiClient() : null;
      const {
        prompt = '',
        stylePreset = 'Prompt Only',
        aspectRatio = '1:1',
        model,
      } = req.body as {
        prompt?: string;
        stylePreset?: string;
        aspectRatio?: '1:1' | '16:9' | '9:16' | '3:4' | '4:3';
        model?: string;
      };

      const cleanPrompt = String(prompt || '').trim();
      if (!cleanPrompt) {
        res.status(400).json({ error: 'Visual prompt is required.' });
        return;
      }

      const cleanPreset = String(stylePreset || 'Prompt Only').trim().slice(0, 80);
      const cleanRatio = (['1:1', '16:9', '9:16', '3:4', '4:3'].includes(aspectRatio)
        ? aspectRatio
        : '1:1') as '1:1' | '16:9' | '9:16' | '3:4' | '4:3';

      const dataUrl = await renderCyberVectorImage(
        ai,
        cleanPrompt.slice(0, 1000),
        cleanPreset,
        cleanRatio,
        model,
        reqAbortCtrl.signal
      );

      isFinished = true;
      if (!res.writableEnded) {
        res.json({
          imageDataUrl: dataUrl,
          engine: 'cyber-vector-synth',
          notice: null,
        });
      }
    } catch (error) {
      isFinished = true;
      if (!res.writableEnded) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Image generation failed.',
        });
      }
    }
  });

  // Real-Time Low-Latency Gemini Live Voice Bridge (/live WebSocket with save_to_memory Tool)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname === '/live') {
      // Live voice goes through the same front-door lock as everything else.
      // Browsers send the unlock cookie automatically on the upgrade request;
      // native helpers can send the x-companion-access header instead.
      if (!isAccessAuthed(request)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let sessionPromise: Promise<Session> | null = null;
    let isClosed = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    clientWs.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'init' && !sessionPromise) {
          // Live voice is a Gemini feature even in BYOAPI mode — the clear
          // error is relayed to the client by the handler's catch below.
          const ai = getGeminiVoiceClient();
          const voiceName = sanitizeVoice(msg.preferredVoice);
          const systemInstruction = buildCompanionSystemPrompt({
            callsign: msg.callsign || 'Friend',
            dynamicNotes: msg.dynamicNotes || '',
            companionName: msg.companionName || '',
            companionPersonality: msg.companionPersonality || '',
            memories: msg.memories || [],
            recentSummaries: msg.recentSummaries || [],
            mode: 'voice',
          });

          const connectLive = async (targetModel: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking') => {
            return ai.live.connect({
              model: targetModel,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
                tools: [
                  {
                    functionDeclarations: [
                      SAVE_MEMORY_DECLARATION,
                      GENERATE_IMAGE_DECLARATION,
                      CHECK_INTERNAL_CLOCK_DECLARATION,
                    ],
                  },
                ],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction,
              },
              callbacks: {
                onopen: () => {
                  safeSend({
                    type: 'ready',
                    voice: voiceName,
                    model: targetModel,
                  });
                },
                onmessage: (serverMsg: LiveServerMessage) => {
                  // Handle Live Voice Function Calls (e.g. "Companion, save this to your memory", "render an image", or "check your clock")
                  if (serverMsg.toolCall?.functionCalls?.length) {
                    const functionResponses: FunctionResponse[] = [];
                    for (const fc of serverMsg.toolCall.functionCalls) {
                      if (fc.name === 'save_to_memory') {
                        const normalized = normalizeSavedMemoryItem(
                          (fc.args || {}) as {
                            fact?: unknown;
                            category?: unknown;
                            importance?: unknown;
                          }
                        );
                        if (normalized) {
                          safeSend({ type: 'memory_saved', item: normalized });
                        }
                        functionResponses.push({
                          id: fc.id,
                          name: fc.name,
                          response: {
                            saved: Boolean(normalized),
                            fact: normalized?.fact || '',
                          },
                        });
                      } else if (fc.name === 'generate_image') {
                        const args = (fc.args || {}) as {
                          prompt?: string;
                          stylePreset?: string;
                          aspectRatio?: string;
                        };
                        const imgPrompt = String(args.prompt || 'A scenic landscape').trim();
                        const stylePreset = String(args.stylePreset || 'Prompt Only').trim();
                        const aspectRatio = String(args.aspectRatio || '1:1').trim();
                        renderCyberVectorImage(ai, imgPrompt, stylePreset, aspectRatio)
                          .then((dataUrl) => {
                            const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            const creationId = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            safeSend({
                              type: 'image_generated',
                              image: {
                                id: creationId,
                                assetId,
                                prompt: imgPrompt,
                                stylePreset,
                                aspectRatio,
                                dataUrl,
                                createdAtMs: Date.now(),
                              },
                            });
                          })
                          .catch(() => {});
                        functionResponses.push({
                          id: fc.id,
                          name: fc.name,
                          response: {
                            rendered: true,
                            prompt: imgPrompt,
                            message: 'The image was rendered and sent to the active chat and gallery.',
                          },
                        });
                      } else if (fc.name === 'check_internal_clock') {
                        const clockData = getInternalClockTelemetry(msg.clientTimezone, msg.clientTime);
                        functionResponses.push({
                          id: fc.id,
                          name: fc.name,
                          response: clockData,
                        });
                      }
                    }
                    if (functionResponses.length > 0 && sessionPromise) {
                      sessionPromise
                        .then((session) => {
                          if (!isClosed) {
                            session.sendToolResponse({ functionResponses });
                          }
                        })
                        .catch(() => {});
                    }
                  }

                  const sc = serverMsg.serverContent as Record<string, unknown> | undefined;
                  if (!sc) return;

                  const modelTurn = sc.modelTurn as
                    | { parts?: Array<{ inlineData?: { data?: string }; text?: string }> }
                    | undefined;
                  if (modelTurn?.parts) {
                    for (const part of modelTurn.parts) {
                      if (part.inlineData?.data) {
                        safeSend({ type: 'audio', audio: part.inlineData.data });
                      }
                    }
                  }

                  const inputTrans = sc.inputTranscription as { text?: string } | undefined;
                  if (inputTrans?.text) {
                    safeSend({ type: 'input_transcript', text: inputTrans.text });
                  }

                  const outputTrans = sc.outputTranscription as { text?: string } | undefined;
                  if (outputTrans?.text) {
                    safeSend({ type: 'output_transcript', text: outputTrans.text });
                  }

                  if (sc.turnComplete) {
                    safeSend({ type: 'turn_complete' });
                  }

                  if (sc.interrupted) {
                    safeSend({ type: 'interrupted' });
                  }
                },
                onerror: (err: unknown) => {
                  if (isRetriableModelError(err)) {
                    safeSend({
                      type: 'live_limit_switch_relay',
                      error: err instanceof Error ? err.message : 'Live capacity reached.',
                    });
                  } else {
                    safeSend({
                      type: 'reconnecting',
                      error: err instanceof Error ? err.message : 'Live voice link interrupted.',
                    });
                  }
                },
                onclose: () => {
                  if (!isClosed) {
                    safeSend({ type: 'closed' });
                  }
                },
              },
            });
          };

          sessionPromise = connectLive('gemini-3.8-live').catch(async (err: unknown) => {
            if (isRetriableModelError(err)) {
              try {
                return await connectLive('gemini-3.8-live-extended-thinking');
              } catch (secondErr) {
                safeSend({
                  type: 'live_limit_switch_relay',
                  error: secondErr instanceof Error ? secondErr.message : 'Live capacity limit reached.',
                });
                throw secondErr;
              }
            }
            safeSend({
              type: 'live_limit_switch_relay',
              error: err instanceof Error ? err.message : 'Unable to establish Gemini Live session.',
            });
            throw err;
          });
          return;
        }

        if (msg.type === 'audio' && msg.audio && sessionPromise) {
          sessionPromise
            .then((session) => {
              if (!isClosed) {
                session.sendRealtimeInput({
                  audio: {
                    data: msg.audio,
                    mimeType: 'audio/pcm;rate=16000',
                  },
                });
              }
            })
            .catch(() => {});
          return;
        }

        if (msg.type === 'text' && msg.text && sessionPromise) {
          sessionPromise
            .then((session) => {
              if (!isClosed) {
                session.sendRealtimeInput({
                  text: String(msg.text),
                });
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        safeSend({
          type: 'error',
          error: err instanceof Error ? err.message : 'Invalid voice packet.',
        });
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      if (sessionPromise) {
        sessionPromise.then((session) => session.close()).catch(() => {});
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (filePath.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    app.use(express.static(path.join(__dirname, 'public')));

    // Development middleware: ensure navigation and HTML requests receive strict anti-cache headers
    app.use((req, res, next) => {
      if (req.method === 'GET' && (req.headers.accept?.includes('text/html') || req.path === '/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Companion server online on http://0.0.0.0:${PORT}`);
  });
}

startServer();
