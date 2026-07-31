'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { uploadSRT, getQuotaStatus, type QuotaStatusResult } from '@/lib/api';
import { Upload, FileText, Globe, Cpu, Languages, Sparkles, BookOpen, AlertCircle, KeyRound, RefreshCw } from 'lucide-react';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — matches backend limit

const TARGET_LANGUAGES = [
  { code: 'Spanish', name: 'Spanish (Español)' },
  { code: 'French', name: 'French (Français)' },
  { code: 'German', name: 'German (Deutsch)' },
  { code: 'Italian', name: 'Italian (Italiano)' },
  { code: 'Portuguese', name: 'Portuguese (Português)' },
  { code: 'Japanese', name: 'Japanese (日本語)' },
  { code: 'Korean', name: 'Korean (한국어)' },
  { code: 'Chinese (Simplified)', name: 'Chinese Simplified (简体中文)' },
  { code: 'Chinese (Traditional)', name: 'Chinese Traditional (繁體中文)' },
  { code: 'Hindi', name: 'Hindi (हिन्दी)' },
  { code: 'Sinhala', name: 'Sinhala (සිංහල)' },
  { code: 'Arabic', name: 'Arabic (العربية)' },
  { code: 'Russian', name: 'Russian (Русский)' },
  { code: 'Dutch', name: 'Dutch (Nederlands)' },
  { code: 'Turkish', name: 'Turkish (Türkçe)' },
];

const MODELS = [
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Recommended & Best Quality)', speed: 'Fastest', quality: 'Highest' },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Budget)', speed: 'Fastest', quality: 'High' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Often Busy)', speed: 'Fastest', quality: 'Highest' },
];

