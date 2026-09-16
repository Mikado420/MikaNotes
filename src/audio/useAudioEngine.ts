/**
 * MikaNotes Phase 4-1 - useAudioEngine Hook
 * React lifecycle integration for AudioEngine instance with strict cleanup and zero memory leaks.
 */

import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { AudioEngine } from './AudioEngine';
import { AudioEngineState, AudioEngineOptions } from './types';

export interface UseAudioEngineReturn {
  audioEngine: AudioEngine;
  audioState: AudioEngineState;
  audioCurrentTimeRef: MutableRefObject<number>;
  loadAudioFile: (file: File) => Promise<void>;
  play: () => Promise<void>;
  resume: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  togglePlay: () => Promise<void>;
  seek: (time: number) => void;
  seekRelative: (delta: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
}

export function useAudioEngine(options?: AudioEngineOptions): UseAudioEngineReturn {
  // Stable AudioEngine instance for component lifecycle
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AudioEngine(options);
  }
  const audioEngine = engineRef.current;

  // React state reflecting discrete audio state changes (load, play, pause, duration, etc.)
  const [audioState, setAudioState] = useState<AudioEngineState>(() => audioEngine.getState());

  // Mutable ref for zero-latency high-frequency time readout without forcing component re-renders
  const audioCurrentTimeRef = useRef<number>(audioState.currentTime);

  useEffect(() => {
    // Subscribe to discrete state changes
    const unsubState = audioEngine.subscribe((state) => {
      setAudioState(state);
      audioCurrentTimeRef.current = state.currentTime;
    });

    // Subscribe to high-frequency time ticks
    const unsubTime = audioEngine.subscribeTime((time) => {
      audioCurrentTimeRef.current = time;
    });

    return () => {
      unsubState();
      unsubTime();
      // On unmount, dispose completely
      audioEngine.dispose();
    };
  }, [audioEngine]);

  const loadAudioFile = useCallback(
    async (file: File) => {
      await audioEngine.loadAudioFile(file);
    },
    [audioEngine]
  );

  const play = useCallback(async () => {
    await audioEngine.play();
  }, [audioEngine]);

  const resume = useCallback(async () => {
    await audioEngine.resume();
  }, [audioEngine]);

  const pause = useCallback(() => {
    audioEngine.pause();
  }, [audioEngine]);

  const stop = useCallback(() => {
    audioEngine.stop();
  }, [audioEngine]);

  const togglePlay = useCallback(async () => {
    await audioEngine.togglePlay();
  }, [audioEngine]);

  const seek = useCallback(
    (time: number) => {
      audioEngine.seek(time);
    },
    [audioEngine]
  );

  const seekRelative = useCallback(
    (delta: number) => {
      audioEngine.seekRelative(delta);
    },
    [audioEngine]
  );

  const setVolume = useCallback(
    (vol: number) => {
      audioEngine.setVolume(vol);
    },
    [audioEngine]
  );

  const setPlaybackRate = useCallback(
    (rate: number) => {
      audioEngine.setPlaybackRate(rate);
    },
    [audioEngine]
  );

  return {
    audioEngine,
    audioState,
    audioCurrentTimeRef,
    loadAudioFile,
    play,
    resume,
    pause,
    stop,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    setPlaybackRate,
  };
}
