/**
 * MikaNotes Phase 2 - Editor Menu & Settings Modals
 * Supports loading preset TJA charts, custom TJA text import/export,
 * and switching to Phase 1 Core Verification Workbench.
 */

import React, { useState } from 'react';
import { X, FileText, Download, Upload, Activity, Sparkles, Copy, Check, FileCode } from 'lucide-react';
import { PRESET_CHARTS } from '../../core/sample-charts';
import { ChartModel, writeTJA } from '../../core';

interface EditorMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  chart: ChartModel;
  fileName: string;
  onLoadTja: (tja: string, fileName?: string) => void;
  onSwitchToWorkbench: () => void;
  onOpenTextEditor?: () => void;
}

export const EditorMenuModal: React.FC<EditorMenuModalProps> = ({
  isOpen,
  onClose,
  chart,
  fileName,
  onLoadTja,
  onSwitchToWorkbench,
  onOpenTextEditor,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'tja' | 'about'>('presets');
  const [tjaExportText, setTjaExportText] = useState<string>('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleOpenTjaTab = () => {
    setActiveTab('tja');
    try {
      const text = writeTJA(chart);
      setTjaExportText(text);
    } catch (e: any) {
      setTjaExportText('// TJA生成エラー: ' + e.message);
    }
  };

  const handleCopyTja = () => {
    navigator.clipboard.writeText(tjaExportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyTjaText = () => {
    if (tjaExportText.trim()) {
      onLoadTja(tjaExportText, fileName);
      onClose();
    }
  };

  const handleDownloadTja = () => {
    const text = writeTJA(chart);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.tja') ? fileName : `${fileName}.tja`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-base">MikaNotes メニュー</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-800 px-4 bg-slate-900/50">
          <button
            onClick={() => setActiveTab('presets')}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'presets'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            サンプル譜面
          </button>
          <button
            onClick={handleOpenTjaTab}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'tja'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            TJAテキスト読込/書出
          </button>
          <button
            onClick={() => {
              onClose();
              onSwitchToWorkbench();
            }}
            className="py-2 px-3 text-xs font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 ml-auto"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Phase 1 Core 検証</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 text-slate-200 text-sm">
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 mb-2">
                検証用プリセットを選択してエディタに読み込みます:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_CHARTS.map((preset) => (
                  <div
                    key={preset.id}
                    onClick={() => {
                      onLoadTja(preset.tja, `${preset.id}.tja`);
                      onClose();
                    }}
                    className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg cursor-pointer transition-all hover:border-blue-500/70"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white text-xs">{preset.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tja' && (
            <div className="space-y-3 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  現在のChartModelからwriteTJA()で生成されたテキスト:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyTja}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'コピー完了' : 'コピー'}</span>
                  </button>
                  <button
                    onClick={handleDownloadTja}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ダウンロード</span>
                  </button>
                </div>
              </div>

              <textarea
                value={tjaExportText}
                onChange={(e) => setTjaExportText(e.target.value)}
                className="w-full h-48 bg-slate-950 font-mono text-xs p-3 rounded-lg border border-slate-800 text-slate-200 focus:outline-none focus:border-blue-500"
                spellCheck={false}
              />

              <div className="flex items-center justify-between pt-1">
                {onOpenTextEditor ? (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTextEditor();
                    }}
                    className="px-3 py-2 bg-blue-950/70 hover:bg-blue-900 border border-blue-600/40 text-blue-300 hover:text-blue-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <FileCode className="w-4 h-4 text-blue-400" />
                    <span>専用テキストエディタを開く (構文検証・同期)</span>
                  </button>
                ) : (
                  <div />
                )}

                <button
                  onClick={handleApplyTjaText}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <Upload className="w-4 h-4" />
                  <span>このTJAテキストをエディタに反映 (parseTJA)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
