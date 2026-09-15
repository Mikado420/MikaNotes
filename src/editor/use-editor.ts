/**
 * MikaNotes Phase 2 - Editor State & Actions Hook
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ChartModel,
  CourseModel,
  MeasureModel,
  NoteModel,
  NoteType,
  RationalPosition,
  Timeline,
  parseTJA,
  writeTJA,
} from '../core';
import {
  EditorTab,
  EditorUIState,
  GridDivision,
  NoteToolType,
  TimelineLayout,
} from './editor-types';
import {
  calculateTimelineLayout,
  snapTimelineXToGrid,
  timeToTimelineX,
} from './coordinate-mapping';

export interface UseEditorOptions {
  initialTjaText: string;
  initialFileName?: string;
}

export function useEditor({ initialTjaText, initialFileName = 'example.tja' }: UseEditorOptions) {
  // 1. Chart Model & History State
  const [chart, setChart] = useState<ChartModel>(() => parseTJA(initialTjaText));
  const [activeCourseIndex, setActiveCourseIndex] = useState<number>(0);
  const [fileName, setFileName] = useState<string>(initialFileName);

  // Undo / Redo History (stores serialized TJA or cloned ChartModel)
  const historyRef = useRef<string[]>([initialTjaText]);
  const historyIndexRef = useRef<number>(0);
  const [, setHistoryVersion] = useState<number>(0);

  // 2. Editor UI State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(155); // Match 155% in reference image
  const [selectedTab, setSelectedTab] = useState<EditorTab>('note');
  const [selectedNoteTool, setSelectedNoteTool] = useState<NoteToolType>('1'); // Default Don
  const [selectedGrid, setSelectedGrid] = useState<GridDivision>(16); // Default 16
  const [customGridDiv, setCustomGridDiv] = useState<number>(16);
  const [selectedMeasureForEdit, setSelectedMeasureForEdit] = useState<number | null>(null);

  // Active course reference
  const activeCourse: CourseModel = useMemo(() => {
    return chart.courses[activeCourseIndex] || chart.activeCourse || chart.courses[0];
  }, [chart, activeCourseIndex]);

  // Derived Timeline for fast binary-search range queries
  const timeline: Timeline = useMemo(() => {
    return new Timeline(activeCourse);
  }, [activeCourse]);

  // Derived total duration
  const totalDuration: number = useMemo(() => {
    return timeline.getDuration();
  }, [timeline]);

  // Layout calculation
  const timelineLayout: TimelineLayout = useMemo(() => {
    return calculateTimelineLayout(activeCourse, zoom);
  }, [activeCourse, zoom]);

  // Current active measure index based on currentTime
  const currentMeasure = useMemo(() => {
    return timeline.getMeasureAtTime(currentTime);
  }, [timeline, currentTime]);

  const activeMeasureIndex = currentMeasure?.index ?? 0;

  // Animation frame loop for playback
  const lastFrameTimeRef = useRef<number | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }, []);

  const startPlayback = useCallback(() => {
    setIsPlaying(true);
    lastFrameTimeRef.current = performance.now();
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      // If at the end, restart from beginning
      if (currentTime >= totalDuration) {
        setCurrentTime(0);
      }
      startPlayback();
    }
  }, [isPlaying, currentTime, totalDuration, startPlayback, stopPlayback]);

  useEffect(() => {
    if (!isPlaying) return;

    const loop = (now: number) => {
      if (lastFrameTimeRef.current !== null) {
        const delta = (now - lastFrameTimeRef.current) / 1000;
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= totalDuration) {
            stopPlayback();
            return totalDuration;
          }
          return next;
        });
      }
      lastFrameTimeRef.current = now;
      animationFrameIdRef.current = requestAnimationFrame(loop);
    };

    animationFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isPlaying, totalDuration, stopPlayback]);

  // Commit changes to history
  const pushHistory = useCallback((newChart: ChartModel) => {
    const serialized = writeTJA(newChart);
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(serialized);
    if (newHistory.length > 50) newHistory.shift(); // Bound history size
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setChart(newChart);
    setHistoryVersion((v) => v + 1);
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    historyIndexRef.current -= 1;
    const prevTja = historyRef.current[historyIndexRef.current];
    try {
      const restored = parseTJA(prevTja);
      setChart(restored);
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      console.error('Failed to undo:', e);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    historyIndexRef.current += 1;
    const nextTja = historyRef.current[historyIndexRef.current];
    try {
      const restored = parseTJA(nextTja);
      setChart(restored);
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      console.error('Failed to redo:', e);
    }
  }, [canRedo]);

  // Zoom actions
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(400, Math.round(z * 1.15)));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(50, Math.round(z / 1.15)));
  }, []);

  const setZoomPercent = useCallback((val: number) => {
    setZoom(Math.max(50, Math.min(400, val)));
  }, []);

  // Time seeking
  const seekTime = useCallback((time: number) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
  }, [totalDuration]);

  // Handle clicking / tapping on the timeline to place or erase notes
  const handleTimelineTap = useCallback(
    (timelineX: number) => {
      const effectiveGrid = selectedGrid === 'free' ? 'free' : customGridDiv;
      const snapResult = snapTimelineXToGrid(timelineX, timelineLayout, effectiveGrid);
      if (!snapResult) return;

      const { measureIndex, rational, time } = snapResult;

      // Update current time to clicked position
      setCurrentTime(time);
      setSelectedMeasureForEdit(measureIndex);

      // If we are in note tab, perform note editing
      if (selectedTab === 'note') {
        const currentCourse = chart.courses[activeCourseIndex] || chart.activeCourse;
        if (!currentCourse || !currentCourse.measures[measureIndex]) return;

        const targetMeasure = currentCourse.measures[measureIndex];

        // Clone chart structure safely
        const updatedCourse: CourseModel = {
          ...currentCourse,
          measures: currentCourse.measures.map((m, idx) => {
            if (idx !== measureIndex) return m;

            let updatedNotes: NoteModel[];
            if (selectedNoteTool === 'erase') {
              // Remove any note at this position
              updatedNotes = m.notes.filter(
                (n) =>
                  !(
                    n.positionInMeasure.numerator === rational.numerator &&
                    n.positionInMeasure.denominator === rational.denominator
                  ) && Math.abs(n.positionInMeasure.fraction - rational.fraction) > 0.0001
              );
            } else if (['1', '2', '3', '4'].includes(selectedNoteTool)) {
              // Add or replace note
              const filtered = m.notes.filter(
                (n) =>
                  !(
                    n.positionInMeasure.numerator === rational.numerator &&
                    n.positionInMeasure.denominator === rational.denominator
                  ) && Math.abs(n.positionInMeasure.fraction - rational.fraction) > 0.0001
              );

              const kindMap: Record<string, NoteType> = {
                '1': 'don',
                '2': 'ka',
                '3': 'big_don',
                '4': 'big_ka',
              };
              const nType = selectedNoteTool as '1' | '2' | '3' | '4';

              const newNote: NoteModel = {
                id: `note-${measureIndex}-${time.toFixed(4)}-${Math.random().toString(36).substring(2, 6)}`,
                type: nType,
                kind: kindMap[nType] || 'don',
                time,
                audioTime: time - (chart.headers.offset || 0),
                beat: m.startBeat + rational.fraction * ((m.numerator * 4) / m.denominator),
                measureIndex,
                positionInMeasure: rational,
                bpm: m.initialBpm,
                scroll: 1.0,
              };

              updatedNotes = [...filtered, newNote].sort(
                (a, b) => a.positionInMeasure.fraction - b.positionInMeasure.fraction
              );
            } else {
              // Roll, big roll, balloon selection in Phase 2-1: prepared for future expansion
              return m;
            }

            return {
              ...m,
              notes: updatedNotes,
            };
          }),
        };

        // Recompute course-level flat notes array
        const allNotes: NoteModel[] = [];
        for (const m of updatedCourse.measures) {
          allNotes.push(...m.notes);
        }
        updatedCourse.notes = allNotes.sort((a, b) => a.time - b.time);

        const updatedCourses = [...chart.courses];
        updatedCourses[activeCourseIndex] = updatedCourse;

        const newChart: ChartModel = {
          ...chart,
          courses: updatedCourses,
          activeCourse: updatedCourse,
        };

        pushHistory(newChart);
      }
    },
    [
      chart,
      activeCourseIndex,
      selectedTab,
      selectedNoteTool,
      selectedGrid,
      customGridDiv,
      timelineLayout,
      pushHistory,
    ]
  );

  // Load a new TJA text
  const loadTja = useCallback((tjaText: string, newFileName?: string) => {
    try {
      const parsed = parseTJA(tjaText);
      historyRef.current = [tjaText];
      historyIndexRef.current = 0;
      setChart(parsed);
      setActiveCourseIndex(0);
      setCurrentTime(0);
      setIsPlaying(false);
      if (newFileName) setFileName(newFileName);
      setHistoryVersion((v) => v + 1);
    } catch (err: any) {
      console.error('Failed to load TJA:', err);
      alert('TJA解析に失敗しました: ' + err.message);
    }
  }, []);

  return {
    chart,
    activeCourse,
    timeline,
    totalDuration,
    timelineLayout,
    currentTime,
    isPlaying,
    zoom,
    selectedTab,
    selectedNoteTool,
    selectedGrid,
    customGridDiv,
    activeMeasureIndex,
    selectedMeasureForEdit,
    fileName,
    canUndo,
    canRedo,
    togglePlayback,
    seekTime,
    zoomIn,
    zoomOut,
    setZoomPercent,
    setSelectedTab,
    setSelectedNoteTool,
    setSelectedGrid,
    setCustomGridDiv,
    setFileName,
    handleTimelineTap,
    undo,
    redo,
    loadTja,
    pushHistory,
  };
}
