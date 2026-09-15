/**
 * MikaNotes Phase 2 - TJA Text Editor Modal
 * Provides full bidirectional editing between Visual Editor and raw TJA text.
 * Uses validateTJARaw() and scanTJAInfo() for diagnostics, protects existing ChartModel on errors,
 * and tracks dirty state with an unapplied changes confirmation dialog.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  FileCode,
  ShieldCheck,
  RotateCcw,
  Layers,
  Music,
} from 'lucide-react';
import { ChartModel, validateTJARaw, scanTJAInfo, writeTJA, ValidationIssue, ScanResult } from '../../core';

interface TjaTextEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  chart: ChartModel;
  fileName: string;
  onApplyTja: (text: string) => { success: boolean; error?: string };
}

export const TjaTextEditorModal: React.FC<TjaTextEditorModalProps> = ({
  isOpen,
  onClose,
  chart,
  fileName,
  onApplyTja,
}) => {
  const [text, setText] = useState<string>('');
  const [initialText, setInitialText] = useState<string>('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [scanInfo, setScanInfo] = useState<ScanResult | null>(null);
  const [hasValidated, setHasValidated] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [showValidationDrawer, setShowValidationDrawer] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync text from current chart whenever modal opens
  useEffect(() => {
    if (isOpen) {
      try {
        const generated = writeTJA(chart);
        setText(generated);
        setInitialText(generated);
        setIssues([]);
        setScanInfo(null);
        setHasValidated(false);
        setApplyError(null);
        setShowDiscardConfirm(false);
        setShowValidationDrawer(false);
      } catch (err: any) {
        console.error('Failed to generate TJA:', err);
        setText('// TJA生成エラー: ' + err.message);
      }
    }
  }, [isOpen, chart]);

  if (!isOpen) return null;

  const isDirty = text !== initialText;

  // Run validation using Core validateTJARaw and scanTJAInfo
  const handleValidate = () => {
    setApplyError(null);
    try {
      const valResult = validateTJARaw(text);
      const scan = scanTJAInfo(text);
      setIssues([...valResult.errors, ...valResult.warnings]);
      setScanInfo(scan);
      setHasValidated(true);
      setShowValidationDrawer(true);
    } catch (err: any) {
      setApplyError('検証例外: ' + err.message);
    }
  };

  // Apply changes back to Visual Editor
  const handleApply = () => {
    setApplyError(null);
    const result = onApplyTja(text);
    if (!result.success) {
      setApplyError(result.error || 'TJAの適用に失敗しました。現在の譜面は保護されています。');
      // Also trigger validation to show issues
      handleValidate();
    } else {
      // Applied successfully: close modal
      setInitialText(text);
      onClose();
    }
  };

  // Handle Close / Cancel request
  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  // Allow tab key indentation in textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;

      target.value = value.substring(0, start) + '  ' + value.substring(end);
      target.selectionStart = target.selectionEnd = start + 2;
      setText(target.value);
    }
  };

  const errorCount = issues.filter((i) => i.type === 'error').length;
  const warningCount = issues.filter((i) => i.type === 'warning').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="bg-[#0b1220] border border-slate-700/80 rounded-xl w-full max-w-5xl h-[92dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="h-12 bg-[#080d17] border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-white text-sm font-sans tracking-tight">
              TJA Text Editor
            </span>
            <span className="text-xs font-mono text-slate-400 truncate max-w-[140px] sm:max-w-[200px]">
              ({fileName})
            </span>
            {isDirty ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                未適用
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                同期済
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Reset to initial */}
            {isDirty && (
              <button
                onClick={() => setText(initialText)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1 transition-colors"
                title="編集前の状態に戻す"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">リセット</span>
              </button>
            )}

            {/* Validate */}
            <button
              id="btn-validate-tja"
              onClick={handleValidate}
              className="px-2.5 sm:px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 hover:text-sky-200 flex items-center gap-1 transition-colors border border-sky-500/30"
              title="validateTJARaw() による構文検査"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>検証</span>
            </button>

            {/* Apply */}
            <button
              id="btn-apply-tja"
              onClick={handleApply}
              className="px-3 sm:px-4 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1 transition-all shadow-md active:scale-95"
              title="Visual Editorに反映"
            >
              <Check className="w-3.5 h-3.5" />
              <span>適用</span>
            </button>

            {/* Cancel / Close */}
            <button
              id="btn-close-text-editor"
              onClick={handleRequestClose}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors ml-1"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Alert Banner */}
        {applyError && (
          <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 text-xs text-rose-200 flex items-center justify-between shrink-0 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-semibold">適用エラー:</span>
              <span className="font-mono">{applyError}</span>
            </div>
            <button
              onClick={() => setApplyError(null)}
              className="text-rose-400 hover:text-rose-200 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Heavy Chart Warning Banner */}
        {scanInfo?.isHeavy && (
          <div className="bg-amber-950/60 border-b border-amber-800/60 px-4 py-1.5 text-xs text-amber-300 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              警告: 1000小節以上の大量小節、または大量ノーツを含む重い譜面です（推定小節数: {scanInfo.totalMeasures}）。
            </span>
          </div>
        )}

        {/* Editor Body */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <textarea
            ref={textareaRef}
            id="tja-text-editor-area"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setHasValidated(false);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 w-full bg-[#070b14] text-slate-100 font-mono text-xs sm:text-sm p-4 resize-none focus:outline-none leading-relaxed border-none selection:bg-blue-600 selection:text-white"
            placeholder="ここにTJAテキストを入力または編集..."
            spellCheck={false}
          />

          {/* Validation Drawer / Panel */}
          {hasValidated && showValidationDrawer && (
            <div className="h-44 sm:h-52 bg-[#090f1d] border-t border-slate-700 flex flex-col shrink-0 text-xs">
              <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                    構文検証結果
                  </span>
                  {errorCount === 0 && warningCount === 0 ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      構文エラー・警告なし（正常）
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {errorCount > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
                          エラー: {errorCount}
                        </span>
                      )}
                      {warningCount > 0 && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                          警告: {warningCount}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {scanInfo && (
                  <div className="hidden sm:flex items-center gap-3 text-slate-400 text-[11px]">
                    <span className="flex items-center gap-1">
                      <Music className="w-3 h-3 text-slate-500" />
                      BPM: {scanInfo.initialBpm}
                    </span>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3 text-slate-500" />
                      コース数: {scanInfo.courseCount}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setShowValidationDrawer(false)}
                  className="text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Issues list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono">
                {issues.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    問題は見つかりませんでした。安全に適用できます。
                  </div>
                ) : (
                  issues.map((issue, idx) => (
                    <div
                      key={`issue-${idx}`}
                      className={`p-2 rounded flex items-start gap-2 text-xs border ${
                        issue.type === 'error'
                          ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                          : 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                      }`}
                    >
                      {issue.type === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <span className="font-bold shrink-0">
                        行 {issue.line ?? '?'}:
                      </span>
                      <span className="flex-1 break-all">{issue.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="h-7 bg-[#080d17] border-t border-slate-800 px-3 flex items-center justify-between text-[11px] font-mono text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            <span>文字数: {text.length}</span>
            <span>行数: {text.split('\n').length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Visual Editor ↔ TJA Text Editor 同期</span>
          </div>
        </div>
      </div>

      {/* Discard Confirmation Modal (PHASE 5: Text Editorの同期状態) */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-xl p-5 max-w-sm w-full shadow-2xl text-slate-100">
            <h3 className="font-bold text-sm text-white mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              未適用の変更があります
            </h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              TJAテキストに未適用の変更が存在します。Visual Editorへ戻る前に変更を適用しますか？
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowDiscardConfirm(false);
                  handleApply();
                }}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>変更を適用して戻る</span>
              </button>
              <button
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium"
              >
                変更を破棄して戻る
              </button>
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="w-full py-1.5 text-xs text-slate-400 hover:text-white"
              >
                編集を続ける
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
