/**
 * MikaNotes Phase 2 - Editor Shell
 * Root landscape container for the mobile-first Taiko chart editor.
 */

import React, { useState } from 'react';
import { useEditor } from '../../editor/use-editor';
import { EditorHeader } from './EditorHeader';
import { TimelineEditor } from './TimelineEditor';
import { EditorToolbar } from './EditorToolbar';
import { EditorMenuModal } from './EditorMenuModal';
import { TjaTextEditorModal } from './TjaTextEditorModal';
import { OrientationNotice } from './OrientationNotice';

interface EditorShellProps {
  initialTja: string;
  initialFileName?: string;
  onSwitchToWorkbench: () => void;
}

export const EditorShell: React.FC<EditorShellProps> = ({
  initialTja,
  initialFileName = 'example.tja',
  onSwitchToWorkbench,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);

  const editor = useEditor({
    initialTjaText: initialTja,
    initialFileName,
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.tja')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result;
        if (typeof text === 'string') {
          editor.loadTja(text, file.name);
        }
      };
      reader.readAsText(file);
    } else if (
      file.type.startsWith('audio/') ||
      lowerName.endsWith('.ogg') ||
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.wav') ||
      lowerName.endsWith('.m4a')
    ) {
      editor.loadAudioFile(file);
    }
  };

  return (
    <div
      id="mikanotes-editor-shell"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="h-[100dvh] w-full flex flex-col overflow-hidden bg-[#070b14] text-slate-100 select-none font-sans"
    >
      {/* 1. Header */}
      <EditorHeader
        fileName={editor.fileName}
        onRenameFile={editor.setFileName}
        isPlaying={editor.isPlaying}
        onTogglePlayback={editor.togglePlayback}
        currentTime={editor.currentTime}
        totalDuration={editor.totalDuration}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onOpenSettings={() => setIsMenuOpen(true)}
        onOpenMenu={() => setIsMenuOpen(true)}
        activeCourseKey={editor.activeCourseKey}
        availableCourseKeys={editor.availableCourseKeys}
        onSelectCourseKey={editor.setActiveCourseKey}
        onOpenTextEditor={() => setIsTextEditorOpen(true)}
        audioState={editor.audioState}
        onLoadAudioFile={editor.loadAudioFile}
        audioEngine={editor.audioEngine}
        chartOffset={editor.chart.headers.offset || 0}
      />

      {/* 2. Main Visual Multi-Lane Timeline */}
      <TimelineEditor
        course={editor.activeCourse}
        timeline={editor.timeline}
        layout={editor.timelineLayout}
        currentTime={editor.currentTime}
        activeMeasureIndex={editor.activeMeasureIndex}
        zoom={editor.zoom}
        selectedGrid={editor.selectedGrid}
        isPlaying={editor.isPlaying}
        onTapTimeline={editor.handleTimelineTap}
        onSelectMeasure={editor.seekToMeasure}
        onZoomIn={editor.zoomIn}
        onZoomOut={editor.zoomOut}
        onResetZoom={() => editor.setZoomPercent(100)}
        pendingSpecialNote={editor.pendingSpecialNote}
        notification={editor.notification}
        audioEngine={editor.audioEngine}
        chartOffset={editor.chart.headers.offset || 0}
        onSeekTimelineX={editor.seekTimelineX}
      />

      {/* 3. Bottom Toolbar & Mode Switcher */}
      <EditorToolbar
        selectedTab={editor.selectedTab}
        onSelectTab={editor.setSelectedTab}
        selectedTool={editor.selectedNoteTool}
        onSelectTool={editor.setSelectedNoteTool}
        selectedGrid={editor.selectedGrid}
        onSelectGrid={editor.setSelectedGrid}
        pendingSpecialNote={editor.pendingSpecialNote}
        onCancelPending={editor.cancelPendingSpecialNote}
        balloonHitCount={editor.balloonHitCount}
        onChangeBalloonHitCount={editor.setBalloonHitCount}
        gogoMode={editor.gogoMode}
        onChangeGogoMode={editor.setGogoMode}
        onAddGogo={() => editor.insertGogoDirect('GOGOSTART')}
        onRemoveGogo={() => editor.insertGogoDirect('GOGOEND')}
        bpmInput={editor.bpmInput}
        onChangeBpm={editor.setBpmInput}
        onSetBpm={editor.insertBpmDirect}
        measureInput={editor.measureInput}
        onChangeMeasure={editor.setMeasureInput}
        onSetMeasure={editor.insertMeasureDirect}
      />

      {/* 4. Menu / Import / Export / Workbench Switcher Modal */}
      <EditorMenuModal
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        chart={editor.chart}
        fileName={editor.fileName}
        onLoadTja={editor.loadTja}
        onSwitchToWorkbench={onSwitchToWorkbench}
        onOpenTextEditor={() => {
          setIsMenuOpen(false);
          setIsTextEditorOpen(true);
        }}
        audioState={editor.audioState}
        onLoadAudioFile={editor.loadAudioFile}
      />

      {/* 5. TJA Text Editor Modal */}
      <TjaTextEditorModal
        isOpen={isTextEditorOpen}
        onClose={() => setIsTextEditorOpen(false)}
        chart={editor.chart}
        fileName={editor.fileName}
        onApplyTja={editor.applyTjaText}
      />

      {/* 6. Mobile Portrait Orientation Notice Prompt */}
      <OrientationNotice />
    </div>
  );
};
