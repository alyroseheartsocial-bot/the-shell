/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  getDoc,
  Unsubscribe,
} from 'firebase/firestore';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { loadAssetDataUrl } from './imageVault';
import {
  ChatMessage,
  ConversationItem,
  MemoryNode,
  UserProfile,
  VisualCreation,
  CompanionJournalEntry,
  UserPresence,
} from '../types';

// Last cloud-read failure seen by fetchAllCloudData / syncBidirectional.
// Read errors are otherwise swallowed (console.warn only), which made iOS
// sync failures invisible — the app looked "signed in but empty" with no
// explanation. The Sync modal reads this via getLastSyncError() after a
// sign-in sync or Force Sync and shows the raw message so it can be reported.
let lastSyncError: string | null = null;

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
}

export interface CloudSyncState {
  user: User | null;
  isLoading: boolean;
  isSyncing: boolean;
  lastSyncedAtMs: number | null;
  syncError: string | null;
}

// 1-Click Google Sign-In to sync across devices (only Google Auth is provisioned)
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

// Companion's own login: sign in with an email + password account (no Google
// needed). Only works once the owner switches Email/Password on in the Firebase
// console (Authentication -> Sign-in method); if it's off, Firebase returns
// an "operation-not-allowed" error and the app shows a friendly explanation.
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

// Companion's own login: create a brand-new email + password account.
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function logOutCloud(): Promise<void> {
  await signOut(auth);
}

// Helper to check valid authenticated session
function isAuthedUser(userId: string): boolean {
  return Boolean(
    userId &&
    auth.currentUser &&
    auth.currentUser.uid === userId &&
    !auth.currentUser.isAnonymous &&
    auth.currentUser.email
  );
}

