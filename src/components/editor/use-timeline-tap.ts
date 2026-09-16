/**
 * MikaNotes Phase 3-B - Mobile Touch & Tap Disambiguation Hook
 * Completely eliminates the "wanted to scroll but placed a note" /
 * "wanted to place a note but scrolled" touch conflict on smartphones.
 *
 * Physics:
 * - When swiping/scrolling horizontally, pointer moves > 8px -> marked as dragging, no note placed.
 * - When cleanly tapping a grid point (<= 8px movement, <= 500ms duration) -> triggers immediate tap.
 * - Suppresses synthetic browser clicks following pointerup to prevent duplicate triggers.
 */

import React, { useRef } from 'react';

export function useTimelineTap(onTap?: (timelineX: number) => void) {
  const pointerStartRef = useRef<{ x: number; y: number; time: number; pointerId: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastHandledTapTimeRef = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle primary pointer (first touch or main mouse button)
    if (!e.isPrimary) return;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
      pointerId: e.pointerId,
    };
    isDraggingRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || pointerStartRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    // If movement exceeds 8 pixels in any direction, it's a drag / swipe to scroll
    if (Math.hypot(dx, dy) > 8) {
      isDraggingRef.current = true;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || pointerStartRef.current.pointerId !== e.pointerId) return;
    const duration = Date.now() - pointerStartRef.current.time;
    const wasDragging = isDraggingRef.current;
    pointerStartRef.current = null;
    isDraggingRef.current = false;

    // If dragged or held for too long (> 500ms), it's a scroll gesture or long-press, not a tap
    if (wasDragging || duration > 500) {
      return;
    }

    if (!onTap) return;

    // It is a clean tap!
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    lastHandledTapTimeRef.current = Date.now();
    onTap(clickX);
  };

  const handlePointerCancel = () => {
    pointerStartRef.current = null;
    isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTap) return;
    // Prevent double-triggering if pointerUp already handled the tap recently
    if (Date.now() - lastHandledTapTimeRef.current < 400) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    lastHandledTapTimeRef.current = Date.now();
    onTap(clickX);
  };

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onClick: handleClick,
  };
}
