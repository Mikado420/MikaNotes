/**
 * MikaNotes Phase 2 - Timeline Editor
 * Central multi-lane timeline viewport orchestrating:
 * 1. Waveform Area
 * 2. Measure Header
 * 3. Note Lane
 * 4. GOGO Lane
 * 5. BPM Lane
 * 6. MEASURE Lane
 * 7. Unified Playhead
 * with floating ZoomControl and synchronous horizontal scrolling.
 */

import React, { useRef, useEffect, useState } from 'react';
import { CourseModel, Timeline } from '../../core';
import { TimelineLayout, GridDivision } from '../../editor/editor-types';
import { timeToTimelineX } from '../../editor/coordinate-mapping';
import { PendingSpecialNote } from '../../editor/special-notes';
import { AudioEngine } from '../../audio/AudioEngine';
import { WaveformArea } from './WaveformArea';
import { MeasureHeader } from './MeasureHeader';
import { NoteLane } from './NoteLane';
import { GogoLane } from './GogoLane';
import { BpmLane } from './BpmLane';
import { MeasureLane } from './MeasureLane';
import { Playhead } from './Playhead';
import { ZoomControl } from './ZoomControl';
import { Crown, Gauge, SplitSquareVertical, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface TimelineEditorProps {
  course: CourseModel;
  timeline: Timeline;
  layout: TimelineLayout;
  currentTime: number;
  activeMeasureIndex: number;
  zoom: number;
  selectedGrid: GridDivision;
  isPlaying: boolean;
  onTapTimeline: (x: number) => void;
  onSelectMeasure: (idx: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  pendingSpecialNote?: PendingSpecialNote | null;
  notification?: { message: string; type: 'error' | 'success' | 'info' } | null;
  audioEngine?: AudioEngine;
  chartOffset?: number;
  onSeekTimelineX?: (x: number) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  course,
  timeline,
  layout,
  currentTime,
  activeMeasureIndex,
  zoom,
  selectedGrid,
  isPlaying,
  onTapTimeline,
  onSelectMeasure,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  pendingSpecialNote,
  notification,
  audioEngine,
  chartOffset = 0,
  onSeekTimelineX,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewportMetrics, setViewportMetrics] = useState({ scrollLeft: 0, clientWidth: 1200 });

  // Update viewport bounds on scroll & resize for high-performance virtualization
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateMetrics = () => {
      setViewportMetrics({
        scrollLeft: container.scrollLeft,
        clientWidth: container.clientWidth || 1200,
      });
    };

    updateMetrics();
    container.addEventListener('scroll', updateMetrics, { passive: true });
    window.addEventListener('resize', updateMetrics);
    return () => {
      container.removeEventListener('scroll', updateMetrics);
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

  // Compute visible start and end with a 1x viewportWidth lookahead / safety margin
  const visibleStartX = Math.max(0, viewportMetrics.scrollLeft - viewportMetrics.clientWidth);
  const visibleEndX = viewportMetrics.scrollLeft + viewportMetrics.clientWidth * 2;

  // Calculate current playhead X coordinate
  const playheadX = timeToTimelineX(currentTime, timeline, layout);

  // Auto-scroll to keep playhead in view during playback (high-frequency RAF subscription)
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;

    if (audioEngine) {
      const unsub = audioEngine.subscribeTime((audioTime) => {
        const t = audioTime + chartOffset;
        const currentX = timeToTimelineX(t, timeline, layout);
        const viewWidth = container.clientWidth;
        const currentScroll = container.scrollLeft;

        if (currentX > currentScroll + viewWidth * 0.75) {
          container.scrollLeft = currentX - viewWidth * 0.25;
        } else if (currentX < currentScroll) {
          container.scrollLeft = Math.max(0, currentX - viewWidth * 0.1);
        }
      });
      return unsub;
    } else {
      const viewWidth = container.clientWidth;
      const currentScroll = container.scrollLeft;

      if (playheadX > currentScroll + viewWidth * 0.75) {
        container.scrollLeft = playheadX - viewWidth * 0.25;
      } else if (playheadX < currentScroll) {
        container.scrollLeft = Math.max(0, playheadX - viewWidth * 0.1);
      }
    }
  }, [isPlaying, playheadX, audioEngine, timeline, layout, chartOffset]);

  // Handle measure selection via MeasureHeader tap to keep target measure in view
  const handleSelectMeasure = (idx: number) => {
    onSelectMeasure(idx);
    const mLayout = layout.measures.find((m) => m.index === idx);
    if (mLayout && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const viewWidth = container.clientWidth;
      if (mLayout.startX < container.scrollLeft || mLayout.startX > container.scrollLeft + viewWidth * 0.75) {
        container.scrollLeft = Math.max(0, mLayout.startX - 32);
      }
    }
  };

  return (
    <div
      id="timeline-editor-viewport"
      className="relative flex-1 w-full overflow-hidden bg-[#070b14] flex select-none"
    >
      {/* Floating Zoom Control on Top-Left */}
      <ZoomControl
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
      />

      {/* Sticky Left Lane Header Strip */}
      <div
        id="lane-labels-strip"
        className="w-18 shrink-0 bg-[#080d17]/95 border-r border-slate-800 z-20 flex flex-col select-none shadow-md"
      >
        {/* Top spacer matching Waveform (36px) + MeasureHeader (24px) */}
        <div className="h-9 border-b border-slate-800/60" />
        <div className="h-6 border-b border-slate-800/80" />

        {/* Note lane spacer (112px / h-28) */}
        <div className="h-28 border-b border-slate-800/80 flex items-center justify-center">
          <span className="text-[10px] text-slate-500 font-mono tracking-wider rotate-[-90deg]">
            NOTES
          </span>
        </div>

        {/* GOGO Lane Label (28px / h-7) */}
        <div className="h-7 border-b border-slate-800/80 px-2 flex items-center gap-1 text-[11px] font-medium text-amber-400">
          <Crown className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px]">GOGO</span>
        </div>

        {/* BPM Lane Label (28px / h-7) */}
        <div className="h-7 border-b border-slate-800/80 px-2 flex items-center gap-1 text-[11px] font-medium text-sky-400">
          <Gauge className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px]">BPM</span>
        </div>

        {/* MEASURE Lane Label (24px / h-6) */}
        <div className="h-6 border-b border-slate-800 px-2 flex items-center gap-1 text-[10px] font-medium text-emerald-400">
          <SplitSquareVertical className="w-3 h-3 shrink-0" />
          <span className="text-[9px]">MEASURE</span>
        </div>
      </div>

      {/* Horizontally Scrollable Timeline Content */}
      <div
        ref={scrollContainerRef}
        id="timeline-scroll-container"
        className="flex-1 overflow-x-auto overflow-y-hidden relative select-none scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent touch-pan-x-scroll"
      >
        <div
          id="timeline-unified-tracks"
          className="relative flex flex-col"
          style={{ width: `${layout.totalWidth}px`, minWidth: '100%' }}
        >
          {/* 1. Waveform Area */}
          <WaveformArea layout={layout} onTapWaveform={onSeekTimelineX} />

          {/* 2. Measure Number Header */}
          <MeasureHeader
            layout={layout}
            activeMeasureIndex={activeMeasureIndex}
            onSelectMeasure={handleSelectMeasure}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
          />

          {/* 3. Note Lane (virtualized for ultra-fast rendering of large charts) */}
          <NoteLane
            course={course}
            layout={layout}
            selectedGrid={selectedGrid}
            onTapLane={onTapTimeline}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
            pendingSpecialNote={pendingSpecialNote}
          />

          {/* 4. GOGO Lane */}
          <GogoLane
            course={course}
            timeline={timeline}
            layout={layout}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
            onTapLane={onTapTimeline}
          />

          {/* 5. BPM Lane */}
          <BpmLane
            course={course}
            timeline={timeline}
            layout={layout}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
            onTapLane={onTapTimeline}
          />

          {/* 6. MEASURE Lane */}
          <MeasureLane
            layout={layout}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
            onTapLane={onTapTimeline}
          />

          {/* 7. Shared Playhead passing through all lanes */}
          <Playhead
            x={playheadX}
            timeline={timeline}
            layout={layout}
            audioEngine={audioEngine}
            chartOffset={chartOffset}
            isPlaying={isPlaying}
          />
        </div>
      </div>

      {/* Floating Notification Toast */}
      {notification && (
        <div
          id="editor-toast-notification"
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200 backdrop-blur-md border animate-in fade-in slide-in-from-top-2 pointer-events-none ${
            notification.type === 'error'
              ? 'bg-rose-950/95 text-rose-200 border-rose-600/80 shadow-rose-950/60'
              : notification.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-200 border-emerald-600/80 shadow-emerald-950/60'
              : 'bg-slate-900/95 text-slate-200 border-sky-500/70 shadow-slate-950/60'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
};
