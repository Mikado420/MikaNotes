/**
 * MikaNotes Phase 2 - Editor State & Actions Hook
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ChartModel,
  CommandModel,
  CourseModel,
  MeasureModel,
  NoteModel,
  NoteType,
  RationalPosition,
  Timeline,
  isSameRationalPosition,
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
  const [selectedMeasureForEdit, setSelectedMeasureForEdit] = useState<number | null>(null);

  // Auxiliary tool parameters for GOGO, BPM, and MEASURE
  const [gogoMode, setGogoMode] = useState<'GOGOSTART' | 'GOGOEND'>('GOGOSTART');
  const [bpmInput, setBpmInput] = useState<number>(120);
  const [measureInput, setMeasureInput] = useState<string>('4/4');

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

  // Commit changes to history with Core re-parsing to guarantee unified timing & events
  const pushHistory = useCallback((newChart: ChartModel) => {
    try {
      const serialized = writeTJA(newChart);
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      newHistory.push(serialized);
      if (newHistory.length > 50) newHistory.shift(); // Bound history size
      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;

      // Re-parse with TJA Core to guarantee all measures, events, notes, and timelines are fully unified
      const recalculated = parseTJA(serialized);
      setChart(recalculated);
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      console.error('Failed to push history:', e);
      setChart(newChart);
      setHistoryVersion((v) => v + 1);
    }
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

  // Common command insertion (GOGO, BPM, MEASURE, etc.) using RationalPosition
  const insertCommandAtPosition = useCallback(
    (
      commandName: string,
      value: string,
      measureIndex: number,
      rational: RationalPosition,
      time: number
    ) => {
      const currentCourse = chart.courses[activeCourseIndex] || chart.activeCourse;
      if (!currentCourse || !currentCourse.measures[measureIndex]) return;

      const trimmedVal = value.trim();
      const raw = trimmedVal ? `#${commandName} ${trimmedVal}` : `#${commandName}`;

      const maxSourceOrder = currentCourse.events.reduce(
        (max, e) => Math.max(max, e.sourceOrder || 0),
        0
      );
      const newSourceOrder = maxSourceOrder + 1;

      const targetMeasure = currentCourse.measures[measureIndex];
      const measureBeats = (targetMeasure.numerator * 4) / targetMeasure.denominator;
      const beat = targetMeasure.startBeat + rational.fraction * measureBeats;

      const newCommand: CommandModel = {
        id: `cmd-${commandName.toLowerCase()}-${measureIndex}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: commandName,
        value: trimmedVal,
        raw,
        time,
        audioTime: time - (chart.headers.offset || 0),
        beat,
        measureIndex,
        positionInMeasure: rational,
        sourceOrder: newSourceOrder,
        isSemantic: true,
      };

      // For BPMCHANGE and MEASURE, if an identical command exists at this exact rational position, replace it
      const isSinglePerPos = commandName === 'BPMCHANGE' || commandName === 'MEASURE';

      const updatedMeasures = currentCourse.measures.map((m, idx) => {
        if (idx !== measureIndex) return m;

        let newEvents = [...m.events];
        if (isSinglePerPos) {
          newEvents = newEvents.filter(
            (e) =>
              !(
                e.name === commandName &&
                isSameRationalPosition(e.positionInMeasure, rational)
              )
          );
        }
        newEvents.push(newCommand);
        newEvents.sort(
          (a, b) =>
            a.positionInMeasure.fraction - b.positionInMeasure.fraction ||
            a.sourceOrder - b.sourceOrder
        );

        return {
          ...m,
          events: newEvents,
        };
      });

      let updatedCourseEvents = [...currentCourse.events];
      if (isSinglePerPos) {
        updatedCourseEvents = updatedCourseEvents.filter(
          (e) =>
            !(
              e.measureIndex === measureIndex &&
              e.name === commandName &&
              isSameRationalPosition(e.positionInMeasure, rational)
            )
        );
      }
      updatedCourseEvents.push(newCommand);
      updatedCourseEvents.sort((a, b) => a.time - b.time || a.sourceOrder - b.sourceOrder);

      const updatedCourse: CourseModel = {
        ...currentCourse,
        measures: updatedMeasures,
        events: updatedCourseEvents,
      };

      const updatedCourses = [...chart.courses];
      updatedCourses[activeCourseIndex] = updatedCourse;

      const newChart: ChartModel = {
        ...chart,
        courses: updatedCourses,
        activeCourse: updatedCourse,
      };

      pushHistory(newChart);
    },
    [chart, activeCourseIndex, pushHistory]
  );

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

  // Handle clicking / tapping on the timeline to place or erase notes or insert commands
  const handleTimelineTap = useCallback(
    (timelineX: number) => {
      const snapResult = snapTimelineXToGrid(timelineX, timeline, timelineLayout, selectedGrid);
      if (!snapResult) return;

      const { measureIndex, rational, time } = snapResult;

      // Update current time to clicked position
      setCurrentTime(time);
      setSelectedMeasureForEdit(measureIndex);

      const currentCourse = chart.courses[activeCourseIndex] || chart.activeCourse;
      if (!currentCourse || !currentCourse.measures[measureIndex]) return;

      // 1. Note Tab: Perform note editing
      if (selectedTab === 'note') {
        const targetMeasure = currentCourse.measures[measureIndex];

        // Clone chart structure safely
        const updatedCourse: CourseModel = {
          ...currentCourse,
          measures: currentCourse.measures.map((m, idx) => {
            if (idx !== measureIndex) return m;

            let updatedNotes: NoteModel[];
            if (selectedNoteTool === 'erase') {
              // Remove any note at this exact rational position
              updatedNotes = m.notes.filter(
                (n) => !isSameRationalPosition(n.positionInMeasure, rational)
              );
            } else if (['1', '2', '3', '4'].includes(selectedNoteTool)) {
              // Add or replace note
              const filtered = m.notes.filter(
                (n) => !isSameRationalPosition(n.positionInMeasure, rational)
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
      // 2. GOGO Tab: Insert GOGOSTART or GOGOEND at snapped position
      else if (selectedTab === 'gogo') {
        insertCommandAtPosition(gogoMode, '', measureIndex, rational, time);
      }
      // 3. BPM Tab: Insert #BPMCHANGE at snapped position
      else if (selectedTab === 'bpm') {
        if (bpmInput > 0 && isFinite(bpmInput)) {
          insertCommandAtPosition('BPMCHANGE', String(bpmInput), measureIndex, rational, time);
        }
      }
      // 4. MEASURE Tab: Insert #MEASURE strictly at measure start position
      else if (selectedTab === 'measure') {
        if (measureInput && measureInput.includes('/')) {
          const targetMeasure = currentCourse.measures[measureIndex];
          const measureStartRational: RationalPosition = { numerator: 0, denominator: 1, fraction: 0 };
          setCurrentTime(targetMeasure.startTime);
          insertCommandAtPosition('MEASURE', measureInput, measureIndex, measureStartRational, targetMeasure.startTime);
        }
      }
    },
    [
      chart,
      activeCourseIndex,
      selectedTab,
      selectedNoteTool,
      selectedGrid,
      timeline,
      timelineLayout,
      gogoMode,
      bpmInput,
      measureInput,
      insertCommandAtPosition,
      pushHistory,
    ]
  );

  // Direct actions callable from tool panels
  const insertGogoDirect = useCallback(
    (mode: 'GOGOSTART' | 'GOGOEND') => {
      setGogoMode(mode);
      const mIdx = selectedMeasureForEdit ?? activeMeasureIndex;
      const m = timeline.getMeasureByIndex(mIdx);
      if (m) {
        insertCommandAtPosition(mode, '', mIdx, { numerator: 0, denominator: 1, fraction: 0 }, m.startTime);
      }
    },
    [selectedMeasureForEdit, activeMeasureIndex, timeline, insertCommandAtPosition]
  );

  const insertBpmDirect = useCallback(
    (bpm: number) => {
      setBpmInput(bpm);
      if (bpm > 0 && isFinite(bpm)) {
        const mIdx = selectedMeasureForEdit ?? activeMeasureIndex;
        const m = timeline.getMeasureByIndex(mIdx);
        if (m) {
          insertCommandAtPosition('BPMCHANGE', String(bpm), mIdx, { numerator: 0, denominator: 1, fraction: 0 }, m.startTime);
        }
      }
    },
    [selectedMeasureForEdit, activeMeasureIndex, timeline, insertCommandAtPosition]
  );

  const insertMeasureDirect = useCallback(
    (num: number, den: number) => {
      const sig = `${num}/${den}`;
      setMeasureInput(sig);
      const mIdx = selectedMeasureForEdit ?? activeMeasureIndex;
      const m = timeline.getMeasureByIndex(mIdx);
      if (m) {
        insertCommandAtPosition('MEASURE', sig, mIdx, { numerator: 0, denominator: 1, fraction: 0 }, m.startTime);
      }
    },
    [selectedMeasureForEdit, activeMeasureIndex, timeline, insertCommandAtPosition]
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
    activeMeasureIndex,
    selectedMeasureForEdit,
    fileName,
    canUndo,
    canRedo,
    gogoMode,
    bpmInput,
    measureInput,
    setGogoMode,
    setBpmInput,
    setMeasureInput,
    togglePlayback,
    seekTime,
    zoomIn,
    zoomOut,
    setZoomPercent,
    setSelectedTab,
    setSelectedNoteTool,
    setSelectedGrid,
    setFileName,
    handleTimelineTap,
    insertCommandAtPosition,
    insertGogoDirect,
    insertBpmDirect,
    insertMeasureDirect,
    undo,
    redo,
    loadTja,
    pushHistory,
  };
}
