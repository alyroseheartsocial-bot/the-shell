import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Images,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { loadAssetDataUrl } from '../lib/imageVault';
import { AspectRatioOption, VisualCreation } from '../types';

interface ImageStudioViewProps {
  creations: VisualCreation[];
  initialPrompt?: string;
  initialStyle?: string;
  initialRatio?: AspectRatioOption;
  onGenerateVisual: (
    prompt: string,
    stylePreset: string,
    aspectRatio: AspectRatioOption,
    signal?: AbortSignal
  ) => Promise<{ creation: VisualCreation; dataUrl: string; notice: string | null }>;
  onSendVisualToChat: (creation: VisualCreation, dataUrl: string) => Promise<void>;
  onDeleteCreation: (creation: VisualCreation) => Promise<void>;
  onDeleteFallbackCreations: () => Promise<number>;
  onBackToChat: () => void;
  onOpenGallery?: () => void;
}

const ASPECT_RATIOS: AspectRatioOption[] = ['1:1', '16:9', '9:16', '3:4', '4:3'];

export const ImageStudioView: React.FC<ImageStudioViewProps> = ({
  creations,
  initialPrompt,
  // initialStyle is still accepted via props for compatibility with App.tsx,
  // but style presets were removed: prompts carry their own style, so it is
  // intentionally not destructured/used here.
  initialRatio,
  onGenerateVisual,
  onSendVisualToChat,
  onDeleteCreation,
  onDeleteFallbackCreations,
  onBackToChat,
  onOpenGallery,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>(initialRatio || '1:1');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [activePreview, setActivePreview] = useState<{
    creation: VisualCreation;
    dataUrl: string;
  } | null>(null);
  const [studioNotice, setStudioNotice] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});

  const abortCtrlRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const hydratedIdsRef = useRef<Set<string>>(new Set());

  // Component lifecycle: clean disposal of any pending generation jobs on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortCtrlRef.current) {
        abortCtrlRef.current.abort();
        abortCtrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialPrompt !== undefined) setPrompt(initialPrompt);
    if (initialRatio && ASPECT_RATIOS.includes(initialRatio)) setAspectRatio(initialRatio);
  }, [initialPrompt, initialRatio]);

  // Memory-safe asset hydration (loads only visible/recent items without slamming the vault)
  useEffect(() => {
    let cancelled = false;
    async function hydrateAssets() {
      // Prioritize the latest creation
      const visibleItems = creations.slice(0, 15);
      const updates: Record<string, string> = {};

      for (const item of visibleItems) {
        if (!hydratedIdsRef.current.has(item.assetId)) {
          hydratedIdsRef.current.add(item.assetId);
          const url = await loadAssetDataUrl(item.assetId);
          if (url) updates[item.assetId] = url;
        }
      }

      if (!cancelled && isMountedRef.current) {
        if (Object.keys(updates).length > 0) {
          setAssetMap((prev) => ({ ...prev, ...updates }));
        }

        // Set default preview if none is active
        if (!activePreview && creations.length > 0) {
          const first = creations[0];
          const firstUrl = updates[first.assetId] || assetMap[first.assetId];
          if (firstUrl) {
            setActivePreview({ creation: first, dataUrl: firstUrl });
          } else {
            void loadAssetDataUrl(first.assetId).then((loaded) => {
              if (loaded && !cancelled && isMountedRef.current) {
                setActivePreview({ creation: first, dataUrl: loaded });
              }
            });
          }
        }
      }
    }

    void hydrateAssets();
    return () => {
      cancelled = true;
    };
  }, [creations, activePreview, assetMap]);

  // Failed renders are the ones whose loaded asset is an SVG data URL (the
  // server's geometric fallback). This view hydrates the recent creations'
  // URLs into assetMap, so the count reflects the loaded set; the App-level
  // handler sweeps the full creations list and only ever removes SVGs.
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

  const handleEnhance = async () => {
    if (isEnhancing) return;
    setIsEnhancing(true);
    setStudioError(null);
    try {
      const res = await fetch('/api/chat/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt, target: 'image' }),
      });
      const data = await res.json();
      if (data.enhanced && isMountedRef.current) {
        setPrompt(data.enhanced);
      }
    } catch {
      // ignore
    } finally {
      if (isMountedRef.current) {
        setIsEnhancing(false);
      }
    }
  };

  const handleCancelGeneration = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setIsGenerating(false);
    setStudioNotice('Visual synthesis cancelled. Canvas reset for next request.');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    // Clean disposal of any previous pending generation coroutines
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    setIsGenerating(true);
    setStudioError(null);
    setStudioNotice(null);

    try {
      const result = await onGenerateVisual(
        prompt.trim(),
        'Prompt Only',
        aspectRatio,
        abortCtrl.signal
      );

      if (!isMountedRef.current || abortCtrl.signal.aborted) return;

      // Update asset map and preview stage cleanly
      setAssetMap((prev) => ({ ...prev, [result.creation.assetId]: result.dataUrl }));
      setActivePreview({ creation: result.creation, dataUrl: result.dataUrl });
      if (result.notice) setStudioNotice(result.notice);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setStudioError(err instanceof Error ? err.message : 'Visual synthesis failed.');
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
      if (abortCtrlRef.current === abortCtrl) {
        abortCtrlRef.current = null;
      }
    }
  };

  const handleDownload = (dataUrl: string, id: string) => {
    const ext = dataUrl.startsWith('data:image/svg') ? 'svg' : 'png';
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `companion-${id}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-indigo-400/25 bg-[var(--bg-panel)] p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-500/20 pb-3.5">
        <div className="flex items-center gap-2.5">
          <ImageIcon className="w-5 h-5 text-cyan-300" />
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-white">
              Companion · Image Studio
            </h2>
            <p className="text-xs text-slate-400">
              Dedicated visual creation lab wired directly to your active session.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenGallery && (
            <button
              type="button"
              onClick={onOpenGallery}
              className="flex items-center gap-1.5 rounded-lg border border-purple-400/40 bg-purple-500/15 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/25 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Images className="w-3.5 h-3.5" />
              <span>View Gallery ({creations.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBackToChat}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Chat</span>
          </button>
        </div>
      </div>

      {/* Creation Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Controls Column */}
        <form onSubmit={handleCreate} className="lg:col-span-5 flex flex-col gap-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-200">Visual Concept</label>
              <button
                type="button"
                onClick={handleEnhance}
                disabled={isEnhancing}
                className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>{isEnhancing ? 'Refining...' : 'Enhance Prompt'}</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={950}
              placeholder="Describe the scene: a garden at sunset, a portrait, a cozy room, a mountain trail..."
              className="w-full rounded-xl border border-indigo-400/30 bg-[#0c1333] p-3 text-xs sm:text-sm text-white placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">Aspect Ratio</label>
            <div className="grid grid-cols-5 gap-1.5">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`rounded-lg py-1.5 text-xs font-mono-tabular font-medium transition-colors cursor-pointer ${
                    aspectRatio === ratio
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/60'
                      : 'bg-[#0c1333] text-slate-400 border border-indigo-400/20 hover:text-slate-200'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 px-4 py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:opacity-95 disabled:opacity-45 cursor-pointer whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Visual...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Visual</span>
                </>
              )}
            </button>

            {isGenerating && (
              <button
                type="button"
                onClick={handleCancelGeneration}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 py-2 text-xs text-rose-300 hover:bg-rose-900/50 cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Cancel &amp; Reset Canvas</span>
              </button>
            )}
          </div>

          {studioError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {studioError}
            </div>
          )}
          {studioNotice && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
              {studioNotice}
            </div>
          )}
        </form>

        {/* Preview Stage Column */}
        <div className="lg:col-span-7 flex flex-col rounded-xl border border-indigo-400/25 bg-[#060919] p-3.5 min-h-[280px]">
          {activePreview ? (
            <div className="flex flex-col h-full justify-between gap-3">
              <div className="flex-1 flex items-center justify-center overflow-hidden rounded-lg bg-[#040612] max-h-80">
                <img
                  src={activePreview.dataUrl}
                  alt={activePreview.creation.prompt}
                  referrerPolicy="no-referrer"
                  className="max-h-80 w-auto object-contain rounded-lg"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-xs text-slate-300 truncate max-w-md">
                  {activePreview.creation.prompt}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleDownload(activePreview.dataUrl, activePreview.creation.id)
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-indigo-400/35 bg-[#10173a] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/60 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSendVisualToChat(activePreview.creation, activePreview.dataUrl)
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send to Companion</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
              <ImageIcon className="w-8 h-8 text-cyan-400/50" />
              <p className="text-xs sm:text-sm font-medium text-slate-300">
                Studio Canvas Ready
              </p>
              <p className="text-xs max-w-xs">
                Enter a visual prompt on the left to generate custom artwork and share it directly into your thread with Companion.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Vault Gallery */}
      {creations.length > 0 && (
        <div className="space-y-2.5 pt-2 border-t border-indigo-500/20">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xs font-semibold tracking-wider text-slate-300">
              SAVED VISUAL CREATIONS ({creations.length})
            </h3>
            {failedRenderCount > 0 && (
              <button
                type="button"
                onClick={() => void handleDeleteFailedRenders()}
                className="flex items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-600/20 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-600/35 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete failed renders ({failedRenderCount})</span>
              </button>
            )}
            {onOpenGallery && (
              <button
                type="button"
                onClick={onOpenGallery}
                className="text-xs font-medium text-cyan-300 hover:underline cursor-pointer"
              >
                Open Full Gallery &rarr;
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {creations.map((item) => {
              const url = assetMap[item.assetId];
              return (
                <div
                  key={item.id}
                  className="group relative rounded-xl border border-indigo-400/25 bg-[#0b102b] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => url && setActivePreview({ creation: item, dataUrl: url })}
                    className="block w-full aspect-square bg-[#060919] cursor-pointer"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={item.prompt}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                        Vault Asset
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCreation(item)}
                    title="Delete visual"
                    className="absolute top-1.5 right-1.5 rounded-md bg-black/70 p-1 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-300 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
