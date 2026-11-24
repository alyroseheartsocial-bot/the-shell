/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Games Room — a play space for chat games with your companion.
 *
 * Like the Creative Room, this thread lives in its own state, its own local
 * storage key, and its own persistence, so it can never archive, replace, or
 * otherwise touch the private main chat. Text-only: no attachments, no voice.
 * The companion hosts and plays — the server applies the games-room prompt
 * (room: 'games') so it keeps rules and score.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Dices, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types';

// Colour choices are concentrated here and wired to the theme slots
// (var(--…) from index.css), so the Room wears every skin with no further work.
const ROOM_CLASSES = {
  panel:
    'flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--bg-panel)] shadow-xl',
  header: 'border-b border-indigo-500/20 bg-[var(--bg-raised)] px-3 sm:px-4 py-3 shrink-0',
  gameChip:
    'px-2.5 py-1 rounded-full border border-indigo-400/30 text-[11px] font-semibold text-indigo-200 hover:text-white hover:bg-indigo-500/20 transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:pointer-events-none',
  list: 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 sm:py-4 space-y-2.5 sm:space-y-3.5',
  userBubble:
    'rounded-br-md border border-cyan-400/25 bg-[var(--bg-bubble-user)] text-[var(--text-main)]',
  companionBubble:
    'rounded-bl-md border border-indigo-500/25 bg-[var(--bg-bubble-companion)] text-[var(--text-main)]',
  streamingBubble:
    'rounded-bl-md border border-cyan-400/35 bg-[#151c2e]/95 text-slate-100',
  bubbleBase:
    'max-w-[85%] sm:max-w-[76%] rounded-3xl px-4 sm:px-5 py-2.5 sm:py-3 companion-scalable-text shadow-md leading-relaxed',
  composer:
    'flex items-center gap-1 sm:gap-2 rounded-full border border-indigo-400/30 bg-[var(--bg-input)] backdrop-blur-md px-2.5 sm:px-4 py-1.5 sm:py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)] shrink-0 transition-all focus-within:border-cyan-400/50 focus-within:shadow-[0_0_20px_rgba(6,182,212,0.2)]',
  sendButton:
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[image:var(--gradient-cta)] text-white shadow-[0_0_14px_var(--glow)] hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer',
  backButton:
    'px-3 py-1 rounded-xl border border-cyan-400/30 text-xs font-semibold text-cyan-200 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer shrink-0',
} as const;

export interface GameDefinition {
  id: string;
  label: string;
  kickoff: string;
}

export const GAME_DEFINITIONS: GameDefinition[] = [
  {
    id: 'would-you-rather',
    label: 'Would You Rather',
    kickoff:
      "Let's play Would You Rather! Ask me the first dilemma — one at a time — and react to my pick before the next one.",
  },
  {
    id: 'two-truths',
    label: 'Two Truths and a Lie',
    kickoff:
      "Let's play Two Truths and a Lie! You go first: give me two truths and one lie about yourself (in any order) and I'll guess which one is the lie. Then we'll swap.",
  },
  {
    id: 'trivia',
    label: 'Trivia Challenge',
    kickoff:
      "Let's play Trivia Challenge! Ask me questions one at a time and keep my score out of 10. Mix easy ones with a few tricky ones — and don't tell me the answer until I've guessed.",
  },
  {
    id: 'word-association',
    label: 'Word Association',
    kickoff:
      "Let's play Word Association! Say one word, I'll reply with the first word it makes me think of, and we go back and forth — single words only, no repeats.",
  },
  {
    id: 'twenty-questions',
    label: '20 Questions',
    kickoff:
      "Let's play 20 Questions! Think of something and I'll try to guess it in 20 yes-or-no questions. Keep count as we go.",
  },
];

interface GamesRoomViewProps {
  callsign: string;
  companionName: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingReply: string;
  onSendMessage: (text: string) => Promise<void>;
  onBackToChat: () => void;
}

export const GamesRoomView: React.FC<GamesRoomViewProps> = ({
  callsign,
  companionName,
  messages,
  isStreaming,
  streamingReply,
  onSendMessage,
  onBackToChat,
}) => {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingReply]);

  const canSend = draft.trim().length > 0 && !isStreaming;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft('');
    void onSendMessage(text);
  };

  return (
    <div className={ROOM_CLASSES.panel}>
      {/* Games Header + Picker */}
      <div className={ROOM_CLASSES.header}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Dices className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base font-bold text-white truncate">
              Games Room
            </h2>
          </div>
          <button type="button" onClick={onBackToChat} className={ROOM_CLASSES.backButton}>
            Back to Chat
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
          Pick a game and {companionName} will host it right here — or just
          start chatting and invent your own.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GAME_DEFINITIONS.map((game) => (
            <button
              key={game.id}
              type="button"
              disabled={isStreaming}
              onClick={() => void onSendMessage(game.kickoff)}
              className={ROOM_CLASSES.gameChip}
            >
              {game.label}
            </button>
          ))}
        </div>
      </div>

      {/* Game Thread */}
      <div className={ROOM_CLASSES.list}>
        {messages.length === 0 && !streamingReply ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center text-slate-400 space-y-2 py-6 sm:py-10 px-4">
            <Dices className="w-7 h-7 text-cyan-400/60" />
            <p className="companion-scalable-text text-slate-300 font-medium max-w-md">
              Welcome to the Games Room, {callsign}. Pick a game above and
              {companionName} will deal you in.
            </p>
            <p className="text-xs max-w-md text-slate-400">
              Games are played right in the chat — no setup, no downloads, and
              the score lives in the conversation.
            </p>
          </div>
        ) : null}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`${ROOM_CLASSES.bubbleBase} ${isUser ? ROOM_CLASSES.userBubble : ROOM_CLASSES.companionBubble}`}>
                <p className="whitespace-pre-wrap break-words">
                  {msg.content}{' '}
                  <span
                    className={`font-semibold whitespace-nowrap ${
                      isUser ? 'text-cyan-300' : 'text-emerald-400'
                    }`}
                  >
                    {isUser ? `-${callsign}` : `-${companionName}`}
                  </span>
                </p>
              </div>
            </div>
          );
        })}

        {/* Companion preparing (stream open, no words yet) */}
        {isStreaming && !streamingReply && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 rounded-full border border-indigo-400/25 bg-[var(--bg-bubble-companion)] px-3 py-1.5 text-xs text-cyan-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
              <span>{companionName} is setting up the game…</span>
            </div>
          </div>
        )}

        {/* Streaming Reply Preview */}
        {streamingReply && (
          <div className="flex flex-col items-start">
            <div className={`${ROOM_CLASSES.bubbleBase} ${ROOM_CLASSES.streamingBubble}`}>
              <p className="whitespace-pre-wrap break-words">
                {streamingReply}{' '}
                <span className="text-emerald-400 font-semibold">-{companionName}</span>
              </p>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Game Composer (text only) */}
      <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 shrink-0">
        <form onSubmit={handleSubmit} className={ROOM_CLASSES.composer}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={7900}
            placeholder="your move..."
            aria-label="Message Companion in the Games Room"
            className="flex-1 min-w-0 bg-transparent px-2 py-1 text-base sm:text-sm text-white placeholder:text-slate-400/70 focus:outline-none font-normal"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message to Companion in the Games Room"
            className={ROOM_CLASSES.sendButton}
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
