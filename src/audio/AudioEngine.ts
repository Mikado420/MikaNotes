/**
 * MikaNotes Phase 4-1 - Audio Engine Core
 * Encapsulates HTMLAudioElement playback, resource management, and lifecycle safety.
 */

import {
  AudioEngineOptions,
  AudioEngineState,
  AudioEventCallback,
  AudioTimeCallback,
} from './types';

export class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private currentFileName: string | null = null;

  private state: AudioEngineState = {
    loadState: 'unloaded',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    playbackRate: 1.0,
    fileName: null,
    errorMessage: null,
  };

  private stateSubscribers: Set<AudioEventCallback> = new Set();
  private timeSubscribers: Set<AudioTimeCallback> = new Set();

  private rafId: number | null = null;
  private boundOnLoadedMetadata: (() => void) | null = null;
  private boundOnTimeUpdate: (() => void) | null = null;
  private boundOnPlay: (() => void) | null = null;
  private boundOnPause: (() => void) | null = null;
  private boundOnEnded: (() => void) | null = null;
  private boundOnError: ((e: Event) => void) | null = null;

  constructor(options?: AudioEngineOptions) {
    if (options?.initialVolume !== undefined) {
      this.state.volume = Math.max(0, Math.min(1, options.initialVolume));
    }
    if (options?.initialPlaybackRate !== undefined) {
      this.state.playbackRate = Math.max(0.25, Math.min(4.0, options.initialPlaybackRate));
    }
  }

  /**
   * Subscribe to full state updates (loadState, isPlaying, volume, etc.)
   */
  public subscribe(callback: AudioEventCallback): () => void {
    this.stateSubscribers.add(callback);
    callback({ ...this.state });
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  /**
   * Subscribe to high-frequency currentTime updates (for smooth playhead tracking)
   */
  public subscribeTime(callback: AudioTimeCallback): () => void {
    this.timeSubscribers.add(callback);
    callback(this.state.currentTime);
    return () => {
      this.timeSubscribers.delete(callback);
    };
  }

  private notifyState(): void {
    const snapshot = { ...this.state };
    for (const sub of this.stateSubscribers) {
      try {
        sub(snapshot);
      } catch (err) {
        console.error('AudioEngine subscriber error:', err);
      }
    }
  }

  private notifyTime(time: number): void {
    for (const sub of this.timeSubscribers) {
      try {
        sub(time);
      } catch (err) {
        console.error('AudioEngine timeSubscriber error:', err);
      }
    }
  }

  /**
   * Start high-frequency requestAnimationFrame loop during active playback
   */
  private startRafLoop(): void {
    this.stopRafLoop();
    const tick = () => {
      if (!this.audio || !this.state.isPlaying) return;
      const current = this.audio.currentTime;
      this.state.currentTime = current;
      this.notifyTime(current);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRafLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Detach all event listeners and release resources from existing audio element
   */
  private cleanupCurrentAudio(): void {
    this.stopRafLoop();

    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // Safe no-op
      }

      if (this.boundOnLoadedMetadata) this.audio.removeEventListener('loadedmetadata', this.boundOnLoadedMetadata);
      if (this.boundOnTimeUpdate) this.audio.removeEventListener('timeupdate', this.boundOnTimeUpdate);
      if (this.boundOnPlay) this.audio.removeEventListener('play', this.boundOnPlay);
      if (this.boundOnPause) this.audio.removeEventListener('pause', this.boundOnPause);
      if (this.boundOnEnded) this.audio.removeEventListener('ended', this.boundOnEnded);
      if (this.boundOnError) this.audio.removeEventListener('error', this.boundOnError);

      this.boundOnLoadedMetadata = null;
      this.boundOnTimeUpdate = null;
      this.boundOnPlay = null;
      this.boundOnPause = null;
      this.boundOnEnded = null;
      this.boundOnError = null;

      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }

  /**
   * Load an audio file (File object from input[type=file] or drag-and-drop)
   */
  public async loadAudioFile(file: File): Promise<void> {
    // Basic validation
    if (!file || file.size === 0) {
      this.state.loadState = 'error';
      this.state.errorMessage = '音源ファイルが空または無効です';
      this.notifyState();
      return;
    }

    // Clean up previous audio instance and URL
    this.cleanupCurrentAudio();

    this.currentFileName = file.name;
    this.state = {
      ...this.state,
      loadState: 'loading',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      fileName: file.name,
      errorMessage: null,
    };
    this.notifyState();
    this.notifyTime(0);

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      this.currentObjectUrl = objectUrl;
    } catch (err: any) {
      this.state.loadState = 'error';
      this.state.errorMessage = `Object URLの生成に失敗しました: ${err?.message || String(err)}`;
      this.notifyState();
      return;
    }

    return this.initializeAudioElement(objectUrl, file.name);
  }

  /**
   * Initialize and attach listeners to HTMLAudioElement
   */
  private initializeAudioElement(src: string, fileName: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio();
      this.audio = audio;
      audio.preload = 'auto';
      audio.volume = this.state.volume;
      audio.playbackRate = this.state.playbackRate;

      let settled = false;
      const settleSuccess = () => {
        if (settled) return;
        settled = true;
        const dur = isFinite(audio.duration) && !isNaN(audio.duration) ? audio.duration : 0;
        this.state = {
          ...this.state,
          loadState: 'loaded',
          duration: dur,
          currentTime: audio.currentTime || 0,
          errorMessage: null,
        };
        this.notifyState();
        this.notifyTime(this.state.currentTime);
        resolve();
      };

      const settleError = (msg: string) => {
        if (settled) return;
        settled = true;
        this.state = {
          ...this.state,
          loadState: 'error',
          isPlaying: false,
          errorMessage: msg,
        };
        this.notifyState();
        resolve(); // Resolve rather than throw to keep callers stable
      };

      this.boundOnLoadedMetadata = () => {
        settleSuccess();
      };

      this.boundOnTimeUpdate = () => {
        if (!this.audio) return;
        const cur = this.audio.currentTime;
        this.state.currentTime = cur;
        this.notifyTime(cur);
      };

      this.boundOnPlay = () => {
        this.state.isPlaying = true;
        this.notifyState();
        this.startRafLoop();
      };

      this.boundOnPause = () => {
        this.state.isPlaying = false;
        this.stopRafLoop();
        if (this.audio) {
          this.state.currentTime = this.audio.currentTime;
          this.notifyTime(this.state.currentTime);
        }
        this.notifyState();
      };

      this.boundOnEnded = () => {
        this.state.isPlaying = false;
        this.stopRafLoop();
        if (this.audio) {
          this.state.currentTime = this.state.duration;
          this.notifyTime(this.state.duration);
        }
        this.notifyState();
      };

      this.boundOnError = (e) => {
        const errCode = audio.error?.code;
        let errDesc = '音源の読み込みまたはデコードに失敗しました';
        if (errCode === 1) errDesc = '音源の取得が中止されました';
        else if (errCode === 2) errDesc = 'ネットワークエラーにより音源取得に失敗しました';
        else if (errCode === 3) errDesc = '音源のデコードに失敗しました (非対応のコーデック)';
        else if (errCode === 4) errDesc = '音源形式がサポートされていません';

        settleError(errDesc);
      };

      audio.addEventListener('loadedmetadata', this.boundOnLoadedMetadata);
      audio.addEventListener('timeupdate', this.boundOnTimeUpdate);
      audio.addEventListener('play', this.boundOnPlay);
      audio.addEventListener('pause', this.boundOnPause);
      audio.addEventListener('ended', this.boundOnEnded);
      audio.addEventListener('error', this.boundOnError);

      audio.src = src;
      audio.load();

      // Fallback timeout in case loadedmetadata doesn't fire (e.g. stalled or silent error)
      setTimeout(() => {
        if (!settled) {
          if (audio.readyState >= 1) {
            settleSuccess();
          } else if (audio.error) {
            settleError('音源の読み込みに失敗しました');
          }
        }
      }, 3000);
    });
  }

  /**
   * Start playback
   */
  public async play(): Promise<void> {
    if (!this.audio || this.state.loadState !== 'loaded') {
      // Safe no-op when no audio is loaded
      return;
    }

    try {
      await this.audio.play();
    } catch (err: any) {
      console.warn('Audio play prevented or failed:', err);
      this.state.isPlaying = false;
      this.stopRafLoop();
      this.notifyState();
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (!this.audio || this.state.loadState !== 'loaded') {
      return;
    }
    try {
      this.audio.pause();
    } catch {
      // Safe no-op
    }
  }

  /**
   * Resume playback (alias for play)
   */
  public async resume(): Promise<void> {
    return this.play();
  }

  /**
   * Stop playback and reset time to 0
   */
  public stop(): void {
    this.pause();
    this.seek(0);
  }

  /**
   * Toggle play / pause
   */
  public async togglePlay(): Promise<void> {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * Seek to specific absolute time in seconds with bounds clamping
   */
  public seek(targetTime: number): void {
    // Sanitize input
    let safeTime = targetTime;
    if (isNaN(safeTime) || !isFinite(safeTime)) {
      safeTime = 0;
    }

    safeTime = Math.max(0, safeTime);
    if (this.state.duration > 0) {
      safeTime = Math.min(this.state.duration, safeTime);
    }

    this.state.currentTime = safeTime;
    this.notifyTime(safeTime);

    if (this.audio && this.state.loadState === 'loaded') {
      try {
        this.audio.currentTime = safeTime;
      } catch (err) {
        console.warn('AudioElement seek error:', err);
      }
    }
  }

  /**
   * Seek relative to current time by delta seconds
   */
  public seekRelative(delta: number): void {
    if (isNaN(delta) || !isFinite(delta)) return;
    this.seek(this.state.currentTime + delta);
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  public setVolume(vol: number): void {
    const safeVol = Math.max(0, Math.min(1, isNaN(vol) ? 1 : vol));
    this.state.volume = safeVol;
    if (this.audio) {
      this.audio.volume = safeVol;
    }
    this.notifyState();
  }

  /**
   * Set playback rate (0.25 to 4.0)
   */
  public setPlaybackRate(rate: number): void {
    const safeRate = Math.max(0.25, Math.min(4.0, isNaN(rate) ? 1.0 : rate));
    this.state.playbackRate = safeRate;
    if (this.audio) {
      this.audio.playbackRate = safeRate;
    }
    this.notifyState();
  }

  public getCurrentTime(): number {
    if (this.audio && this.state.loadState === 'loaded') {
      return this.audio.currentTime;
    }
    return this.state.currentTime;
  }

  public getDuration(): number {
    return this.state.duration;
  }

  public getState(): AudioEngineState {
    return { ...this.state };
  }

  public isLoaded(): boolean {
    return this.state.loadState === 'loaded';
  }

  public isPlaying(): boolean {
    return this.state.isPlaying;
  }

  /**
   * Complete teardown for unmount
   */
  public dispose(): void {
    this.cleanupCurrentAudio();
    this.stateSubscribers.clear();
    this.timeSubscribers.clear();
    this.state = {
      loadState: 'unloaded',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1.0,
      playbackRate: 1.0,
      fileName: null,
      errorMessage: null,
    };
  }

  /**
   * Alias for dispose
   */
  public destroy(): void {
    this.dispose();
  }
}
