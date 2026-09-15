/**
 * MikaNotes TJA Core - Validator
 * Validates TJA data integrity, distinguishing ERROR vs WARNING
 */

import { ValidationResult, ValidationIssue, CourseModel } from './types';

export function validateTJARaw(tjaText: string): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const lines = tjaText.split(/\r?\n/);
  let hasStart = false;
  let hasEnd = false;
  let inSong = false;
  let activeRollType: string | null = null;
  let activeRollLine: number = 0;
  let balloonCounts = 0;
  let expectedBalloons: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].split('//')[0].trim();
    if (!line) continue;

    // Header validation
    if (line.startsWith('BPM:')) {
      const val = parseFloat(line.substring(4).trim());
      if (isNaN(val) || !isFinite(val) || val <= 0) {
        errors.push({
          type: 'error',
          code: 'INVALID_BPM',
          message: `Invalid initial BPM value: "${line.substring(4).trim()}". Must be a positive finite number.`,
          line: lineNum,
        });
      } else if (val > 10000) {
        warnings.push({
          type: 'warning',
          code: 'EXTREME_BPM',
          message: `Extremely high BPM (${val}). May cause playback issues.`,
          line: lineNum,
        });
      }
    } else if (line.startsWith('BALLOON:')) {
      const rawValues = line.substring(8).trim();
      if (rawValues.length > 0) {
        const parts = rawValues.split(/[, ]+/).filter(Boolean);
        const numbers = parts.map(Number);
        if (numbers.some(n => isNaN(n) || n <= 0 || !Number.isInteger(n))) {
          warnings.push({
            type: 'warning',
            code: 'INVALID_BALLOON_HEADER',
            message: `BALLOON header contains invalid values: "${rawValues}". Expected positive integers.`,
            line: lineNum,
          });
        }
        expectedBalloons = numbers.filter(n => !isNaN(n) && n > 0);
      }
    } else if (line.startsWith('OFFSET:')) {
      const val = parseFloat(line.substring(7).trim());
      if (isNaN(val) || !isFinite(val)) {
        warnings.push({
          type: 'warning',
          code: 'INVALID_OFFSET',
          message: `Invalid OFFSET value: "${line.substring(7).trim()}". Defaulting to 0.0.`,
          line: lineNum,
        });
      }
    } else if (line.startsWith('#START')) {
      hasStart = true;
      inSong = true;
    } else if (line.startsWith('#END')) {
      hasEnd = true;
      inSong = false;
      if (activeRollType !== null) {
        errors.push({
          type: 'error',
          code: 'UNCLOSED_ROLL',
          message: `Unclosed roll/balloon (type ${activeRollType}) before #END at line ${lineNum} (started at line ${activeRollLine}).`,
          line: lineNum,
        });
        activeRollType = null;
      }
    } else if (line.startsWith('#')) {
      // Command validation
      const spaceIdx = line.indexOf(' ');
      const cmdName = (spaceIdx !== -1 ? line.substring(0, spaceIdx) : line).toUpperCase();
      const cmdVal = (spaceIdx !== -1 ? line.substring(spaceIdx + 1) : '').trim();

      switch (cmdName) {
        case '#BPMCHANGE': {
          const val = parseFloat(cmdVal);
          if (isNaN(val) || !isFinite(val) || val <= 0) {
            errors.push({
              type: 'error',
              code: 'INVALID_BPMCHANGE',
              message: `Invalid #BPMCHANGE value "${cmdVal}" at line ${lineNum}. Must be a positive finite number.`,
              line: lineNum,
            });
          }
          break;
        }
        case '#MEASURE': {
          const parts = cmdVal.split('/');
          if (parts.length !== 2) {
            errors.push({
              type: 'error',
              code: 'MALFORMED_MEASURE',
              message: `Malformed #MEASURE format "${cmdVal}" at line ${lineNum}. Must be numerator/denominator (e.g. 4/4).`,
              line: lineNum,
            });
          } else {
            const num = parseFloat(parts[0]);
            const den = parseFloat(parts[1]);
            if (isNaN(num) || isNaN(den) || !isFinite(num) || !isFinite(den)) {
              errors.push({
                type: 'error',
                code: 'INVALID_MEASURE_VALUES',
                message: `Non-numeric or non-finite #MEASURE values at line ${lineNum}: "${cmdVal}".`,
                line: lineNum,
              });
            } else if (den <= 0) {
              errors.push({
                type: 'error',
                code: 'MEASURE_ZERO_DENOMINATOR',
                message: `Invalid #MEASURE denominator <= 0 at line ${lineNum}: "${cmdVal}".`,
                line: lineNum,
              });
            } else if (num <= 0) {
              errors.push({
                type: 'error',
                code: 'MEASURE_ZERO_NUMERATOR',
                message: `Invalid #MEASURE numerator <= 0 at line ${lineNum}: "${cmdVal}".`,
                line: lineNum,
              });
            } else if ((num / den) * 4 > 32) {
              warnings.push({
                type: 'warning',
                code: 'ABNORMAL_MEASURE_LENGTH',
                message: `Extremely long measure ratio (${cmdVal}, ${(num / den) * 4} beats) at line ${lineNum}.`,
                line: lineNum,
              });
            }
          }
          break;
        }
        case '#DELAY': {
          const val = parseFloat(cmdVal);
          if (isNaN(val) || !isFinite(val)) {
            warnings.push({
              type: 'warning',
              code: 'INVALID_DELAY',
              message: `Invalid #DELAY value "${cmdVal}" at line ${lineNum}.`,
              line: lineNum,
            });
          }
          break;
        }
        case '#SCROLL': {
          const val = parseFloat(cmdVal);
          if (isNaN(val) || !isFinite(val)) {
            warnings.push({
              type: 'warning',
              code: 'INVALID_SCROLL',
              message: `Invalid #SCROLL value "${cmdVal}" at line ${lineNum}.`,
              line: lineNum,
            });
          }
          break;
        }
        case '#GOGOSTART':
        case '#GOGOEND':
        case '#BARLINEON':
        case '#BARLINEOFF':
        case '#LYRIC':
        case '#BRANCHSTART':
        case '#BRANCHEND':
        case '#N':
        case '#E':
        case '#M':
        case '#LEVELHOLD':
        case '#NEXTSONG':
          break;
        default:
          warnings.push({
            type: 'warning',
            code: 'UNKNOWN_COMMAND',
            message: `Unrecognized command "${cmdName}" at line ${lineNum}. Will be preserved as raw event.`,
            line: lineNum,
          });
      }
    } else if (inSong) {
      // Notes validation
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === ',') {
          continue;
        } else if (['0', '1', '2', '3', '4'].includes(char)) {
          // normal notes
        } else if (char === '5' || char === '6' || char === '7') {
          if (activeRollType !== null) {
            warnings.push({
              type: 'warning',
              code: 'CONSECUTIVE_ROLL_START',
              message: `Roll type ${char} started at line ${lineNum} while previous roll (${activeRollType}) was not explicitly closed with '8'. Auto-closing previous roll.`,
              line: lineNum,
            });
          }
          activeRollType = char;
          activeRollLine = lineNum;
          if (char === '7') balloonCounts++;
        } else if (char === '8') {
          if (activeRollType === null) {
            warnings.push({
              type: 'warning',
              code: 'ORPHAN_ROLL_END',
              message: `Roll end '8' encountered without an active roll start at line ${lineNum}.`,
              line: lineNum,
            });
          }
          activeRollType = null;
        } else if (char >= '9' && char <= 'Z') {
          // Special/extended notes (e.g. ad-lib or bomb notes in some simulators)
          warnings.push({
            type: 'warning',
            code: 'EXTENDED_NOTE_CHAR',
            message: `Unusual note character '${char}' at line ${lineNum}.`,
            line: lineNum,
          });
        }
      }
    }
  }

  if (!hasStart) {
    errors.push({
      type: 'error',
      code: 'MISSING_START',
      message: `Missing #START directive. Chart notes cannot be parsed without #START.`,
    });
  }

  if (!hasEnd && hasStart) {
    warnings.push({
      type: 'warning',
      code: 'MISSING_END',
      message: `Missing #END directive. The chart may be truncated.`,
    });
  }

  if (activeRollType !== null) {
    errors.push({
      type: 'error',
      code: 'UNCLOSED_ROLL',
      message: `Unclosed roll/balloon (type ${activeRollType}) at the end of the chart (started at line ${activeRollLine}).`,
      line: activeRollLine,
    });
  }

  if (expectedBalloons.length > 0 && balloonCounts > 0 && expectedBalloons.length !== balloonCounts) {
    warnings.push({
      type: 'warning',
      code: 'BALLOON_COUNT_MISMATCH',
      message: `BALLOON header defines ${expectedBalloons.length} counts, but chart has ${balloonCounts} balloon notes (7).`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates a structured CourseModel
 */
export function validateCourseModel(course: CourseModel): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const m of course.measures) {
    if (m.duration <= 0 || !isFinite(m.duration)) {
      errors.push({
        type: 'error',
        code: 'INVALID_MEASURE_DURATION',
        message: `Measure ${m.index} has non-positive or non-finite duration (${m.duration}s).`,
        measureIndex: m.index,
      });
    }
    if (m.numerator <= 0 || m.denominator <= 0) {
      errors.push({
        type: 'error',
        code: 'INVALID_MEASURE_RATIO',
        message: `Measure ${m.index} has invalid time signature ${m.numerator}/${m.denominator}.`,
        measureIndex: m.index,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
