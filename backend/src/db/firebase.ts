import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  throw new Error(
    'FIREBASE_SERVICE_ACCOUNT environment variable is not set. ' +
    'Set it to the full contents of your Firebase service account JSON (on one line).'
  );
}

let serviceAccount: object;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Make sure the entire JSON is on one line.');
}

// Prevent re-initializing the app on hot-reloads (e.g. nodemon)
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });
}

export const db = getFirestore();
export default db;
