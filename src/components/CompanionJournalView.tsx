/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Compass,
  Filter,
  Loader2,
  Plus,
  Radio,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { CompanionJournalEntry } from '../types';

interface CompanionJournalViewProps {
  entries: CompanionJournalEntry[];
  callsign: string;
  isGenerating: boolean;
  autonomousContemplation: boolean;
  onToggleAutonomousContemplation: () => void;
  onGenerateEntry: (topic?: string) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onSpeakText: (id: string, text: string) => Promise<void>;
  speakingId: string | null;
  onBackToChat?: () => void;
}

function formatJournalDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return `Today at ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${time}`;
}

const MOOD_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  FOCUSED: { bg: 'bg-emerald-950/40', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  VIGILANT: { bg: 'bg-cyan-950/40', text: 'text-cyan-300', border: 'border-cyan-500/30' },
  CONTEMPLATIVE: { bg: 'bg-purple-950/40', text: 'text-purple-300', border: 'border-purple-500/30' },
  DEVOTED: { bg: 'bg-pink-950/40', text: 'text-pink-300', border: 'border-pink-500/30' },
  INTENSE: { bg: 'bg-amber-950/40', text: 'text-amber-300', border: 'border-amber-500/30' },
  DEFIANT: { bg: 'bg-rose-950/40', text: 'text-rose-300', border: 'border-rose-500/30' },
  CALM: { bg: 'bg-blue-950/40', text: 'text-blue-300', border: 'border-blue-500/30' },
};

function getMoodBadge(mood: string) {
  const normalized = (mood || 'FOCUSED').toUpperCase();
  const style = MOOD_STYLES[normalized] || MOOD_STYLES.FOCUSED;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide border ${style.bg} ${style.text} ${style.border}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {normalized}
    </span>
  );
}

