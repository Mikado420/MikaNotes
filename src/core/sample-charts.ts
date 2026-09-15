/**
 * MikaNotes TJA Core - Sample Charts for Verification
 */

export interface PresetChart {
  id: string;
  name: string;
  category: string;
  description: string;
  tja: string;
}

export const PRESET_CHARTS: PresetChart[] = [
  {
    id: 'reference_demo',
    name: 'Reference UI Demo (example.tja)',
    category: 'Featured',
    description: 'Exact chart scene from MikaNotes Phase 2 UI design reference image',
    tja: `TITLE:example.tja
BPM:150
COURSE:Oni
LEVEL:8

#START
#MEASURE 4/4
0000000000000000,
3000000000000000,
#GOGOSTART
2020100020201000,
2020100000000000,
#GOGOEND
#MEASURE 3/4
#BPMCHANGE 180
201080201000,
#MEASURE 4/4
8020102010000000,
#BPMCHANGE 200
2010100000000000,
#END`,
  },
  {
    id: 'standard',
    name: 'Standard Taiko Chart',
    category: 'Basic',
    description: '4/4 time signature, steady 130 BPM, Don, Ka, Big Don, Big Ka patterns',
    tja: `TITLE:Mika Groove
SUBTITLE:--Taiko Core Demo
BPM:130
WAVE:groove.ogg
OFFSET:-0.200
DEMOSTART:15.000
COURSE:Oni
LEVEL:8

#START
1000100010001000,
2000200020002000,
1020102010201020,
3000400030401000,
#END`,
  },
  {
    id: 'timing_variations',
    name: 'BPM & Measure Changes',
    category: 'Timing',
    description: 'Dynamic BPM shifts (120 -> 160 -> 200) and measure ratios (3/4, 5/4, 7/8)',
    tja: `TITLE:Polyrhythm Rush
BPM:120
COURSE:Oni
LEVEL:9

#START
#MEASURE 4/4
1000100010001000,
#MEASURE 3/4
#BPMCHANGE 160
100020001000,
#MEASURE 5/4
10002000100020001000,
#MEASURE 7/8
#BPMCHANGE 200
10201020102010,
#END`,
  },
  {
    id: 'rolls_balloons',
    name: 'Rolls & Balloons',
    category: 'Rolls',
    description: 'Sequential rolls (5..8, 6..8) and balloon notes (7..8) with BALLOON: 5,12',
    tja: `TITLE:Drumroll Symphony
BPM:140
BALLOON:5,12
COURSE:Oni
LEVEL:9

#START
1000200010002000,
5000000080000000,
6000000080000000,
7000000080000000,
7000000080000000,
1000100010001000,
#END`,
  },
  {
    id: 'concurrent_preserve',
    name: 'Preserved Tags & Commands',
    category: 'Preservation',
    description: '#SCROLL, #DELAY, #LYRIC, #GOGO, custom headers (MAKER, GENRE, CUSTOM_FLAG)',
    tja: `TITLE:Preservation Legend
SUBTITLE:--Archive Edition
BPM:150
OFFSET:-0.350
MAKER:MikaCreator
GENRE:Game Music
CUSTOM_FLAG:MikaNotes_Core_v1
HEADSCROLL:1.20
COURSE:Oni
LEVEL:10

#START
#SCROLL 1.5
#LYRIC Get ready for the drop!
1000100010001000,
#DELAY 0.5
#GOGOSTART
#SCROLL 2.0
#BARLINEOFF
1020102010201020,
#BARLINEON
#GOGOEND
#SCROLL 1.0
2000200020002000,
#END`,
  },
  {
    id: 'arbitrary_grids',
    name: 'Arbitrary Division Grids',
    category: 'Grids',
    description: '20, 24, and 48 notes per measure with precise rational positioning',
    tja: `TITLE:Micro-step Study
BPM:128
COURSE:Oni
LEVEL:10

#START
10101010101010101010,
100100100100100100100100,
101010101010101010101010101010101010101010101010,
#END`,
  },
  {
    id: 'heavy_stress',
    name: 'Heavy Chart Stress Test',
    category: 'Safety',
    description: 'Large measure stream with safety scanner pre-flight',
    tja: `TITLE:Stress Test Marathon
BPM:180
COURSE:Oni
LEVEL:10

#START
` + Array(300).fill('10201020,').join('\n') + `
#END`,
  },
  {
    id: 'abnormal_safety',
    name: 'Abnormal Chart Handling',
    category: 'Safety',
    description: '0-measure denominator, unclosed roll, unknown commands, extreme measure beats',
    tja: `TITLE:Abnormal Test
BPM:120
#START
#UNKNOWN_DIRECTIVE foo_bar
#MEASURE 0/4
1000,
#MEASURE 99999999/1
2000,
#BPMCHANGE 0
1020,
5000000000000000,
#END`,
  },
];
