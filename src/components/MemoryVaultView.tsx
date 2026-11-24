import React, { useState } from 'react';
import { ArrowLeft, BrainCircuit, Plus, Search, Trash2 } from 'lucide-react';
import { ConversationItem, MemoryCategory, MemoryNode } from '../types';

interface MemoryVaultViewProps {
  callsign: string;
  memories: MemoryNode[];
  archivedConversations: ConversationItem[];
  onAddMemory: (category: MemoryCategory, fact: string, importance: number) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onBackToChat: () => void;
}

const CATEGORIES: Array<{ value: 'all' | MemoryCategory; label: string }> = [
  { value: 'all', label: 'All Nodes' },
  { value: 'personal', label: 'Personal' },
  { value: 'shared_history', label: 'Shared History' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'preference', label: 'Preferences' },
  { value: 'directive', label: 'Directives' },
];

export const MemoryVaultView: React.FC<MemoryVaultViewProps> = ({
  callsign,
  memories,
  archivedConversations,
  onAddMemory,
  onDeleteMemory,
  onBackToChat,
}) => {
  const [filterCat, setFilterCat] = useState<'all' | MemoryCategory>('all');
  const [query, setQuery] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('personal');
  const [newFact, setNewFact] = useState('');
  const [newImportance, setNewImportance] = useState(4);
  const [isSaving, setIsSaving] = useState(false);

  const filteredMemories = memories.filter((m) => {
    const matchesCat = filterCat === 'all' || m.category === filterCat;
    const matchesQuery =
      !query.trim() || m.fact.toLowerCase().includes(query.trim().toLowerCase());
    return matchesCat && matchesQuery;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onAddMemory(newCategory, newFact.trim(), newImportance);
      setNewFact('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-indigo-400/25 bg-[var(--bg-panel)] p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-3.5">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="w-5 h-5 text-cyan-300" />
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-white">
              Persistent Memory Graph · {callsign}
            </h2>
            <p className="text-xs text-slate-400">
              Every node below is actively injected into Companion&apos; live prompt context.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBackToChat}
          className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Chat</span>
        </button>
      </div>

      {/* Add Memory Form */}
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-xl border border-indigo-400/20 bg-[#0d1436] p-3"
      >
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
          className="sm:col-span-3 rounded-lg border border-indigo-400/30 bg-[#080c24] px-2.5 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
        >
          <option value="personal">Personal Detail</option>
          <option value="shared_history">Shared History</option>
          <option value="dynamic">Relationship Dynamic</option>
          <option value="preference">Preference</option>
          <option value="directive">Standing Directive</option>
        </select>

        <input
          type="text"
          value={newFact}
          onChange={(e) => setNewFact(e.target.value)}
          maxLength={580}
          placeholder={`Add a durable fact about ${callsign} or shared history...`}
          className="sm:col-span-6 rounded-lg border border-indigo-400/30 bg-[#080c24] px-3 py-2 text-xs text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
        />

        <select
          value={newImportance}
          onChange={(e) => setNewImportance(Number(e.target.value))}
          className="sm:col-span-1 rounded-lg border border-indigo-400/30 bg-[#080c24] px-2 py-2 text-xs font-mono-tabular text-cyan-300 focus:border-cyan-400 focus:outline-none"
          title="Priority Weight (1-5)"
        >
          <option value={5}>P5</option>
          <option value={4}>P4</option>
          <option value={3}>P3</option>
          <option value={2}>P2</option>
          <option value={1}>P1</option>
        </select>

        <button
          type="submit"
          disabled={!newFact.trim() || isSaving}
          className="sm:col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-45 cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Commit</span>
        </button>
      </form>

      {/* Filter Bar & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#0d1436] p-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setFilterCat(cat.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                filterCat === cat.value
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter memory nodes..."
            className="w-full rounded-lg border border-indigo-400/25 bg-[#0c1230] pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Memory Nodes List */}
      <div className="space-y-2">
        {filteredMemories.length === 0 ? (
          <div className="rounded-xl border border-indigo-400/15 bg-[#0b112c] p-6 text-center text-xs text-slate-400">
            No memory nodes match this filter. Chat with Companion or commit a core fact above.
          </div>
        ) : (
          filteredMemories.map((node) => (
            <div
              key={node.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-indigo-400/20 bg-[#0c1332] px-3.5 py-2.5 hover:border-cyan-400/35 transition-colors"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-cyan-300/85">
                  <span>{node.category.replace('_', ' ').toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span>PRIORITY {node.importance}/5</span>
                </div>
                <p className="companion-scalable-text text-slate-100">{node.fact}</p>
              </div>
              <button
                type="button"
                onClick={() => onDeleteMemory(node.id)}
                title="Remove memory node"
                className="p-1.5 text-slate-400 hover:text-rose-300 cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Archived Continuity Summaries */}
      {archivedConversations.length > 0 && (
        <div className="pt-3 border-t border-indigo-500/20 space-y-2.5">
          <h3 className="font-display text-sm font-semibold text-slate-200">
            Archived Session Continuity Summaries
          </h3>
          <div className="space-y-2">
            {archivedConversations.map((arch) => (
              <div
                key={arch.id}
                className="rounded-xl border border-indigo-400/20 bg-[#0b102b] px-3.5 py-2.5 space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-200">{arch.title}</span>
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    {new Date(arch.updatedAtMs).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{arch.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
