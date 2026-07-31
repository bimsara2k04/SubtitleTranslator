import type { JobDetails, TranslationJob, TranslationChunk, ValidationIssue } from './types.js';

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

// Empty or unset NEXT_PUBLIC_BACKEND_URL means "same origin" (useful when the
// backend is reverse-proxied behind the Next.js app in production). Set it to
// the backend URL for local development, e.g. http://localhost:3001.
const BACKEND_URL =
  (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').trim().replace(/\/$/, '') || '';

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Request failed with status ${res.status}`;
  let code: string | undefined;
  try {
    const body = await res.json();
    message = body?.error?.message ?? message;
    code = body?.error?.code;
  } catch {
    // non-JSON error body — keep default message
  }
  return new ApiError(message, res.status, code);
}

// ─── Response shape guards (defensive — never trust a remote API) ───────────

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.severity === 'error' || v.severity === 'warning') &&
    typeof v.code === 'string' &&
    typeof v.message === 'string' &&
    (typeof v.cueIndex === 'number' || v.cueIndex === null)
  );
}

function isTranslationChunk(value: unknown): value is TranslationChunk {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.chunkIndex === 'number' &&
    typeof c.status === 'string' &&
    typeof c.retryCount === 'number' &&
    Array.isArray(c.cueIndexes) &&
    Array.isArray(c.cuesToTranslate) &&
    (c.translatedItems === null || Array.isArray(c.translatedItems))
  );
}

function isJobDetails(value: unknown): value is JobDetails {
  if (typeof value !== 'object' || value === null) return false;
  const j = value as Record<string, unknown>;
  return (
    typeof j.id === 'string' &&
    typeof j.status === 'string' &&
    typeof j.sourceFilename === 'string' &&
    typeof j.targetLanguage === 'string' &&
    typeof j.totalCues === 'number' &&
    typeof j.totalChunks === 'number' &&
    typeof j.processedChunks === 'number' &&
    typeof j.failedChunks === 'number' &&
    Array.isArray(j.chunks) &&
    j.chunks.every(isTranslationChunk) &&
    Array.isArray(j.validationIssues) &&
    j.validationIssues.every(isValidationIssue)
  );
}

// ─── API calls ───────────────────────────────────────────────────────────────

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
  validationIssues: ValidationIssue[];
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

  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (err: unknown) {
    throw new ApiError(
      isAbortError(err)
        ? 'Upload timed out. The backend may be unresponsive.'
        : 'Network error — is the backend running?'
    );
  }

  if (!res.ok) throw await parseError(res);

  const data = await res.json();
  if (typeof data?.jobId !== 'string') {
    throw new ApiError('Unexpected upload response from backend.');
  }
  return data as UploadResponse;
}

export async function getJobDetails(jobId: string): Promise<JobDetails> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/jobs/${jobId}`);
  } catch (err: unknown) {
    throw new ApiError(
      isAbortError(err)
        ? 'Fetching job details timed out.'
        : 'Network error — is the backend running?'
    );
  }

  if (!res.ok) throw await parseError(res);

  const data = await res.json();
  const job = data?.job;
  if (!isJobDetails(job)) {
    throw new ApiError('Backend returned an unexpected job payload.');
  }
  return job;
}

export async function startTranslation(jobId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/jobs/${jobId}/translate`, {
      method: 'POST',
    });
  } catch (err: unknown) {
    throw new ApiError(
      isAbortError(err)
        ? 'Starting translation timed out.'
        : 'Network error — is the backend running?'
    );
  }

  if (!res.ok) throw await parseError(res);
}

export async function retryChunk(jobId: string, chunkId: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/jobs/${jobId}/retry-chunk/${chunkId}`, {
      method: 'POST',
    });
  } catch (err: unknown) {
    throw new ApiError(
      isAbortError(err)
        ? 'Retrying the chunk timed out.'
        : 'Network error — is the backend running?'
    );
  }

  if (!res.ok) throw await parseError(res);
}

export async function downloadExport(jobId: string): Promise<{ blob: Blob; filename: string }> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/jobs/${jobId}/export`);
  } catch (err: unknown) {
    throw new ApiError(
      isAbortError(err)
        ? 'Download timed out.'
        : 'Network error — is the backend running?'
    );
  }

  if (!res.ok) throw await parseError(res);

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition) || /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `translated_${jobId}.srt`;
  return { blob, filename };
}

export type QuotaKeyStatus = {
  label: string;
  dailyCallsUsed: number;
  dailyCallsLimit: number;
  dailyCallsRemaining: number;
  onCooldown: boolean;
  cooldownExpiresAt: string | null;
  /** True when a key is locked until the daily reset (not just a short cooldown). */
  exhausted?: boolean;
};

export type QuotaStatusResult =
  | { ok: true; keyCount: number; remainingToday: number; keys: QuotaKeyStatus[] }
  | { ok: false; reason: 'offline' | 'error'; message: string };

export async function getQuotaStatus(): Promise<QuotaStatusResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BACKEND_URL}/api/quota-status`);
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'offline',
      message: isAbortError(err) ? 'Backend is not responding.' : 'Backend is offline.',
    };
  }

  if (!res.ok) {
    return { ok: false, reason: 'error', message: `Backend error (${res.status}).` };
  }

  try {
    const data = await res.json();
    const keys: QuotaKeyStatus[] = Array.isArray(data?.keys) ? data.keys : [];
    return {
      ok: true,
      keyCount: typeof data?.keyCount === 'number' ? data.keyCount : keys.length,
      remainingToday: typeof data?.remainingToday === 'number' ? data.remainingToday : 0,
      keys,
    };
  } catch {
    return { ok: false, reason: 'error', message: 'Backend returned an unexpected quota payload.' };
  }
}

export { BACKEND_URL };
export type { TranslationJob };
