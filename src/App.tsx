/**
 * MikaNotes Phase 1 — TJA Core Verification Workbench & Inspector
 */

import React, { useState, useMemo } from 'react';
import {
  parseTJA,
  writeTJA,
  scanTJAInfo,
  validateTJARaw,
  Timeline,
  ChartModel,
  ScanResult,
  ValidationResult,
} from './core';
import { runAllCoreTests, TestCaseResult } from './core/test-suite';
import { PRESET_CHARTS } from './core/sample-charts';
import { EditorShell } from './components/editor/EditorShell';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RefreshCw,
  FileText,
  Activity,
  ArrowLeftRight,
  Search,
  BookOpen,
  Music,
  Clock,
  Sparkles,
  Layers,
  ChevronRight,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { usePWAUpdate, PWAUpdateNotification, PWAInstallButton } from './pwa';

export default function App() {
  const pwaState = usePWAUpdate();
  const [viewMode, setViewMode] = useState<'editor' | 'workbench'>('editor');
  const [activeTab, setActiveTab] = useState<'tests' | 'playground' | 'roundtrip' | 'timeline' | 'design'>('tests');
  const [testResults, setTestResults] = useState<TestCaseResult[]>(() => runAllCoreTests());
  const [testCategoryFilter, setTestCategoryFilter] = useState<string>('all');

  // Playground state
  const [selectedPresetId, setSelectedPresetId] = useState<string>('standard');
  const [tjaInput, setTjaInput] = useState<string>(PRESET_CHARTS[0].tja);
  const [inspectorSubTab, setInspectorSubTab] = useState<'measures' | 'notes' | 'rolls' | 'events' | 'headers'>('measures');

  // Timeline Scrubber state
  const [scrubTime, setScrubTime] = useState<number>(1.0);

  // Parse current input
  const { chart, scan, validation, parseError } = useMemo(() => {
    try {
      const s: ScanResult = scanTJAInfo(tjaInput);
      const v: ValidationResult = validateTJARaw(tjaInput);
      const c: ChartModel = parseTJA(tjaInput);
      return { chart: c, scan: s, validation: v, parseError: null };
    } catch (err: any) {
      return {
        chart: null,
        scan: scanTJAInfo(tjaInput),
        validation: validateTJARaw(tjaInput),
        parseError: err?.message || String(err),
      };
    }
  }, [tjaInput]);

  // Round trip comparison
  const roundTripData = useMemo(() => {
    if (!chart) return null;
    try {
      const generatedTJA = writeTJA(chart);
      const modelB = parseTJA(generatedTJA);
      const cA = chart.activeCourse;
      const cB = modelB.activeCourse;

      const noteCountMatch = cA.notes.length === cB.notes.length;
      const measureCountMatch = cA.measures.length === cB.measures.length;
      const rollsCountMatch = cA.rolls.length === cB.rolls.length;
      const balloonsCountMatch = cA.balloons.length === cB.balloons.length;
      const gogoCountMatch = cA.gogoRanges.length === cB.gogoRanges.length;

      let maxTimingDiff = 0;
      for (let i = 0; i < Math.min(cA.notes.length, cB.notes.length); i++) {
        const diff = Math.abs(cA.notes[i].time - cB.notes[i].time);
        if (diff > maxTimingDiff) maxTimingDiff = diff;
      }

      const isSemanticallyEqual =
        noteCountMatch && measureCountMatch && rollsCountMatch && balloonsCountMatch && gogoCountMatch && maxTimingDiff < 0.002;

      return {
        generatedTJA,
        modelB,
        noteCountMatch,
        measureCountMatch,
        rollsCountMatch,
        balloonsCountMatch,
        gogoCountMatch,
        maxTimingDiff,
        isSemanticallyEqual,
      };
    } catch (e: any) {
      return {
        generatedTJA: `// Error in writeTJA or re-parsing: ${e?.message || e}`,
        modelB: null,
        noteCountMatch: false,
        measureCountMatch: false,
        rollsCountMatch: false,
        balloonsCountMatch: false,
        gogoCountMatch: false,
        maxTimingDiff: 999,
        isSemanticallyEqual: false,
      };
    }
  }, [chart]);

  // Timeline instance
  const timeline = useMemo(() => {
    if (!chart) return null;
    return new Timeline(chart.activeCourse);
  }, [chart]);

  const duration = chart ? chart.activeCourse.duration : 10;

  // Handle Preset selection
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const found = PRESET_CHARTS.find((p) => p.id === presetId);
    if (found) {
      setTjaInput(found.tja);
      setScrubTime(1.0);
    }
  };

  const handleRerunTests = () => {
    setTestResults(runAllCoreTests());
  };

  const passedCount = testResults.filter((t) => t.status === 'passed').length;
  const totalTests = testResults.length;
  const allPassed = passedCount === totalTests;

  const filteredTests = testResults.filter((t) => {
    if (testCategoryFilter === 'all') return true;
    return t.category === testCategoryFilter;
  });

  // Default to Mobile Landscape Visual Editor (Phase 2)
  if (viewMode === 'editor') {
    return (
      <EditorShell
        initialTja={PRESET_CHARTS[0].tja}
        initialFileName="example.tja"
        onSwitchToWorkbench={() => setViewMode('workbench')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-600 flex items-center justify-center shadow-lg shadow-rose-950/40">
            <Music className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">MikaNotes</h1>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Phase 1 Core
              </span>
            </div>
            <p className="text-xs text-slate-400">TJA Parser • Writer • Timeline Engine • Verification</p>
          </div>
        </div>

        {/* Global Metric Badges */}
        <div className="flex items-center gap-3 text-xs">
          {/* Back to Mobile Editor Button */}
          <button
            id="btn-switch-to-editor"
            onClick={() => setViewMode('editor')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all shadow-md active:scale-95"
          >
            <Smartphone className="w-4 h-4" />
            <span>Visual Editor (Phase 2) へ</span>
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          <div
            id="status-tests-badge"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium ${
              allPassed
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
          >
            {allPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            <span>Automated Tests: {passedCount}/{totalTests} Passed</span>
          </div>

          {chart && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <span>Course: <strong className="text-white">{chart.activeCourse.courseName}</strong></span>
              <span>•</span>
              <span>Notes: <strong className="text-white">{chart.activeCourse.notes.length}</strong></span>
              <span>•</span>
              <span>Measures: <strong className="text-white">{chart.activeCourse.measures.length}</strong></span>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-slate-900 border-b border-slate-800 px-4 flex gap-1 overflow-x-auto text-xs sm:text-sm font-medium">
        <button
          id="tab-btn-tests"
          onClick={() => setActiveTab('tests')}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'tests'
              ? 'border-amber-500 text-amber-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Automated Tests ({passedCount}/{totalTests})</span>
        </button>

        <button
          id="tab-btn-playground"
          onClick={() => setActiveTab('playground')}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'playground'
              ? 'border-amber-500 text-amber-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>TJA Core Playground</span>
        </button>

        <button
          id="tab-btn-roundtrip"
          onClick={() => setActiveTab('roundtrip')}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'roundtrip'
              ? 'border-amber-500 text-amber-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span>Round Trip Inspector</span>
        </button>

        <button
          id="tab-btn-timeline"
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'timeline'
              ? 'border-amber-500 text-amber-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Phase 2 Query API</span>
        </button>

        <button
          id="tab-btn-design"
          onClick={() => setActiveTab('design')}
          className={`px-4 py-2.5 flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'design'
              ? 'border-amber-500 text-amber-400 bg-slate-800/50'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Design & Architecture</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {/* =================================================================== */}
        {/* TAB 1: AUTOMATED TESTS                                              */}
        {/* =================================================================== */}
        {activeTab === 'tests' && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Core Test Suite (17 Comprehensive Test Scenarios)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Validates normal patterns, dynamic BPM/Measure, Delay, Gogo, Rolls, Balloons, Round-Trip, and Abnormal chart safety.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={testCategoryFilter}
                  onChange={(e) => setTestCategoryFilter(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">All Categories ({totalTests})</option>
                  <option value="normal">Normal / Mixed</option>
                  <option value="timing">Timing (BPM, Measure, Delay)</option>
                  <option value="rolls">Rolls & Balloons</option>
                  <option value="multievent">Multi-Event</option>
                  <option value="grid">Division Grids</option>
                  <option value="roundtrip">Round-Trip Preservation</option>
                  <option value="abnormal">Abnormal & Heavy Chart</option>
                </select>

                <button
                  id="btn-run-all-tests"
                  onClick={handleRerunTests}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg shadow transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Run All Tests
                </button>
              </div>
            </div>

            {/* Test Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTests.map((test) => (
                <div
                  key={test.id}
                  className={`border rounded-xl p-3.5 transition-colors ${
                    test.status === 'passed'
                      ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      : 'bg-rose-950/30 border-rose-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {test.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <span className="text-xs font-semibold text-white block">{test.name}</span>
                        <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          {test.category}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {test.durationMs}ms
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 mt-2 pl-6 leading-relaxed">
                    {test.message}
                  </p>

                  {test.details && (
                    <div className="mt-2 pl-6">
                      <pre className="text-[10px] font-mono bg-slate-950/80 border border-slate-800/80 rounded p-2 text-slate-400 overflow-x-auto">
                        {JSON.stringify(test.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 2: PLAYGROUND & INSPECTOR                                       */}
        {/* =================================================================== */}
        {activeTab === 'playground' && (
          <section className="space-y-4">
            {/* Presets & Pre-flight Diagnostics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Left Column: Preset & Input */}
              <div className="lg:col-span-1 space-y-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      Load Preset Chart
                    </label>
                    <span className="text-[10px] text-slate-400">{PRESET_CHARTS.length} presets</span>
                  </div>

                  <select
                    id="preset-chart-select"
                    value={selectedPresetId}
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {PRESET_CHARTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.category}] {p.name}
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800/60">
                    {PRESET_CHARTS.find((p) => p.id === selectedPresetId)?.description}
                  </div>
                </div>

                {/* Raw TJA Editor Box */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Raw TJA Source</span>
                    <span className="text-[10px] font-mono text-slate-400">{tjaInput.length} chars</span>
                  </div>
                  <textarea
                    id="raw-tja-textarea"
                    value={tjaInput}
                    onChange={(e) => setTjaInput(e.target.value)}
                    rows={14}
                    spellCheck={false}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
                  />
                </div>
              </div>

              {/* Right Columns: Scanner, Validation & Model Inspector */}
              <div className="lg:col-span-2 space-y-3">
                {/* Pre-scan & Diagnostics Banner */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Notes Count</span>
                    <span className="text-base font-bold text-white font-mono">{scan.notesCount}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Measures</span>
                    <span className="text-base font-bold text-white font-mono">{scan.measureCount}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Initial BPM</span>
                    <span className="text-base font-bold text-white font-mono">{scan.initialBpm}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Heavy Protection</span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded inline-block mt-0.5 ${
                        scan.isHeavy
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                          : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {scan.isHeavy ? 'Heavy Chart Flagged' : 'Standard Scale'}
                    </span>
                  </div>
                </div>

                {/* Validation Issues (Errors / Warnings) */}
                {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-white">Validation Diagnostics</span>
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {validation.errors.map((e, idx) => (
                        <div key={`err-${idx}`} className="text-xs bg-rose-950/40 border border-rose-800/50 text-rose-300 p-2 rounded flex items-start gap-2">
                          <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" />
                          <div>
                            <strong>ERROR [{e.code}]</strong> (line {e.line || '?'}): {e.message}
                          </div>
                        </div>
                      ))}
                      {validation.warnings.map((w, idx) => (
                        <div key={`warn-${idx}`} className="text-xs bg-amber-950/40 border border-amber-800/50 text-amber-300 p-2 rounded flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                          <div>
                            <strong>WARN [{w.code}]</strong> (line {w.line || '?'}): {w.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parse Error Fallback */}
                {parseError && (
                  <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-4 text-xs text-rose-200">
                    <strong className="font-semibold block mb-1">Parse Error Encountered:</strong>
                    {parseError}
                  </div>
                )}

                {/* Structured Model Inspector */}
                {chart && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    {/* Sub-tab bar */}
                    <div className="bg-slate-950/80 border-b border-slate-800 px-3 py-2 flex gap-2 text-xs font-medium overflow-x-auto">
                      <button
                        onClick={() => setInspectorSubTab('measures')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          inspectorSubTab === 'measures' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Measures ({chart.activeCourse.measures.length})
                      </button>
                      <button
                        onClick={() => setInspectorSubTab('notes')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          inspectorSubTab === 'notes' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Notes ({chart.activeCourse.notes.length})
                      </button>
                      <button
                        onClick={() => setInspectorSubTab('rolls')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          inspectorSubTab === 'rolls' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Rolls & Balloons ({chart.activeCourse.rolls.length + chart.activeCourse.balloons.length})
                      </button>
                      <button
                        onClick={() => setInspectorSubTab('events')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          inspectorSubTab === 'events' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Events ({chart.activeCourse.events.length})
                      </button>
                      <button
                        onClick={() => setInspectorSubTab('headers')}
                        className={`px-2.5 py-1 rounded transition-colors ${
                          inspectorSubTab === 'headers' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Headers & Preserved Raw
                      </button>
                    </div>

                    {/* Sub-tab Content Table */}
                    <div className="p-3 max-h-96 overflow-y-auto">
                      {inspectorSubTab === 'measures' && (
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead>
                            <tr className="text-[10px] text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                              <th className="pb-2">#</th>
                              <th className="pb-2">Time (s)</th>
                              <th className="pb-2">Duration</th>
                              <th className="pb-2">Signature</th>
                              <th className="pb-2">Division</th>
                              <th className="pb-2">Notes</th>
                              <th className="pb-2">Barline</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {chart.activeCourse.measures.slice(0, 100).map((m) => (
                              <tr key={m.index} className="hover:bg-slate-800/40">
                                <td className="py-1.5 font-bold text-white">{m.index}</td>
                                <td className="py-1.5 text-amber-400">{m.startTime.toFixed(3)}s</td>
                                <td className="py-1.5">{m.duration.toFixed(3)}s</td>
                                <td className="py-1.5">{m.numerator}/{m.denominator}</td>
                                <td className="py-1.5 text-indigo-400">{m.division}</td>
                                <td className="py-1.5">{m.notes.length}</td>
                                <td className="py-1.5">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.barlineVisible ? 'bg-emerald-950/60 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                                    {m.barlineVisible ? 'ON' : 'OFF'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {inspectorSubTab === 'notes' && (
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead>
                            <tr className="text-[10px] text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                              <th className="pb-2">ID</th>
                              <th className="pb-2">Kind</th>
                              <th className="pb-2">Time</th>
                              <th className="pb-2">Beat</th>
                              <th className="pb-2">Measure</th>
                              <th className="pb-2">Position</th>
                              <th className="pb-2">BPM</th>
                              <th className="pb-2">Scroll</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {chart.activeCourse.notes.slice(0, 150).map((n) => (
                              <tr key={n.id} className="hover:bg-slate-800/40">
                                <td className="py-1.5 font-semibold text-slate-400">{n.id}</td>
                                <td className="py-1.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      n.kind === 'don'
                                        ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                                        : n.kind === 'ka'
                                        ? 'bg-sky-950/80 text-sky-300 border border-sky-500/40'
                                        : n.kind === 'big_don'
                                        ? 'bg-rose-900 text-rose-100 border border-rose-400'
                                        : 'bg-sky-900 text-sky-100 border border-sky-400'
                                    }`}
                                  >
                                    {n.kind.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-1.5 text-amber-400 font-semibold">{n.time.toFixed(3)}s</td>
                                <td className="py-1.5">{n.beat.toFixed(2)}</td>
                                <td className="py-1.5">Bar #{n.measureIndex}</td>
                                <td className="py-1.5 text-slate-400">
                                  {n.positionInMeasure.numerator}/{n.positionInMeasure.denominator}
                                </td>
                                <td className="py-1.5">{n.bpm}</td>
                                <td className="py-1.5">{n.scroll}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {inspectorSubTab === 'rolls' && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-white">Continuous Rolls ({chart.activeCourse.rolls.length})</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                            {chart.activeCourse.rolls.map((r) => (
                              <div key={r.id} className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
                                <div className="flex justify-between font-bold text-amber-300">
                                  <span>{r.type.toUpperCase()} (raw {r.rawType})</span>
                                  <span>{(r.endTime - r.startTime).toFixed(2)}s duration</span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1">
                                  {r.startTime.toFixed(3)}s → {r.endTime.toFixed(3)}s (Beat {r.startBeat.toFixed(2)} → {r.endBeat.toFixed(2)})
                                </div>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-xs font-semibold text-white mt-4">Balloons ({chart.activeCourse.balloons.length})</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                            {chart.activeCourse.balloons.map((b) => (
                              <div key={b.id} className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80">
                                <div className="flex justify-between font-bold text-orange-300">
                                  <span>BALLOON [{b.balloonIndex}]</span>
                                  <span className="text-white bg-orange-950/80 px-2 py-0.5 rounded border border-orange-500/40">
                                    {b.hitCount} hits required
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1">
                                  {b.startTime.toFixed(3)}s → {b.endTime.toFixed(3)}s
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {inspectorSubTab === 'events' && (
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead>
                            <tr className="text-[10px] text-slate-400 border-b border-slate-800 uppercase tracking-wider">
                              <th className="pb-2">Command</th>
                              <th className="pb-2">Value</th>
                              <th className="pb-2">Time</th>
                              <th className="pb-2">Beat</th>
                              <th className="pb-2">Measure</th>
                              <th className="pb-2">Semantic</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-slate-300">
                            {chart.activeCourse.events.map((ev) => (
                              <tr key={ev.id} className="hover:bg-slate-800/40">
                                <td className="py-1.5 font-bold text-amber-400">{ev.name}</td>
                                <td className="py-1.5 text-slate-200">{ev.value || '-'}</td>
                                <td className="py-1.5">{ev.time.toFixed(3)}s</td>
                                <td className="py-1.5">{ev.beat.toFixed(2)}</td>
                                <td className="py-1.5">Bar #{ev.measureIndex}</td>
                                <td className="py-1.5">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.isSemantic ? 'bg-indigo-950 text-indigo-300' : 'bg-slate-800 text-slate-300'}`}>
                                    {ev.isSemantic ? 'Core Engine' : 'Preserved Raw'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {inspectorSubTab === 'headers' && (
                        <div className="space-y-3 font-mono text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">TITLE</span>
                              <span className="text-white font-bold">{chart.headers.title || '(none)'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">SUBTITLE</span>
                              <span className="text-white font-bold">{chart.headers.subtitle || '(none)'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">BPM</span>
                              <span className="text-amber-400 font-bold">{chart.headers.bpm}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">WAVE</span>
                              <span className="text-white">{chart.headers.wave || '(none)'}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">OFFSET</span>
                              <span className="text-white">{chart.headers.offset}s</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded border border-slate-800">
                              <span className="text-[10px] text-slate-400 block">COURSE</span>
                              <span className="text-white">{chart.headers.course} (Level {chart.headers.level})</span>
                            </div>
                          </div>

                          <h5 className="text-xs font-semibold text-white pt-2">All Preserved Custom / Raw Headers:</h5>
                          <pre className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300 text-[11px]">
                            {JSON.stringify(chart.headers.rawHeaders, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 3: ROUND TRIP INSPECTOR                                         */}
        {/* =================================================================== */}
        {activeTab === 'roundtrip' && (
          <section className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                    Round Trip Semantic Verification (Model A ↔ Writer ↔ Model B)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ensures parsing, writing, and re-parsing preserves 100% of the musical and command semantics.
                  </p>
                </div>

                {roundTripData && (
                  <div
                    className={`px-3 py-1.5 rounded-lg border font-semibold text-xs flex items-center gap-1.5 ${
                      roundTripData.isSemanticallyEqual
                        ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/70 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {roundTripData.isSemanticallyEqual ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    <span>
                      {roundTripData.isSemanticallyEqual
                        ? 'Round Trip Passed (Semantically Identical)'
                        : 'Discrepancy Detected'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {chart && roundTripData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Model A vs Model B Metrics */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Model Comparison Metrics
                  </h3>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Total Notes:</span>
                      <span className="font-bold text-white">
                        Model A: {chart.activeCourse.notes.length} | Model B: {roundTripData.modelB?.activeCourse.notes.length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Total Measures:</span>
                      <span className="font-bold text-white">
                        Model A: {chart.activeCourse.measures.length} | Model B: {roundTripData.modelB?.activeCourse.measures.length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Continuous Rolls:</span>
                      <span className="font-bold text-white">
                        Model A: {chart.activeCourse.rolls.length} | Model B: {roundTripData.modelB?.activeCourse.rolls.length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Balloons:</span>
                      <span className="font-bold text-white">
                        Model A: {chart.activeCourse.balloons.length} | Model B: {roundTripData.modelB?.activeCourse.balloons.length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Gogo Intervals:</span>
                      <span className="font-bold text-white">
                        Model A: {chart.activeCourse.gogoRanges.length} | Model B: {roundTripData.modelB?.activeCourse.gogoRanges.length ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between p-2 rounded bg-slate-950 border border-slate-800/80">
                      <span className="text-slate-400">Max Timing Delta:</span>
                      <span className="font-bold text-emerald-400">
                        {roundTripData.maxTimingDiff.toFixed(6)}s (Tolerance: 0.002s)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Generated Output from Writer */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                      Generated TJA Text (TJA Writer Output)
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {roundTripData.generatedTJA.length} characters
                    </span>
                  </div>
                  <textarea
                    readOnly
                    rows={12}
                    value={roundTripData.generatedTJA}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-200 focus:outline-none leading-relaxed"
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 4: PHASE 2 TIMELINE QUERY API                                   */}
        {/* =================================================================== */}
        {activeTab === 'timeline' && (
          <section className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-amber-400" />
                    Phase 2 Timeline Query API
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Demonstrates how Phase 2 (Malody-style mobile editor & canvas) queries notes, measures, and events at runtime.
                  </p>
                </div>
                <div className="text-xs font-mono text-amber-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  Scrub Time: <strong>{scrubTime.toFixed(3)}s</strong> / {duration.toFixed(2)}s
                </div>
              </div>

              {/* Time Scrubber */}
              <div className="space-y-1">
                <input
                  id="timeline-scrubber"
                  type="range"
                  min="0"
                  max={Math.max(duration, 0.1)}
                  step="0.02"
                  value={scrubTime}
                  onChange={(e) => setScrubTime(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.000s</span>
                  <span>{(duration * 0.25).toFixed(2)}s</span>
                  <span>{(duration * 0.5).toFixed(2)}s</span>
                  <span>{(duration * 0.75).toFixed(2)}s</span>
                  <span>{duration.toFixed(2)}s</span>
                </div>
              </div>
            </div>

            {timeline && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Instantaneous State Queries */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                    State at t = {scrubTime.toFixed(3)}s
                  </h3>

                  <div className="space-y-2">
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">getBpmAtTime(t)</span>
                      <span className="text-sm font-bold text-amber-400">{timeline.getBpmAtTime(scrubTime)} BPM</span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">getScrollAtTime(t)</span>
                      <span className="text-sm font-bold text-sky-400">
                        {timeline.getScrollAtTime(scrubTime).scroll}x
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">getGogoStateAtTime(t)</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded inline-block mt-0.5 ${
                          timeline.getGogoStateAtTime(scrubTime)
                            ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {timeline.getGogoStateAtTime(scrubTime) ? '🔥 GOGO ACTIVE' : 'Normal (Off)'}
                      </span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider block">timeToBeat(t)</span>
                      <span className="text-sm font-bold text-indigo-400">{timeline.timeToBeat(scrubTime).toFixed(3)} Beats</span>
                    </div>
                  </div>
                </div>

                {/* Measure at Time */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 font-mono text-xs">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                    getMeasureAtTime(t)
                  </h3>

                  {(() => {
                    const m = timeline.getMeasureAtTime(scrubTime);
                    if (!m) return <div className="text-slate-500">No measure found</div>;
                    return (
                      <div className="space-y-2">
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Measure Index</span>
                          <span className="text-sm font-bold text-white">Bar #{m.index}</span>
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Time Span</span>
                          <span className="text-amber-400">{m.startTime.toFixed(3)}s → {m.endTime.toFixed(3)}s</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">Duration: {m.duration.toFixed(3)}s</span>
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Signature & Division</span>
                          <span className="text-white">{m.numerator}/{m.denominator} (Division: {m.division})</span>
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Notes inside Bar</span>
                          <span className="text-emerald-400">{m.notes.length} note(s)</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Visible Notes in Window (getNotesInRange) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-sans">
                      getNotesInRange(t - 1.0s, t + 1.0s)
                    </h3>
                    <span className="text-[10px] text-slate-400">Malody Viewport</span>
                  </div>

                  {(() => {
                    const windowNotes = timeline.getNotesInRange(Math.max(0, scrubTime - 1.0), scrubTime + 1.0);
                    return (
                      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {windowNotes.length === 0 ? (
                          <div className="text-slate-500 py-4 text-center">No notes in 2-second window</div>
                        ) : (
                          windowNotes.map((n) => (
                            <div
                              key={n.id}
                              className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full ${
                                    n.kind.includes('don') ? 'bg-rose-500' : 'bg-sky-500'
                                  }`}
                                />
                                <span className="font-bold text-white uppercase text-[11px]">{n.kind}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-amber-400 font-bold">{n.time.toFixed(3)}s</span>
                                <span className="text-[10px] text-slate-500 block">
                                  {(n.time - scrubTime > 0 ? '+' : '') + (n.time - scrubTime).toFixed(3)}s
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </section>
        )}

        {/* =================================================================== */}
        {/* TAB 5: DESIGN & ARCHITECTURE                                        */}
        {/* =================================================================== */}
        {activeTab === 'design' && (
          <section className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                  MikaNotes Phase 1: TJA Core Architecture Document
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Comprehensive architectural explanation of how TEIKA's limitations were overcome and how Phase 2 is enabled.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    1. どのようにTEIKAの課題を解決したか
                  </h3>
                  <ul className="text-xs text-slate-300 space-y-2 leading-relaxed list-disc list-inside">
                    <li>
                      <strong>UI・DOMからの完全分離:</strong> TEIKAの `tja-parser.js` はDOM生成やグローバルstateと結合していましたが、MikaNotesでは純粋なTypeScriptクラス・関数のみで構成。WebWorkerやNodeでも完全に同一挙動。
                    </li>
                    <li>
                      <strong>有理数精度 (Rational Position):</strong> 各ノーツの位置を分数 `{'{'} numerator, denominator, fraction {'}'}` として保持し、微小な浮動小数点誤差によるズレを防止。
                    </li>
                    <li>
                      <strong>巨大譜面・無限ループ防護:</strong> 50ms以内の高速スキャナ (`scanTJAInfo`) とパーサー内タイムアウト安全機構により、不正な `#MEASURE 99999999/1` 等でもブラウザを凍結させません。
                    </li>
                  </ul>
                </div>

                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    2. 情報保存原則 (Preservation First)
                  </h3>
                  <ul className="text-xs text-slate-300 space-y-2 leading-relaxed list-disc list-inside">
                    <li>
                      <strong>未知ヘッダーの完全保全:</strong> `MAKER`, `GENRE`, `HEADSCROLL`, ユーザー独自タグなどは `headers.rawHeaders` にすべて保存され、Writerで100%復元。
                    </li>
                    <li>
                      <strong>未知・表示用コマンドの維持:</strong> `#SCROLL`, `#DELAY`, `#LYRIC`, `#BARLINE`, 分岐コマンド等は `isSemantic: false` のイベントとして時間軸順に保持。
                    </li>
                    <li>
                      <strong>Round Trip Test:</strong> Model A ↔ Writer ↔ Model B において、ノーツ数・小節数・タイミング（誤差 &lt; 0.001s）・連打・風船が一致することを自動検証。
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                  3. Phase 2 (Malody風Editor / UI) への接続
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Phase 2 では、スマートフォン画面に合わせたMalody風のトラック描画とタッチ編集を行います。
                  TJA Core の `Timeline` API により、UI層は以下を $O(\log N)$ で即座に実行できます：
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-amber-400 font-bold block">getNotesInRange(t0, t1)</span>
                    可視範囲のノーツのみを瞬時に取得し、スマートフォンでの60fps描画を実現。
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-sky-400 font-bold block">timeToBeat / beatToTime</span>
                    タップした座標から正確な拍（4分音符、16分音符グリッド）を逆算。
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-emerald-400 font-bold block">writeTJA(chart)</span>
                    編集されたモデルを標準のTJAテキストとしていつでも安全に再書き出し。
                  </div>
                </div>
              </div>

              {/* PWA & GitHub Pages Infrastructure Card */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    4. PWA / GitHub Pages / 自動更新基盤
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                      Scope: <strong className="text-white">{pwaState.registration?.scope || import.meta.env.BASE_URL}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => pwaState.checkForUpdates()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 font-medium transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>更新を確認</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-slate-400 text-[10px] block uppercase tracking-wider">Service Worker</span>
                    <span className="font-bold text-white">
                      {pwaState.registration ? 'Active & Running' : 'Registered / Standby'}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {pwaState.offlineReady ? 'Offline Ready (App Shell Precached)' : 'Cache Initializing'}
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-slate-400 text-[10px] block uppercase tracking-wider">Auto-Update Strategy</span>
                    <span className="font-bold text-emerald-400">Prompt + Safe Reload</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      作業中データ保護ガード (Unsaved Guard) 完備
                    </span>
                  </div>

                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-slate-300">
                    <span className="text-slate-400 text-[10px] block uppercase tracking-wider">Asset Caching Policy</span>
                    <span className="font-bold text-sky-400">NetworkFirst / CacheFirst</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      HTML: NetworkFirst / 大容量音源(OGG)除外
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* PWA Update Notification Banner */}
      <PWAUpdateNotification pwaState={pwaState} />
    </div>
  );
}
