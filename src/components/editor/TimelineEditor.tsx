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
import { WaveformArea } from './WaveformArea';
import { MeasureHeader } from './MeasureHeader';
import { NoteLane } from './NoteLane';
import { GogoLane } from './GogoLane';
import { BpmLane } from './BpmLane';
import { MeasureLane } from './MeasureLane';
import { Playhead } from './Playhead';
import { ZoomControl } from './ZoomControl';
import { Crown, Gauge, SplitSquareVertical } from 'lucide-react';

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

  // Auto-scroll to keep playhead in view during playback
  useEffect(() => {
    if (!isPlaying || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const viewWidth = container.clientWidth;
    const currentScroll = container.scrollLeft;

    // If playhead goes past 70% of viewport width, advance scroll
    if (playheadX > currentScroll + viewWidth * 0.75) {
      container.scrollLeft = playheadX - viewWidth * 0.25;
    } else if (playheadX < currentScroll) {
      container.scrollLeft = Math.max(0, playheadX - viewWidth * 0.1);
    }
  }, [isPlaying, playheadX]);

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
        className="flex-1 overflow-x-auto overflow-y-hidden relative select-none scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
      >
        <div
          id="timeline-unified-tracks"
          className="relative flex flex-col"
          style={{ width: `${layout.totalWidth}px`, minWidth: '100%' }}
        >
          {/* 1. Waveform Area */}
          <WaveformArea layout={layout} />

          {/* 2. Measure Number Header */}
          <MeasureHeader
            layout={layout}
            activeMeasureIndex={activeMeasureIndex}
            onSelectMeasure={onSelectMeasure}
          />

          {/* 3. Note Lane (virtualized for ultra-fast rendering of large charts) */}
          <NoteLane
            course={course}
            layout={layout}
            selectedGrid={selectedGrid}
            onTapLane={onTapTimeline}
            visibleStartX={visibleStartX}
            visibleEndX={visibleEndX}
          />

          {/* 4. GOGO Lane */}
          <GogoLane
            course={course}
            timeline={timeline}
            layout={layout}
          />

          {/* 5. BPM Lane */}
          <BpmLane
            course={course}
            timeline={timeline}
            layout={layout}
          />

          {/* 6. MEASURE Lane */}
          <MeasureLane layout={layout} />

          {/* 7. Shared Playhead passing through all lanes */}
          <Playhead x={playheadX} />
        </div>
      </div>
    </div>
  );
};
