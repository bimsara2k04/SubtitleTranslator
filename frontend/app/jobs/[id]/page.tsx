'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { getJobDetails, startTranslation, retryChunk, getExportUrl, getJobEstimate, type EstimateResponse } from '@/lib/api';
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
  Cpu,
  Layers,
  Info,
  ShieldCheck,
  Check,
} from 'lucide-react';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function JobStatusPage({ params }: PageProps) {
  // Resolve params promise
  const resolvedParams = use(params);
  const jobId = resolvedParams.id;

  const [job, setJob] = useState<JobDetails | null>(null);
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(null);

  // Fetch job details
  const fetchJob = useCallback(async () => {
    try {
      const data = await getJobDetails(jobId);
      setJob(data);

      if (data.status === 'pending' && !estimate) {
        setEstimateLoading(true);
        try {
          const est = await getJobEstimate(jobId);
          setEstimate(est);
        } catch (err) {
          console.error('Failed to load pre-flight estimates', err);
        } finally {
          setEstimateLoading(false);
        }
      }
      setError(null);
    } catch (err: any) {
      console.error('Error fetching job details:', err);
      setError(err?.message || 'Failed to sync job details.');
    } finally {
      setLoading(false);
    }
  }, [jobId, estimate]);

  // Polling hook when job is in active translation state
  useEffect(() => {
    fetchJob();

    const interval = setInterval(() => {
      if (job) {
        const isProcessing =
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
        {job.status === 'pending' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Estimates & Start Translation */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-[-20%] left-[-20%] w-[50%] h-[50%] rounded-full bg-purple-900/5 blur-[80px] pointer-events-none" />
                
                <div className="flex items-center gap-3.5 mb-6">
                  <div className="bg-purple-600/20 border border-purple-500/30 p-3 rounded-2xl text-purple-400">
                    <Sparkles className="h-6 w-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Pre-flight Quota & Call Estimates</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Analysis of subtitle file payload and active Gemini key pool</p>
                  </div>
                </div>

                {estimateLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                    <span className="text-xs text-slate-400 mt-3">Analyzing subtitle and token structures...</span>
                  </div>
                ) : estimate ? (
                  <div className="flex flex-col gap-6">
                    {/* Metrics Grid */}
                    <div className="grid grid-cols-3 gap-4 bg-white/5 p-5 rounded-2xl border border-white/5">
                      <div className="flex flex-col text-center">
                        <span className="text-[10px] uppercase text-slate-400 font-mono tracking-wider">Required Calls</span>
                        <span className="text-2xl font-black text-purple-300 font-mono mt-1.5">{estimate.estimatedCalls}</span>
                      </div>
                      <div className="flex flex-col text-center border-x border-white/5">
                        <span className="text-[10px] uppercase text-slate-400 font-mono tracking-wider">Est. Tokens</span>
                        <span className="text-2xl font-black text-purple-300 font-mono mt-1.5">
                          {estimate.estimatedTotalTokens.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col text-center">
                        <span className="text-[10px] uppercase text-slate-400 font-mono tracking-wider">Est. Time</span>
                        <span className="text-2xl font-black text-purple-300 font-mono mt-1.5">
                          {Math.max(1, Math.round(estimate.estimatedCalls * 1.5))}m
                        </span>
                      </div>
                    </div>

                    {/* Warnings / OK Badges */}
                    {estimate.throttleWarning ? (
                      <div className={`p-4.5 rounded-2xl border flex gap-3.5 text-xs leading-relaxed ${
                        estimate.canCompleteWithFailover 
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                      }`}>
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold mb-0.5 text-sm">Quota Failover Notification</p>
                          <p className="text-[11px] opacity-90">{estimate.throttleWarning}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4.5 rounded-2xl flex gap-3.5 text-xs leading-relaxed">
                        <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold mb-0.5 text-sm">Quota Health OK</p>
                          <p className="text-[11px] opacity-90">All configured projects have sufficient quota. Translation will complete without needing failover.</p>
                        </div>
                      </div>
                    )}

                    {/* Action Button */}
                    <button
                      onClick={handleStartTranslate}
                      disabled={loading || (!estimate.canCompleteWithFailover && !confirm('The remaining quota may not be enough to finish. Do you want to try anyway?'))}
                      className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-bold py-4 px-6 rounded-xl text-xs tracking-wider transition-all active:scale-[0.99] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer mt-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-white" />
                          <span>Preparing Workspace...</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 fill-current animate-pulse" />
                          <span>Start Translation Run</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-8">Could not calculate job estimates. Try reloading the page.</p>
                )}
              </div>
            </div>

            {/* Right Column: Key Pool status */}
            <div className="flex flex-col gap-6">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
                <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] rounded-full bg-violet-900/5 blur-[80px] pointer-events-none" />

                <div className="flex items-center gap-2 mb-5">
                  <Cpu className="h-4.5 w-4.5 text-purple-400" />
                  <h3 className="text-xs font-bold text-white tracking-wide uppercase font-mono">Active Gemini Key Pool</h3>
                </div>

                <div className="flex flex-col gap-3.5">
                  {estimate?.projects?.map((proj) => (
                    <div key={proj.label} className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{proj.label}</span>
                        {proj.onCooldown ? (
                          <span className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-mono font-medium">
                            Cooldown
                          </span>
                        ) : proj.canCompleteJobAlone ? (
                          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                            <Check className="h-2.5 w-2.5" /> Can run alone
                          </span>
                        ) : (
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                            Needs failover
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1">
                        <span>Used today:</span>
                        <span>{proj.dailyCallsUsed} / {proj.dailyCallsLimit}</span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                        <span>Remaining calls:</span>
                        <span className={proj.dailyCallsRemaining === 0 ? 'text-rose-400 font-black' : 'text-purple-300 font-black'}>
                          {proj.dailyCallsRemaining}
                        </span>
                      </div>

                      {proj.cooldownExpiresAt && (
                        <div className="text-[8px] text-slate-500 font-mono mt-1 text-right">
                          Expires: {new Date(proj.cooldownExpiresAt).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  ))}

                  {(!estimate?.projects || estimate.projects.length === 0) && (
                    <p className="text-[10px] text-slate-500 text-center py-4">No active projects configured.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
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
