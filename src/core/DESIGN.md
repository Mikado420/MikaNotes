# MikaNotes Phase 1 — TJA Core Architecture & Design

## 1. 概要 (Overview)
MikaNotesはスマートフォン特化型TJAエディタを目指すプロジェクトです。
本フェーズ（Phase 1）では、UI層から完全に疎結合化された「TJA Core（譜面データ基盤）」を構築しました。
従来のTEIKAの課題を徹底的に分析し、堅牢性・高速性・完全なデータ保全性（Preservation）・Phase 2（Malody風タイムラインエディタ / テキストエディタ）へのシームレスなAPI提供を実現しています。

---

## 2. どのようにTEIKAの課題を解決したか (Solving TEIKA's Limitations)

| 領域 | TEIKAの課題 | MikaNotes TJA Core での解決策 |
| :--- | :--- | :--- |
| **責務の分離** | `tja-parser.js` 内で構文解析、タイムライン計算、DOM生成（canvas/UI用オブジェクト）、グローバルstate更新が混然一体となっていた。 | **UIと完全分離された純粋データ層**として再設計。DOM非依存・ステートレスで、Node.js/WebWorker/ブラウザどこでも同一動作。 |
| **データ構造** | 1つの小節が巨大なフラット配列となり、ノーツの正確な拍位置や小節内分数位置（Rational Position）が欠落していた。 | `ChartModel` > `CourseModel` > `MeasureModel` > `NoteModel` / `RollModel` / `BalloonModel` / `CommandModel` の階層構造。有理数位置 `{ numerator, denominator, fraction }` を保持。 |
| **可逆変換 (Round Trip)** | パーサーからモデル化する過程で、`#SCROLL`、`#DELAY`、`#LYRIC`、コース独自ヘッダー、未知の拡張コマンドが破棄されていた。 | **Preservation First原則**。全未知ヘッダーは `rawHeaders`、全未知/表示用コマンドは `isSemantic: false` のイベントとして完全保持され、Writerで100%出力復元。 |
| **連打・風船のペアリング** | `5..8`、`6..8`、`7..8` の開始/終了管理がフラットな文字走査で行われ、未終了や連続開始時に状態が不正になりやすかった。 | `RollModel` / `BalloonModel` を構造化オブジェクトとして独立抽出し、BALLOONヘッダーとの連番結合、未終了時の自動終端処理を実装。 |
| **フリーズ・巨大譜面対策** | `#MEASURE 99999999/1` や極端な高BPM、数万行の異常譜面でブラウザがハングするリスクがあった。 | **50ms上限の軽量スキャナ (`scanTJAInfo`)** による先行判定と、Parser内の **Timeout Protection** による多層防護。極端値の安全クランプ。 |
| **Phase 2 検索API** | 「時刻 $t$ 秒にあるノーツ」「時刻 $t$ でのBPM」「小節 $k$ の開始時刻」を引くために全配列を都度走査する必要があった。 | 二分探索対応の `Timeline` クラスを提供。`getNotesInRange()`, `getMeasureAtTime()`, `getEventsAtTime()`, `getGogoStateAtTime()`, `timeToBeat()`, `beatToTime()` を $O(\log N)$ で提供。 |

---

## 3. 内部データ構造 (Data Structures)

### 3.1 ChartModel
```typescript
interface ChartModel {
  headers: TJAHeaderData;                  // TITLE, SUBTITLE, BPM, WAVE, OFFSET, rawHeaders
  courses: Record<number, CourseModel>;    // 0: Easy, 1: Normal, 2: Hard, 3: Oni, 4: Edit
  activeCourseKey: number;
  activeCourse: CourseModel;
  scanInfo: ScanResult;                    // 軽量事前スキャン結果 (isHeavy, heavyReasons)
  validation: ValidationResult;            // エラー・警告リスト
}
```

### 3.2 CourseModel
```typescript
interface CourseModel {
  courseKey: number;
  courseName: string;
  headers: Record<string, any>;
  measures: MeasureModel[];                // 小節リスト
  notes: NoteModel[];                      // 通常打鍵ノーツ (1:ドン, 2:カツ, 3:大ドン, 4:大カツ)
  rolls: RollModel[];                      // 連打 (5:連打, 6:大連打)
  balloons: BalloonModel[];                // 風船 (7:風船) + 打数情報
  events: CommandModel[];                  // 全コマンドイベント (BPM, MEASURE, DELAY, GOGO, SCROLL, LYRIC等)
  gogoRanges: GogoRange[];                 // ゴーゴータイムの区間リスト [startTime, endTime]
  barlineTimes: number[];                  // 小節線の時刻リスト
  duration: number;                        // コース全体の演奏時間 (秒)
  maxCombo: number;                        // 総コンボ数
}
```