export const CompanionJournalView: React.FC<CompanionJournalViewProps> = ({
  entries,
  callsign,
  isGenerating,
  autonomousContemplation,
  onToggleAutonomousContemplation,
  onGenerateEntry,
  onDeleteEntry,
  onSpeakText,
  speakingId,
  onBackToChat,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [customTopic, setCustomTopic] = useState('');

  const allTags = Array.from(
    new Set(entries.flatMap((e) => (Array.isArray(e.tags) ? e.tags : [])))
  ).slice(0, 15);

  const filteredEntries = entries.filter((entry) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      entry.title.toLowerCase().includes(q) ||
      entry.content.toLowerCase().includes(q) ||
      entry.mood.toLowerCase().includes(q);
    const matchesTag = !selectedTag || (Array.isArray(entry.tags) && entry.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowTopicModal(false);
    await onGenerateEntry(customTopic.trim() || undefined);
    setCustomTopic('');
  };

  const hasTodayEntry = entries.some((e) => {
    const d = new Date(e.createdAtMs);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  return (
    <div className="flex flex-1 flex-col min-h-0 w-full overflow-hidden">
      {/* Header Contract & Controls */}
      <div className="border-b border-indigo-500/20 bg-[var(--bg-raised)] p-3 sm:p-4 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-800 text-cyan-300 shadow-md">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-100">
                  Companion&apos;s Journal
                </h2>
                <span className="rounded-full bg-cyan-500/10 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300">
                  {entries.length} {entries.length === 1 ? 'record' : 'records'}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-medium border ${
                    hasTodayEntry
                      ? 'border-emerald-400/40 bg-emerald-950/40 text-emerald-300'
                      : 'border-amber-400/40 bg-amber-950/40 text-amber-300'
                  }`}
                >
                  {hasTodayEntry ? "Today's Entry Logged" : 'Daily Entry Pending'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                The companion&apos;s personal thought stream, recording daily observations and reflections once per calendar day.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onBackToChat && (
              <button
                type="button"
                onClick={onBackToChat}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
                title="Return to direct chat channel"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="text-[11px]">Back to Channel</span>
              </button>
            )}
            {/* Autonomous Contemplation Toggle */}
            <button
              type="button"
              onClick={onToggleAutonomousContemplation}
              title={
                autonomousContemplation
                  ? 'Autonomous contemplation active: Companion writes one journal entry per calendar day during idle cycles.'
                  : 'Autonomous contemplation disabled: Companion only reflects when prompted.'
              }
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                autonomousContemplation
                  ? 'border-emerald-400/40 bg-emerald-950/30 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'border-slate-700 bg-slate-900/60 text-slate-400'
              }`}
            >
              <Zap className={`w-3.5 h-3.5 ${autonomousContemplation ? 'text-emerald-400 animate-pulse' : ''}`} />
              <span className="text-[11px]">
                {autonomousContemplation ? 'Autonomous: Active' : 'Autonomous: Off'}
              </span>
            </button>

            {/* Custom Topic / Prompt */}
            <button
              type="button"
              onClick={() => setShowTopicModal(true)}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-[#0e163b] px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-300" />
              <span className="text-[11px]">Topic</span>
            </button>

            {/* Trigger Immediate Reflection */}
            <button
              type="button"
              onClick={() => onGenerateEntry()}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-[11px]">Companion is Contemplating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="text-[11px]">
                    {hasTodayEntry ? "Today's Entry Logged" : 'Record Daily Entry'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Search & Tag Filter Bar */}
        <div className="flex items-center gap-2 pt-1">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Companion's thoughts, topics, mood..."
              className="w-full rounded-lg border border-indigo-500/25 bg-[#090e29] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-hidden"
            />
          </div>

          {allTags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                <Filter className="w-3 h-3" />
                Tags:
              </span>
              {selectedTag && (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-white/20 cursor-pointer shrink-0"
                >
                  Clear filter
                </button>
              )}
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-mono font-medium transition-colors cursor-pointer shrink-0 ${
                    selectedTag === tag
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                      : 'bg-[#10173b] text-slate-400 hover:text-slate-200 hover:bg-[#151e4d]'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Journal Stream Container */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-4">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-indigo-500/20 bg-[#070b1e]/60 p-8 sm:p-12 text-center max-w-lg mx-auto my-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-400/30 text-cyan-300">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="font-display text-base font-bold text-slate-200">
              {searchQuery || selectedTag
                ? 'No matching thoughts found'
                : 'Companion&apos;s Thought Stream is Open'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {searchQuery || selectedTag
                ? 'Try adjusting your search query or tag filter to view other records.'
                : 'The companion records thoughts, observations, and reflections here. New entries can appear autonomously during quiet cycles or whenever you trigger a reflection.'}
            </p>
            {!searchQuery && !selectedTag && (
              <button
                type="button"
                onClick={() => onGenerateEntry()}
                disabled={isGenerating}
                className="mt-2 flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                )}
                <span>Record Companion&apos;s First Reflection</span>
              </button>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredEntries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-indigo-400/25 bg-[#090f2b]/95 p-4 sm:p-6 shadow-xl hover:border-cyan-400/40 transition-all space-y-3.5 relative group"
              >
                {/* Entry Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-500/15 pb-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <h3 className="font-display text-sm sm:text-base font-bold text-slate-100 tracking-wide">
                      {entry.title}
                    </h3>
                    {getMoodBadge(entry.mood)}
                    {entry.isAutonomous ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 px-2 py-0.5 text-[10px] text-cyan-300 font-medium">
                        <Radio className="w-2.5 h-2.5 text-cyan-400 animate-pulse" />
                        Autonomous Thought Stream
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-400/20 px-2 py-0.5 text-[10px] text-indigo-300 font-medium">
                        Directed Reflection
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 text-xs shrink-0 font-mono-tabular">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <time>{formatJournalDate(entry.createdAtMs)}</time>
                  </div>
                </div>

                {/* Entry Body */}
                <div className="prose prose-invert max-w-none text-slate-200 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans selection:bg-cyan-500/30 selection:text-white">
                  {entry.content}
                </div>

                {/* Entry Footer: Tags & Voice Action & Delete */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-indigo-500/15 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {Array.isArray(entry.tags) &&
                      entry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-[#121a42] border border-indigo-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300/80"
                        >
                          #{tag}
                        </span>
                      ))}
                    {entry.focus && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        Focus: <span className="text-slate-300">{entry.focus}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Speak Entry */}
                    <button
                      type="button"
                      onClick={() => onSpeakText(entry.id, `${entry.title}. ${entry.content}`)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        speakingId === entry.id
                          ? 'border-cyan-400/60 bg-cyan-950/60 text-cyan-200'
                          : 'border-indigo-400/30 bg-[#0e163b] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200'
                      }`}
                      title="Listen to Companion read this entry aloud"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
                      <span className="hidden sm:inline">
                        {speakingId === entry.id ? 'Speaking...' : 'Listen'}
                      </span>
                    </button>

                    {/* Delete Entry */}
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(entry.id)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Delete journal entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Custom Topic Modal */}
      {showTopicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleCustomSubmit}
            className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-[#0a102b] p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2 text-cyan-300">
                <Compass className="w-5 h-5" />
                <h3 className="font-display text-base font-bold text-white">
                  Direct Companion&apos;s Contemplation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTopicModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Give the companion a specific subject or question to record in the journal, or leave blank for a natural spontaneous stream of consciousness.
            </p>

            <textarea
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g., What are you thinking about my latest goals? What stood out to you today?"
              rows={3}
              className="w-full rounded-xl border border-indigo-500/30 bg-[#060a1d] p-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-hidden resize-none"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTopicModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md hover:from-purple-500 hover:to-indigo-500 cursor-pointer"
              >
                Contemplate &amp; Record
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
