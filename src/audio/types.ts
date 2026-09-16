/**
 * MikaNotes Phase 4-1 - Audio Engine Types
 * Pure TypeScript interfaces for HTMLAudioElement-based playback engine
 */

export type AudioLoadState = 'unloaded' | 'loading' | 'loaded' | 'error';

export interface AudioEngineState {
  loadState: AudioLoadState;
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number;    // in seconds
  volume: number;      // 0.0 - 1.0
  playbackRate: number;// typically 1.0
  fileName: string | null;
  errorMessage: string | null;
}

export type AudioEventCallback = (state: AudioEngineState) => void;
export type AudioTimeCallback = (currentTime: number) => void;

export interface AudioEngineOptions {
  initialVolume?: number;
  initialPlaybackRate?: number;
}