const TONES = [
  { id: 'natural', name: 'Natural (Idiomatic & Context-Aware)' },
  { id: 'literal', name: 'Literal (Strict Direct Translation)' },
  { id: 'formal', name: 'Formal (Polite & Grammatically Precise)' },
  { id: 'casual', name: 'Casual (Informal & Spoken Slang)' },
];

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('Sinhala');
  const [model, setModel] = useState('gemini-3.6-flash');
  const [toneStyle, setToneStyle] = useState('natural');
  const [glossary, setGlossary] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quota, setQuota] = useState<QuotaStatusResult | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);

  const fetchQuota = useCallback(async () => {
    const result = await getQuotaStatus();
    if (result.ok) {
      // Compute per-key exhaustion state at fetch time (not during render).
      const now = Date.now();
      setQuota({
        ...result,
        keys: result.keys.map((k) => ({
          ...k,
          exhausted: !!(
            k.onCooldown &&
            k.cooldownExpiresAt &&
            new Date(k.cooldownExpiresAt).getTime() - now > 10 * 60 * 1000
          ),
        })),
      });
    } else {
      setQuota(result);
    }
    setQuotaLoading(false);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void fetchQuota(), 0);
    const interval = setInterval(() => void fetchQuota(), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchQuota]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/x-subrip': ['.srt'],
      'text/plain': ['.srt'],
      'application/octet-stream': ['.srt'],
    },
    maxFiles: 1,
    maxSize: MAX_UPLOAD_BYTES,
    onDrop: (acceptedFiles) => {
      setError(null);
      const accepted = acceptedFiles[0];
      if (accepted) {
        setFile(accepted);
      }
    },
    onDropRejected: (fileRejections) => {
      const first = fileRejections[0];
      if (first?.errors.some((e) => e.code === 'file-too-large')) {
        setError('File is too large. The maximum allowed size is 5MB.');
      } else {
        setError('File rejected. Please choose a single .srt subtitle file.');
      }
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select or upload an SRT file.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await uploadSRT({
        file,
        targetLanguage,
        model,
        toneStyle,
        glossary: glossary.trim() || undefined,
      });

      // Redirect to the job status page
      router.push(`/jobs/${response.jobId}`);
    } catch (err: unknown) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to initialize translation job. Make sure the backend server is running.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-[#030014]">
      {/* Decorative Gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-white/5 bg-black/20 backdrop-blur-md px-8 py-4 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-purple-600/20 border border-purple-500/30 p-2 rounded-xl text-purple-400">
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white">Gemini Subtitle Translator</h1>
              <p className="text-[10px] text-slate-400/80">Structured SRT translation with metadata preservation</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <a href="https://github.com/bimsara2k04/SubtitleTranslator" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-100 transition-colors">
              Repository
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-2xl bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl shadow-2xl relative">
          <div className="flex flex-col gap-6">
            <div className="text-center max-w-md mx-auto">
              <h2 className="text-2xl font-bold tracking-tight text-white">Translate Subtitles with Gemini</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Upload your English <code className="text-purple-300 font-mono">.srt</code> subtitle file. We parse captions into structured blocks, translate only text to keep timing metadata safe, and rebuild the export.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragActive
                    ? 'border-purple-500 bg-purple-500/5'
                    : file
                    ? 'border-purple-500/30 bg-purple-500/5'
                    : 'border-white/15 bg-white/0 hover:bg-white/5 hover:border-white/30'
                }`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-purple-600/20 border border-purple-500/30 p-4 rounded-full text-purple-400">
                      <FileText className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-semibold text-white mt-2">{file.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB &bull; Click or drag to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-full text-slate-400">
                      <Upload className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-semibold text-white mt-2">
                      {isDragActive ? 'Drop your subtitle here' : 'Upload subtitle file'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Drag & drop an <code className="text-purple-300 font-mono">.srt</code> file, or click to browse
                    </p>
                  </div>
                )}
              </div>

              {/* Grid Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Language Select */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-purple-400" />
                    <span>Target Language</span>
                  </label>
                  <select
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    {TARGET_LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tone Select */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5 text-purple-400" />
                    <span>Translation Tone</span>
                  </label>
                  <select
                    value={toneStyle}
                    onChange={(e) => setToneStyle(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    {TONES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Model Select */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-purple-400" />
                  <span>Gemini Model</span>
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Glossary Options */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-purple-400" />
                  <span>Glossary terms (Optional)</span>
                </label>
                <textarea
                  value={glossary}
                  onChange={(e) => setGlossary(e.target.value)}
                  placeholder={`Term mapping format (one per line):\n"AI" -> "IA"\n"John" -> "Juan"`}
                  rows={3}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors font-mono resize-none"
                />
              </div>

              {/* Error messages */}
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl p-4 flex gap-3 items-start text-xs leading-normal">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-semibold py-3.5 px-4 rounded-xl text-xs tracking-wide transition-all active:scale-[0.99] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] disabled:shadow-none flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Initializing translation job...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Upload & Setup Translation</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Quota Status Panel */}
        <div className="w-full max-w-2xl mt-4 bg-white/3 border border-white/8 rounded-2xl p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <KeyRound className="h-3.5 w-3.5 text-purple-400" />
              <span>API Key Pool — Daily Quota</span>
            </div>
            <button
              onClick={fetchQuota}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              title="Refresh quota status"
            >
              <RefreshCw className={`h-3 w-3 ${quotaLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {quotaLoading && !quota ? (
            <p className="text-[10px] text-slate-500 text-center py-2">Loading quota status...</p>
          ) : !quota?.ok ? (
            <p className="text-[10px] text-amber-400/80 text-center py-2">
              {quota?.reason === 'offline'
                ? 'Backend offline — start the backend server to see key quota.'
                : quota?.message ?? 'Could not load quota status.'}
            </p>
          ) : quota.keys.length === 0 ? (
            <p className="text-[10px] text-amber-400/80 text-center py-2">
              No Gemini API keys configured on the backend.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {quota.keys.map((k) => {
                const pct = Math.round((k.dailyCallsUsed / Math.max(k.dailyCallsLimit, 1)) * 100);
                const exhausted = k.exhausted ?? false;
                const statusColor = exhausted ? 'bg-rose-500' : k.onCooldown ? 'bg-amber-500' : 'bg-emerald-500';
                const barColor = exhausted ? 'bg-rose-500/60' : k.onCooldown ? 'bg-amber-500/60' : 'bg-purple-500/70';
                return (
                  <div key={k.label} className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
                    <span className="text-[10px] text-slate-400 w-16 shrink-0">{k.label}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums shrink-0 text-slate-400">
                      {k.dailyCallsUsed}/{k.dailyCallsLimit}
                    </span>
                    <span className={`text-[9px] shrink-0 font-medium ${
                      exhausted ? 'text-rose-400' : k.onCooldown ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {exhausted ? 'Exhausted' : k.onCooldown ? 'Cooling' : `${k.dailyCallsRemaining} left`}
                    </span>
                  </div>
                );
              })}
              <p className="text-[9px] text-slate-500 mt-1 text-right">
                {quota.remainingToday} requests left across {quota.keyCount} keys
                &nbsp;·&nbsp; Resets midnight PT &nbsp;·&nbsp; Auto-refreshes every 30s
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 px-8 text-center text-[10px] text-slate-500">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>&copy; {new Date().getFullYear()} Subtitle Translator. Powered by Gemini Interactions & Structured Outputs.</span>
          <span>Academic Portfolio Project</span>
        </div>
      </footer>
    </div>
  );
}
