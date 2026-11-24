import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Filter,
  Images,
  Maximize2,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { loadAssetDataUrl } from '../lib/imageVault';
import { AspectRatioOption, VisualCreation } from '../types';

interface GalleryViewProps {
  creations: VisualCreation[];
  onSendVisualToChat: (creation: VisualCreation, dataUrl: string) => Promise<void>;
  onDeleteCreation: (creation: VisualCreation) => Promise<void>;
  onDeleteFallbackCreations: () => Promise<number>;
  onBackToChat: () => void;
  onOpenStudio: (prompt?: string, stylePreset?: string, aspectRatio?: AspectRatioOption) => void;
}

const STYLE_PRESETS = [
  'All Styles',
  'Prompt Only',
  'Photorealistic',
  'Illustration',
  'Anime Style',
  'Watercolor',
  'Cinematic Portrait',
  'Landscape',
];

const ASPECT_RATIOS: Array<'All Ratios' | AspectRatioOption> = [
  'All Ratios',
  '1:1',
  '16:9',
  '9:16',
  '3:4',
  '4:3',
];

export const GalleryView: React.FC<GalleryViewProps> = ({
  creations,
  onSendVisualToChat,
  onDeleteCreation,
  onDeleteFallbackCreations,
  onBackToChat,
  onOpenStudio,
}) => {
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('All Styles');
  const [selectedRatio, setSelectedRatio] = useState<'All Ratios' | AspectRatioOption>('All Ratios');
  const [activeLightbox, setActiveLightbox] = useState<{
    creation: VisualCreation;
    dataUrl: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const hydratedIdsRef = React.useRef<Set<string>>(new Set());

  // Hydrate visual data URLs from IndexedDB for creations cleanly without render looping
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const updates: Record<string, string> = {};
      for (const item of creations) {
        if (!hydratedIdsRef.current.has(item.assetId)) {
          hydratedIdsRef.current.add(item.assetId);
          const url = await loadAssetDataUrl(item.assetId);
          if (url) updates[item.assetId] = url;
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setAssetMap((prev) => ({ ...prev, ...updates }));
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [creations]);

  const handleDownload = (dataUrl: string, id: string) => {
    const isSvg = dataUrl.startsWith('data:image/svg');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `companion-gallery-${id}.${isSvg ? 'svg' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPrompt = async (creation: VisualCreation) => {
    try {
      await navigator.clipboard.writeText(creation.prompt);
      setCopiedId(creation.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleSendToChat = async (creation: VisualCreation, dataUrl: string) => {
    setSendingId(creation.id);
    try {
      await onSendVisualToChat(creation, dataUrl);
      setActiveLightbox(null);
      onBackToChat();
    } finally {
      setSendingId(null);
    }
  };

  // Failed renders are the ones whose loaded asset is an SVG data URL (the
  // server's geometric fallback). This view hydrates every creation's URL
  // into assetMap, so the count here covers the whole gallery.
  const failedRenderCount = creations.filter((item) =>
    (assetMap[item.assetId] || '').startsWith('data:image/svg+xml')
  ).length;

  const handleDeleteFailedRenders = async () => {
    if (failedRenderCount === 0) return;
    const confirmed = window.confirm(
      `Delete ${failedRenderCount} failed render${failedRenderCount === 1 ? '' : 's'}? Your real pictures won't be touched.`
    );
    if (!confirmed) return;
    await onDeleteFallbackCreations();
  };

  const filteredCreations = creations.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery = !q || item.prompt.toLowerCase().includes(q) || (item.stylePreset || '').toLowerCase().includes(q);
    const matchesStyle = selectedStyle === 'All Styles' || item.stylePreset === selectedStyle;
    const matchesRatio = selectedRatio === 'All Ratios' || item.aspectRatio === selectedRatio;
    return matchesQuery && matchesStyle && matchesRatio;
  });

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-indigo-400/25 bg-[var(--bg-panel)] p-4 sm:p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-400/35 text-cyan-300">
            <Images className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                Rendered Visual Gallery
              </h2>
              <span className="rounded-full bg-cyan-500/15 border border-cyan-400/40 px-2 py-0.5 text-[11px] font-mono-tabular font-semibold text-cyan-200">
                {creations.length} {creations.length === 1 ? 'render' : 'renders'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Collection of all visual artwork rendered in the Image Studio and requested during chat.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {failedRenderCount > 0 && (
            <button
              type="button"
              onClick={() => void handleDeleteFailedRenders()}
              className="flex items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-600/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-600/35 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete failed renders ({failedRenderCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenStudio()}
            className="flex items-center gap-1.5 rounded-lg border border-purple-400/50 bg-purple-600/25 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-600/35 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Studio Render</span>
          </button>
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Chat</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 rounded-xl border border-indigo-400/20 bg-[#0c1332] p-2.5">
        <div className="sm:col-span-5 relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompt or subject..."
            className="w-full rounded-lg border border-indigo-400/30 bg-[#080c24] pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="sm:col-span-4">
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            className="w-full rounded-lg border border-indigo-400/30 bg-[#080c24] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
          >
            {STYLE_PRESETS.map((preset) => (
              <option key={preset} value={preset} className="bg-[#080c24] text-white">
                {preset}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-3">
          <select
            value={selectedRatio}
            onChange={(e) => setSelectedRatio(e.target.value as 'All Ratios' | AspectRatioOption)}
            className="w-full rounded-lg border border-indigo-400/30 bg-[#080c24] px-3 py-1.5 text-xs font-mono-tabular text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio} value={ratio} className="bg-[#080c24] text-white">
                {ratio}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gallery Cards Grid */}
      {filteredCreations.length === 0 ? (
        <div className="rounded-2xl border border-indigo-400/20 bg-[#0a0f2b] p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-400/30 text-indigo-300">
            <Images className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-sm sm:text-base font-semibold text-slate-200">
              {creations.length === 0 ? 'No Rendered Images Yet' : 'No Matching Images Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {creations.length === 0
                ? 'Render visuals in the Image Studio or ask your companion in chat (e.g. "draw an image of a garden at sunset") to populate your gallery.'
                : 'Try adjusting your search query or reset the style preset and aspect ratio filters.'}
            </p>
          </div>
          {creations.length === 0 && (
            <button
              type="button"
              onClick={() => onOpenStudio()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:opacity-95 cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Open Image Studio</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCreations.map((item) => {
            const url = assetMap[item.assetId];
            return (
              <div
                key={item.id}
                className="group relative flex flex-col rounded-xl border border-indigo-400/25 bg-[#0b102c] overflow-hidden hover:border-cyan-400/60 transition-all duration-200 shadow-md"
              >
                {/* Visual Viewport */}
                <div
                  className="relative aspect-square w-full bg-[#050716] overflow-hidden cursor-pointer"
                  onClick={() => url && setActiveLightbox({ creation: item, dataUrl: url })}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={item.prompt}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-contain p-1 group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-500 font-mono-tabular">
                      Loading visual...
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                    <span className="rounded bg-black/75 backdrop-blur-xs px-1.5 py-0.5 text-[10px] font-mono-tabular font-medium text-cyan-300 border border-cyan-400/30">
                      {item.aspectRatio}
                    </span>
                    {item.stylePreset && (
                      <span className="rounded bg-black/75 backdrop-blur-xs px-1.5 py-0.5 text-[10px] font-medium text-slate-300 border border-indigo-400/30 truncate max-w-[120px]">
                        {item.stylePreset}
                      </span>
                    )}
                  </div>

                  {/* Hover Quick Action Buttons */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5 gap-2">
                    <p className="text-xs text-slate-100 line-clamp-2 leading-snug font-medium">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-white/15">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (url) setActiveLightbox({ creation: item, dataUrl: url });
                          }}
                          title="Fullscreen View"
                          className="rounded-lg bg-white/10 p-1.5 text-slate-200 hover:bg-cyan-500/25 hover:text-cyan-200 transition-colors"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (url) handleDownload(url, item.id);
                          }}
                          title="Download Image"
                          className="rounded-lg bg-white/10 p-1.5 text-slate-200 hover:bg-white/20 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyPrompt(item);
                          }}
                          title="Copy Prompt"
                          className="rounded-lg bg-white/10 p-1.5 text-slate-200 hover:bg-white/20 transition-colors"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (url) void handleSendToChat(item, url);
                          }}
                          title="Send to Active Chat"
                          className="flex items-center gap-1 rounded-lg bg-purple-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-purple-500 transition-colors"
                        >
                          <Send className="w-3 h-3" />
                          <span>Chat</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onDeleteCreation(item);
                          }}
                          title="Delete from Gallery"
                          className="rounded-lg bg-rose-950/60 p-1.5 text-rose-300 hover:bg-rose-900 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer Info */}
                <div className="p-2.5 space-y-1 bg-[#090d24]">
                  <p className="text-xs text-slate-200 line-clamp-1 font-medium">
                    {item.prompt}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-tabular">
                    <span>{new Date(item.createdAtMs).toLocaleDateString()}</span>
                    <button
                      type="button"
                      onClick={() => onOpenStudio(item.prompt, item.stylePreset, item.aspectRatio)}
                      className="text-cyan-300 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>Remix in Studio</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Interactive Lightbox Modal */}
      {activeLightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-sm"
          onClick={() => setActiveLightbox(null)}
        >
          <div
            className="flex flex-col w-full max-w-4xl max-h-[92dvh] rounded-2xl border border-cyan-400/40 bg-[#090f2b] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header */}
            <div className="flex items-center justify-between border-b border-indigo-500/20 px-4 py-3 bg-[#070b20]">
              <div className="flex items-center gap-2">
                <span className="rounded bg-cyan-500/15 border border-cyan-400/40 px-2 py-0.5 text-[11px] font-mono-tabular font-medium text-cyan-200">
                  {activeLightbox.creation.aspectRatio}
                </span>
                <span className="text-xs text-slate-300 font-medium truncate max-w-xs sm:max-w-md">
                  {activeLightbox.creation.stylePreset}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveLightbox(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close Lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lightbox Body (Preview Area) */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-6 bg-[#040614] overflow-hidden">
              <img
                src={activeLightbox.dataUrl}
                alt={activeLightbox.creation.prompt}
                referrerPolicy="no-referrer"
                className="max-h-[60dvh] w-auto max-w-full object-contain rounded-xl shadow-2xl"
              />
            </div>

            {/* Lightbox Footer Details & Actions */}
            <div className="border-t border-indigo-500/20 p-4 bg-[#0a102d] space-y-3">
              <div className="space-y-1">
                <div className="text-[11px] font-display font-semibold tracking-wider text-cyan-300">
                  PROMPT SPECIFICATION
                </div>
                <p className="text-xs sm:text-sm text-slate-100 leading-relaxed">
                  {activeLightbox.creation.prompt}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-500/20">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt(activeLightbox.creation)}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-[#12193d] px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-400/50 cursor-pointer"
                  >
                    {copiedId === activeLightbox.creation.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied Prompt</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Prompt</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload(activeLightbox.dataUrl, activeLightbox.creation.id)
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-[#12193d] px-3 py-1.5 text-xs text-slate-200 hover:border-cyan-400/50 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = activeLightbox.creation;
                      setActiveLightbox(null);
                      onOpenStudio(c.prompt, c.stylePreset, c.aspectRatio);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-[#12193d] px-3 py-1.5 text-xs text-cyan-200 hover:border-cyan-400/50 cursor-pointer"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Remix in Studio</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSendToChat(activeLightbox.creation, activeLightbox.dataUrl)
                    }
                    disabled={sendingId === activeLightbox.creation.id}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:from-purple-500 hover:to-indigo-500 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingId === activeLightbox.creation.id ? 'Sending...' : 'Send to Active Chat'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = activeLightbox.creation;
                      setActiveLightbox(null);
                      void onDeleteCreation(c);
                    }}
                    className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-rose-300 hover:bg-rose-900/60 cursor-pointer"
                    title="Delete Image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
