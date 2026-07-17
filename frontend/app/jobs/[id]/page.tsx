'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { getJobDetails, startTranslation, retryChunk, getExportUrl } from '@/lib/api';
import type { JobDetails } from '@/lib/types';
import ChunkGrid from './components/ChunkGrid';
import ValidationReport from './components/ValidationReport';
import SubtitlePreview from './components/SubtitlePreview';
import {
  Sparkles,
  ArrowLeft,
  Download,
  AlertTriangle,
  Play,
  CheckCircle,
  FileText,
  Clock,
  Loader2,
  ListRestart,
  RefreshCw,
} from 'lucide-react';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function JobStatusPage({ params }: PageProps) {
  // Resolve params promise
  const resolvedParams = use(params);
  const jobId = resolvedParams.id;

  const [job, setJob] = useState<JobDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(null);

  // Fetch job details
  const fetchJob = useCallback(async () => {
    try {
      const data = await getJobDetails(jobId);
      setJob(data);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching job details:', err);
      setError(err?.message || 'Failed to sync job details.');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Polling hook when job is in active translation state
  useEffect(() => {
    fetchJob();

    const interval = setInterval(() => {
      if (job) {
        const isProcessing =
          job.status === 'pending' ||
          job.status === 'parsing' ||
          job.status === 'translating' ||
          job.status === 'rebuilding';

        if (isProcessing) {
          fetchJob();
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchJob, job?.status]);

  // Auto-start translation if the job is just loaded and pending
  useEffect(() => {
    if (job && job.status === 'pending') {
      (async () => {
        try {
          await startTranslation(jobId);
          fetchJob();
        } catch (err: any) {
          setError(err?.message || 'Failed to start subtitle translation.');
        }
      })();
    }
  }, [job?.status, jobId, fetchJob]);

  const handleStartTranslate = async () => {
    try {
      setLoading(true);
      await startTranslation(jobId);
      await fetchJob();
    } catch (err: any) {
      setError(err?.message || 'Failed to start translation run.');
      setLoading(false);
    }
  };

  const handleRetryChunk = async (chunkId: string) => {
    try {
      await retryChunk(jobId, chunkId);
      await fetchJob();
    } catch (err: any) {
      setError(err?.message || 'Failed to retry chunk.');
    }
  };

  const handleSelectCue = (cueIndex: number) => {
    setSelectedCueIndex(cueIndex);
  };

  const handleClearSelectedCue = () => {
    setSelectedCueIndex(null);
  };

  if (loading && !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#030014] text-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <span className="text-xs text-slate-400 mt-4">Loading translation workspace...</span>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#030014] text-slate-100 p-4">
        <div className="max-w-md bg-white/5 border border-white/10 rounded-2xl p-6 text-center backdrop-blur-xl">
          <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
          <h2 className="text-lg font-bold text-white mt-4">Job Workspace Error</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">{error}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to upload page</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const progressPercent =
    job.totalChunks > 0 ? Math.round((job.processedChunks / job.totalChunks) * 100) : 0;

  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const isTranslating =
    job.status === 'translating' || job.status === 'parsing' || job.status === 'rebuilding';

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-[#030014]">
      {/* Decorative gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md px-8 py-4 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white p-2 rounded-xl transition-all active:scale-95"
              title="Return Home"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-white truncate max-w-xs sm:max-w-md">
                  {job.sourceFilename}
                </h1>
                <span className="text-[10px] bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded font-mono">
                  {job.targetLanguage}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Model: {job.model} &bull; Tone: {job.toneStyle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCompleted && (
              <a
                href={getExportUrl(jobId)}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:shadow-[0_0_20px_rgba(139,92,246,0.5)] active:scale-95"
              >
                <Download className="h-4 w-4" />
                <span>Export SRT</span>
              </a>
            )}
            {isFailed && (
              <button
                onClick={handleStartTranslate}
                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Restart Translation</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-grow max-w-5xl w-full mx-auto py-10 px-4 flex flex-col gap-6">
        {/* Status Card */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="bg-purple-600/20 border border-purple-500/30 p-3 rounded-2xl text-purple-400">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-mono tracking-wider font-semibold">
                  Job Workspace ID: {jobId}
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  {isCompleted
                    ? 'Translation Completed'
                    : isFailed
                    ? 'Translation Interrupted'
                    : 'Translating Subtitles...'}
                </h2>
                <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Created {new Date(job.createdAt).toLocaleTimeString()}
                  </span>
                  <span>&bull;</span>
                  <span>
                    {job.totalCues} original cues &bull; {job.totalChunks} chunks
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Circular/Badge */}
            <div className="flex flex-col items-end shrink-0">
              <div className="text-2xl font-black text-purple-300 font-mono">
                {progressPercent}%
              </div>
              <div className="text-[10px] uppercase text-slate-400 font-mono tracking-wider mt-0.5">
                {job.processedChunks} of {job.totalChunks} chunks processed
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/5 rounded-full h-2 mt-6 overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {job.errorMessage && isFailed && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl p-4 flex gap-3 items-start text-xs leading-normal mt-4">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Error summary: </span>
                <span>{job.errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Chunks grid */}
        <ChunkGrid chunks={job.chunks} onRetry={handleRetryChunk} jobStatus={job.status} />

        {/* Quality control validation list */}
        <ValidationReport issues={job.validationIssues} onSelectCue={handleSelectCue} />

        {/* Side by side preview */}
        <SubtitlePreview
          chunks={job.chunks}
          validationIssues={job.validationIssues}
          selectedCueIndex={selectedCueIndex}
          onClearSelectedCue={handleClearSelectedCue}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 px-8 text-center text-[10px] text-slate-500 mt-12">
        <div className="max-w-5xl mx-auto">
          &copy; {new Date().getFullYear()} Subtitle Translator. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
