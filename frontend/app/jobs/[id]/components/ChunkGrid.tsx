'use client';

import React from 'react';
import type { TranslationChunk } from '@/lib/types';
import { Play, RotateCcw, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

type ChunkGridProps = {
  chunks: TranslationChunk[];
  onRetry: (chunkId: string) => void;
  jobStatus: string;
};

export default function ChunkGrid({ chunks, onRetry, jobStatus }: ChunkGridProps) {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
      <h2 className="text-lg font-semibold mb-4 text-purple-200 flex items-center gap-2">
        <span>Translation Chunks</span>
        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-normal">
          {chunks.filter((c) => c.status === 'completed').length} / {chunks.length} Done
        </span>
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {chunks.map((chunk) => {
          let statusColor = 'bg-slate-800 border-slate-700 text-slate-400';
          let statusIcon = null;

          if (chunk.status === 'processing') {
            statusColor = 'bg-purple-950/40 border-purple-500/50 text-purple-400 animate-pulse-glow';
            statusIcon = <Loader2 className="h-3 w-3 animate-spin" />;
          } else if (chunk.status === 'completed') {
            statusColor = 'bg-emerald-950/40 border-emerald-500/50 text-emerald-400';
            statusIcon = <CheckCircle className="h-3 w-3" />;
          } else if (chunk.status === 'failed') {
            statusColor = 'bg-rose-950/40 border-rose-500/50 text-rose-400';
            statusIcon = <AlertTriangle className="h-3 w-3" />;
          }

          return (
            <div
              key={chunk.id}
              className={`border rounded-xl p-3 flex flex-col justify-between gap-2 transition-all ${statusColor}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Chunk #{chunk.chunkIndex + 1}</span>
                {statusIcon}
              </div>

              <div className="text-[10px] opacity-70">
                {chunk.cueIndexes.length} cues
              </div>

              {chunk.usedProjectLabel && chunk.status === 'completed' && (
                <span className="text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded px-1.5 py-0.5 mt-1 font-mono text-center truncate select-all" title={`Translated by: ${chunk.usedProjectLabel}`}>
                  {chunk.usedProjectLabel}
                </span>
              )}

              {chunk.status === 'failed' && jobStatus !== 'translating' && (
                <button
                  onClick={() => onRetry(chunk.id)}
                  className="mt-1 flex items-center justify-center gap-1 text-[10px] bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 py-1 px-1.5 rounded transition-all font-medium border border-rose-500/30 active:scale-95 cursor-pointer"
                  title={chunk.errorMessage || 'Unknown error'}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  <span>Retry</span>
                </button>
              )}

              {chunk.errorMessage && chunk.status === 'failed' && (
                <div className="text-[9px] text-rose-300 leading-tight mt-1 max-h-8 overflow-y-auto font-mono scrollbar-none">
                  {chunk.errorMessage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
