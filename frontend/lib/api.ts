import type { JobDetails } from './types';
import { auth } from './firebase';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export type UploadParams = {
  file: File;
  targetLanguage: string;
  model: string;
  toneStyle: string;
  glossary?: string;
};

export type UploadResponse = {
  jobId: string;
  status: string;
  valid: boolean;
  validationIssues: import('./types').ValidationIssue[];
};

export async function uploadSRT(params: UploadParams): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('targetLanguage', params.targetLanguage);
  formData.append('model', params.model);
  formData.append('toneStyle', params.toneStyle);
  if (params.glossary) {
    formData.append('glossary', params.glossary);
  }

  const authHeaders = await getAuthHeaders();

  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    headers: {
      ...authHeaders,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed with status ${res.status}`);
  }

  return res.json();
}

export async function getJobDetails(jobId: string): Promise<JobDetails> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`, {
    headers: {
      ...authHeaders,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch job details: ${res.status}`);
  }

  const data = await res.json();
  return data.job;
}

export async function startTranslation(jobId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/translate`, {
    method: 'POST',
    headers: {
      ...authHeaders,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to start translation: ${res.status}`);
  }
}

export async function retryChunk(jobId: string, chunkId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/retry-chunk/${chunkId}`, {
    method: 'POST',
    headers: {
      ...authHeaders,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to retry chunk: ${res.status}`);
  }
}

export function getExportUrl(jobId: string): string {
  return `${BACKEND_URL}/api/jobs/${jobId}/export`;
}

export type EstimateResponse = {
  estimatedCalls: number;
  estimatedTotalTokens: number;
  estimatedChunks: number;
  totalCues: number;
  projects: Array<{
    label: string;
    dailyCallsUsed: number;
    dailyCallsLimit: number;
    dailyCallsRemaining: number;
    canCompleteJobAlone: boolean;
    onCooldown: boolean;
    cooldownExpiresAt: string | null;
  }>;
  combinedCallsRemaining: number;
  canCompleteWithoutFailover: boolean;
  canCompleteWithFailover: boolean;
  throttleWarning: string | null;
  isEstimate: boolean;
};

export async function getJobEstimate(jobId: string): Promise<EstimateResponse> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/estimate`, {
    headers: {
      ...authHeaders,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch job estimates: ${res.status}`);
  }
  return res.json();
}

export async function getTranslationHistory(): Promise<JobDetails[]> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/jobs`, {
    headers: {
      ...authHeaders,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch translation history: ${res.status}`);
  }
  const data = await res.json();
  return data.jobs;
}

