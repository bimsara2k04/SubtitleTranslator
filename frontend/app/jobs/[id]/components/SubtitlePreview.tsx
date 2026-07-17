'use client';

import React, { useRef, useEffect } from 'react';
import type { SubtitleCue, TranslationChunk, ValidationIssue } from '@/lib/types';
import { ArrowRight, Eye, AlertTriangle, MessageSquare } from 'lucide-react';

type SubtitlePreviewProps = {
  chunks: TranslationChunk[];
  validationIssues: ValidationIssue[];
  selectedCueIndex: number | null;
  onClearSelectedCue: () => void;
};

export default function SubtitlePreview({
  chunks,
  validationIssues,
  selectedCueIndex,
  onClearSelectedCue,
}: SubtitlePreviewProps) {
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});

  // Scroll to the selected cue index when it updates
  useEffect(() => {
    if (selectedCueIndex !== null) {
      const element = rowRefs.current[selectedCueIndex];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect
        element.classList.add('bg-purple-500/20');
        const timer = setTimeout(() => {
          element.classList.remove('bg-purple-500/20');
          onClearSelectedCue();
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedCueIndex, onClearSelectedCue]);

  // Aggregate all cues across chunks
  const allCues = chunks
    .flatMap((chunk) => {
      return chunk.cuesToTranslate.map((cue) => {
        // Map corresponding translation if complete
        const translation = chunk.translatedItems?.find((t) => t.index === cue.index);
        return {
          ...cue,
          translatedLines: translation?.translatedLines || null,
          chunkIndex: chunk.chunkIndex,
          chunkStatus: chunk.status,
        };
      });
    })
    .sort((a, b) => a.index - b.index);

  if (allCues.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-purple-200 flex items-center gap-2">
          <Eye className="h-5 w-5" />
          <span>Bilingual Preview & Inspector</span>
        </h2>
        <div className="text-xs text-slate-400">
          Showing {allCues.length} cues
        </div>
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden max-h-[600px] overflow-y-auto relative">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-white/5 sticky top-0 backdrop-blur border-b border-white/10 text-slate-300 font-semibold z-10">
            <tr>
              <th className="py-3 px-4 w-16">#</th>
              <th className="py-3 px-4 w-40">Timing</th>
              <th className="py-3 px-4 w-1/2">Source (English)</th>
              <th className="py-3 px-4 w-1/2">Translation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {allCues.map((cue) => {
              const cueIssues = validationIssues.filter((i) => i.cueIndex === cue.index);
              const hasErrors = cueIssues.some((i) => i.severity === 'error');
              const hasWarnings = cueIssues.some((i) => i.severity === 'warning');

              let rowClass = 'hover:bg-white/5 transition-all';
              if (hasErrors) rowClass = 'bg-rose-950/10 hover:bg-rose-950/20 border-l-2 border-l-rose-500';
              else if (hasWarnings) rowClass = 'bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-l-amber-500';

              return (
                <tr
                  key={cue.index}
                  ref={(el) => {
                    rowRefs.current[cue.index] = el;
                  }}
                  className={rowClass}
                >
                  <td className="py-3 px-4 font-mono align-top text-purple-400 font-semibold">
                    {cue.index}
                  </td>
                  <td className="py-3 px-4 align-top font-mono text-[10px] text-slate-400 leading-normal">
                    <div>{cue.startTime}</div>
                    <div className="text-[9px] opacity-60 flex items-center gap-1 mt-0.5">
                      <ArrowRight className="h-2 w-2" />
                      <span>{cue.endTime}</span>
                    </div>
                    <div className="text-[9px] opacity-50 mt-0.5">
                      {(cue.durationMs / 1000).toFixed(2)}s
                    </div>
                  </td>
                  <td className="py-3 px-4 align-top leading-relaxed text-slate-200 whitespace-pre-line">
                    {cue.textLines.join('\n')}
                  </td>
                  <td className="py-3 px-4 align-top leading-relaxed whitespace-pre-line">
                    {cue.translatedLines ? (
                      <span className="text-purple-100">{cue.translatedLines.join('\n')}</span>
                    ) : cue.chunkStatus === 'processing' ? (
                      <span className="text-purple-400/60 italic shimmer px-2 py-0.5 rounded">
                        Translating...
                      </span>
                    ) : cue.chunkStatus === 'failed' ? (
                      <span className="text-rose-400 font-medium italic flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Translation failed
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Waiting...</span>
                    )}

                    {cueIssues.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {cueIssues.map((issue, issueIdx) => (
                          <div
                            key={issueIdx}
                            className={`flex items-start gap-1 text-[10px] leading-tight ${
                              issue.severity === 'error' ? 'text-rose-300' : 'text-amber-300'
                            }`}
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
