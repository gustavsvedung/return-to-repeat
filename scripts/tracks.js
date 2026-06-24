/**
 * Track Definitions
 * Declares all 11 tracks with their variations, triggers, stems, and controls
 *
 * Each track is an object with:
 * - id, title: Basic info
 * - variations: Array of version strings, or null
 * - selectVariation(signals): Function returning which variation to play
 * - getAudioFiles(variation): Returns { main, stems } for loading
 * - getControls(variation): Returns array of UI control definitions
 * - isLocked(signals): Returns true if track should be locked
 * - color: Background color for this track
 */

// --- Track 1: one ---
const track1 = {
  id: 1,
  title: "one",
  variations: null,

  selectVariation: () => null,

  getAudioFiles: () => ({
    main: "01.mp3",
    stems: {}
  }),

  getControls: () => [],

  isLocked: () => false,
  color: "#5d6b8e"
};

// --- Track 2: two ---
const track2 = {
  id: 2,
  title: "two",
  variations: null,

  selectVariation: () => null,

  getAudioFiles: () => ({
    main: "02.mp3",
    stems: {}
  }),

  getControls: () => [],

  isLocked: () => false,
  color: "#a98fc4"
};

// --- Track 3: three (Contextual + Interactive) ---
const track3 = {
  id: 3,
  title: "three",
  variations: ["A", "B"],

  selectVariation: (signals) => {
    // B plays at night (21:00 - 06:00)
    return signals.isNight ? "B" : "A";
  },

  getAudioFiles: (variation) => ({
    main: `03${variation}.mp3`,
    stems: {
      voc1: { file: `03${variation}voc1.mp3`, defaultOn: true },
      voc2: { file: `03${variation}voc2.mp3`, defaultOn: false },
      voc3: { file: `03${variation}voc3.mp3`, defaultOn: false },
      voc4: { file: `03${variation}voc4.mp3`, defaultOn: false }
    }
  }),

  getControls: () => [
    { type: "toggle", stem: "voc1", image: "img/bird.png", defaultOn: true  },
    { type: "toggle", stem: "voc2", image: "img/bird.png", defaultOn: false },
    { type: "toggle", stem: "voc3", image: "img/bird.png", defaultOn: false },
    { type: "toggle", stem: "voc4", image: "img/bird.png", defaultOn: false }
  ],

  // Random lyric line per page load, drawn from the set matching the variation
  getTagline: (signals) => {
    const linesA = [
      "Symphony in every tree",
      "Hear them sing for you and me",
      "Early dawn until night time fall",
      "Singing in the music hall",
      "Daylight dream childhood days",
      "Lost in a familiar maze",
      "Far away a horn is blown",
      "Time to head back home",
    ];
    const linesB = [
      "Flicker dreams on silver screens",
      "Broken hearts and tangled scenes",
      "Echoes in the silent night",
      "Lost between what’s wrong and right",
      "Velvet rooms velvet skies",
      "Moonlight dances in your eyes",
      "Hold my hand and spin me around",
      "All is lost and found",
    ];
    const lines = signals.isNight ? linesB : linesA;
    return lines[Math.floor(Math.random() * lines.length)];
  },

  isLocked: () => false,
  color: "#c4a55a"
};

// --- Track 4: four (Contextual + Random + Interactive) ---
const track4 = {
  id: 4,
  title: "four",
  variations: ["A1", "A2", "A3", "B"],

  selectVariation: (signals) => {
    // B on Sundays only
    if (signals.dayOfWeek === 0) return "B";

    // Random A1-A3 on other days
    const roll = Math.random();
    if (roll < 0.33) return "A1";
    if (roll < 0.66) return "A2";
    return "A3";
  },

  getAudioFiles: (variation) => {
    if (variation === "B") {
      return { main: "04B.mp3", stems: {} };
    }
    // A1, A2, A3: main track + random drum stem
    const drumNumber = variation.charAt(1);  // "1", "2", or "3"
    return {
      main: "04A.mp3",
      stems: {
        drums: { file: `04Adrums${drumNumber}.mp3`, defaultOn: false }
      }
    };
  },

  getControls: (variation) => {
    // No controls on Sunday (B version)
    if (variation === "B") return [];
    // Toggle: initially muted (drums off), button unmutes
    return [
      { type: "toggle", stem: "drums", image: "img/horse.png", defaultOn: false }
    ];
  },

  getTagline: () => "I evig sommar lever du min syster",

  isLocked: () => false,
  color: "#ebe6dc"
};

