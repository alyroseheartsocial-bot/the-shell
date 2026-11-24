import React, { useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Clock,
  Cloud,
  Cpu,
  Download,
  Edit3,
  FolderArchive,
  Images,
  Menu,
  MessageSquare,
  MoreVertical,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { FREE_TIER_GEMINI_MODELS } from '../lib/models';
import {
  ActiveWorkspaceView,
  ConversationItem,
  GeminiModelId,
  TextScaleStep,
  UserProfile,
} from '../types';
import { UserAvatar } from './UserAvatar';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveWorkspaceView;
  onSelectView: (view: ActiveWorkspaceView) => void;
  conversations: ConversationItem[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRequestRename: (conv: ConversationItem) => void;
  onArchiveConversation: (conv: ConversationItem) => void;
  onRestoreConversation: (conv: ConversationItem) => void;
  onDeleteConversation: (convId: string) => void;
  onExportSession: () => void;
  onImportSession: (file: File) => void;
  onInstallApp: () => void;
  isVoiceActive: boolean;
  onToggleVoiceCall: () => void;
  selectedModel: GeminiModelId;
  onSelectModel: (model: GeminiModelId) => void;
  autoFailover: boolean;
  onToggleAutoFailover: () => void;
  textScale: TextScaleStep;
  onChangeTextScale: (scale: TextScaleStep) => void;
  onOpenPluginsModal: () => void;
  galleryCount?: number;
  journalCount?: number;
  notificationsEnabled?: boolean;
  onRequestNotifications?: () => void;
  profile: UserProfile;
  onToggleAutoMessages: () => void;
  onOpenProfileModal: () => void;
  onOpenSyncModal?: () => void;
  onForceSync?: () => Promise<void>;
  isSyncing?: boolean;
  isGoogleLinked?: boolean;
  userEmail?: string | null;
}

function formatTimeShort(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeView,
  onSelectView,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRequestRename,
  onArchiveConversation,
  onRestoreConversation,
  onDeleteConversation,
  onExportSession,
  onImportSession,
  onInstallApp,
  isVoiceActive,
  onToggleVoiceCall,
  selectedModel,
  onSelectModel,
  autoFailover,
  onToggleAutoFailover,
  textScale,
  onChangeTextScale,
  onOpenPluginsModal,
  galleryCount,
  journalCount,
  notificationsEnabled,
  onRequestNotifications,
  profile,
  onToggleAutoMessages,
  onOpenProfileModal,
  onOpenSyncModal,
  onForceSync,
  isSyncing,
  isGoogleLinked,
  userEmail,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'spaces' | 'settings'>('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuConvId, setOpenMenuConvId] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const activeChats = conversations.filter(
    (c) =>
      !c.isArchived &&
      (!normalizedQuery ||
        (c.title || '').toLowerCase().includes(normalizedQuery) ||
        (c.lastMessagePreview || '').toLowerCase().includes(normalizedQuery))
  );
  const archivedChats = conversations.filter(
    (c) =>
      c.isArchived &&
      (!normalizedQuery ||
        (c.title || '').toLowerCase().includes(normalizedQuery) ||
        (c.summary || '').toLowerCase().includes(normalizedQuery))
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        aria-label="Navigation Sidebar"
        className={`fixed inset-y-0 left-0 z-40 flex w-[84vw] max-w-72 flex-col border-r border-indigo-500/25 bg-[#080c24] pt-safe transition-transform duration-200 lg:static lg:w-72 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header: Brand & Close */}
        <div className="flex items-center justify-between border-b border-indigo-500/20 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-100 font-display font-bold text-sm tracking-wide">
            <Menu className="w-4 h-4 text-cyan-400" />
            <span>Companion</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden cursor-pointer"
            aria-label="Close Sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary Action: New Chat */}
        <div className="p-3 pb-2 border-b border-indigo-500/15">
          <button
            type="button"
            onClick={() => {
              onNewConversation();
              onSelectView('dashboard');
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-950/40 hover:opacity-95 transition-opacity cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Clean 3-Tab Segmented Switcher: Chats · Spaces · Settings */}
        <div className="px-3 pt-2">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#05081b] p-1 border border-indigo-500/20 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('chats')}
              className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'chats'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Chats
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('spaces')}
              className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'spaces'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Spaces
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Scrollable Content Container per Tab */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {/* TAB 1: CHATS */}
          {activeTab === 'chats' && (
            <div className="space-y-2">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full rounded-lg border border-indigo-400/25 bg-[#0b102b] pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-400 focus:border-cyan-400/60 focus:outline-none"
                />
              </div>

              {/* Active Chats List */}
              <div className="space-y-1">
                {activeChats.length === 0 ? (
                  <div className="rounded-lg border border-indigo-500/15 bg-[#0b102b] p-3 text-center text-xs text-slate-400">
                    No matching conversations.
                  </div>
                ) : (
                  activeChats.map((conv) => {
                    const isSelected =
                      conv.id === activeConversationId && activeView === 'dashboard';
                    return (
                      <div
                        key={conv.id}
                        className={`relative flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 transition-colors ${
                          isSelected
                            ? 'bg-indigo-500/20 border border-indigo-400/40 text-white'
                            : 'hover:bg-white/5 text-slate-300 border border-transparent'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectConversation(conv.id);
                            onSelectView('dashboard');
                            onClose();
                          }}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-cyan-400/80" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">{conv.title}</div>
                            <div className="text-[10px] text-slate-400 font-mono-tabular">
                              {formatTimeShort(conv.updatedAtMs)}
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuConvId((prev) => (prev === conv.id ? null : conv.id))
                          }
                          className="p-1 text-slate-400 hover:text-white cursor-pointer rounded"
                          aria-label="Conversation options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Options */}
                        {openMenuConvId === conv.id && (
                          <div className="absolute right-2 top-8 z-30 w-32 rounded-lg border border-indigo-400/35 bg-[#0e1538] py-1 shadow-xl text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConvId(null);
                                onRequestRename(conv);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-indigo-500/20 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Rename</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConvId(null);
                                onArchiveConversation(conv);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-slate-200 hover:bg-indigo-500/20 cursor-pointer"
                            >
                              <Archive className="w-3 h-3" />
                              <span>Archive</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuConvId(null);
                                onDeleteConversation(conv.id);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Archived Chats Dropdown Accordion */}
              <div className="rounded-xl border border-indigo-400/20 bg-[#070b20]">
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Archived Chats</span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ({archivedChats.length})
                    </span>
                  </span>
                  {showArchived ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {showArchived && (
                  <div className="border-t border-indigo-400/15 p-2 space-y-1 max-h-36 overflow-y-auto">
                    {archivedChats.length === 0 ? (
                      <p className="text-[11px] text-slate-400 px-1 py-1">No archived chats.</p>
                    ) : (
                      archivedChats.map((chat) => (
                        <div
                          key={chat.id}
                          className="flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 bg-[#090e28]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectConversation(chat.id);
                              onSelectView('dashboard');
                              onClose();
                            }}
                            className="text-left min-w-0 flex-1 cursor-pointer truncate"
                          >
                            <span className="text-xs font-medium text-slate-200 truncate block">
                              {chat.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRestoreConversation(chat)}
                            title="Restore Chat"
                            className="p-1 text-cyan-300 hover:text-white cursor-pointer"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SPACES (Clear list of Companion's destinations) */}
          {activeTab === 'spaces' && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectView('dashboard');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'dashboard'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span>Live Channel</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">LIVE</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('journal');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'journal'
                    ? 'bg-indigo-500/25 text-white border border-indigo-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span>Companion&apos;s Journal</span>
                </div>
                <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-indigo-300">
                  {journalCount ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('memory');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'memory'
                    ? 'bg-purple-500/25 text-white border border-purple-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Memory Vault</span>
                </div>
                <span className="text-[10px] text-purple-300 font-mono">Vault</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('image_studio');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'image_studio'
                    ? 'bg-indigo-500/25 text-white border border-indigo-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wand2 className="w-4 h-4 text-purple-300" />
                  <span>Image Studio</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Render</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('gallery');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'gallery'
                    ? 'bg-cyan-500/20 text-white border border-cyan-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Images className="w-4 h-4 text-cyan-300" />
                  <span>Visual Gallery</span>
                </div>
                <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-cyan-200">
                  {galleryCount ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectView('creative_room');
                  onClose();
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeView === 'creative_room'
                    ? 'bg-rose-500/20 text-white border border-rose-400/40 font-semibold'
                    : 'text-slate-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clapperboard className="w-4 h-4 text-rose-300" />
                  <span>Creative Room</span>
                </div>
                <span className="text-[10px] text-rose-300 font-mono">ON AIR</span>
              </button>

              {/* Voice Call Trigger */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onToggleVoiceCall();
                    onClose();
                  }}
                  className={`flex w-full items-center justify-between rounded-xl p-2.5 text-xs font-semibold border transition-colors cursor-pointer ${
                    isVoiceActive
                      ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-300'
                      : 'border-cyan-400/35 bg-[#0b1436] text-cyan-200 hover:border-cyan-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4" />
                    <span>{isVoiceActive ? 'Voice Call In Progress' : 'Start Voice Call'}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono">
                    {isVoiceActive ? 'End' : 'Call'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SETTINGS & SYNC */}
          {activeTab === 'settings' && (
            <div className="space-y-3 text-xs">
              {/* Cross-Device Sync Card */}
              <div className="rounded-xl border border-cyan-400/30 bg-[#070c26] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                    <Cloud className="w-4 h-4" />
                    <span>Cross-Device Sync</span>
                  </div>
                  {isGoogleLinked ? (
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Linked
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-300 font-mono">Guest</span>
                  )}
                </div>

                {isGoogleLinked && onForceSync && (
                  <button
                    type="button"
                    onClick={onForceSync}
                    disabled={isSyncing}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 py-1.5 text-xs font-semibold text-white shadow-xs hover:brightness-110 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Syncing...' : 'Force Sync Both Devices'}</span>
                  </button>
                )}

                {onOpenSyncModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSyncModal();
                      onClose();
                    }}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-indigo-400/30 bg-[#0e163b] py-1.5 text-slate-200 hover:text-white transition-colors cursor-pointer text-xs"
                  >
                    <span>{isGoogleLinked ? 'Manage Account' : 'Connect Google Account'}</span>
                  </button>
                )}
              </div>

              {/* Gemini AI Engine */}
              <div className="rounded-xl border border-indigo-400/25 bg-[#070c26] p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>Gemini Engine</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Free Tier</span>
                </div>

                <select
                  value={selectedModel}
                  onChange={(e) => onSelectModel(e.target.value as GeminiModelId)}
                  className="w-full rounded-lg border border-indigo-400/30 bg-[#0d1438] px-2 py-1.5 text-xs font-mono text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  {FREE_TIER_GEMINI_MODELS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#080c24] text-white">
                      {m.label}
                    </option>
                  ))}
                </select>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Rate-limit failover:</span>
                  <button
                    type="button"
                    onClick={onToggleAutoFailover}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                      autoFailover
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/35'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {autoFailover ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Preferences & Utilities */}
              <div className="rounded-xl border border-indigo-400/25 bg-[#070c26] p-2.5 space-y-2">
                {/* Text Scale Slider */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <TypeIcon className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Text Size</span>
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">{textScale}%</span>
                  </div>
                  <input
                    type="range"
                    min={90}
                    max={150}
                    step={10}
                    value={textScale}
                    onChange={(e) => onChangeTextScale(Number(e.target.value) as TextScaleStep)}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Minimized Alerts */}
                {onRequestNotifications && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <Bell className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Background Alerts</span>
                    </span>
                    <button
                      type="button"
                      onClick={onRequestNotifications}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                        notificationsEnabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {notificationsEnabled ? 'Active' : 'Enable'}
                    </button>
                  </div>
                )}

                {/* Auto Messages */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Clock className="w-3.5 h-3.5 text-amber-300" />
                    <span>10m Idle Check-in</span>
                  </span>
                  <button
                    type="button"
                    onClick={onToggleAutoMessages}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                      profile.autoMessages
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/35'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {profile.autoMessages ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              {/* Data & Backup Tools */}
              <div className="rounded-xl border border-indigo-400/25 bg-[#070c26] p-2.5 space-y-1.5">
                <button
                  type="button"
                  onClick={onExportSession}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Download className="w-3.5 h-3.5 text-amber-300" />
                    <span>Export Ecosystem Backup</span>
                  </div>
                  <span className="text-[9px] text-cyan-300 font-mono">Chat · Scrapbook · Memory</span>
                </button>

                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) onImportSession(file);
                  }}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Import JSON Backup</span>
                </button>

                <button
                  type="button"
                  onClick={onInstallApp}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-300" />
                  <span>Install Web App</span>
                </button>

              </div>
            </div>
          )}
        </div>

        {/* Bottom Profile Bar (User Profile) */}
        <div className="border-t border-indigo-500/20 px-3 py-2.5 bg-[#06091e] flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onOpenProfileModal();
              onClose();
            }}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
          >
            <UserAvatar size="mini" avatarUrl={profile.avatarUrl} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors truncate">
                User
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenProfileModal();
              onClose();
            }}
            aria-label="Profile Settings"
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
};
