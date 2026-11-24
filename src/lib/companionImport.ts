/**
 * Easy companion import — parsing only, no UI and no saving.
 *
 * Accepts the two shapes people actually arrive with:
 *  1. A structured JSON profile (The Shell's own shape, a Shell backup's
 *     `profile` object, or a nested { companion, user } export from another
 *     app) — recognizable fields map straight onto the profile.
 *  2. Free-form text (a persona description, a character card, a memory
 *     dump) — the text becomes the personality draft, and plausible memory
 *     lines (bullets, numbered lists, lines under a "Memories" heading) are
 *     split out as individual Memory Vault candidates.
 *
 * Everything here is best-effort and forgiving: unknown fields are ignored,
 * missing fields stay missing (the review screen leaves current values in
 * place for anything the import doesn't mention), and nothing is applied
 * until the owner confirms on the review screen.
 */

import { MemoryCategory, VoicePreset } from '../types';
import { sanitizeMemoryCategory, sanitizeVoicePreset } from './helpers';

export interface CompanionImportDraft {
  companionName?: string;
  companionPersonality?: string;
  companionGreeting?: string;
  companionAvatarUrl?: string;
  callsign?: string;
  dynamicNotes?: string;
  preferredVoice?: VoicePreset;
}

export interface ImportedMemoryCandidate {
  fact: string;
  category: MemoryCategory;
  importance: number;
  /** True when an identical fact already lives in the Memory Vault. */
  isDuplicate: boolean;
  /** Pre-ticked for import — duplicates start unticked. */
  selected: boolean;
}

export interface ParsedCompanionImport {
  kind: 'json' | 'text';
  draft: CompanionImportDraft;
  memories: ImportedMemoryCandidate[];
}

export type CompanionImportParseResult =
  | { ok: true; parsed: ParsedCompanionImport }
  | { ok: false; error: string };

/** Fully generic example shown on the import screen — safe to copy as-is. */
export const COMPANION_IMPORT_EXAMPLE = `{
  "companionName": "Your companion's name",
  "companionGreeting": "The first thing they say when you open chat",
  "companionPersonality": "Who they are, how they talk, what they care about — a few sentences is plenty.",
  "callsign": "What they call you",
  "dynamicNotes": "A line or two about you",
  "preferredVoice": "Kore",
  "memories": [
    "A fact worth remembering",
    "Another fact, one per line"
  ]
}`;

const MAX_IMPORT_CHARS = 200_000;
const MAX_MEMORY_CANDIDATES = 100;

function asRecord(val: unknown): Record<string, unknown> | null {
  return val && typeof val === 'object' && !Array.isArray(val)
    ? (val as Record<string, unknown>)
    : null;
}

function pickString(
  sources: Array<Record<string, unknown> | null>,
  keys: string[],
  maxLen: number
): string | undefined {
  for (const src of sources) {
    if (!src) continue;
    for (const key of keys) {
      const val = src[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim().slice(0, maxLen);
      }
    }
  }
  return undefined;
}

function normalizeFact(fact: string): string {
  return fact.toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
}

function buildCandidate(
  fact: string,
  category: unknown,
  importance: unknown,
  existingFacts: Set<string>,
  seenFacts: Set<string>
): ImportedMemoryCandidate | null {
  const clean = fact.trim().replace(/\s+/g, ' ').slice(0, 580);
  if (clean.length < 3) return null;
  const norm = normalizeFact(clean);
  if (seenFacts.has(norm)) return null;
  seenFacts.add(norm);
  const isDuplicate = existingFacts.has(norm);
  const rawImportance =
    typeof importance === 'number' && Number.isFinite(importance) ? importance : 4;
  return {
    fact: clean,
    category: sanitizeMemoryCategory(typeof category === 'string' ? category : ''),
    // The Memory Vault only persists importance >= 3 (see addMemoryNode),
    // so imported memories are clamped into the range the bank accepts.
    importance: Math.max(3, Math.min(5, Math.round(rawImportance))),
    isDuplicate,
    selected: !isDuplicate,
  };
}