// --- Track 5: five (Random + Interactive flutes) ---
const track5 = {
  id: 5,
  title: "five",
  variations: ["A", "B"],

  selectVariation: () => {
    // B has 17% chance
    return Math.random() < 0.17 ? "B" : "A";
  },

  getAudioFiles: (variation) => ({
    main: `05${variation}.mp3`,
    stems: {}
  }),

  // Flute samples — monophonic (one at a time), play through once (no loop)
  getSamples: () => ({
    files: {
      flute_g1: "05fluteg1.mp3",
      flute_a1: "05flutea1.mp3",
      flute_c2: "05flutec2.mp3",
      flute_d2: "05fluted2.mp3",
      flute_e2: "05flutee2.mp3"
    },
    options: { monophonic: true, loop: false }
  }),

  getControls: () => [
    { type: "button", behavior: "hold", sample: "flute_g1", image: "img/bird.png", color: "#E07820" },  // orange
    { type: "button", behavior: "hold", sample: "flute_a1", image: "img/bird.png", color: "#4CAF72" },  // green
    { type: "button", behavior: "hold", sample: "flute_c2", image: "img/bird.png", color: "#D94040" },  // red
    { type: "button", behavior: "hold", sample: "flute_d2", image: "img/bird.png", color: "#C9A520" },  // yellow
    { type: "button", behavior: "hold", sample: "flute_e2", image: "img/bird.png", color: "#3D8FBF" }   // cerulean
  ],

  isLocked: () => false,
  color: "#c87a5a"
};

// --- Track 6: six (Interactive whistling) ---
const track6 = {
  id: 6,
  title: "six",
  variations: null,

  selectVariation: () => null,

  getAudioFiles: () => ({
    main: "06synth.mp3",
    stems: {
      whistling: { file: "06whistling.mp3", defaultOn: true }
    }
  }),

  getControls: () => [
    { type: "toggle", stem: "whistling", image: "img/bird.png", defaultOn: true }
  ],

  isLocked: () => false,
  color: "#b89668"
};

// --- Track 7: seven (Full moon + Interactive drones) ---
const track7 = {
  id: 7,
  title: "seven",
  variations: ["A", "B"],

  selectVariation: (signals) => {
    // B plays on full moon (± 1 day)
    return signals.isFullMoon ? "B" : "A";
  },

  getAudioFiles: (variation) => {
    if (variation === "A") {
      return { main: "07A.mp3", stems: {} };
    }
    // B version has drone stems (fader-controlled, lazy-start)
    return {
      main: "07B.mp3",
      stems: {
        drone_c: { file: "07Bdronec.mp3", defaultOn: false, faderControl: true },
        drone_e: { file: "07Bdronee.mp3", defaultOn: false, faderControl: true },
        drone_g: { file: "07Bdroneg.mp3", defaultOn: false, faderControl: true }
      }
    };
  },

  getControls: (variation) => {
    // No controls on regular version
    if (variation === "A") return [];
    // Faders for drones on full moon version. Fill colours follow Scriabin's
    // sound-to-colour mapping for the played notes: C=red, E=sky blue, G=orange.
    return [
      { type: "fader", stem: "drone_c", min: 0, max: 1, color: "#d83a3a" }, // C — red
      { type: "fader", stem: "drone_e", min: 0, max: 1, color: "#6fb8d4" }, // E — sky blue
      { type: "fader", stem: "drone_g", min: 0, max: 1, color: "#e07820" }  // G — orange
    ];
  },

  getTagline: () => "Mamma och Ilse",

  isLocked: () => false,
  color: "#8a3a48"
};

