'use client';

import { useEffect, useRef, useState } from 'react';

// ============================================
// TYPES & INTERFACES
// ============================================

interface Point {
  x: number;
  y: number;
}

interface TrailPoint extends Point {
  age: number;
  pressure: number;
  velocity: number;
}

// Cloud bubble for chain patterns
interface CloudBubble {
  x: number;
  y: number;
  radius: number;
  age: number;
}

// Blue dot pattern element
interface DotPattern {
  x: number;
  y: number;
  dots: Point[];
  age: number;
  color: string;
}

// Flowing organic outline
interface OrganicLine {
  points: Point[];
  age: number;
  color: string;
}

// Aura glow effect
interface AuraGlow {
  x: number;
  y: number;
  radius: number;
  age: number;
}

interface BeatPattern {
  playing: boolean;
  step: number;
  lastTime: number;
  type: 'hat' | 'snare' | 'kick';
}

// ============================================
// CONSTANTS
// ============================================

const NOTE_FREQUENCIES: { [key: string]: number } = {
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
  'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
};

const CHORD_INTERVALS = {
  major: [0, 4, 7, 12],
  minor: [0, 3, 7, 12],
  seventh: [0, 4, 7, 10],
};

const ROOT_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const BEAT_PATTERNS = {
  hat:   [1, 0, 1, 0, 1, 0, 1, 0],
  snare: [0, 0, 1, 0, 0, 0, 1, 0],
  kick:  [1, 0, 0, 1, 1, 0, 0, 0],
};

// Ethereal color palette - soft blues, coral, teal
const ETHEREAL_COLORS = {
  softBlue: 'rgba(140, 180, 220, ',      // soft sky blue
  deepBlue: 'rgba(80, 120, 180, ',       // deeper blue for dots
  coral: 'rgba(220, 140, 140, ',         // coral pink
  teal: 'rgba(140, 200, 190, ',          // light teal
  white: 'rgba(255, 255, 255, ',         // pure white
  paleBlue: 'rgba(200, 220, 240, ',      // very pale blue
};

// Glow colors for aura effects
const GLOW_COLORS = {
  center: 'rgba(180, 210, 240, ',        // soft blue center
  mid: 'rgba(140, 180, 220, ',           // mid blue
  outer: 'rgba(220, 235, 250, ',         // pale outer glow
};

// Line colors for organic outlines
const LINE_COLORS = {
  blue: 'rgba(100, 140, 200, ',          // soft blue outline
  coral: 'rgba(200, 130, 130, ',         // coral outline
  teal: 'rgba(120, 180, 170, ',          // teal outline
  gray: 'rgba(160, 170, 180, ',          // soft gray
};

// ============================================
// COMPONENT
// ============================================