### 3.3 MeasureModel & NoteModel
```typescript
interface MeasureModel {
  index: number;
  startTime: number;                       // 小節開始時刻 (秒, #START基準)
  endTime: number;                         // 小節終了時刻 (秒)
  audioStartTime: number;                  // 音源時刻 (startTime - offset)
  audioEndTime: number;
  startBeat: number;                       // 開始拍 (4分音符基準)
  endBeat: number;
  numerator: number;                       // 拍子分子 (例: 4)
  denominator: number;                     // 拍子分母 (例: 4)
  ratio: number;
  duration: number;
  barlineVisible: boolean;                 // #BARLINEON / #BARLINEOFF
  notes: NoteModel[];
  events: CommandModel[];
  division: number;                        // 分割数 (例: 16, 24, 48)
}

interface NoteModel {
  id: string;
  type: '1' | '2' | '3' | '4';
  kind: 'don' | 'ka' | 'big_don' | 'big_ka';
  time: number;                            // 打鍵時刻 (秒)
  audioTime: number;
  beat: number;                            // 拍位置
  measureIndex: number;
  positionInMeasure: {
    numerator: number;
    denominator: number;
    fraction: number;                      // 0.0 〜 1.0
  };
  bpm: number;
  scroll: number;
}
```

---

## 4. モジュール構成 (Core Modules)

1. **`parser.ts`**:
   - TJAテキストを行解析し、ヘッダーとコースブロックに分離。
   - 小節先頭コマンド（`#MEASURE`、`#BPMCHANGE`等）を直ちに適用し、各ノーツの正確な秒数と拍位置を算出。
   - 連打・風船の自動ペアリング、未終端ロールの保護。
   - タイムアウト保護（デフォルト2500ms）で無限ループを完全防止。

2. **`writer.ts`**:
   - `ChartModel` から意味的に同一なTJAテキストを再生成。
   - 各小節のノーツと連打の有理数位置から **最小公倍数 (LCM)** を算出し、最適な分割文字列表現（`10002000,` 等）を構築。
   - 未知ヘッダー、`#SCROLL`、`#LYRIC`、表示制御を正確に保持。

3. **`scanner.ts`**:
   - フルパース前に 50ms 以内で文字数、小節数、ノーツ数、拍数異常、推定演奏時間を高速走査。
   - 巨大譜面やフリーズの可能性がある譜面を `isHeavy: true` として事前判定。

4. **`validator.ts`**:
   - 構文エラー（ERROR: 進行不能）と警告（WARNING: 保持可能だが注意）を明確に分離。
   - 不正なBPM、0除算MEASURE、未閉じロール、BALLOON打数不整合、未知コマンドを検知。

5. **`timeline.ts`**:
   - Phase 2 の Malody 風タイムラインエディタに向けた高機能クエリAPI。
   - 二分探索を用いた高速範囲検索（`getNotesInRange`, `getMeasureAtTime`）。
   - 秒 $\leftrightarrow$ 拍（Beat）の双方向相互変換。

6. **`math.ts`**:
   - 最大公約数 (`gcd`)、最小公倍数 (`lcm`)、分数簡約 (`simplifyFraction`)、微小誤差考慮の等値判定 (`approxEqual`)。

---

## 5. Phase 2 (Malody風Editor / UI) への接続設計

Phase 2 では以下のように TJA Core を直接活用します：

```typescript
import { createChartWithTimeline } from './core';

// 1. 譜面の読み込み
const { chart, timeline } = createChartWithTimeline(tjaText);

// 2. Malody風タイムラインの描画 (可視範囲のノーツのみ高速取得)
const visibleNotes = timeline.getNotesInRange(currentTime - 1.0, currentTime + 3.0);
const currentMeasure = timeline.getMeasureAtTime(currentTime);
const currentBpm = timeline.getBpmAtTime(currentTime);
const isGogo = timeline.getGogoStateAtTime(currentTime);

// 3. 編集操作 (ノーツの追加・移動・削除)
// 小節の拍位置から正確な時間を算出し、ChartModel を更新
const newTime = timeline.beatToTime(targetBeat);

// 4. 保存・エクスポート
import { writeTJA } from './core';
const savedTja = writeTJA(chart);
```

このように、UI層は複雑なTJA構文の解釈や時間の微小誤差計算から完全に解放され、タッチ操作やMalody風のトラック描画に専念できます。