function extractMemoriesFromJson(
  sources: Array<Record<string, unknown> | null>,
  existingFacts: Set<string>
): ImportedMemoryCandidate[] {
  const candidates: ImportedMemoryCandidate[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    if (!src) continue;
    for (const key of ['memories', 'memory', 'memoryVault', 'facts']) {
      const list = src[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (candidates.length >= MAX_MEMORY_CANDIDATES) break;
        if (typeof entry === 'string') {
          const c = buildCandidate(entry, undefined, undefined, existingFacts, seen);
          if (c) candidates.push(c);
        } else {
          const rec = asRecord(entry);
          if (!rec) continue;
          const fact = pickString(
            [rec],
            ['fact', 'text', 'content', 'memory', 'value'],
            580
          );
          if (!fact) continue;
          const c = buildCandidate(
            fact,
            rec.category,
            rec.importance,
            existingFacts,
            seen
          );
          if (c) candidates.push(c);
        }
      }
    }
  }
  return candidates;
}

function draftFromJson(
  root: Record<string, unknown>
): { draft: CompanionImportDraft; memorySources: Array<Record<string, unknown> | null> } {
  const profile = asRecord(root.profile);
  const companion = asRecord(root.companion) || asRecord(root.character);
  const user = asRecord(root.user) || asRecord(root.owner);
  // Field lookup order: the dedicated companion/user objects first, then a
  // Shell backup's profile, then the root itself (the flat import shape).
  const companionSources = [companion, profile, root];
  const userSources = [user, profile, root];

  const draft: CompanionImportDraft = {};

  const name = pickString(
    companionSources,
    ['companionName', 'companion_name', 'characterName', 'name'],
    40
  );
  if (name) draft.companionName = name;

  const personality = pickString(
    companionSources,
    [
      'companionPersonality',
      'personality',
      'persona',
      'description',
      'characterDescription',
      'systemPrompt',
      'system_prompt',
    ],
    4000
  );
  if (personality) draft.companionPersonality = personality;

  const greeting = pickString(
    companionSources,
    ['companionGreeting', 'greeting', 'firstMessage', 'first_message', 'openingLine'],
    300
  );
  if (greeting) draft.companionGreeting = greeting;

  const avatar = pickString(
    companionSources,
    ['companionAvatarUrl', 'avatarUrl', 'avatar'],
    850_000
  );
  if (avatar && (avatar.startsWith('data:image/') || avatar.startsWith('https://'))) {
    draft.companionAvatarUrl = avatar;
  }

  const callsign = pickString(
    userSources,
    ['callsign', 'userCallsign', 'userName', 'yourName'],
    40
  );
  if (callsign) draft.callsign = callsign;

  const notes = pickString(
    userSources,
    ['dynamicNotes', 'bio', 'userBio', 'aboutUser', 'aboutMe', 'notes'],
    500
  );
  if (notes) draft.dynamicNotes = notes;

  const voiceRaw = pickString(companionSources, ['preferredVoice', 'voice'], 40);
  if (voiceRaw) {
    draft.preferredVoice = sanitizeVoicePreset(voiceRaw);
  }

  return { draft, memorySources: [root, companion, profile] };
}

const MEMORY_HEADING_RE =
  /^(memories|memory|facts|things to remember|remember|about me|notes about me)\b[:\s]*$/i;
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const LABELLED_NAME_RE = /^(?:companion\s+)?name\s*[:\-]\s*(.+)$/i;
const LABELLED_GREETING_RE = /^greeting\s*[:\-]\s*(.+)$/i;
const HEADING_RE = /^#{1,6}\s+/;