export default function AirInstrument() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const animationRef = useRef<number>(0);
  const lastUIUpdateRef = useRef<number>(0);

  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayParams, setDisplayParams] = useState({
    root: 'C',
    chordType: 'major',
    filter: 2000,
    beat: 'none',
  });

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainsRef = useRef<GainNode[]>([]);
  const masterFilterRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const arpIndexRef = useRef(0);
  const lastArpTimeRef = useRef(0);
  const arpSpeedRef = useRef(200);

  const beatPatternRef = useRef<BeatPattern>({
    playing: false,
    step: 0,
    lastTime: 0,
    type: 'kick',
  });
  const beatIntervalRef = useRef(150);

  // Hand tracking refs
  const rightHandRef = useRef<{ index: Point | null; thumb: Point | null; pinch: number }>({
    index: null, thumb: null, pinch: 0.5
  });
  const leftHandRef = useRef<{ index: Point | null; lastZone: string | null }>({
    index: null, lastZone: null
  });
  const prevRightIndexRef = useRef<Point | null>(null);
  const isPlayingRef = useRef(false);

  const currentChordRef = useRef({ root: 'C', type: 'major', octave: 4 });
  const smoothFilterRef = useRef(2000);

  // Visual refs - ethereal cloud aesthetic
  const MAX_AGE = 1000;
  const trailPointsRef = useRef<TrailPoint[]>([]);
  const cloudBubblesRef = useRef<CloudBubble[]>([]);
  const dotPatternsRef = useRef<DotPattern[]>([]);
  const organicLinesRef = useRef<OrganicLine[]>([]);
  const auraGlowsRef = useRef<AuraGlow[]>([]);
  const flickerRef = useRef({ active: false, intensity: 0 });

  const sizeRef = useRef({ w: 0, h: 0 });

  // ============================================
  // INITIALIZATION
  // ============================================

  const startExperience = async () => {
    setIsLoading(true);
    try {
      await initAudio();
      await initMediaPipe();
      setIsStarted(true);
      animate();
    } catch (error) {
      console.error('Failed to start:', error);
      alert('Failed to start: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const initAudio = async () => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioCtxRef.current = ctx;

    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 4000;
    masterFilter.Q.value = 2;
    masterFilterRef.current = masterFilter;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGainRef.current = masterGain;

    masterFilter.connect(masterGain);
    masterGain.connect(ctx.destination);

    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sawtooth' : i === 1 ? 'triangle' : i === 2 ? 'square' : 'sine';
      osc.frequency.value = 220;
      osc.detune.value = (Math.random() - 0.5) * 10;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(masterFilter);
      osc.start();

      oscillatorsRef.current.push(osc);
      gainsRef.current.push(gain);
    }

    await createAmbientNoise(ctx);
  };

  const createAmbientNoise = async (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.006;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 2000;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.1;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start();

    noiseSourceRef.current = noiseSource;
  };

  const initMediaPipe = async () => {
    if (!videoRef.current) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
    });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();

    const { Hands } = await import('@mediapipe/hands');
    const { Camera } = await import('@mediapipe/camera_utils');

    const hands = new Hands({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onHandResults);

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current });
        }
      },
      width: 1280,
      height: 720,
    });

    await camera.start();
  };

  // ============================================
  // HAND TRACKING
  // ============================================

  const onHandResults = (results: any) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;

    let rightHand = null;
    let leftHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const lm = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i].label;

        if (handedness === 'Right') {
          leftHand = lm;
        } else {
          rightHand = lm;
        }
      }
    }

    processRightHand(rightHand, w, h);
    processLeftHand(leftHand, w, h);
  };

  const processRightHand = (landmarks: any, w: number, h: number) => {
    if (landmarks) {
      const idx = landmarks[8];
      const thm = landmarks[4];

      const newIndex = { x: (1 - idx.x) * w, y: idx.y * h };
      const prev = prevRightIndexRef.current;

      let velocity = 0;
      if (prev) {
        const dx = newIndex.x - prev.x;
        const dy = newIndex.y - prev.y;
        velocity = Math.sqrt(dx * dx + dy * dy);
      }

      rightHandRef.current.index = newIndex;
      rightHandRef.current.thumb = { x: (1 - thm.x) * w, y: thm.y * h };
      prevRightIndexRef.current = { ...newIndex };

      const dx = idx.x - thm.x;
      const dy = idx.y - thm.y;
      const dz = (idx.z || 0) - (thm.z || 0);
      let pinch = Math.sqrt(dx * dx + dy * dy + dz * dz);
      pinch = Math.max(0.02, Math.min(0.25, pinch));
      rightHandRef.current.pinch = (pinch - 0.02) / 0.23;

      const rootIndex = Math.floor((newIndex.x / w) * ROOT_NOTES.length);
      const root = ROOT_NOTES[Math.max(0, Math.min(ROOT_NOTES.length - 1, rootIndex))];

      const yNorm = newIndex.y / h;
      let chordType = 'major';
      if (yNorm > 0.66) chordType = 'seventh';
      else if (yNorm > 0.33) chordType = 'minor';

      currentChordRef.current = { root, type: chordType, octave: 4 };

      // Add trail point
      const pressure = Math.max(0.4, Math.min(1, 1.2 - velocity / 80));
      trailPointsRef.current.push({
        x: newIndex.x,
        y: newIndex.y,
        age: 0,
        pressure,
        velocity,
      });

      // Add aura glow at hand position
      if (Math.random() < 0.4) {
        auraGlowsRef.current.push({
          x: newIndex.x,
          y: newIndex.y,
          radius: 40 + Math.random() * 60 + velocity * 0.5,
          age: 0,
        });
      }

      // Add cloud bubbles - chain-like patterns
      if (Math.random() < 0.6) {
        const numBubbles = 3 + Math.floor(Math.random() * 5);
        let bx = newIndex.x;
        let by = newIndex.y;
        const angle = Math.random() * Math.PI * 2;

        for (let i = 0; i < numBubbles; i++) {
          const bubbleRadius = 4 + Math.random() * 12;
          cloudBubblesRef.current.push({
            x: bx,
            y: by,
            radius: bubbleRadius,
            age: 0,
          });
          // Chain to next bubble
          bx += Math.cos(angle + (Math.random() - 0.5) * 0.5) * (bubbleRadius * 1.5);
          by += Math.sin(angle + (Math.random() - 0.5) * 0.5) * (bubbleRadius * 1.5);
        }
      }

      // Add blue dot patterns on movement
      if (velocity > 5 && Math.random() < 0.35) {
        const patternDots: Point[] = [];
        const patternSize = 30 + Math.random() * 50;
        const numDots = 15 + Math.floor(Math.random() * 25);

        // Create decorative dot pattern (spiral or cluster)
        for (let i = 0; i < numDots; i++) {
          const t = i / numDots;
          const spiralR = t * patternSize;
          const spiralAngle = t * Math.PI * 4 + Math.random() * 0.5;
          patternDots.push({
            x: Math.cos(spiralAngle) * spiralR + (Math.random() - 0.5) * 8,
            y: Math.sin(spiralAngle) * spiralR + (Math.random() - 0.5) * 8,
          });
        }

        dotPatternsRef.current.push({
          x: newIndex.x + (Math.random() - 0.5) * 100,
          y: newIndex.y + (Math.random() - 0.5) * 100,
          dots: patternDots,
          age: 0,
          color: ETHEREAL_COLORS.deepBlue,
        });
      }

      // Add organic flowing lines
      if (velocity > 3 && prev && Math.random() < 0.4) {
        const linePoints: Point[] = [];
        const numPoints = 8 + Math.floor(Math.random() * 8);
        let lx = newIndex.x;
        let ly = newIndex.y;
        const baseAngle = Math.atan2(newIndex.y - prev.y, newIndex.x - prev.x);

        for (let i = 0; i < numPoints; i++) {
          linePoints.push({ x: lx, y: ly });
          const angle = baseAngle + (Math.random() - 0.5) * 1.2;
          const step = 15 + Math.random() * 25;
          lx += Math.cos(angle) * step;
          ly += Math.sin(angle) * step;
        }

        const colors = [LINE_COLORS.blue, LINE_COLORS.coral, LINE_COLORS.teal, LINE_COLORS.gray];
        organicLinesRef.current.push({
          points: linePoints,
          age: 0,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }

      // Add large cloud bubble clusters occasionally
      if (Math.random() < 0.08) {
        const cx = newIndex.x + (Math.random() - 0.5) * 150;
        const cy = newIndex.y + (Math.random() - 0.5) * 150;
        const clusterSize = 5 + Math.floor(Math.random() * 8);

        for (let i = 0; i < clusterSize; i++) {
          const angle = (i / clusterSize) * Math.PI * 2 + Math.random() * 0.5;
          const dist = 20 + Math.random() * 40;
          cloudBubblesRef.current.push({
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            radius: 6 + Math.random() * 15,
            age: 0,
          });
        }
      }

      isPlayingRef.current = true;
    } else {
      rightHandRef.current.index = null;
      rightHandRef.current.thumb = null;
      isPlayingRef.current = false;
    }
  };

  const processLeftHand = (landmarks: any, w: number, h: number) => {
    if (landmarks) {
      const idx = landmarks[8];
      const pos = { x: (1 - idx.x) * w, y: idx.y * h };
      leftHandRef.current.index = pos;

      const yNorm = pos.y / h;
      let zone: 'hat' | 'snare' | 'kick';
      if (yNorm < 0.33) zone = 'hat';
      else if (yNorm < 0.66) zone = 'snare';
      else zone = 'kick';

      if (zone !== leftHandRef.current.lastZone) {
        beatPatternRef.current = {
          playing: true,
          step: 0,
          lastTime: performance.now(),
          type: zone,
        };
      }
      leftHandRef.current.lastZone = zone;
    } else {
      leftHandRef.current.index = null;
      leftHandRef.current.lastZone = null;
      beatPatternRef.current.playing = false;
    }
  };

  // ============================================
  // AUDIO FUNCTIONS
  // ============================================

  const triggerDrum = (type: 'hat' | 'snare' | 'kick') => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'kick') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'snare') {
      const bufferSize = ctx.sampleRate * 0.12;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
    } else if (type === 'hat') {
      const bufferSize = ctx.sampleRate * 0.04;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.08));
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 6000;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
    }
  };

  const updateBeatPattern = (now: number) => {
    const beat = beatPatternRef.current;
    if (!beat.playing) return;

    if (now - beat.lastTime > beatIntervalRef.current) {
      beat.lastTime = now;
      beat.step = (beat.step + 1) % 8;

      const pattern = BEAT_PATTERNS[beat.type];
      if (pattern[beat.step] === 1) {
        triggerDrum(beat.type);
      }
    }
  };

  const getChordFrequencies = (root: string, type: string, octave: number): number[] => {
    const intervals = CHORD_INTERVALS[type as keyof typeof CHORD_INTERVALS] || CHORD_INTERVALS.major;
    const rootNote = `${root}${octave}`;
    const rootFreq = NOTE_FREQUENCIES[rootNote] || 261.63;
    return intervals.map(interval => rootFreq * Math.pow(2, interval / 12));
  };

  const updateAudio = () => {
    const ctx = audioCtxRef.current;
    const rh = rightHandRef.current;

    if (!ctx) return;

    const now = performance.now();
    const pinch = rh.pinch;

    arpSpeedRef.current = 100 + (1 - pinch) * 200;

    if (rh.index && isPlayingRef.current) {
      const { root, type, octave } = currentChordRef.current;
      const frequencies = getChordFrequencies(root, type, octave);

      if (now - lastArpTimeRef.current > arpSpeedRef.current) {
        lastArpTimeRef.current = now;
        arpIndexRef.current = (arpIndexRef.current + 1) % frequencies.length;
        flickerRef.current = { active: true, intensity: 1 };
      }

      const t = ctx.currentTime;

      oscillatorsRef.current.forEach((osc, i) => {
        const freq = frequencies[i % frequencies.length];
        osc.frequency.setTargetAtTime(freq, t, 0.05);
      });

      gainsRef.current.forEach((gain, i) => {
        const isCurrentNote = i === arpIndexRef.current;
        const targetGain = isCurrentNote ? 0.18 : 0.05;
        gain.gain.setTargetAtTime(targetGain, t, 0.02);
      });

      const targetFilter = 200 + pinch * 8000;
      smoothFilterRef.current += (targetFilter - smoothFilterRef.current) * 0.08;

      if (masterFilterRef.current) {
        masterFilterRef.current.frequency.setTargetAtTime(smoothFilterRef.current, t, 0.02);
        masterFilterRef.current.Q.setTargetAtTime(1 + (1 - pinch) * 4, t, 0.02);
      }

      if (masterGainRef.current) {
        masterGainRef.current.gain.setTargetAtTime(0.45, t, 0.02);
      }
    } else {
      if (masterGainRef.current) {
        masterGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    }

    updateBeatPattern(now);
  };

  // ============================================
  // ANIMATION & RENDERING
  // ============================================

  const animate = () => {
    const ctx = ctxRef.current;
    const video = videoRef.current;
    const { w, h } = sizeRef.current;

    if (!ctx || !w || !video) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    // Draw video background (mirrored) - no overlay, direct camera view
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -w, 0, w, h);
    ctx.restore();

    updateAudio();

    // Decay flicker
    if (flickerRef.current.active) {
      flickerRef.current.intensity *= 0.85;
      if (flickerRef.current.intensity < 0.05) {
        flickerRef.current.active = false;
      }
    }

    // Age all ethereal elements
    trailPointsRef.current = trailPointsRef.current
      .map(p => ({ ...p, age: p.age + 0.15 }))
      .filter(p => p.age < MAX_AGE);

    cloudBubblesRef.current = cloudBubblesRef.current
      .map(b => ({ ...b, age: b.age + 0.25 }))
      .filter(b => b.age < 800);

    dotPatternsRef.current = dotPatternsRef.current
      .map(d => ({ ...d, age: d.age + 0.3 }))
      .filter(d => d.age < 700);

    organicLinesRef.current = organicLinesRef.current
      .map(l => ({ ...l, age: l.age + 0.2 }))
      .filter(l => l.age < 600);

    auraGlowsRef.current = auraGlowsRef.current
      .map(a => ({ ...a, age: a.age + 0.4 }))
      .filter(a => a.age < 500);

    // Draw layers (back to front) - ethereal aesthetic
    drawAuraGlows(ctx);
    drawDotPatterns(ctx);
    drawOrganicLines(ctx);
    drawCloudBubbles(ctx);
    drawTrails(ctx);
    drawCursors(ctx);
    drawZoneLabels(ctx, w, h);

    // Update UI
    const now = performance.now();
    if (now - lastUIUpdateRef.current > 100) {
      lastUIUpdateRef.current = now;
      const { root, type } = currentChordRef.current;
      setDisplayParams({
        root,
        chordType: type,
        filter: Math.round(smoothFilterRef.current),
        beat: beatPatternRef.current.playing ? beatPatternRef.current.type : 'none',
      });
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  // Draw soft blue aura glows
  const drawAuraGlows = (ctx: CanvasRenderingContext2D) => {
    auraGlowsRef.current.forEach(aura => {
      const opacity = Math.max(0, 1 - aura.age / 500);
      const radius = Math.max(1, aura.radius);

      // Create soft radial gradient glow
      const gradient = ctx.createRadialGradient(
        aura.x, aura.y, 0,
        aura.x, aura.y, radius
      );
      gradient.addColorStop(0, `${GLOW_COLORS.center}${opacity * 0.4})`);
      gradient.addColorStop(0.4, `${GLOW_COLORS.mid}${opacity * 0.2})`);
      gradient.addColorStop(0.7, `${GLOW_COLORS.outer}${opacity * 0.1})`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(aura.x, aura.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    });
  };

  // Draw blue dot patterns (pointillist style)
  const drawDotPatterns = (ctx: CanvasRenderingContext2D) => {
    dotPatternsRef.current.forEach(pattern => {
      const opacity = Math.max(0, 0.9 * (1 - pattern.age / 700));

      pattern.dots.forEach(dot => {
        const dotSize = 2 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.arc(pattern.x + dot.x, pattern.y + dot.y, dotSize, 0, Math.PI * 2);
        ctx.fillStyle = `${pattern.color}${opacity * (0.6 + Math.random() * 0.3)})`;
        ctx.fill();
      });
    });
  };

  // Draw delicate organic flowing lines
  const drawOrganicLines = (ctx: CanvasRenderingContext2D) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    organicLinesRef.current.forEach(line => {
      if (line.points.length < 2) return;
      const opacity = Math.max(0, 0.8 * (1 - line.age / 600));

      // Draw smooth curve through points
      ctx.beginPath();
      ctx.moveTo(line.points[0].x, line.points[0].y);

      for (let i = 1; i < line.points.length - 1; i++) {
        const p = line.points[i];
        const next = line.points[i + 1];
        const cpx = (p.x + next.x) / 2;
        const cpy = (p.y + next.y) / 2;
        ctx.quadraticCurveTo(p.x, p.y, cpx, cpy);
      }

      // Line to last point
      const last = line.points[line.points.length - 1];
      ctx.lineTo(last.x, last.y);

      ctx.strokeStyle = `${line.color}${opacity})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  };

  // Draw cloud-like bubble chains
  const drawCloudBubbles = (ctx: CanvasRenderingContext2D) => {
    cloudBubblesRef.current.forEach(bubble => {
      const opacity = Math.max(0, 1 - bubble.age / 800);
      const radius = Math.max(1, bubble.radius);

      // White fill with soft blue outline
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `${ETHEREAL_COLORS.white}${opacity * 0.85})`;
      ctx.fill();

      // Soft blue outline
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `${ETHEREAL_COLORS.paleBlue}${opacity * 0.6})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner highlight
      if (radius > 5) {
        ctx.beginPath();
        ctx.arc(bubble.x - radius * 0.25, bubble.y - radius * 0.25, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `${ETHEREAL_COLORS.white}${opacity * 0.5})`;
        ctx.fill();
      }
    });
  };

  // Draw ethereal trails
  const drawTrails = (ctx: CanvasRenderingContext2D) => {
    const points = trailPointsRef.current;
    if (points.length < 2) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw soft ethereal strokes
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const dist = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      if (dist > 50) continue;

      const ageFactor = 1 - curr.age / MAX_AGE;
      const opacity = ageFactor * curr.pressure * 0.7;

      // Soft blue-gray line
      const lineWidth = Math.max(0.5, 1 + curr.pressure * 1.5 - curr.velocity * 0.01);

      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.strokeStyle = `${LINE_COLORS.gray}${opacity})`;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    // Draw smooth connecting curve
    if (points.length > 10) {
      const recentPoints = points.slice(-60);

      ctx.beginPath();
      ctx.moveTo(recentPoints[0].x, recentPoints[0].y);

      for (let i = 1; i < recentPoints.length - 1; i += 2) {
        const p = recentPoints[i];
        const next = recentPoints[Math.min(i + 1, recentPoints.length - 1)];
        const ageFactor = 1 - p.age / MAX_AGE;

        if (ageFactor > 0.3) {
          const cpx = (p.x + next.x) / 2;
          const cpy = (p.y + next.y) / 2;
          ctx.quadraticCurveTo(p.x, p.y, cpx, cpy);
        }
      }

      const avgAge = recentPoints.reduce((sum, p) => sum + p.age, 0) / recentPoints.length;
      const curveOpacity = Math.max(0, 0.3 * (1 - avgAge / MAX_AGE));
      ctx.strokeStyle = `${ETHEREAL_COLORS.softBlue}${curveOpacity})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Ethereal flicker effect
    if (flickerRef.current.active) {
      const recentPoints = points.slice(-10);
      recentPoints.forEach((p) => {
        const r = Math.max(2, 4);
        // Soft glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
        gradient.addColorStop(0, `${ETHEREAL_COLORS.white}${flickerRef.current.intensity * 0.6})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      });
    }
  };

  const drawCursors = (ctx: CanvasRenderingContext2D) => {
    const rh = rightHandRef.current;
    const lh = leftHandRef.current;

    if (rh.index) {
      const pulseSize = 30 + Math.sin(Date.now() * 0.003) * 5;

      // Soft blue aura glow around cursor
      const gradient = ctx.createRadialGradient(
        rh.index.x, rh.index.y, 0,
        rh.index.x, rh.index.y, pulseSize * 2
      );
      gradient.addColorStop(0, `${GLOW_COLORS.center}0.3)`);
      gradient.addColorStop(0.5, `${GLOW_COLORS.mid}0.15)`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.arc(rh.index.x, rh.index.y, pulseSize * 2, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Cloud-like bubble rings
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + Date.now() * 0.001;
        const bx = rh.index.x + Math.cos(angle) * pulseSize;
        const by = rh.index.y + Math.sin(angle) * pulseSize;
        const bubbleSize = 5 + Math.sin(Date.now() * 0.005 + i) * 2;

        // White bubble
        ctx.beginPath();
        ctx.arc(bx, by, bubbleSize, 0, Math.PI * 2);
        ctx.fillStyle = `${ETHEREAL_COLORS.white}0.8)`;
        ctx.fill();
        ctx.strokeStyle = `${ETHEREAL_COLORS.paleBlue}0.5)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Center white bubble
      ctx.beginPath();
      ctx.arc(rh.index.x, rh.index.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = `${ETHEREAL_COLORS.white}0.9)`;
      ctx.fill();
      ctx.strokeStyle = `${ETHEREAL_COLORS.softBlue}0.6)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ethereal pinch connection
      if (rh.thumb) {
        // Draw bubble chain between fingers
        const dist = Math.sqrt(Math.pow(rh.thumb.x - rh.index.x, 2) + Math.pow(rh.thumb.y - rh.index.y, 2));
        const numBubbles = Math.floor(dist / 15);
        for (let i = 1; i < numBubbles; i++) {
          const t = i / numBubbles;
          const bx = rh.index.x + (rh.thumb.x - rh.index.x) * t;
          const by = rh.index.y + (rh.thumb.y - rh.index.y) * t;
          const size = 3 + Math.sin(t * Math.PI) * 3;

          ctx.beginPath();
          ctx.arc(bx, by, size, 0, Math.PI * 2);
          ctx.fillStyle = `${ETHEREAL_COLORS.white}${0.6 - rh.pinch * 0.4})`;
          ctx.fill();
        }

        // Thumb bubble
        ctx.beginPath();
        ctx.arc(rh.thumb.x, rh.thumb.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `${ETHEREAL_COLORS.white}${0.5 + (1 - rh.pinch) * 0.4})`;
        ctx.fill();
      }

      // Chord label
      const { root, type } = currentChordRef.current;
      const suffix = type === 'minor' ? 'm' : type === 'seventh' ? '7' : '';
      ctx.fillStyle = `${ETHEREAL_COLORS.white}0.9)`;
      ctx.font = '12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${root}${suffix}`, rh.index.x, rh.index.y - pulseSize - 25);
    }

    if (lh.index) {
      const zone = lh.lastZone;
      const isPlaying = beatPatternRef.current.playing;

      // Soft outer glow
      const gradient = ctx.createRadialGradient(
        lh.index.x, lh.index.y, 0,
        lh.index.x, lh.index.y, 40
      );
      gradient.addColorStop(0, isPlaying ? `${ETHEREAL_COLORS.coral}0.3)` : `${GLOW_COLORS.center}0.2)`);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.arc(lh.index.x, lh.index.y, 40, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Cloud bubble ring
      ctx.beginPath();
      ctx.arc(lh.index.x, lh.index.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = `${ETHEREAL_COLORS.white}0.85)`;
      ctx.fill();
      ctx.strokeStyle = isPlaying ? `${ETHEREAL_COLORS.coral}0.6)` : `${ETHEREAL_COLORS.paleBlue}0.5)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isPlaying) {
        const step = beatPatternRef.current.step;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = 28;
          const x = lh.index.x + Math.cos(angle) * r;
          const y = lh.index.y + Math.sin(angle) * r;
          const dotSize = i === step ? 5 : 3;

          ctx.beginPath();
          ctx.arc(x, y, dotSize, 0, Math.PI * 2);
          ctx.fillStyle = i === step
            ? `${ETHEREAL_COLORS.coral}0.9)`
            : `${ETHEREAL_COLORS.white}0.7)`;
          ctx.fill();
        }
      }

      ctx.fillStyle = `${ETHEREAL_COLORS.deepBlue}0.8)`;
      ctx.font = '9px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone?.toUpperCase() || '', lh.index.x, lh.index.y + 3);
    }
  };

  const drawZoneLabels = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.font = '10px Georgia, serif';
    ctx.fillStyle = `${ETHEREAL_COLORS.white}0.6)`;

    ctx.textAlign = 'right';
    ctx.fillText('Major', w - 15, h * 0.17);
    ctx.fillText('Minor', w - 15, h * 0.5);
    ctx.fillText('7th', w - 15, h * 0.83);

    ctx.textAlign = 'left';
    ctx.fillText('Hi-Hat', 15, h * 0.17);
    ctx.fillText('Snare', 15, h * 0.5);
    ctx.fillText('Kick', 15, h * 0.83);

    // Ethereal decorative text
    ctx.fillStyle = `${ETHEREAL_COLORS.paleBlue}0.3)`;
    ctx.font = '9px serif';
    ctx.fillText('dream', w - 65, h * 0.1);
    ctx.fillText('cloud', w - 55, h * 0.32);
    ctx.fillText('float', 18, h * 0.62);
    ctx.fillText('glow', 22, h * 0.9);
  };

  // ============================================
  // LIFECYCLE
  // ============================================

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctxRef.current = ctx;
      }

      sizeRef.current = { w, h };
    };

    resize();
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationRef.current);
      oscillatorsRef.current.forEach(osc => osc.stop());
      noiseSourceRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Ethereal title */}
      <div className="absolute top-5 left-5 select-none pointer-events-none">
        <div className="border-l border-sky-200/40 pl-3">
          <div className="text-[11px] font-serif tracking-[0.35em] text-white/80">
            CloudSound
          </div>
          <div className="text-[8px] font-serif text-sky-200/60 mt-0.5">
            Ethereal Instrument
          </div>
        </div>
      </div>

      {/* Ethereal parameters */}
      <div className="absolute top-5 right-5 select-none pointer-events-none text-right">
        <div className="font-serif text-[9px] text-white/70 space-y-0.5">
          <div>{displayParams.root}{displayParams.chordType === 'minor' ? 'm' : displayParams.chordType === 'seventh' ? '7' : ''}</div>
          <div>{displayParams.filter} Hz</div>
          {displayParams.beat !== 'none' && (
            <div className="text-rose-300/80">{displayParams.beat}</div>
          )}
        </div>
      </div>

      {/* Ethereal cloud-like start button */}
      {!isStarted && (
        <button
          onClick={startExperience}
          disabled={isLoading}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     px-16 py-7 text-[10px] font-serif tracking-[0.4em]
                     text-sky-100/90 border border-sky-200/30 bg-sky-100/10 backdrop-blur-md
                     rounded-full shadow-[0_0_40px_rgba(140,180,220,0.3)]
                     hover:bg-sky-100/20 hover:border-sky-200/50 hover:shadow-[0_0_60px_rgba(140,180,220,0.5)]
                     transition-all duration-700 disabled:opacity-20"
        >
          {isLoading ? 'Loading...' : 'Begin'}
        </button>
      )}
    </div>
  );
}
