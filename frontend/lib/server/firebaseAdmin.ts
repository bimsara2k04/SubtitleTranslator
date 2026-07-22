import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

function initAdmin(): Firestore {
  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing.');
    }
    let serviceAccount: Record<string, any>;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
    } catch (e: any) {
      throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${e?.message}`);
    }

    initializeApp({
      credential: cert(serviceAccount),
    });
  }
  return getFirestore();
}

// Proxy lazily initializes Firebase Admin on first method call (e.g. adminDb.collection)
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const instance = initAdmin() as any;
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});

export default adminDb;
