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

  return (
    <div
      id="mikanotes-editor-shell"
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
        onSelectMeasure={() => {}}
        onZoomIn={editor.zoomIn}
        onZoomOut={editor.zoomOut}
        onResetZoom={() => editor.setZoomPercent(100)}
      />

      {/* 3. Bottom Toolbar & Mode Switcher */}
      <EditorToolbar
        selectedTab={editor.selectedTab}
        onSelectTab={editor.setSelectedTab}
        selectedTool={editor.selectedNoteTool}
        onSelectTool={editor.setSelectedNoteTool}
        selectedGrid={editor.selectedGrid}
        onSelectGrid={editor.setSelectedGrid}
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
      />

      {/* 5. TJA Text Editor Modal */}
      <TjaTextEditorModal
        isOpen={isTextEditorOpen}
        onClose={() => setIsTextEditorOpen(false)}
        chart={editor.chart}
        fileName={editor.fileName}
        onApplyTja={editor.applyTjaText}
      />
    </div>
  );
};