function draftFromText(
  raw: string,
  existingFacts: Set<string>
): ParsedCompanionImport {
  const lines = raw.split(/\r?\n/);
  const memoryLines: string[] = [];
  const personalityLines: string[] = [];
  let inMemorySection = false;
  let companionName: string | undefined;
  let companionGreeting: string | undefined;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const headingText = trimmed.replace(HEADING_RE, '');

    if (MEMORY_HEADING_RE.test(headingText)) {
      inMemorySection = true;
      return;
    }
    // A new markdown heading ends the memory section.
    if (HEADING_RE.test(trimmed) && !MEMORY_HEADING_RE.test(headingText)) {
      inMemorySection = false;
    }

    // Labelled identity lines near the top of a character card.
    if (idx < 15 && !companionName) {
      const m = trimmed.match(LABELLED_NAME_RE);
      if (m) companionName = m[1].trim().slice(0, 40);
    }
    if (idx < 15 && !companionGreeting) {
      const m = trimmed.match(LABELLED_GREETING_RE);
      if (m) companionGreeting = m[1].trim().slice(0, 300);
    }

    const bullet = trimmed.match(BULLET_RE);
    if (bullet) {
      memoryLines.push(bullet[1]);
      // Bullets inside a memory section are pure memories; bullets elsewhere
      // stay in the personality too (character cards often list traits as
      // bullets, and dropping them would gut the persona).
      if (!inMemorySection) personalityLines.push(line);
      return;
    }
    if (inMemorySection && trimmed.length >= 3) {
      memoryLines.push(trimmed);
      return;
    }
    personalityLines.push(line);
  });

  const seen = new Set<string>();
  const memories: ImportedMemoryCandidate[] = [];
  for (const fact of memoryLines) {
    if (memories.length >= MAX_MEMORY_CANDIDATES) break;
    const c = buildCandidate(fact, undefined, undefined, existingFacts, seen);
    if (c) memories.push(c);
  }

  // If stripping the memory lines gutted the text, keep the whole thing as
  // the personality — a short persona with its facts left in beats an empty
  // one.
  let personality = personalityLines.join('\n').trim();
  if (personality.length < 40) {
    personality = raw.trim();
  }

  const draft: CompanionImportDraft = {};
  if (companionName) draft.companionName = companionName;
  if (companionGreeting) draft.companionGreeting = companionGreeting;
  if (personality) draft.companionPersonality = personality.slice(0, 4000);

  return { kind: 'text', draft, memories };
}

/**
 * Parse pasted/uploaded import content. `existingFacts` are the facts
 * already in the Memory Vault, used only to flag duplicates.
 */
export function parseCompanionImport(
  rawInput: string,
  existingFacts: string[] = []
): CompanionImportParseResult {
  const raw = (rawInput || '').slice(0, MAX_IMPORT_CHARS);
  if (!raw.trim()) {
    return {
      ok: false,
      error: 'Nothing to import yet — paste some text or choose a file first.',
    };
  }

  const existingSet = new Set(existingFacts.map(normalizeFact));

  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsedJson: unknown = JSON.parse(trimmed);
      // A bare array is treated as a list of memories.
      if (Array.isArray(parsedJson)) {
        const holder: Record<string, unknown> = { memories: parsedJson };
        const memories = extractMemoriesFromJson([holder], existingSet);
        if (memories.length > 0) {
          return { ok: true, parsed: { kind: 'json', draft: {}, memories } };
        }
        return {
          ok: false,
          error:
            "That list didn't contain any memories we could read. Try the example shape below, or paste free-form notes instead.",
        };
      }
      const root = asRecord(parsedJson);
      if (root) {
        const { draft, memorySources } = draftFromJson(root);
        const memories = extractMemoriesFromJson(memorySources, existingSet);
        const hasDraft = Object.values(draft).some(
          (v) => typeof v === 'string' && v.trim()
        );
        if (hasDraft || memories.length > 0) {
          return { ok: true, parsed: { kind: 'json', draft, memories } };
        }
        return {
          ok: false,
          error:
            "We couldn't find a companion profile in that file. Check the example below for the shape that works best — or paste free-form notes and we'll sort them out.",
        };
      }
    } catch {
      // Looked like JSON but isn't — fall through and treat it as free-form
      // text rather than failing; the review screen shows what we made of it.
    }
  }

  const parsed = draftFromText(raw, existingSet);
  if (!parsed.draft.companionPersonality && parsed.memories.length === 0) {
    return {
      ok: false,
      error:
        "We couldn't make sense of that. Paste a companion profile, a character card, or some notes about them and try again.",
    };
  }
  return { ok: true, parsed };
}