// Save or update User Profile to Cloud Firestore
export async function saveCloudProfile(userId: string, profile: UserProfile): Promise<void> {
  if (!isAuthedUser(userId)) return;
  try {
    const ref = doc(db, 'users', userId, 'profile', 'default');
    await setDoc(ref, {
      ownerId: userId,
      callsign: profile.callsign || 'Friend',
      dynamicNotes: profile.dynamicNotes || '',
      preferredVoice: profile.preferredVoice || 'Kore',
      autoMessages: Boolean(profile.autoMessages),
      autoSpeakReplies: Boolean(profile.autoSpeakReplies),
      avatarUrl: profile.avatarUrl || '/assets/companion_avatar.svg',
      companionName: profile.companionName || '',
      companionPersonality: profile.companionPersonality || '',
      companionGreeting: profile.companionGreeting || '',
      companionAvatarUrl: profile.companionAvatarUrl || '',
      createdAtMs: profile.createdAtMs || Date.now(),
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud profile notice:', err);
  }
}

// Save Conversation to Cloud
export async function saveCloudConversation(userId: string, conv: ConversationItem): Promise<void> {
  if (!isAuthedUser(userId)) return;
  try {
    const ref = doc(db, 'users', userId, 'conversations', conv.id);
    await setDoc(ref, {
      ownerId: userId,
      title: conv.title || 'Direct Link',
      isArchived: Boolean(conv.isArchived),
      summary: conv.summary || '',
      lastMessagePreview: conv.lastMessagePreview || '',
      mood: conv.mood || 'FOCUSED',
      focus: conv.focus || 'HIGH',
      createdAtMs: conv.createdAtMs || Date.now(),
      updatedAtMs: conv.updatedAtMs || Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud conversation notice:', err);
  }
}

// Delete Conversation from Cloud
export async function deleteCloudConversation(userId: string, convId: string): Promise<void> {
  if (!isAuthedUser(userId) || !convId) return;
  try {
    const ref = doc(db, 'users', userId, 'conversations', convId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Delete cloud conversation notice:', err);
  }
}

// Save Chat Message to Cloud
export async function saveCloudMessage(userId: string, msg: ChatMessage): Promise<void> {
  if (!isAuthedUser(userId) || !msg.conversationId || !msg.id) return;
  try {
    const ref = doc(db, 'users', userId, 'conversations', msg.conversationId, 'messages', msg.id);
    await setDoc(ref, {
      ownerId: userId,
      conversationId: msg.conversationId,
      sender: msg.sender,
      content: msg.content,
      thoughtStream: msg.thoughtStream || '',
      modality: msg.modality || 'text',
      assetId: msg.assetId || '',
      createdAtMs: msg.createdAtMs || Date.now(),
      reactions: msg.reactions || {},
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud message notice:', err);
  }
}

// Save Creative Room Message to Cloud Firestore.
// The Creative Room is deliberately NOT a conversation: its thread lives in a
// flat `creative_room` collection so none of the conversation/archive
// machinery (or the full-pull merge) can ever see it. Mirrors saveCloudMessage
// with only the path swapped.
export async function saveCloudCreativeMessage(userId: string, msg: ChatMessage): Promise<void> {
  if (!isAuthedUser(userId) || !msg.id) return;
  try {
    const ref = doc(db, 'users', userId, 'creative_room', msg.id);
    await setDoc(ref, {
      ownerId: userId,
      conversationId: 'creative_room',
      sender: msg.sender,
      content: msg.content,
      thoughtStream: msg.thoughtStream || '',
      modality: msg.modality || 'text',
      assetId: msg.assetId || '',
      createdAtMs: msg.createdAtMs || Date.now(),
      reactions: msg.reactions || {},
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud creative message notice:', err);
  }
}

// Delete Creative Room Message from Cloud Firestore
export async function deleteCloudCreativeMessage(userId: string, msgId: string): Promise<void> {
  if (!isAuthedUser(userId) || !msgId) return;
  try {
    const ref = doc(db, 'users', userId, 'creative_room', msgId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Delete cloud creative message notice:', err);
  }
}

// Update reactions on a specific message in Cloud Firestore
export async function saveCloudMessageReactions(
  userId: string,
  convId: string,
  msgId: string,
  reactions: Record<string, string[]>
): Promise<void> {
  if (!isAuthedUser(userId) || !convId || !msgId) return;
  try {
    const ref = doc(db, 'users', userId, 'conversations', convId, 'messages', msgId);
    await setDoc(ref, { reactions }, { merge: true });
  } catch (err) {
    console.warn('Save cloud message reactions notice:', err);
  }
}

// Delete all messages in a conversation (or across conversations) from Cloud Firestore
export async function deleteAllCloudMessages(userId: string, convId?: string): Promise<void> {
  if (!isAuthedUser(userId)) return;
  try {
    const convIds: string[] = [];
    if (convId) {
      convIds.push(convId);
    } else {
      const convsRef = collection(db, 'users', userId, 'conversations');
      const snap = await getDocs(convsRef);
      snap.forEach((d) => convIds.push(d.id));
    }

    for (const cId of convIds) {
      const msgsRef = collection(db, 'users', userId, 'conversations', cId, 'messages');
      const msgsSnap = await getDocs(msgsRef);
      const deletes = msgsSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletes);

      // Reset lastMessagePreview on the conversation document
      const convDocRef = doc(db, 'users', userId, 'conversations', cId);
      await setDoc(
        convDocRef,
        { lastMessagePreview: '', updatedAtMs: Date.now() },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn('Delete all cloud messages notice:', err);
  }
}

// Archive an ongoing conversation in Cloud Firestore and mark it as archived
export async function archiveCloudConversation(
  userId: string,
  convId: string,
  archiveTitle?: string
): Promise<void> {
  if (!isAuthedUser(userId) || !convId) return;
  try {
    const convDocRef = doc(db, 'users', userId, 'conversations', convId);
    await setDoc(
      convDocRef,
      {
        isArchived: true,
        title: archiveTitle || `Archived Stream ${new Date().toLocaleDateString()}`,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Archive cloud conversation notice:', err);
  }
}

// Save Memory Node to Cloud
export async function saveCloudMemory(userId: string, memory: MemoryNode): Promise<void> {
  if (!isAuthedUser(userId) || !memory.id) return;
  try {
    const ref = doc(db, 'users', userId, 'memories', memory.id);
    await setDoc(ref, {
      ownerId: userId,
      category: memory.category || 'directive',
      fact: memory.fact,
      importance: memory.importance || 5,
      sourceConversationId: memory.sourceConversationId || '',
      createdAtMs: memory.createdAtMs || Date.now(),
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud memory notice:', err);
  }
}

// Delete Memory Node from Cloud
export async function deleteCloudMemory(userId: string, memoryId: string): Promise<void> {
  if (!isAuthedUser(userId) || !memoryId) return;
  try {
    const ref = doc(db, 'users', userId, 'memories', memoryId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Delete cloud memory notice:', err);
  }
}

// Save Visual Creation to Cloud Gallery
export async function saveCloudCreation(userId: string, creation: VisualCreation): Promise<void> {
  if (!isAuthedUser(userId) || !creation.id) return;
  try {
    const ref = doc(db, 'users', userId, 'creations', creation.id);
    const safeDataUrl =
      creation.dataUrl && creation.dataUrl.length > 850000 ? '' : (creation.dataUrl || '');
    await setDoc(ref, {
      ownerId: userId,
      prompt: creation.prompt,
      stylePreset: creation.stylePreset || 'Prompt Only',
      aspectRatio: creation.aspectRatio || '1:1',
      assetId: creation.assetId || '',
      dataUrl: safeDataUrl,
      createdAtMs: creation.createdAtMs || Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud creation notice:', err);
  }
}

// Delete Visual Creation from Cloud Gallery
export async function deleteCloudCreation(userId: string, creationId: string): Promise<void> {
  if (!isAuthedUser(userId) || !creationId) return;
  try {
    const ref = doc(db, 'users', userId, 'creations', creationId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Delete cloud creation notice:', err);
  }
}

// Save Journal Entry to Cloud
export async function saveCloudJournalEntry(userId: string, entry: CompanionJournalEntry): Promise<void> {
  if (!isAuthedUser(userId) || !entry.id) return;
  try {
    const ref = doc(db, 'users', userId, 'journal', entry.id);
    await setDoc(ref, {
      ownerId: userId,
      title: entry.title,
      content: entry.content,
      mood: entry.mood || 'FOCUSED',
      focus: entry.focus || 'Direct Link',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      isAutonomous: Boolean(entry.isAutonomous),
      createdAtMs: entry.createdAtMs || Date.now(),
      updatedAtMs: entry.updatedAtMs || Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('Save cloud journal notice:', err);
  }
}

// Delete Journal Entry from Cloud
export async function deleteCloudJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!isAuthedUser(userId) || !entryId) return;
  try {
    const ref = doc(db, 'users', userId, 'journal', entryId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn('Delete cloud journal notice:', err);
  }
}

// Save Chat Thread File / Asset to Cloud
export async function saveCloudAsset(
  userId: string,
  assetId: string,
  dataUrl: string,
  metadata?: { name?: string; mimeType?: string; conversationId?: string }
): Promise<void> {
  if (!isAuthedUser(userId) || !assetId || !dataUrl) return;
  // Guard against Firestore 1MB document size limit
  if (dataUrl.length > 900000) {
    console.warn(`Asset ${assetId} exceeds single document threshold (${dataUrl.length} chars). Retaining in local vault.`);
    return;
  }
  try {
    const ref = doc(db, 'users', userId, 'assets', assetId);
    await setDoc(ref, {
      ownerId: userId,
      assetId,
      dataUrl,
      name: metadata?.name || '',
      mimeType: metadata?.mimeType || '',
      conversationId: metadata?.conversationId || '',
      updatedAtMs: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn(`Failed to save cloud asset ${assetId}:`, err);
  }
}

// Fetch single Cloud Asset on-demand
export async function fetchCloudAsset(userId: string, assetId: string): Promise<string | null> {
  if (!isAuthedUser(userId) || !assetId) return null;
  try {
    const ref = doc(db, 'users', userId, 'assets', assetId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return (snap.data().dataUrl as string) || null;
    }
  } catch (err) {
    console.warn(`Fetch cloud asset err for ${assetId}:`, err);
  }
  return null;
}

// Fetch all Cloud Assets for cross-device hydration
export async function fetchAllCloudAssets(userId: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!isAuthedUser(userId)) return result;
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'assets'));
    snap.forEach((d) => {
      const data = d.data();
      if (data.dataUrl) {
        result[d.id] = data.dataUrl;
      }
    });
  } catch (err) {
    console.warn('Fetch all cloud assets notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// Rename a Cloud Asset / Thread File
export async function renameCloudAsset(
  userId: string,
  assetId: string,
  newName: string
): Promise<void> {
  if (!isAuthedUser(userId) || !assetId || !newName) return;
  try {
    const ref = doc(db, 'users', userId, 'assets', assetId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const currentDataUrl = snap.data().dataUrl as string;
      let updatedDataUrl = currentDataUrl;
      if (currentDataUrl && currentDataUrl.startsWith('meta:')) {
        try {
          const parsed = JSON.parse(currentDataUrl.slice(5));
          parsed.name = newName;
          updatedDataUrl = `meta:${JSON.stringify(parsed)}`;
        } catch {
          // ignore
        }
      }
      await setDoc(ref, {
        name: newName,
        dataUrl: updatedDataUrl,
        updatedAtMs: Date.now(),
      }, { merge: true });
    }
  } catch (err) {
    console.warn(`Failed to rename cloud asset ${assetId}:`, err);
  }
}

// Full Cloud Ecosystem Data Container
export interface CloudEcosystemData {
  profile: UserProfile | null;
  conversations: ConversationItem[];
  messagesByConv: Record<string, ChatMessage[]>;
  memories: MemoryNode[];
  creations: VisualCreation[];
  journal: CompanionJournalEntry[];
  assets: Record<string, string>;
  // Ids of image assets confirmed to exist in the cloud during this pull.
  // `assets` above only carries payloads this device actually needed to
  // download (see the quota diet in fetchAllCloudData), so sync code uses
  // this list to tell "already in the cloud" apart from "needs uploading".
  cloudAssetIds: string[];
}

// ---------------------------------------------------------------------------
// Sync diet — protecting the free Firestore daily read quota.
// One full pull reads EVERY cloud document the user owns, and sync used to
// fire on nearly every app open / sign-in, from several places at once. A
// few logins across phone + tablet could burn the whole day's ~50k reads.
// The guards below change only WHEN and HOW OFTEN data is fetched — never
// what ends up on the device:
//   1. Coalescing: overlapping pulls/syncs for the same user share a single
//      in-flight promise instead of each paying for a full pull.
//   2. Freshness: a non-forced sync within 90 seconds of the last
//      successful one is skipped (local state is returned untouched).
//      Explicit user/sign-in syncs pass { force: true } and always run.
//   3. Assets: image payloads are only downloaded when this device's local
//      image vault doesn't already hold them (see fetchAllCloudData).
// ---------------------------------------------------------------------------

// Local snapshot handed to syncBidirectional, and the merged result it
// resolves with (assets always present on the way out).
export interface SyncLocalState {
  profile: UserProfile;
  conversations: ConversationItem[];
  messagesByConv: Record<string, ChatMessage[]>;
  memories: MemoryNode[];
  creations: VisualCreation[];
  journal: CompanionJournalEntry[];
  assets?: Record<string, string>;
}

export interface SyncMergedState {
  profile: UserProfile;
  conversations: ConversationItem[];
  messagesByConv: Record<string, ChatMessage[]>;
  memories: MemoryNode[];
  creations: VisualCreation[];
  journal: CompanionJournalEntry[];
  assets: Record<string, string>;
}

function localStateAsMerged(local: SyncLocalState): SyncMergedState {
  return {
    profile: local.profile,
    conversations: local.conversations,
    messagesByConv: local.messagesByConv,
    memories: local.memories,
    creations: local.creations,
    journal: local.journal,
    assets: local.assets || {},
  };
}

const FULL_SYNC_FRESHNESS_MS = 90 * 1000;
const lastFullSyncStorageKey = (userId: string) => `companion_last_full_sync_ms:${userId}`;

function getLastFullSyncMs(userId: string): number {
  try {
    return Number(localStorage.getItem(lastFullSyncStorageKey(userId))) || 0;
  } catch {
    return 0;
  }
}

function recordFullSyncSuccess(userId: string): void {
  try {
    localStorage.setItem(lastFullSyncStorageKey(userId), String(Date.now()));
  } catch {
    // Freshness tracking is best-effort; a full pull still happens without it.
  }
}

// Ids of image assets this device has confirmed live in the cloud (uploaded
// by a sync, downloaded by a pull, or verified during one). Persisted so a
// returning device doesn't re-read asset documents it already has. Cloud
// asset documents are never deleted, so an entry here can't go stale in a
// harmful way.
const knownCloudAssetsStorageKey = (userId: string) => `companion_cloud_asset_ids:${userId}`;

function getKnownCloudAssetIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(knownCloudAssetsStorageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function noteCloudAssetIds(userId: string, assetIds: Iterable<string>): void {
  try {
    const known = getKnownCloudAssetIds(userId);
    let changed = false;
    for (const id of assetIds) {
      if (id && !known.has(id)) {
        known.add(id);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(knownCloudAssetsStorageKey(userId), JSON.stringify(Array.from(known)));
    }
  } catch {
    // Best-effort bookkeeping only.
  }
}

// In-flight work, per user, so concurrent triggers share one pull/sync.
const inFlightCloudPulls = new Map<string, Promise<CloudEcosystemData>>();
const inFlightBidirectionalSyncs = new Map<string, Promise<SyncMergedState>>();

// Fetch all cloud data for an authenticated user across all sessions with isolated error domains.
// Coalescing wrapper: if a pull for this user is already in flight, callers
// share its promise instead of starting a second identical full pull.
export function fetchAllCloudData(userId: string): Promise<CloudEcosystemData> {
  const inFlight = inFlightCloudPulls.get(userId);
  if (inFlight) {
    return inFlight;
  }
  const run = fetchAllCloudDataInternal(userId);
  inFlightCloudPulls.set(userId, run);
  // Clear the entry once settled so the NEXT pull fetches fresh data.
  void run.then(
    () => inFlightCloudPulls.delete(userId),
    () => inFlightCloudPulls.delete(userId)
  );
  return run;
}

async function fetchAllCloudDataInternal(userId: string): Promise<CloudEcosystemData> {
  // Fresh fetch: forget the previous run's read failure. If every section
  // below succeeds, lastSyncError stays null (a fully successful fetch).
  lastSyncError = null;

  const result: CloudEcosystemData = {
    profile: null,
    conversations: [],
    messagesByConv: {},
    memories: [],
    creations: [],
    journal: [],
    assets: {},
    cloudAssetIds: [],
  };

  if (!isAuthedUser(userId)) {
    return result;
  }

  const runFetch = async (): Promise<CloudEcosystemData> => {
    // 1. Profile
    try {
      const profileSnap = await getDoc(doc(db, 'users', userId, 'profile', 'default'));
      if (profileSnap.exists()) {
        const d = profileSnap.data();
        result.profile = {
          ownerId: userId,
          callsign: d.callsign || 'Friend',
          dynamicNotes: d.dynamicNotes ?? '',
          preferredVoice: 'Kore',
          autoMessages: Boolean(d.autoMessages),
        autoSpeakReplies: Boolean(d.autoSpeakReplies),
        avatarUrl: d.avatarUrl || '/assets/companion_avatar.svg',
        companionName: d.companionName || '',
        companionPersonality: d.companionPersonality || '',
        companionGreeting: d.companionGreeting || '',
        companionAvatarUrl: d.companionAvatarUrl || '',
        createdAtMs: d.createdAtMs || Date.now(),
        updatedAtMs: d.updatedAtMs || Date.now(),
      };
    }
  } catch (err) {
    console.warn('Profile cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  // 2. Conversations: Fetch all without relying on index to guarantee zero dropped conversations
  const convList: ConversationItem[] = [];
  try {
    const convsSnap = await getDocs(collection(db, 'users', userId, 'conversations'));
    convsSnap.forEach((docSnap) => {
      const d = docSnap.data();
      convList.push({
        id: docSnap.id,
        ownerId: userId,
        title: d.title || 'Direct Channel',
        isArchived: Boolean(d.isArchived),
        summary: d.summary || '',
        lastMessagePreview: d.lastMessagePreview || '',
        mood: d.mood || 'FOCUSED',
        focus: d.focus || 'HIGH',
        createdAtMs: Number(d.createdAtMs) || Date.now(),
        updatedAtMs: Number(d.updatedAtMs) || Number(d.createdAtMs) || Date.now(),
      });
    });
    convList.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    result.conversations = convList;
  } catch (err) {
    console.warn('Conversations cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  // 3. Messages for every conversation (concurrently, robustly)
  const messagePromises = convList.map(async (conv) => {
    try {
      const msgsSnap = await getDocs(
        collection(db, 'users', userId, 'conversations', conv.id, 'messages')
      );
      const msgs: ChatMessage[] = [];
      msgsSnap.forEach((mSnap) => {
        const md = mSnap.data();
        msgs.push({
          id: mSnap.id,
          ownerId: userId,
          conversationId: conv.id,
          sender: md.sender || 'companion',
          content: md.content || '',
          thoughtStream: md.thoughtStream || '',
          modality: md.modality || 'text',
          assetId: md.assetId || '',
          createdAtMs: Number(md.createdAtMs) || Date.now(),
          reactions: (md.reactions as Record<string, string[]>) || {},
        });
      });
      msgs.sort((a, b) => a.createdAtMs - b.createdAtMs);
      result.messagesByConv[conv.id] = msgs;
    } catch (err) {
      console.warn(`Messages fetch notice for conv ${conv.id}:`, err);
      lastSyncError = err instanceof Error ? err.message : String(err);
    }
  });
  await Promise.allSettled(messagePromises);

  // 4. Memories (Cloud backup)
  try {
    let memsSnap;
    try {
      memsSnap = await getDocs(
        query(collection(db, 'users', userId, 'memories'), orderBy('updatedAtMs', 'desc'))
      );
    } catch {
      memsSnap = await getDocs(collection(db, 'users', userId, 'memories'));
    }
    const memList: MemoryNode[] = [];
    memsSnap.forEach((mSnap) => {
      const d = mSnap.data();
      memList.push({
        id: mSnap.id,
        ownerId: userId,
        category: d.category || 'directive',
        fact: d.fact || '',
        importance: d.importance || 5,
        sourceConversationId: d.sourceConversationId || '',
        createdAtMs: d.createdAtMs || Date.now(),
        updatedAtMs: d.updatedAtMs || Date.now(),
      });
    });
    memList.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    result.memories = memList;
  } catch (err) {
    console.warn('Memories cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  // 5. Visual Creations
  try {
    let creSnap;
    try {
      creSnap = await getDocs(
        query(collection(db, 'users', userId, 'creations'), orderBy('createdAtMs', 'desc'))
      );
    } catch {
      creSnap = await getDocs(collection(db, 'users', userId, 'creations'));
    }
    const creList: VisualCreation[] = [];
    creSnap.forEach((cSnap) => {
      const d = cSnap.data();
      creList.push({
        id: cSnap.id,
        ownerId: userId,
        prompt: d.prompt || '',
        stylePreset: d.stylePreset || 'Prompt Only',
        aspectRatio: d.aspectRatio || '1:1',
        assetId: d.assetId || '',
        dataUrl: d.dataUrl,
        createdAtMs: d.createdAtMs || Date.now(),
      });
    });
    creList.sort((a, b) => b.createdAtMs - a.createdAtMs);
    result.creations = creList;
  } catch (err) {
    console.warn('Creations cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  // 6. Companion Journal Entries
  try {
    let jSnap;
    try {
      jSnap = await getDocs(
        query(collection(db, 'users', userId, 'journal'), orderBy('createdAtMs', 'desc'))
      );
    } catch {
      jSnap = await getDocs(collection(db, 'users', userId, 'journal'));
    }
    const jList: CompanionJournalEntry[] = [];
    jSnap.forEach((jDoc) => {
      const d = jDoc.data();
      jList.push({
        id: jDoc.id,
        ownerId: userId,
        title: d.title || 'Companion Reflection',
        content: d.content || '',
        mood: d.mood || 'FOCUSED',
        focus: d.focus || 'Direct Link',
        tags: Array.isArray(d.tags) ? d.tags : [],
        isAutonomous: Boolean(d.isAutonomous),
        createdAtMs: d.createdAtMs || Date.now(),
        updatedAtMs: d.updatedAtMs || Date.now(),
      });
    });
    jList.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    result.journal = jList;
  } catch (err) {
    console.warn('Journal cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

  // 7. Chat Thread Files & Visual Assets — quota diet version.
  // Asset documents hold the FULL image payload, so downloading the whole
  // assets collection on every pull was the most expensive part of sync.
  // Every asset the interface can actually show is referenced by one of the
  // creations or messages fetched above, so we work from those ids only:
  //   - Already in this device's local image vault AND already confirmed in
  //     the cloud before: skip entirely — no read at all.
  //   - In the vault but never confirmed in the cloud: verify with a single
  //     document read; if it's there, remember it and move on (the payload
  //     itself is already on this device).
  //   - Missing from the vault: download it. A fresh device has an empty
  //     vault, so it still restores the entire gallery this way.
  // Ids confirmed to exist in the cloud are reported in result.cloudAssetIds
  // (and persisted) so the sync merge can tell "already in the cloud" apart
  // from "needs uploading" without holding every payload.
  try {
    const referencedAssetIds = new Set<string>();
    for (const c of result.creations) {
      if (c.assetId) referencedAssetIds.add(c.assetId);
    }
    for (const msgs of Object.values(result.messagesByConv)) {
      for (const m of msgs) {
        if (m.assetId) referencedAssetIds.add(m.assetId);
      }
    }

    const knownInCloud = getKnownCloudAssetIds(userId);
    const confirmedInCloud: string[] = [];

    await Promise.all(
      Array.from(referencedAssetIds).map(async (assetId) => {
        let localUrl: string | null = null;
        try {
          localUrl = await loadAssetDataUrl(assetId);
        } catch {
          localUrl = null;
        }

        if (localUrl && knownInCloud.has(assetId)) {
          // On this device and known to be in the cloud: nothing to fetch.
          confirmedInCloud.push(assetId);
          return;
        }

        // Either not downloaded yet, or its cloud presence was never
        // confirmed — one document read settles both cases.
        const cloudUrl = await fetchCloudAsset(userId, assetId);
        if (cloudUrl) {
          confirmedInCloud.push(assetId);
          if (!localUrl) {
            result.assets[assetId] = cloudUrl;
          }
        }
        // Not found in the cloud: a local-only asset. It stays out of the
        // confirmed list so syncBidirectional uploads it below.
      })
    );

    result.cloudAssetIds = confirmedInCloud;
    noteCloudAssetIds(userId, confirmedInCloud);
  } catch (err) {
    console.warn('Assets cloud fetch notice:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
  }

    return result;
  };

  const timeoutPromise = new Promise<CloudEcosystemData>((resolve) => {
    setTimeout(() => {
      console.warn('fetchAllCloudData safety timeout reached; proceeding with local/partial data');
      lastSyncError =
        'Cloud fetch timed out after 6s — reads may be stalled; proceeding with local/partial data';
      resolve(result);
    }, 6000);
  });

  return Promise.race([runFetch(), timeoutPromise]);
}

/**
 * Merges local and remote message arrays with a strict merge-or-preserve strategy.
 * Rule 1: Never overwrite a populated local message array with an empty or older remote payload.
 * Rule 2: If message IDs conflict, local session state takes precedence (preserves active edits, content length, streaming chunks), while unioning user reactions and preserving timestamps.
 * Rule 3: Any local messages not yet in remote storage are tracked in `missingInCloud` so they can be saved immediately.
 */
export function mergeMessagesWithLocalPrecedence(
  localMsgs: ChatMessage[] = [],
  remoteMsgs: ChatMessage[] = []
): { merged: ChatMessage[]; missingInCloud: ChatMessage[] } {
  // If remote is empty, preserve local entirely without loss
  if (!remoteMsgs || remoteMsgs.length === 0) {
    return {
      merged: [...localMsgs],
      missingInCloud: [...localMsgs],
    };
  }

  // If local is empty, take remote
  if (!localMsgs || localMsgs.length === 0) {
    return {
      merged: [...remoteMsgs],
      missingInCloud: [],
    };
  }

  const msgMap = new Map<string, ChatMessage>();
  const missingInCloud: ChatMessage[] = [];

  // Seed map with remote messages
  for (const rMsg of remoteMsgs) {
    if (rMsg && rMsg.id) {
      msgMap.set(rMsg.id, rMsg);
    }
  }

  // Merge local messages, giving precedence to local session state
  for (const lMsg of localMsgs) {
    if (!lMsg || !lMsg.id) continue;

    const rMsg = msgMap.get(lMsg.id);
    if (!rMsg) {
      // Local message is missing in remote: preserve and push to cloud
      msgMap.set(lMsg.id, lMsg);
      missingInCloud.push(lMsg);
    } else {
      // State conflict: message exists in both local and remote.
      // Local session state takes precedence.
      const lContent = (lMsg.content || '').trim();
      const rContent = (rMsg.content || '').trim();
      let resolvedContent = lMsg.content;
      if (!lContent && rContent) {
        resolvedContent = rMsg.content;
      } else if (rContent.length > lContent.length && !lContent.includes('...') && !lContent.endsWith('…')) {
        // Remote has significantly more complete text and local was not a mid-stream edit
        resolvedContent = rMsg.content;
      }

      const resolvedThought = (lMsg.thoughtStream && lMsg.thoughtStream.trim().length > 0)
        ? lMsg.thoughtStream
        : (rMsg.thoughtStream || '');

      const resolvedModality = lMsg.modality || rMsg.modality || 'text';
      const resolvedAssetId = lMsg.assetId || rMsg.assetId || '';

      // Union reactions so reactions from neither device are lost
      const mergedReactions: Record<string, string[]> = { ...(rMsg.reactions || {}) };
      if (lMsg.reactions) {
        for (const [key, users] of Object.entries(lMsg.reactions)) {
          const remoteUsers = mergedReactions[key] || [];
          mergedReactions[key] = Array.from(new Set([...remoteUsers, ...(users || [])]));
        }
      }

      const mergedMsg: ChatMessage = {
        id: lMsg.id,
        ownerId: lMsg.ownerId || rMsg.ownerId,
        conversationId: lMsg.conversationId || rMsg.conversationId,
        sender: lMsg.sender || rMsg.sender,
        content: resolvedContent,
        thoughtStream: resolvedThought,
        modality: resolvedModality,
        assetId: resolvedAssetId,
        createdAtMs: lMsg.createdAtMs || rMsg.createdAtMs || Date.now(),
        reactions: mergedReactions,
      };

      msgMap.set(lMsg.id, mergedMsg);

      if (
        resolvedContent !== rMsg.content ||
        resolvedThought !== (rMsg.thoughtStream || '') ||
        JSON.stringify(mergedReactions) !== JSON.stringify(rMsg.reactions || {})
      ) {
        missingInCloud.push(mergedMsg);
      }
    }
  }

  const merged = Array.from(msgMap.values()).sort(
    (a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0)
  );

  return { merged, missingInCloud };
}

/**
 * Merges local and remote conversation items without dropping active or populated local threads.
 * Rule: Never drop a thread that has messages in local state or in messagesByConv.
 * Rule: Take the newest updatedAtMs, preserve user-customized titles, and merge statuses.
 */
export function mergeConversationsGracefully(
  localConvs: ConversationItem[] = [],
  remoteConvs: ConversationItem[] = [],
  messagesByConv: Record<string, ChatMessage[]> = {},
  deletedConvIds: Set<string> = new Set()
): { merged: ConversationItem[]; missingInCloud: ConversationItem[] } {
  const convMap = new Map<string, ConversationItem>();
  const missingInCloud: ConversationItem[] = [];

  // Seed with remote conversations
  for (const rConv of remoteConvs) {
    if (!rConv || !rConv.id || deletedConvIds.has(rConv.id)) continue;
    convMap.set(rConv.id, rConv);
  }

  // Merge local conversations
  for (const lConv of localConvs) {
    if (!lConv || !lConv.id || deletedConvIds.has(lConv.id)) continue;

    const msgs = messagesByConv[lConv.id] || [];
    const hasMessages = msgs.length > 0;

    // Filter empty boot stubs only if there are other conversations and this stub has ZERO messages
    const isBootStub = lConv.id === 'conv_initial_boot';
    const otherConvsExist = convMap.size > 0 || localConvs.some((c) => c.id !== 'conv_initial_boot');
    if (isBootStub && !hasMessages && otherConvsExist) {
      continue;
    }

    const rConv = convMap.get(lConv.id);
    if (!rConv) {
      // Local conversation not yet in remote: preserve and push to cloud
      convMap.set(lConv.id, lConv);
      missingInCloud.push(lConv);
    } else {
      // Merge properties: take newest timestamp, preserve title
      const isCustomTitle = lConv.title && lConv.title !== 'Direct Channel' && lConv.title !== 'New Conversation';
      const mergedConv: ConversationItem = {
        ...rConv,
        ...lConv,
        title: isCustomTitle ? lConv.title : (rConv.title || lConv.title || 'Direct Channel'),
        lastMessagePreview: (msgs.length > 0 && msgs[msgs.length - 1].content)
          ? msgs[msgs.length - 1].content.slice(0, 100)
          : (lConv.lastMessagePreview || rConv.lastMessagePreview || ''),
        updatedAtMs: Math.max(lConv.updatedAtMs || 0, rConv.updatedAtMs || 0),
        isArchived: Boolean(lConv.isArchived && rConv.isArchived),
      };

      convMap.set(lConv.id, mergedConv);

      if ((lConv.updatedAtMs || 0) > (rConv.updatedAtMs || 0) || isCustomTitle) {
        missingInCloud.push(mergedConv);
      }
    }
  }

  const merged = Array.from(convMap.values()).sort(
    (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
  );

  return { merged, missingInCloud };
}

// True 2-Way Sync between Local State and Cloud — Unifies devices without wiping data
// Two-way sync entry point, with the quota-diet guards from the note above:
// overlapping calls for the same user share one in-flight sync, and a
// non-forced call within 90 seconds of the last successful sync returns the
// local state untouched instead of paying for another full cloud pull.
// Callers that are explicitly user- or sign-in-initiated pass
// { force: true } and always run the full sync.
export async function syncBidirectional(
  userId: string,
  local: SyncLocalState,
  options?: { force?: boolean }
): Promise<SyncMergedState> {
  if (!isAuthedUser(userId)) {
    return localStateAsMerged(local);
  }

  // Coalescing: a sync for this user is already running — reuse it.
  const inFlight = inFlightBidirectionalSyncs.get(userId);
  if (inFlight) {
    return inFlight;
  }

  // Freshness: the cloud was fully pulled moments ago — don't re-read
  // every document again just because another trigger fired.
  if (!options?.force) {
    const lastFullSyncMs = getLastFullSyncMs(userId);
    if (lastFullSyncMs > 0 && Date.now() - lastFullSyncMs < FULL_SYNC_FRESHNESS_MS) {
      return localStateAsMerged(local);
    }
  }

  const run = syncBidirectionalInternal(userId, local);
  inFlightBidirectionalSyncs.set(userId, run);
  try {
    const merged = await run;
    // The internal sync swallows failures and returns local state as a safe
    // fallback; only stamp the freshness clock when the pull truly
    // succeeded (no recorded sync error), so a failed pull is retried by
    // the next trigger instead of being treated as fresh.
    if (!lastSyncError) {
      recordFullSyncSuccess(userId);
    }
    return merged;
  } finally {
    inFlightBidirectionalSyncs.delete(userId);
  }
}

async function syncBidirectionalInternal(
  userId: string,
  local: SyncLocalState
): Promise<SyncMergedState> {
  if (!isAuthedUser(userId)) {
    return localStateAsMerged(local);
  }

  try {
    const cloud = await fetchAllCloudData(userId);

    // Ids of image assets the cloud definitely holds (confirmed during the
    // pull, plus any payloads it returned). The merge's upload checks use
    // this — NOT the payload map — because the pull no longer downloads
    // assets this device already has in its local vault.
    const cloudAssetIdSet = new Set<string>([
      ...cloud.cloudAssetIds,
      ...Object.keys(cloud.assets),
    ]);

    const pendingWrites: Promise<void>[] = [];

    // 1. Profile: merge keeping newest updates — with one guardrail: a
    // factory "guest" placeholder profile (the blank Friend profile a fresh
    // device/browser starts with) must NEVER beat a real profile, no matter
    // how new its timestamp is. Without this, signing in on a new device
    // overwrote the owner's real cloud profile with the blank guest one.
    const isPlaceholderProfile = (p: UserProfile | null | undefined): boolean =>
      !!p &&
      p.callsign === 'Friend' &&
      !(p.dynamicNotes || '').trim() &&
      !(p.companionName || '').trim() &&
      !(p.companionPersonality || '').trim() &&
      !(p.companionGreeting || '').trim() &&
      !(p.companionAvatarUrl || '').trim() &&
      (p.avatarUrl === '/assets/companion_avatar.svg' || p.avatarUrl === '/assets/guest_avatar.svg');
    let mergedProfile = { ...local.profile };
    if (cloud.profile) {
      const localIsPlaceholder = isPlaceholderProfile(local.profile);
      const cloudIsPlaceholder = isPlaceholderProfile(cloud.profile);
      if (localIsPlaceholder && !cloudIsPlaceholder) {
        // Real cloud profile wins over a local blank guest, timestamps aside
        mergedProfile = { ...local.profile, ...cloud.profile };
      } else if (!localIsPlaceholder && cloudIsPlaceholder) {
        // Cloud copy is a blank guest (a fresh device polluted it earlier):
        // the real local profile wins and repairs the cloud copy.
        pendingWrites.push(saveCloudProfile(userId, local.profile).catch((e) => console.warn('Sync profile write err:', e)));
      } else if ((cloud.profile.updatedAtMs || 0) >= (local.profile.updatedAtMs || 0)) {
        mergedProfile = { ...local.profile, ...cloud.profile };
      } else {
        // Local profile is newer, sync to cloud
        pendingWrites.push(saveCloudProfile(userId, local.profile).catch((e) => console.warn('Sync profile write err:', e)));
      }
    } else if (!isPlaceholderProfile(local.profile)) {
      // Cloud has no profile yet, initialize it — but never with a blank guest
      pendingWrites.push(saveCloudProfile(userId, local.profile).catch((e) => console.warn('Init profile write err:', e)));
    }

    // 2. Conversations: merge gracefully without dropping populated local threads
    const convResult = mergeConversationsGracefully(
      local.conversations,
      cloud.conversations,
      local.messagesByConv
    );
    const mergedConversations = convResult.merged;
    for (const c of convResult.missingInCloud) {
      pendingWrites.push(
        saveCloudConversation(userId, c).catch((e) => console.warn('Sync conv write err:', e))
      );
    }

    // 3. Messages by conversation: merge-or-preserve with local precedence
    const mergedMessagesByConv: Record<string, ChatMessage[]> = {};
    const allConvIds = new Set([
      ...Object.keys(cloud.messagesByConv),
      ...Object.keys(local.messagesByConv),
      ...mergedConversations.map((c) => c.id),
    ]);

    for (const cId of allConvIds) {
      const cloudMsgs = cloud.messagesByConv[cId] || [];
      const localMsgs = local.messagesByConv[cId] || [];

      const { merged, missingInCloud } = mergeMessagesWithLocalPrecedence(localMsgs, cloudMsgs);
      mergedMessagesByConv[cId] = merged;

      for (const m of missingInCloud) {
        pendingWrites.push(
          saveCloudMessage(userId, m).catch((e) => console.warn('Sync msg write err:', e))
        );
      }
    }

    // 4. Memories: complete union by id and backup to cloud
    const memMap = new Map<string, MemoryNode>();
    for (const m of cloud.memories) memMap.set(m.id, m);
    for (const m of local.memories) {
      if (!memMap.has(m.id)) {
        memMap.set(m.id, m);
        pendingWrites.push(saveCloudMemory(userId, m).catch((e) => console.warn('Sync memory write err:', e)));
      }
    }
    const mergedMemories = Array.from(memMap.values()).sort(
      (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
    );

    // 5. Creations & Visual Art: union by id with bidirectional image payload sync
    const creMap = new Map<string, VisualCreation>();
    for (const c of cloud.creations) {
      creMap.set(c.id, c);
      if (c.assetId && c.dataUrl && !cloud.assets[c.assetId]) {
        cloud.assets[c.assetId] = c.dataUrl;
      }
    }
    for (const c of local.creations) {
      const localDataUrl = c.dataUrl || local.assets?.[c.assetId] || '';
      if (!creMap.has(c.id)) {
        const enrichedLocalCreation = {
          ...c,
          dataUrl: localDataUrl,
        };
        creMap.set(c.id, enrichedLocalCreation);
        pendingWrites.push(
          saveCloudCreation(userId, enrichedLocalCreation).catch((e) =>
            console.warn('Sync creation write err:', e)
          )
        );
        if (c.assetId && localDataUrl && localDataUrl.length <= 900000 && !cloudAssetIdSet.has(c.assetId)) {
          pendingWrites.push(
            saveCloudAsset(userId, c.assetId, localDataUrl, {
              name: `Companion Render - ${c.prompt.slice(0, 30)}`,
              mimeType: localDataUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/jpeg',
            })
              .then(() => noteCloudAssetIds(userId, [c.assetId]))
              .catch((e) => console.warn('Sync creation asset write err:', e))
          );
        }
      }
    }
    const mergedCreations = Array.from(creMap.values()).sort(
      (a, b) => b.createdAtMs - a.createdAtMs
    );

    // 6. Journal: union by id — NEVER delete existing entries; backup local entries to cloud
    const hasRealCloudJournal = cloud.journal.length > 0;
    const jMap = new Map<string, CompanionJournalEntry>();
    for (const j of cloud.journal) jMap.set(j.id, j);
    for (const j of local.journal) {
      if (j.id === 'journal_boot_1' && hasRealCloudJournal && !cloud.journal.some((cj) => cj.id === 'journal_boot_1')) {
        continue;
      }
      if (!jMap.has(j.id)) {
        jMap.set(j.id, j);
        pendingWrites.push(saveCloudJournalEntry(userId, j).catch((e) => console.warn('Sync journal write err:', e)));
      }
    }
    const mergedJournal = Array.from(jMap.values()).sort(
      (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)
    );

    // 7. Chat Thread Files & Visual Assets: comprehensive 2-way image sync across devices
    const mergedAssets: Record<string, string> = { ...(local.assets || {}) };
    for (const [assetId, dataUrl] of Object.entries(cloud.assets)) {
      if (!mergedAssets[assetId] && dataUrl) {
        mergedAssets[assetId] = dataUrl;
      }
    }
    // Also ingest any image dataUrls from creations
    for (const c of mergedCreations) {
      if (c.assetId && c.dataUrl && !mergedAssets[c.assetId]) {
        mergedAssets[c.assetId] = c.dataUrl;
      }
    }
    for (const [assetId, dataUrl] of Object.entries(local.assets || {})) {
      if (!cloudAssetIdSet.has(assetId) && dataUrl && dataUrl.length <= 900000) {
        pendingWrites.push(
          saveCloudAsset(userId, assetId, dataUrl)
            .then(() => noteCloudAssetIds(userId, [assetId]))
            .catch((e) => console.warn('Sync asset write err:', e))
        );
      }
    }

    // Await all queued writes safely so both devices are immediately in sync
    if (pendingWrites.length > 0) {
      await Promise.allSettled(pendingWrites);
    }

    return {
      profile: mergedProfile,
      conversations: mergedConversations.length > 0 ? mergedConversations : local.conversations,
      messagesByConv: mergedMessagesByConv,
      memories: mergedMemories.length > 0 ? mergedMemories : local.memories,
      creations: mergedCreations,
      journal: mergedJournal.length > 0 ? mergedJournal : local.journal,
      assets: mergedAssets,
    };
  } catch (err) {
    console.warn('syncBidirectional notice, retaining safe local state:', err);
    lastSyncError = err instanceof Error ? err.message : String(err);
    return {
      profile: local.profile,
      conversations: local.conversations,
      messagesByConv: local.messagesByConv,
      memories: local.memories,
      creations: local.creations,
      journal: local.journal,
      assets: local.assets || {},
    };
  }
}

// Merge local storage data into Cloud when linking a new device/account
export async function uploadLocalStateToCloud(
  userId: string,
  state: {
    profile: UserProfile;
    conversations: ConversationItem[];
    messagesByConv: Record<string, ChatMessage[]>;
    memories: MemoryNode[];
    creations: VisualCreation[];
    journal?: CompanionJournalEntry[];
    assets?: Record<string, string>;
  }
): Promise<void> {
  try {
    // 1. Profile
    await saveCloudProfile(userId, state.profile);

    // 2. Conversations & their messages
    for (const conv of state.conversations) {
      await saveCloudConversation(userId, conv);
      const msgs = state.messagesByConv[conv.id] || [];
      for (const msg of msgs) {
        await saveCloudMessage(userId, msg);
      }
    }

    // 3. Memories
    for (const mem of state.memories) {
      await saveCloudMemory(userId, mem);
    }

    // 4. Creations
    for (const cre of state.creations) {
      await saveCloudCreation(userId, cre);
    }

    // 5. Journal Entries
    if (Array.isArray(state.journal)) {
      for (const j of state.journal) {
        await saveCloudJournalEntry(userId, j);
      }
    }

    // 6. Chat Thread Files & Visual Assets
    if (state.assets && typeof state.assets === 'object') {
      for (const [assetId, dataUrl] of Object.entries(state.assets)) {
        await saveCloudAsset(userId, assetId, dataUrl);
      }
    }
  } catch (err) {
    console.warn('Initial cloud migration notice:', err);
  }
}

// Persist User's presence status in Cloud Firestore for cross-device awareness
export async function saveUserPresence(
  userId: string,
  presence: UserPresence
): Promise<void> {
  if (!isAuthedUser(userId)) return;
  try {
    const docRef = doc(db, 'users', userId, 'presence', 'current');
    await setDoc(docRef, {
      status: presence.status,
      lastActiveMs: presence.lastActiveMs,
      updatedAtMs: presence.updatedAtMs,
      isManualOverride: Boolean(presence.isManualOverride),
      note: presence.note || '',
    });
  } catch (err) {
    // Non-fatal presence sync notice
    console.warn('Presence sync notice:', err);
  }
}

// Subscribe to User's presence updates across platforms/devices in real time
export function subscribeUserPresence(
  userId: string,
  callback: (presence: UserPresence) => void
): Unsubscribe {
  if (!isAuthedUser(userId)) {
    return () => {};
  }
  const docRef = doc(db, 'users', userId, 'presence', 'current');
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        callback({
          status: (d.status as 'active' | 'away' | 'call') || 'active',
          lastActiveMs: Number(d.lastActiveMs) || Date.now(),
          updatedAtMs: Number(d.updatedAtMs) || Date.now(),
          isManualOverride: Boolean(d.isManualOverride),
          note: d.note || '',
        });
      }
    },
    (err) => {
      console.warn('Presence subscription notice:', err);
    }
  );
}

// Fetch all messages for a specific conversation on demand
export async function fetchCloudConversationMessages(
  userId: string,
  convId: string
): Promise<ChatMessage[]> {
  if (!isAuthedUser(userId) || !convId) return [];
  try {
    const msgsSnap = await getDocs(
      collection(db, 'users', userId, 'conversations', convId, 'messages')
    );
    const msgs: ChatMessage[] = [];
    msgsSnap.forEach((mSnap) => {
      const md = mSnap.data();
      msgs.push({
        id: mSnap.id,
        ownerId: userId,
        conversationId: convId,
        sender: md.sender || 'companion',
        content: md.content || '',
        thoughtStream: md.thoughtStream || '',
        modality: md.modality || 'text',
        assetId: md.assetId || '',
        createdAtMs: Number(md.createdAtMs) || Date.now(),
        reactions: (md.reactions as Record<string, string[]>) || {},
      });
    });
    msgs.sort((a, b) => a.createdAtMs - b.createdAtMs);
    return msgs;
  } catch (err) {
    console.warn(`Fetch messages error for conv ${convId}:`, err);
    return [];
  }
}

