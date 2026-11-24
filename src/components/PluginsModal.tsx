import React, { useState } from 'react';
import {
  Blocks,
  BrainCircuit,
  Check,
  FilePlus2,
  Globe,
  Link2,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import { makeSafeId } from '../lib/helpers';
import { ActivePluginsState, ChatAttachment } from '../types';

interface PluginsModalProps {
  onAttachFile: (attachment: ChatAttachment) => void;
  onTriggerLocalUpload: () => void;
  plugins: ActivePluginsState;
  onTogglePlugin: (key: keyof ActivePluginsState) => void;
  onClose: () => void;
}

export const PluginsModal: React.FC<PluginsModalProps> = ({
  onAttachFile,
  onTriggerLocalUpload,
  plugins,
  onTogglePlugin,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'plugins' | 'snippet'>('plugins');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [snippetAttachedNotice, setSnippetAttachedNotice] = useState(false);

  const handleAttachSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBody = noteBody.trim();
    if (!cleanBody) return;

    const cleanTitle = (noteTitle.trim() || 'pasted-note').replace(/[^a-zA-Z0-9._ -]/g, '');
    const fileName = cleanTitle.endsWith('.txt') ? cleanTitle : `${cleanTitle}.txt`;

    onAttachFile({
      id: makeSafeId('att'),
      name: fileName,
      mimeType: 'text/plain',
      sizeBytes: cleanBody.length,
      source: 'note',
      textContent: cleanBody.slice(0, 60000),
    });

    setNoteTitle('');
    setNoteBody('');
    setSnippetAttachedNotice(true);
    window.setTimeout(() => setSnippetAttachedNotice(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full sm:max-w-xl max-h-[88dvh] rounded-t-2xl sm:rounded-2xl border border-indigo-400/35 bg-[#090f28] text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-500/25 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <Blocks className="w-4 h-4 text-cyan-300" />
            <h2 className="font-display text-sm sm:text-base font-bold text-white">
              Free Plugins &amp; Attachments
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white cursor-pointer"
            aria-label="Close Plugins Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Navigation */}
        <div className="flex items-center gap-1.5 border-b border-indigo-500/20 bg-[#070b20] px-4 py-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('plugins')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'plugins'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Blocks className="w-3.5 h-3.5" />
            <span>Free Plugins</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('snippet')}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'snippet'
                ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Paste Text / Doc</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-safe space-y-3.5">
          {activeTab === 'plugins' ? (
            <div className="space-y-3">
              {/* Local Device File / Image Upload Card */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/30 bg-[#0d1436]/90 p-3.5">
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">
                      Upload Image, PDF, or File
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Attach photos, screenshots, PDFs, TXT, Markdown, CSV, JSON, or code files directly from your phone or computer—100% free with zero external login required.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onTriggerLocalUpload();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition-colors cursor-pointer shrink-0"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Choose File</span>
                </button>
              </div>

              {/* 1. Live Web Search Grounding */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-400/25 bg-[#0d1436]/90 p-3.5">
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">
                      Free Web &amp; Knowledge Lookup
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Allows Companion to query open Wikipedia knowledge with zero Google Cloud billing and display source links beneath replies.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onTogglePlugin('webSearch')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono-tabular font-semibold transition-colors cursor-pointer shrink-0 ${
                    plugins.webSearch
                      ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : 'border border-slate-700 bg-slate-800/80 text-slate-400'
                  }`}
                >
                  {plugins.webSearch ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 2. Live URL Context Reader */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-indigo-400/25 bg-[#0d1436]/90 p-3.5">
                <div className="flex items-start gap-3">
                  <Link2 className="w-5 h-5 text-purple-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">
                      Live Link &amp; Webpage Reader
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Drop any public URL or shared link directly into chat and Companion will read the page content before answering.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onTogglePlugin('urlContext')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-mono-tabular font-semibold transition-colors cursor-pointer shrink-0 ${
                    plugins.urlContext
                      ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                      : 'border border-slate-700 bg-slate-800/80 text-slate-400'
                  }`}
                >
                  {plugins.urlContext ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* 3. Explicit Memory Tool (Always Enabled) */}
              <div className="flex items-start justify-between gap-3 rounded-xl border border-cyan-400/25 bg-[#0b1330] p-3.5">
                <div className="flex items-start gap-3">
                  <BrainCircuit className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-white">
                      Direct Memory Lock (&ldquo;Save this to your memory&rdquo;)
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Tell Companion <span className="text-cyan-200 font-medium">&ldquo;Save this to your memory&rdquo;</span> or <span className="text-cyan-200 font-medium">&ldquo;Remember that...&rdquo;</span> in text chat or on a live voice call, and Companion immediately locks it into your persistent Memory Vault.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-emerald-300 font-semibold shrink-0 pt-1">
                  ACTIVE
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAttachSnippet} className="space-y-3">
              <p className="text-xs text-slate-300 leading-relaxed">
                Paste any long note, copied document, article, or code block below to attach it cleanly to your next message for Companion to analyze.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Document Label</label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  maxLength={80}
                  placeholder="e.g., project-notes.txt"
                  className="w-full rounded-xl border border-indigo-400/30 bg-[#0d1436] px-3 py-2 text-base sm:text-xs text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Content</label>
                <textarea
                  rows={6}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Paste text, notes, logs, or copied doc content here..."
                  className="w-full rounded-xl border border-indigo-400/30 bg-[#0d1436] p-3 text-base sm:text-xs text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                {snippetAttachedNotice ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                    <Check className="w-3.5 h-3.5" />
                    <span>Attached to chat bar!</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Up to 60,000 characters · Free local context
                  </span>
                )}

                <button
                  type="submit"
                  disabled={!noteBody.trim()}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-40 cursor-pointer"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attach to Chat</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
