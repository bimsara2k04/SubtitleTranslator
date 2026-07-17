'use client';

import React from 'react';
import type { ValidationIssue } from '@/lib/types';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ValidationReportProps = {
  issues: ValidationIssue[];
  onSelectCue?: (cueIndex: number) => void;
};

export default function ValidationReport({ issues, onSelectCue }: ValidationReportProps) {
  if (issues.length === 0) {
    return (
      <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-3">
        <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-xl border border-emerald-500/30">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-emerald-200 text-sm">Validation Passed</h3>
          <p className="text-xs text-emerald-400/80 mt-0.5">
            No syntax errors, timestamp overlaps, or reading speed issues were detected.
          </p>
        </div>
      </div>
    );
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="text-lg font-semibold text-purple-200">Quality Control & Validation</h2>
        <div className="flex gap-3 text-xs">
          {errors.length > 0 && (
            <span className="bg-rose-500/20 border border-rose-500/30 text-rose-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
            </span>
          )}
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-2">
        {issues.map((issue, idx) => {
          const isError = issue.severity === 'error';
          const icon = isError ? (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          );

          const cardBg = isError
            ? 'bg-rose-950/20 border-rose-500/20 hover:bg-rose-950/30'
            : 'bg-amber-950/20 border-amber-500/20 hover:bg-amber-950/30';

          return (
            <div
              key={idx}
              onClick={() => issue.cueIndex !== null && onSelectCue?.(issue.cueIndex)}
              className={`border rounded-xl p-3 flex gap-3 items-start justify-between cursor-pointer transition-all ${cardBg}`}
            >
              <div className="flex gap-3 items-start">
                <div className="mt-0.5">{icon}</div>
                <div>
                  <div className="text-xs font-semibold flex items-center gap-2">
                    {issue.cueIndex !== null ? (
                      <span className="text-purple-300 hover:underline">
                        Cue #{issue.cueIndex}
                      </span>
                    ) : (
                      <span className="text-slate-300">File Header</span>
                    )}
                    <span className="text-[10px] opacity-50 uppercase font-mono tracking-wider">
                      [{issue.code}]
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-normal">
                    {issue.message}
                  </p>
                </div>
              </div>
              {issue.cueIndex !== null && (
                <span className="text-[10px] text-purple-400 hover:text-purple-300 shrink-0 font-medium">
                  Jump to row &rarr;
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
