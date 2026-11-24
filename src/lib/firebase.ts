/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import {
  initializeAuth,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore targeting the provisioned custom database ID.
// experimentalForceLongPolling: long-polling is FORCED because Firestore's
// default streaming transport (WebChannel) silently stalls for reads in iOS
// WebKit containers (Chrome and home-screen/standalone apps alike) while
// writes still pass — sign-in succeeds, uploads land, but no data ever comes
// back down and listener errors are swallowed. The gentler
// experimentalAutoDetectLongPolling was tried first and failed to switch
// transports on iOS, so the fallback is now unconditional.
const firestoreSettings = { experimentalForceLongPolling: true };
export const db = firebaseConfig.firestoreDatabaseId
  ? initializeFirestore(app, firestoreSettings, firebaseConfig.firestoreDatabaseId)
  : initializeFirestore(app, firestoreSettings);

// Explicit auth persistence: try IndexedDB first, fall back to localStorage.
// Plain getAuth() defaults to IndexedDB only, which is unreliable inside
// iOS home-screen (standalone) apps — sign-ins there could silently fail to
// stick across relaunches, leaving the app signed out and unable to sync.
// localStorage is the dependable store in that container.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  // Required explicitly with initializeAuth: without it, popup sign-in
  // (the Google button) throws auth/argument-error.
  popupRedirectResolver: browserPopupRedirectResolver,
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Cleanly sign out only truly anonymous sessions if any exist
if (typeof window !== 'undefined') {
  auth.onAuthStateChanged((user) => {
    if (user && user.isAnonymous) {
      void auth.signOut().catch(() => {});
    }
  });
}

// Test connection when user is authenticated
export async function validateFirestoreConnection(): Promise<boolean> {
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    return true;
  }
  try {
    await getDocFromServer(doc(db, 'users', auth.currentUser.uid, 'profile', 'default'));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.warn('Firestore offline notice. Operating in offline mode.');
      return false;
    }
    return true;
  }
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
): never {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
