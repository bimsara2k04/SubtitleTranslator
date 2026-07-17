import type { JobDetails } from './types.js';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

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
  validationIssues: import('./types.js').ValidationIssue[];
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

  const res = await fetch(`${BACKEND_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Upload failed with status ${res.status}`);
  }

  return res.json();
}

export async function getJobDetails(jobId: string): Promise<JobDetails> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch job details: ${res.status}`);
  }

  const data = await res.json();
  return data.job;
}

export async function startTranslation(jobId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/translate`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to start translation: ${res.status}`);
  }
}

export async function retryChunk(jobId: string, chunkId: string): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/api/jobs/${jobId}/retry-chunk/${chunkId}`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to retry chunk: ${res.status}`);
  }
}

export function getExportUrl(jobId: string): string {
  return `${BACKEND_URL}/api/jobs/${jobId}/export`;
}
