import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

function getServiceAccount(): Record<string, any> | null {
  if (!serviceAccountJson) return null;
  try {
    return JSON.parse(serviceAccountJson);
  } catch {
    return null;
  }
}

const serviceAccount = getServiceAccount();

if (getApps().length === 0 && serviceAccount) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

export const adminDb = getApps().length > 0 ? getFirestore() : ({} as ReturnType<typeof getFirestore>);
export default adminDb;
