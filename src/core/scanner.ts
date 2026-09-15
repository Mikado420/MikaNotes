/**
 * MikaNotes TJA Core - Lightweight Scanner
 * Rapid pre-flight assessment with timeout and heavy chart protection
 */

import { ScanResult } from './types';

export interface ScanOptions {
  maxScanTimeMs?: number;
}

/**
 * Fast scanning of TJA data before full parsing.
 * Guaranteed never to freeze or loop infinitely, even on multi-megabyte abnormal files.
 */
export function scanTJAInfo(tja: string, options: ScanOptions = {}): ScanResult {
  const maxScanTime = options.maxScanTimeMs ?? 50;

  if (!tja || typeof tja !== 'string') {
    return {
      charCount: 0,
      lineCount: 0,
      measureCount: 0,
      notesCount: 0,
      initialBpm: 120,
      estimatedDuration: 0,
      maxMeasureBeats: 4,
      isHeavy: false,
      heavyReasons: [],
    };
  }

  const scanStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const charCount = tja.length;
  const lines = tja.split(/\r?\n/);
  const lineCount = lines.length;

  let measureCount = 0;
  let notesCount = 0;
  let maxMeasureBeats = 4;
  let currentBpm = 120;
  let initialBpm = 120;
  let bpmFound = false;
  let currentMeasure = [4, 4];
  let duration = 0;
  let hasValidDuration = true;
  const heavyReasons: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Timeout protection: abort loop if scan exceeds time limit
    if (i % 80 === 0 && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - scanStart > maxScanTime) {
      hasValidDuration = false;
      heavyReasons.push(`Scan timeout exceeded (${maxScanTime}ms)`);
      break;
    }

    const raw = lines[i].split('//')[0].trim();
    if (!raw) continue;

    if (raw.startsWith('BPM:')) {
      const val = parseFloat(raw.substring(4).trim());
      if (!isNaN(val) && val > 0 && isFinite(val)) {
        currentBpm = val;
        if (!bpmFound) {
          initialBpm = val;
          bpmFound = true;
        }
      }
    } else if (raw.startsWith('#BPMCHANGE')) {
      const val = parseFloat(raw.substring(10).trim());
      if (!isNaN(val) && val > 0 && isFinite(val)) {
        currentBpm = val;
      }
    } else if (raw.startsWith('#MEASURE')) {
      const m = raw.substring(8).trim().split('/');
      if (m.length === 2) {
        const num = parseFloat(m[0]);
        const den = parseFloat(m[1]);
        if (!isNaN(num) && !isNaN(den) && den > 0 && num >= 0 && isFinite(num) && isFinite(den)) {
          currentMeasure = [num, den];
          const beats = (num / den) * 4;
          if (isNaN(beats) || !isFinite(beats) || beats > 16 || beats < 0 || num > 10000) {
            hasValidDuration = false;
          }
          if (isNaN(beats) || !isFinite(beats) || beats > maxMeasureBeats) {
            maxMeasureBeats = isFinite(beats) ? beats : Infinity;
          }
        } else {
          hasValidDuration = false;
          maxMeasureBeats = Infinity;
        }
      }
    } else if (raw === ',') {
      if (measureCount < 100000) measureCount++;
      if (hasValidDuration) {
        const beats = (currentMeasure[0] / currentMeasure[1]) * 4;
        if (!isNaN(beats) && isFinite(beats) && beats >= 0 && currentBpm > 0 && beats <= 32) {
          duration += (beats / currentBpm) * 60;
        } else {
          hasValidDuration = false;
        }
      }
    } else if (raw.match(/^[0-9A-G,]+$/)) {
      for (let j = 0; j < raw.length; j++) {
        const char = raw[j];
        if (char === ',') {
          if (measureCount < 100000) measureCount++;
          if (hasValidDuration) {
            const beats = (currentMeasure[0] / currentMeasure[1]) * 4;
            if (!isNaN(beats) && isFinite(beats) && beats >= 0 && currentBpm > 0 && beats <= 32) {
              duration += (beats / currentBpm) * 60;
            } else {
              hasValidDuration = false;
            }
          }
        } else if (['1', '2', '3', '4'].includes(char)) {
          if (notesCount < 200000) notesCount++;
        }
      }
    }
  }

  const isDurationSensible = hasValidDuration && isFinite(duration) && duration >= 0 && duration <= 86400 * 7;
  const finalDuration = isDurationSensible ? duration : null;

  if (charCount > 30000) heavyReasons.push(`Large file size (${charCount} characters)`);
  if (lineCount > 1500) heavyReasons.push(`High line count (${lineCount} lines)`);
  if (measureCount > 400) heavyReasons.push(`High measure count (${measureCount} measures)`);
  if (notesCount > 3000) heavyReasons.push(`High note count (${notesCount} notes)`);
  if (maxMeasureBeats > 16 || !isFinite(maxMeasureBeats) || isNaN(maxMeasureBeats)) {
    heavyReasons.push(`Extreme measure beat length (${maxMeasureBeats} beats)`);
  }
  if (finalDuration === null) {
    heavyReasons.push(`Invalid or indeterminable duration`);
  }

  const isHeavy = heavyReasons.length > 0;

  return {
    charCount,
    lineCount,
    measureCount,
    notesCount,
    initialBpm,
    estimatedDuration: finalDuration,
    maxMeasureBeats,
    isHeavy,
    heavyReasons,
  };
}
