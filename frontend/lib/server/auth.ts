import { getAuth } from 'firebase-admin/auth';
import { getApps } from 'firebase-admin/app';
import { initAdmin } from './firebaseAdmin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
}

export async function verifyRequestUser(req: Request): Promise<AuthenticatedUser | null> {
  // Ensure Firebase Admin is initialized
  try {
    initAdmin();
  } catch (err) {
    console.error('[Auth Service] Failed to initialize admin app:', err);
    return null;
  }

  if (getApps().length === 0) {
    return null;
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);
    const decodedToken = await getAuth().verifyIdToken(token);
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error) {
    console.error('[Auth Service] Token verification failed:', error);
    return null;
  }
}
