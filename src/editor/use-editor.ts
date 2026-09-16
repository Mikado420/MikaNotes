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
  validateTJARaw,
  writeTJA,
  RollModel,
  BalloonModel,
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
import {
  PendingSpecialNote,
  validateSpecialStart,
  validateSpecialPlacement,
  createSpecialNote,
  eraseSpecialNoteAtPosition,
} from './special-notes';
import { registerUnsavedWorkGuard } from '../pwa/usePWAUpdate';

export interface UseEditorOptions {
  initialTjaText: string;
  initialFileName?: string;
}

/**
 * Determine initial / preferred CourseKey (3: Oni -> 2: Hard -> 1: Normal -> 0: Easy -> 4: Edit)
 */
export function getPreferredCourseKey(chartModel: ChartModel): number {
  if (chartModel.courses[3]) return 3; // Oni
  if (chartModel.courses[2]) return 2; // Hard
  if (chartModel.courses[1]) return 1; // Normal
  if (chartModel.courses[0]) return 0; // Easy
  if (chartModel.courses[4]) return 4; // Edit
  const keys = Object.keys(chartModel.courses).map(Number);
  if (keys.length > 0) return keys[0];
  return chartModel.activeCourseKey ?? 3;
}

export function useEditor({ initialTjaText, initialFileName = 'example.tja' }: UseEditorOptions) {
  // 1. Chart Model & History State
  const [chart, setChart] = useState<ChartModel>(() => parseTJA(initialTjaText));
  const [activeCourseKey, setActiveCourseKey] = useState<number>(() => {
    try {
      const parsed = parseTJA(initialTjaText);
      return getPreferredCourseKey(parsed);
    } catch {
      return 3;
    }
  });
  const [fileName, setFileName] = useState<string>(initialFileName);

  // Undo / Redo History (stores serialized TJA strings)
  const historyRef = useRef<string[]>([initialTjaText]);
  const historyIndexRef = useRef<number>(0);
  const [, setHistoryVersion] = useState<number>(0);

  // 2. Editor UI State
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(155); // Match 155% in reference image
  const [selectedTab, setSelectedTabState] = useState<EditorTab>('note');
  const [selectedNoteTool, setSelectedNoteToolState] = useState<NoteToolType>('1'); // Default Don
  const [selectedGrid, setSelectedGrid] = useState<GridDivision>(16); // Default 16
  const [selectedMeasureForEdit, setSelectedMeasureForEdit] = useState<number | null>(null);

  // Special notes editing state (Roll, Big Roll, Balloon)
  const [pendingSpecialNote, setPendingSpecialNote] = useState<PendingSpecialNote | null>(null);
  const [balloonHitCount, setBalloonHitCount] = useState<number>(5);

  // Non-blocking toast notifications for user feedback
  const [notification, setNotification] = useState<{
    message: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);
  const notificationTimerRef = useRef<any>(null);

  const showNotification = useCallback(
    (message: string, type: 'error' | 'success' | 'info' = 'error') => {
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
      setNotification({ message, type });
      notificationTimerRef.current = setTimeout(() => {
        setNotification(null);
        notificationTimerRef.current = null;
      }, 3000);
    },
    []
  );

  const clearNotification = useCallback(() => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    setNotification(null);
  }, []);

  const cancelPendingSpecialNote = useCallback(() => {
    setPendingSpecialNote(null);
    showNotification('特殊音符の配置をキャンセルしました', 'info');
  }, [showNotification]);

  // Wrapper to reset pending state when switching tool, tab, or course
  const setSelectedNoteTool = useCallback((tool: NoteToolType) => {
    setSelectedNoteToolState(tool);
    setPendingSpecialNote(null);
  }, []);

  const setSelectedTab = useCallback((tab: EditorTab) => {
    setSelectedTabState(tab);
    setPendingSpecialNote(null);
  }, []);

  const handleSetActiveCourseKey = useCallback((key: number) => {
    setActiveCourseKey(key);
    setPendingSpecialNote(null);
  }, []);

  // Auxiliary tool parameters for GOGO, BPM, and MEASURE
  const [gogoMode, setGogoMode] = useState<'GOGOSTART' | 'GOGOEND'>('GOGOSTART');
  const [bpmInput, setBpmInput] = useState<number>(120);
  const [measureInput, setMeasureInput] = useState<string>('4/4');

  // Available course keys in current chart
  const availableCourseKeys = useMemo<number[]>(() => {
    return Object.keys(chart.courses).map(Number).sort((a, b) => a - b);
  }, [chart.courses]);

  // Active course reference based on activeCourseKey
  const activeCourse: CourseModel = useMemo(() => {
    return chart.courses[activeCourseKey] || chart.activeCourse || Object.values(chart.courses)[0];
  }, [chart, activeCourseKey]);

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
    setPendingSpecialNote(null);
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
  const pushHistory = useCallback(
    (newChart: ChartModel) => {
      try {
        const serialized = writeTJA(newChart);
        const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        newHistory.push(serialized);
        if (newHistory.length > 50) newHistory.shift(); // Bound history size
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;

        // Re-parse with TJA Core to guarantee all measures, events, notes, and timelines are fully unified
        const recalculated = parseTJA(serialized, { courseKey: activeCourseKey });
        setChart(recalculated);
        setHistoryVersion((v) => v + 1);
      } catch (e) {
        console.error('Failed to push history:', e);
        setChart(newChart);
        setHistoryVersion((v) => v + 1);
      }
    },
    [activeCourseKey]
  );

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    setPendingSpecialNote(null);
    historyIndexRef.current -= 1;
    const prevTja = historyRef.current[historyIndexRef.current];
    try {
      const restored = parseTJA(prevTja, { courseKey: activeCourseKey });
      setChart(restored);
      if (!restored.courses[activeCourseKey]) {
        setActiveCourseKey(getPreferredCourseKey(restored));
      }
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      console.error('Failed to undo:', e);
    }
  }, [canUndo, activeCourseKey]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    setPendingSpecialNote(null);
    historyIndexRef.current += 1;
    const nextTja = historyRef.current[historyIndexRef.current];
    try {
      const restored = parseTJA(nextTja, { courseKey: activeCourseKey });
      setChart(restored);
      if (!restored.courses[activeCourseKey]) {
        setActiveCourseKey(getPreferredCourseKey(restored));
      }
      setHistoryVersion((v) => v + 1);
    } catch (e) {
      console.error('Failed to redo:', e);
    }
  }, [canRedo, activeCourseKey]);

  // Common command insertion (GOGO, BPM, MEASURE, etc.) using RationalPosition
  const insertCommandAtPosition = useCallback(
    (
      commandName: string,
      value: string,
      measureIndex: number,
      rational: RationalPosition,
      time: number
    ) => {
      const currentCourse = chart.courses[activeCourseKey] || chart.activeCourse;
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

      const updatedCourses: Record<number, CourseModel> = {
        ...chart.courses,
        [activeCourseKey]: updatedCourse,
      };

      const newChart: ChartModel = {
        ...chart,
        courses: updatedCourses,
        activeCourseKey,
        activeCourse: updatedCourse,
      };

      pushHistory(newChart);
    },
    [chart, activeCourseKey, pushHistory]
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

  // Measure seeking (jump playhead to measure start)
  const seekToMeasure = useCallback(
    (measureIndex: number) => {
      const currentCourse = chart.courses[activeCourseKey] || chart.activeCourse;
      if (!currentCourse) return;
      const m = currentCourse.measures[measureIndex];
      if (m) {
        seekTime(m.startTime);
        setSelectedMeasureForEdit(measureIndex);
      }
    },
    [chart, activeCourseKey, seekTime]
  );

  // Phase 3-B: Mobile PWA & Unsaved Work Guards
  useEffect(() => {
    const unregister = registerUnsavedWorkGuard(() => canUndo);
    return unregister;
  }, [canUndo]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (canUndo) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [canUndo]);

  // Handle clicking / tapping on the timeline to place or erase notes or insert commands
  const handleTimelineTap = useCallback(
    (timelineX: number) => {
      const currentCourse = chart.courses[activeCourseKey] || chart.activeCourse;
      if (!currentCourse) return;

      // 1. Note Tab: Perform note editing
      if (selectedTab === 'note') {
        // A. Special tools (5: Roll, 6: Big Roll, 7: Balloon)
        if (['5', '6', '7'].includes(selectedNoteTool)) {
          if (!pendingSpecialNote) {
            // Tap 1: Start Position
            const snapResult = snapTimelineXToGrid(timelineX, timeline, timelineLayout, selectedGrid);
            if (!snapResult) return;

            const { measureIndex, rational, time, snappedX } = snapResult;
            setCurrentTime(time);
            setSelectedMeasureForEdit(measureIndex);

            const validation = validateSpecialStart(currentCourse, measureIndex, rational, time);
            if (!validation.valid) {
              showNotification(validation.error || '無効な開始位置です', 'error');
              return;
            }

            const toolType = selectedNoteTool as '5' | '6' | '7';
            const specialType = toolType === '5' ? 'roll' : toolType === '6' ? 'big_roll' : 'balloon';
            setPendingSpecialNote({
              toolType,
              type: specialType,
              rawType: toolType,
              startMeasureIndex: measureIndex,
              startPosition: rational,
              startTime: time,
              snappedX,
            });
            showNotification('開始位置を設定しました。終了位置をタップしてください。', 'info');
            return;
          } else {
            // Tap 2: End Position
            const snapResult = snapTimelineXToGrid(
              timelineX,
              timeline,
              timelineLayout,
              selectedGrid,
              { allowMeasureEnd: true }
            );
            if (!snapResult) return;

            const { measureIndex: endMeasureIndex, rational: endRational, time: endTime } = snapResult;

            const validation = validateSpecialPlacement(
              currentCourse,
              pendingSpecialNote,
              endMeasureIndex,
              endRational,
              endTime,
              balloonHitCount
            );
            if (!validation.valid) {
              showNotification(validation.error || '無効な終了位置です', 'error');
              return;
            }

            const offset = chart.headers.offset || 0;
            const initialBpm = timeline.getBpmAtTime(pendingSpecialNote.startTime) || 120;
            const updatedCourse = createSpecialNote(
              currentCourse,
              pendingSpecialNote,
              endMeasureIndex,
              endRational,
              endTime,
              balloonHitCount,
              offset,
              initialBpm
            );

            const updatedCourses: Record<number, CourseModel> = {
              ...chart.courses,
              [activeCourseKey]: updatedCourse,
            };
            const newChart: ChartModel = {
              ...chart,
              courses: updatedCourses,
              activeCourseKey,
              activeCourse: updatedCourse,
            };

            const label =
              pendingSpecialNote.type === 'balloon'
                ? '風船'
                : pendingSpecialNote.type === 'big_roll'
                ? '大連打'
                : '連打';
            setPendingSpecialNote(null);
            pushHistory(newChart);
            showNotification(`${label}を作成しました`, 'success');
            setCurrentTime(endTime);
            setSelectedMeasureForEdit(endMeasureIndex);
            return;
          }
        }

        // B. Erase tool: Deletes regular notes first; if none, deletes special notes (roll/balloon)
        if (selectedNoteTool === 'erase') {
          const snapResult = snapTimelineXToGrid(timelineX, timeline, timelineLayout, selectedGrid);
          if (!snapResult) return;

          const { measureIndex, rational, time } = snapResult;
          setCurrentTime(time);
          setSelectedMeasureForEdit(measureIndex);

          const targetM = currentCourse.measures[measureIndex];
          if (!targetM) return;

          // Check regular note deletion first
          const noteIdx = targetM.notes.findIndex((n) =>
            isSameRationalPosition(n.positionInMeasure, rational)
          );

          if (noteIdx !== -1) {
            const updatedNotes = targetM.notes.filter((_, idx) => idx !== noteIdx);
            const updatedCourse: CourseModel = {
              ...currentCourse,
              measures: currentCourse.measures.map((m, idx) => {
                if (idx !== measureIndex) return m;
                return { ...m, notes: updatedNotes };
              }),
            };
            const allNotes: NoteModel[] = [];
            for (const m of updatedCourse.measures) {
              allNotes.push(...m.notes);
            }
            updatedCourse.notes = allNotes.sort((a, b) => a.time - b.time);

            const updatedCourses: Record<number, CourseModel> = {
              ...chart.courses,
              [activeCourseKey]: updatedCourse,
            };
            const newChart: ChartModel = {
              ...chart,
              courses: updatedCourses,
              activeCourseKey,
              activeCourse: updatedCourse,
            };
            pushHistory(newChart);
            showNotification('音符を削除しました', 'info');
            return;
          }

          // If no regular note, check special notes deletion (Roll, Big Roll, Balloon)
          const specialErase = eraseSpecialNoteAtPosition(currentCourse, measureIndex, rational, time);
          if (specialErase.deleted) {
            const updatedCourse = specialErase.updatedCourse;
            const updatedCourses: Record<number, CourseModel> = {
              ...chart.courses,
              [activeCourseKey]: updatedCourse,
            };
            const newChart: ChartModel = {
              ...chart,
              courses: updatedCourses,
              activeCourseKey,
              activeCourse: updatedCourse,
            };
            pushHistory(newChart);
            const label =
              specialErase.deletedType === 'balloon'
                ? '風船'
                : specialErase.deletedType === 'big_roll'
                ? '大連打'
                : '連打';
            showNotification(`${label}を削除しました`, 'info');
            return;
          }

          return;
        }

        // C. Regular notes ('1', '2', '3', '4')
        if (['1', '2', '3', '4'].includes(selectedNoteTool)) {
          const snapResult = snapTimelineXToGrid(timelineX, timeline, timelineLayout, selectedGrid);
          if (!snapResult) return;

          const { measureIndex, rational, time } = snapResult;
          setCurrentTime(time);
          setSelectedMeasureForEdit(measureIndex);

          // Check collision: cannot place regular notes on endpoints or inside existing rolls / balloons
          const allSpecial: (RollModel | BalloonModel)[] = [
            ...currentCourse.rolls,
            ...currentCourse.balloons,
          ];
          const insideOrEndpointConflict = allSpecial.some(
            (r) =>
              (r.startMeasureIndex === measureIndex &&
                isSameRationalPosition(r.startPosition, rational)) ||
              (r.endMeasureIndex === measureIndex &&
                isSameRationalPosition(r.endPosition, rational)) ||
              (time >= r.startTime - 1e-4 && time <= r.endTime + 1e-4)
          );
          if (insideOrEndpointConflict) {
            showNotification('特殊音符の区間内には通常音符を配置できません', 'error');
            return;
          }

          const targetM = currentCourse.measures[measureIndex];
          if (!targetM) return;

          const filtered = targetM.notes.filter(
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
            beat: targetM.startBeat + rational.fraction * ((targetM.numerator * 4) / targetM.denominator),
            measureIndex,
            positionInMeasure: rational,
            bpm: (targetM as any).initialBpm || 120,
            scroll: 1.0,
          };

          const updatedNotes = [...filtered, newNote].sort(
            (a, b) => a.positionInMeasure.fraction - b.positionInMeasure.fraction
          );

          const updatedCourse: CourseModel = {
            ...currentCourse,
            measures: currentCourse.measures.map((m, idx) => {
              if (idx !== measureIndex) return m;
              return { ...m, notes: updatedNotes };
            }),
          };

          const allNotes: NoteModel[] = [];
          for (const m of updatedCourse.measures) {
            allNotes.push(...m.notes);
          }
          updatedCourse.notes = allNotes.sort((a, b) => a.time - b.time);

          const updatedCourses: Record<number, CourseModel> = {
            ...chart.courses,
            [activeCourseKey]: updatedCourse,
          };
          const newChart: ChartModel = {
            ...chart,
            courses: updatedCourses,
            activeCourseKey,
            activeCourse: updatedCourse,
          };

          pushHistory(newChart);
          return;
        }
      }

      // 2. GOGO, BPM, MEASURE tabs
      const snapResult = snapTimelineXToGrid(timelineX, timeline, timelineLayout, selectedGrid);
      if (!snapResult) return;
      const { measureIndex, rational, time } = snapResult;
      setCurrentTime(time);
      setSelectedMeasureForEdit(measureIndex);

      if (selectedTab === 'gogo') {
        insertCommandAtPosition(gogoMode, '', measureIndex, rational, time);
      } else if (selectedTab === 'bpm') {
        if (bpmInput > 0 && isFinite(bpmInput)) {
          insertCommandAtPosition('BPMCHANGE', String(bpmInput), measureIndex, rational, time);
        }
      } else if (selectedTab === 'measure') {
        if (measureInput && measureInput.includes('/')) {
          const targetMeasure = currentCourse.measures[measureIndex];
          if (targetMeasure) {
            const measureStartRational: RationalPosition = { numerator: 0, denominator: 1, fraction: 0 };
            setCurrentTime(targetMeasure.startTime);
            insertCommandAtPosition('MEASURE', measureInput, measureIndex, measureStartRational, targetMeasure.startTime);
          }
        }
      }
    },
    [
      chart,
      activeCourseKey,
      selectedTab,
      selectedNoteTool,
      selectedGrid,
      timeline,
      timelineLayout,
      pendingSpecialNote,
      balloonHitCount,
      gogoMode,
      bpmInput,
      measureInput,
      insertCommandAtPosition,
      pushHistory,
      showNotification,
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
      setPendingSpecialNote(null);
      const parsed = parseTJA(tjaText);
      const initialKey = getPreferredCourseKey(parsed);
      historyRef.current = [tjaText];
      historyIndexRef.current = 0;
      setChart(parsed);
      setActiveCourseKey(initialKey);
      setCurrentTime(0);
      setIsPlaying(false);
      if (newFileName) setFileName(newFileName);
      setHistoryVersion((v) => v + 1);
    } catch (err: any) {
      console.error('Failed to load TJA:', err);
      alert('TJA解析に失敗しました: ' + err.message);
    }
  }, []);

  // Apply TJA text directly from Text Editor with error protection
  const applyTjaText = useCallback(
    (tjaText: string): { success: boolean; error?: string } => {
      try {
        setPendingSpecialNote(null);
        const validation = validateTJARaw(tjaText);
        if (validation.errors.length > 0) {
          const firstErr = validation.errors[0];
          return {
            success: false,
            error: `行 ${firstErr.line ?? '?'}: ${firstErr.message}`,
          };
        }

        const parsed = parseTJA(tjaText, { courseKey: activeCourseKey });
        const nextKey = parsed.courses[activeCourseKey]
          ? activeCourseKey
          : getPreferredCourseKey(parsed);

        // Record serialized state into history stack for seamless Undo / Redo
        const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        newHistory.push(tjaText);
        if (newHistory.length > 50) newHistory.shift();
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;

        setChart(parsed);
        setActiveCourseKey(nextKey);
        setHistoryVersion((v) => v + 1);
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: `パースエラー: ${err?.message || String(err)}`,
        };
      }
    },
    [activeCourseKey]
  );

  return {
    chart,
    activeCourseKey,
    setActiveCourseKey: handleSetActiveCourseKey,
    availableCourseKeys,
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
    pendingSpecialNote,
    cancelPendingSpecialNote,
    balloonHitCount,
    setBalloonHitCount,
    notification,
    clearNotification,
    showNotification,
    gogoMode,
    bpmInput,
    measureInput,
    setGogoMode,
    setBpmInput,
    setMeasureInput,
    togglePlayback,
    seekTime,
    seekToMeasure,
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
    applyTjaText,
    pushHistory,
  };
}