// --- Track 8: eight (Random A/B/C) ---
const track8 = {
  id: 8,
  title: "eight",
  variations: ["A", "B", "C"],

  selectVariation: () => {
    // 33% chance each
    const roll = Math.random();
    if (roll < 0.33) return "A";
    if (roll < 0.66) return "B";
    return "C";
  },

  getAudioFiles: (variation) => ({
    main: `08${variation}.mp3`,
    stems: {}
  }),

  getControls: () => [],

  isLocked: () => false,
  color: "#8a9460"
};

// --- Track 9: nine (Contextual + Random + Interactive keyboard) ---
const track9 = {
  id: 9,
  title: "nine",
  variations: ["A1", "A2", "A3", "B1", "B2", "B3"],

  selectVariation: (signals) => {
    // Odd date = A, Even date = B
    const letter = (signals.dayOfMonth % 2 === 1) ? "A" : "B";
    // Random 1, 2, or 3
    const number = Math.floor(Math.random() * 3) + 1;
    return `${letter}${number}`;
  },

  getAudioFiles: (variation) => {
    const letter = variation.charAt(0);
    const number = variation.charAt(1);

    if (letter === "A") {
      return {
        main: `09A${number}.mp3`,
        stems: {
          keys1: { file: "09Akeys1.mp3", defaultOn: true },
          keys2: { file: "09Akeys2.mp3", defaultOn: false },
          keys3: { file: "09Akeys3.mp3", defaultOn: false }
        }
      };
    }
    // B versions have no interactive stems
    return {
      main: `09B${number}.mp3`,
      stems: {}
    };
  },

  getControls: (variation) => {
    if (variation.startsWith("B")) return [];
    return [
      { type: "stem-select", stem: "keys1", image: "img/cat.png", transform: null,           active: true },
      { type: "stem-select", stem: "keys2", image: "img/cat.png", transform: "scaleX(-1)" },
      { type: "stem-select", stem: "keys3", image: "img/cat.png", transform: "scaleY(-1)" }
    ];
  },

  isLocked: () => false,
  color: "#e08aa0"
};

// --- Track 10: ten (Play count alternating) ---
const track10 = {
  id: 10,
  title: "ten",
  variations: ["A", "B"],

  selectVariation: (signals) => {
    // Alternates every 10 plays
    // Plays 1-10 = A, 11-20 = B, 21-30 = A, etc.
    const playCount = signals.trackPlayCounts[10] || 0;
    const decade = Math.floor(playCount / 10);
    return (decade % 2 === 0) ? "A" : "B";
  },

  getAudioFiles: (variation) => ({
    main: `10${variation}.mp3`,
    stems: {}
  }),

  getControls: () => [],

  getTagline: () => {
    const lines = [
      "As I walk along the path",
      "Shining love glowing all around us",
      "In my early days I gazed upon Thee",
      "Night seems to darken all my views",
      "Am I lost inside my head?",
      "Perhaps I better sleep on it instead",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  },

  isLocked: () => false,
  color: "#6f8aab"
};

// --- Track 11: eleven (Locked until 5 album completions) ---
const track11 = {
  id: 11,
  title: "eleven",
  variations: null,

  selectVariation: () => null,

  getAudioFiles: () => ({
    main: "11.mp3",
    stems: {}
  }),

  getControls: () => [
    {
      type: "effect-hold",
      effect: "bitcrusher",
      image: "img/eel.png",
      rampTime: 6.0,    // seconds to reach full effect
      releaseTime: 2.0  // seconds to fade out after release
    }
  ],

  isLocked: (signals) => {
    // Locked unless we have the unlock OR 5+ album completions
    return !signals.track11Unlocked && signals.albumCompletions < 5;
  },
  getTagline: () => {
    const lines = [
      "In the day and in the night",
      "In the shadows in the light",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  },

  color: "#7867a8"
};

// --- Export all tracks ---

export const tracks = [
  track1,
  track2,
  track3,
  track4,
  track5,
  track6,
  track7,
  track8,
  track9,
  track10,
  track11
];

export function getTrack(id) {
  return tracks.find(t => t.id === id);
}

export function getTrackCount() {
  return tracks.length;
}
