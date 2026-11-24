/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Creative Room — a workspace for making shareable content.
 *
 * This thread is deliberately NOT a main-chat conversation: it lives in its
 * own state, its own local storage key, and its own cloud collection, so it
 * can never archive, replace, or otherwise touch the private main chat.
 * Text-only in v1: no attachments, no voice, no reactions.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Clapperboard, Loader2, Radio } from 'lucide-react';
import { ChatMessage } from '../types';

// Colour choices are concentrated here and wired to the theme slots
// (var(--…) from index.css), so the Room wears every skin — Terminal,
// Warm Hearth, Midnight, and the rest — with no further work. Don't sprinkle one-off colours
// through the markup below. (The ON AIR pill stays rose in all skins:
// rose = recording = meaning colour.)
const ROOM_CLASSES = {
  panel:
    'flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--bg-panel)] shadow-xl',
  header: 'border-b border-indigo-500/20 bg-[var(--bg-raised)] px-3 sm:px-4 py-3 shrink-0',
  onAirPill:
    'inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wider text-rose-300',
  backButton:
    'px-3 py-1 rounded-xl border border-cyan-400/30 text-xs font-semibold text-cyan-200 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer shrink-0',
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
} as const;

interface CreativeRoomViewProps {
  callsign: string;
  companionName: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingReply: string;
  thoughtStream: string;
  savedFactsByMsgId: Record<string, string[]>;
  onSendMessage: (text: string) => Promise<void>;
  onBackToChat: () => void;
}

export const CreativeRoomView: React.FC<CreativeRoomViewProps> = ({
  callsign,
  companionName,
  messages,
  isStreaming,
  streamingReply,
  thoughtStream,
  savedFactsByMsgId,
  onSendMessage,
  onBackToChat,
}) => {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest stage lines in view as they land or stream in.
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
      {/* On-Stage Header */}
      <div className={ROOM_CLASSES.header}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-5 h-5 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base font-bold text-white truncate">
              Creative Room
            </h2>
            <span className={ROOM_CLASSES.onAirPill}>
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
              ON AIR
            </span>
          </div>
          <button type="button" onClick={onBackToChat} className={ROOM_CLASSES.backButton}>
            Back to Chat
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
          A workspace for making shareable content — everything in here is on
          the record and fair game to post. Your main chat stays private; this
          room never touches it.
        </p>
        {thoughtStream && (
          <p className="mt-1 text-[11px] text-cyan-200/70 italic truncate" title={thoughtStream}>
            {thoughtStream}
          </p>
        )}
      </div>

      {/* Stage Thread */}
      <div ref={listRef} className={ROOM_CLASSES.list}>
        {messages.length === 0 && !streamingReply ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center text-center text-slate-400 space-y-2 py-6 sm:py-10 px-4">
            <Clapperboard className="w-7 h-7 text-cyan-400/60" />
            <p className="companion-scalable-text text-slate-300 font-medium max-w-md">
              Welcome to the Creative Room, {callsign}. Whatever you create in
              here is made to be shared; your main chat stays private.
            </p>
            <p className="text-xs max-w-md text-slate-400">
              Start with an idea, a draft, or the piece you want to polish for sharing.
            </p>
          </div>
        ) : null}

        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const savedFacts = !isUser ? savedFactsByMsgId[msg.id] || [] : [];
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
                {savedFacts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-emerald-400/20 space-y-1 text-xs text-emerald-300/95">
                    {savedFacts.map((fact, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                        <span>
                          Saved to Memory <span aria-hidden="true">·</span> {fact}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Companion preparing (stream open, no words yet) */}
        {isStreaming && !streamingReply && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2 rounded-full border border-indigo-400/25 bg-[var(--bg-bubble-companion)] px-3 py-1.5 text-xs text-cyan-200">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
              <span>Companion is getting ready…</span>
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

      {/* Stage Composer (text only) */}
      <div className="px-2.5 sm:px-3 pb-2.5 sm:pb-3 pt-1 shrink-0">
        <form onSubmit={handleSubmit} className={ROOM_CLASSES.composer}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={7900}
            placeholder="draft the piece you want to share..."
            aria-label="Message Companion in the Creative Room"
            className="flex-1 min-w-0 bg-transparent px-2 py-1 text-base sm:text-sm text-white placeholder:text-slate-400/70 focus:outline-none font-normal"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message to Companion in the Creative Room"
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
