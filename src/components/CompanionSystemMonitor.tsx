import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { MemoryCategory, MemoryNode, SystemErrorLog } from '../types';

interface CompanionSystemMonitorProps {
  memoryCount: number;
  memories?: MemoryNode[];
  onSelectView?: (view: 'dashboard' | 'memory') => void;
  isCloudSyncing: boolean;
  isGoogleLinked: boolean;
  userEmail?: string | null;
  lastSyncedAtMs?: number | null;
  onForceSync?: () => Promise<void>;
  errorLogs: SystemErrorLog[];
  onClearErrors?: () => void;
  activeError?: string | null;
  isOnline?: boolean;
  apiDelayMs?: number | null;
  ttftMs?: number | null;
}

export const CompanionSystemMonitor: React.FC<CompanionSystemMonitorProps> = ({
  memoryCount,
  memories = [],
  onSelectView,
  isCloudSyncing,
  isGoogleLinked,
  userEmail,
  lastSyncedAtMs,
  onForceSync,
  errorLogs,
  onClearErrors,
  activeError,
  isOnline = true,
  apiDelayMs,
  ttftMs,
}) => {
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingLatencyMs, setPingLatencyMs] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [tickerAnimating, setTickerAnimating] = useState(false);

  // Trigger ticker bump animation whenever memoryCount increments
  useEffect(() => {
    setTickerAnimating(true);
    const timer = setTimeout(() => setTickerAnimating(false), 600);
    return () => clearTimeout(timer);
  }, [memoryCount]);

  // Run a quick system diagnostic ping (tests /api/health and measures roundtrip)
  const handleRunDiagnostic = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/health');
      const roundTrip = Math.round(performance.now() - start);
      if (res.ok) {
        setPingLatencyMs(roundTrip);
      } else {
        setPingLatencyMs(null);
      }
    } catch {
      setPingLatencyMs(null);
    } finally {
      setIsPinging(false);
    }
  };

  // Convert memoryCount into 3-digit ticker array, e.g. 42 -> ['0', '4', '2']
  const paddedCount = String(Math.max(0, memoryCount)).padStart(3, '0');
  const digits = paddedCount.split('');

  // Count by categories for the ticker sub-bar
  const categoryCounts = memories.reduce<Record<string, number>>((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {});

  const totalErrors = errorLogs.length + (activeError ? 1 : 0);
  const isSystemNominal = totalErrors === 0 && isOnline;

  const formatRelativeSync = (ms?: number | null): string => {
    if (!ms) return 'Awaiting sync';
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="w-full rounded-xl sm:rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-[#070c24]/95 via-[#0a102f]/95 to-[#080d26]/95 p-2 sm:p-3 shadow-[0_0_20px_rgba(0,229,255,0.06)] space-y-2">
        {/* Top Header Bar: Monitor Title, Error Watcher, Sync State, and Memory Ticker */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Section 1: Companion Monitor Branding & Health Watcher */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-cyan-400/35 bg-[#060c22] text-cyan-300 font-display text-[10px] sm:text-xs font-bold tracking-wider uppercase">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Companion System Monitor</span>
            </div>

            {/* Error Telemetry Watcher Pill */}
            <button
              type="button"
              onClick={() => setShowErrorModal(true)}
              title={
                isSystemNominal
                  ? 'All internal systems nominal · 0 errors detected (Click to inspect)'
                  : `${totalErrors} internal warning(s) or alert(s) detected (Click to inspect logs)`
              }
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] sm:text-xs font-mono font-semibold transition-all cursor-pointer ${
                isSystemNominal
                  ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-300 hover:border-emerald-400'
                  : 'border-rose-500/50 bg-rose-950/40 text-rose-300 hover:border-rose-400 animate-pulse'
              }`}
            >
              {isSystemNominal ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">SYS: NOMINAL</span>
                  <span className="sm:hidden">NOMINAL</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
                  <span>
                    SYS: {totalErrors} {totalErrors === 1 ? 'ERR' : 'ERRS'}
                  </span>
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                </>
              )}
            </button>

            {/* Realtime API Delay Watcher */}
            {apiDelayMs !== undefined && apiDelayMs !== null && (
              <div
                title={`Text API Response Delay: ${apiDelayMs}ms${ttftMs ? ` (TTFT: ${ttftMs}ms)` : ''}`}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] sm:text-xs font-mono font-medium ${
                  apiDelayMs > 4000
                    ? 'border-amber-500/40 bg-amber-950/40 text-amber-300'
                    : 'border-cyan-500/30 bg-[#070e28] text-cyan-300'
                }`}
              >
                <Cpu className="w-3 h-3 text-cyan-400" />
                <span className="hidden md:inline text-slate-400">API DELAY:</span>
                <span className="font-bold">{apiDelayMs}ms</span>
                {ttftMs ? (
                  <span className="text-[9px] text-slate-400 hidden lg:inline">({ttftMs}ms TTFT)</span>
                ) : null}
              </div>
            )}
          </div>

          {/* Section 2: Cross-Platform Sync Connection State + Memory Ticker */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
            {/* Cross-Platform Sync Connection Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] sm:text-xs font-mono font-medium transition-colors ${
                !isOnline
                  ? 'border-amber-500/40 bg-amber-950/35 text-amber-300'
                  : isGoogleLinked
                    ? 'border-indigo-400/35 bg-[#0b1338] text-slate-200'
                    : 'border-amber-400/30 bg-[#161226] text-amber-200'
              }`}
            >
              {!isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline">OFFLINE CACHED</span>
                  <span className="md:hidden">OFFLINE</span>
                </>
              ) : isCloudSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  <span className="text-cyan-300 font-semibold">SYNCING...</span>
                </>
              ) : isGoogleLinked ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden md:inline text-slate-300">CLOUD LINK:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    SYNCED
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-300">GUEST / LOCAL</span>
                </>
              )}

              {/* Force Sync Quick Trigger */}
              {isGoogleLinked && onForceSync && (
                <button
                  type="button"
                  onClick={onForceSync}
                  disabled={isCloudSyncing}
                  title={`Force two-way sync across devices (${formatRelativeSync(lastSyncedAtMs)})`}
                  className="ml-1 p-0.5 rounded hover:bg-cyan-500/20 text-cyan-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            {/* Memory Index Counter — Ticker Style */}
            <button
              type="button"
              onClick={() => onSelectView?.('memory')}
              title={`Memory Index: ${memoryCount} Nodes active in Companion's Vault (Click to view vault)`}
              className={`flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-xl border transition-all cursor-pointer group ${
                tickerAnimating
                  ? 'border-cyan-300 bg-cyan-950/60 shadow-[0_0_15px_rgba(0,229,255,0.4)] scale-102'
                  : 'border-cyan-500/35 bg-[#050b1e] hover:border-cyan-400 hover:bg-[#070f2b]'
              }`}
            >
              <div className="flex flex-col text-left">
                <span className="text-[8px] sm:text-[9px] font-display font-semibold text-cyan-300/80 uppercase tracking-widest leading-none">
                  MEM INDEX
                </span>
                <span className="text-[9px] text-slate-400 hidden lg:inline leading-tight">
                  TICKER
                </span>
              </div>

              {/* Ticker Segmented Digit Cells */}
              <div className="flex items-center gap-0.5 font-mono">
                {digits.map((digit, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex h-5 w-4 sm:h-6 sm:w-5 items-center justify-center rounded bg-[#030614] border border-cyan-400/40 text-cyan-300 font-bold text-xs sm:text-sm font-mono-tabular shadow-[inset_0_1px_3px_rgba(0,0,0,0.9),0_0_6px_rgba(0,229,255,0.25)] transition-transform ${
                      tickerAnimating ? 'text-white scale-110' : ''
                    }`}
                  >
                    {digit}
                  </span>
                ))}
              </div>

              <span className="text-[9px] sm:text-[10px] font-mono text-cyan-200/90 font-medium group-hover:text-cyan-100">
                NODES
              </span>
            </button>

            {/* Expand / Collapse Details Toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              aria-label={isExpanded ? 'Collapse Telemetry Deck' : 'Expand Telemetry Deck'}
              className="p-1 rounded-lg border border-indigo-400/25 bg-[#060b1e] text-slate-400 hover:text-cyan-300 hover:border-cyan-400/40 transition-colors cursor-pointer"
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Expanded Telemetry Deck: Categories Breakdown, Live Ping Latency, Diagnostics */}
        {isExpanded && (
          <div className="pt-2 border-t border-indigo-500/20 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            {/* Col 1: Memory Index Breakdown */}
            <div className="rounded-lg border border-indigo-400/20 bg-[#060a1f] p-2 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                <span className="font-semibold uppercase">Memory Index Breakdown</span>
                <span className="text-slate-400">{memoryCount} Total</span>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                <span className="rounded bg-indigo-950/60 border border-indigo-500/30 px-1.5 py-0.5 text-indigo-300">
                  DIR: {categoryCounts['directive'] || 0}
                </span>
                <span className="rounded bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 text-cyan-300">
                  DYN: {categoryCounts['dynamic'] || 0}
                </span>
                <span className="rounded bg-purple-950/60 border border-purple-500/30 px-1.5 py-0.5 text-purple-300">
                  PREF: {categoryCounts['preference'] || 0}
                </span>
                <span className="rounded bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300">
                  HIST: {categoryCounts['shared_history'] || 0}
                </span>
                <span className="rounded bg-slate-900 border border-slate-700 px-1.5 py-0.5 text-slate-300">
                  PERS: {categoryCounts['personal'] || 0}
                </span>
              </div>
            </div>

            {/* Col 2: Sync Telemetry & Latency */}
            <div className="rounded-lg border border-indigo-400/20 bg-[#060a1f] p-2 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                <span className="font-semibold uppercase">Cross-Platform Sync Telemetry</span>
                <span className="text-slate-400">
                  {lastSyncedAtMs ? formatRelativeSync(lastSyncedAtMs) : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span>Account:</span>
                <span className="truncate max-w-[140px] text-emerald-300">
                  {userEmail || 'Local Guest'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span>Health Ping:</span>
                <span className="text-cyan-300 font-semibold">
                  {pingLatencyMs !== null ? `${pingLatencyMs}ms` : 'Not tested'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-300 font-mono">
                <span>Text Stream Delay:</span>
                <span className="text-cyan-300 font-semibold">
                  {apiDelayMs !== undefined && apiDelayMs !== null ? `${apiDelayMs}ms` : 'Nominal'}
                  {ttftMs ? ` (${ttftMs}ms TTFT)` : ''}
                </span>
              </div>
            </div>

            {/* Col 3: Diagnostic Self-Test & Error Inspect Actions */}
            <div className="rounded-lg border border-indigo-400/20 bg-[#060a1f] p-2 flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[10px] font-mono font-semibold uppercase text-cyan-300">
                  Diagnostics Radar
                </div>
                <div className="text-[10px] text-slate-400">
                  {totalErrors === 0 ? 'Zero internal errors logged' : `${totalErrors} logged issue(s)`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRunDiagnostic}
                  disabled={isPinging}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900/50 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
                  <span>{isPinging ? 'Testing...' : 'Ping'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowErrorModal(true)}
                  className="rounded-lg border border-indigo-400/35 bg-indigo-950/40 px-2.5 py-1 text-[11px] font-semibold text-indigo-200 hover:bg-indigo-900/50 transition-colors cursor-pointer"
                >
                  Logs
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Internal Error Diagnostic Terminal Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-cyan-400/40 bg-[#070b22] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2 text-cyan-300">
                <Terminal className="w-5 h-5 text-cyan-400" />
                <h3 className="font-display text-sm sm:text-base font-bold text-white tracking-wide">
                  Companion Internal Error Telemetry Watcher
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowErrorModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Telemetry Summary */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-500/30 bg-[#040819] text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    totalErrors === 0 ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'
                  }`}
                />
                <span className="font-semibold text-slate-200">
                  {totalErrors === 0
                    ? 'All Internal Watchers Nominal'
                    : `${totalErrors} Internal Event(s) Captured`}
                </span>
              </div>
              <span className="text-[11px] font-mono text-cyan-300">
                API · Voice · Sync · Engine
              </span>
            </div>

            {/* Error Log Entries List */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
              {activeError && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-2.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-rose-300 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      ACTIVE RUNTIME ALERT
                    </span>
                    <span className="text-slate-400 text-[10px]">Active Now</span>
                  </div>
                  <p className="text-rose-200 text-xs break-all leading-relaxed">{activeError}</p>
                </div>
              )}

              {errorLogs.length === 0 && !activeError ? (
                <div className="py-8 text-center text-slate-400 space-y-1.5">
                  <ShieldCheck className="w-8 h-8 text-emerald-400/70 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">No Internal Errors Detected</p>
                  <p className="text-xs text-slate-400">
                    Gemini AI connection, voice pipeline, and Firestore cross-platform sync are all running cleanly.
                  </p>
                </div>
              ) : (
                errorLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-lg border p-2.5 space-y-1 ${
                      log.severity === 'error'
                        ? 'border-rose-500/30 bg-rose-950/20 text-rose-200'
                        : 'border-amber-500/30 bg-amber-950/20 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="uppercase font-bold tracking-wider text-cyan-300">
                        [{log.category}]
                      </span>
                      <span className="text-slate-400">
                        {new Date(log.timestampMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed break-words">{log.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-indigo-500/20">
              <button
                type="button"
                onClick={handleRunDiagnostic}
                disabled={isPinging}
                className="flex items-center gap-1.5 rounded-xl border border-cyan-400/35 bg-cyan-950/35 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                <span>{isPinging ? 'Running Self-Check...' : 'Test Network & API'}</span>
              </button>

              <div className="flex items-center gap-2">
                {errorLogs.length > 0 && onClearErrors && (
                  <button
                    type="button"
                    onClick={onClearErrors}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clear Logs</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowErrorModal(false)}
                  className="rounded-xl bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
