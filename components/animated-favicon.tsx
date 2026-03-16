'use client';

import { useEffect } from 'react';

const SIZE = 128;
const BG_COLOR = '#18181b';
const FONT = `bold ${Math.round(SIZE * 0.55)}px system-ui, -apple-system, sans-serif`;
const RADIUS = Math.round(SIZE * 0.2);

// Glitch colors — neon/cyber palette
const GLITCH_COLORS = [
  '#ff0040', // hot pink
  '#00ffff', // cyan
  '#ff00ff', // magenta
  '#00ff41', // matrix green
  '#ffff00', // yellow
  '#8400ff', // purple
  '#ff6600', // orange
];

// Timing
const HOLD_NORMAL_MS = 2500;
const GLITCH_BURST_MS = 800;
const GLITCH_FRAME_MS = 60;
const PAUSE_AFTER_MS = 1000;

type Phase = 'hold' | 'glitch' | 'pause';

function drawFrame(
  ctx: CanvasRenderingContext2D,
  color: string,
  offsetX: number,
  offsetY: number,
  scanlineY?: number,
) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, SIZE, SIZE, RADIUS);
  ctx.fillStyle = BG_COLOR;
  ctx.fill();
  ctx.clip();

  // Text with optional offset (glitch displacement)
  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText('MC', SIZE / 2 + offsetX, SIZE / 2 + 2 + offsetY);

  // Optional RGB split — draw offset colored copies
  if (offsetX !== 0 || offsetY !== 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#00ffff';
    ctx.fillText('MC', SIZE / 2 + offsetX - 3, SIZE / 2 + 2 + offsetY);
    ctx.fillStyle = '#ff0040';
    ctx.fillText('MC', SIZE / 2 + offsetX + 3, SIZE / 2 + 2 + offsetY + 1);
    ctx.globalAlpha = 1;
  }

  // Scanline glitch — black bar across a random Y
  if (scanlineY !== undefined) {
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, scanlineY, SIZE, 3 + Math.random() * 6);
  }

  ctx.restore();
}

export function AnimatedFavicon() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create our own link element for the animated favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);

    // Remove any competing icon links that Next.js may have added
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((el) => {
      if (el !== link) el.remove();
    });

    function updateFavicon() {
      link.href = canvas.toDataURL('image/png');
    }

    let phase: Phase = 'hold';
    let phaseStart = Date.now();
    let glitchInterval: ReturnType<typeof setInterval> | null = null;

    function startHold() {
      phase = 'hold';
      phaseStart = Date.now();
      drawFrame(ctx!, '#ffffff', 0, 0);
      updateFavicon();
    }

    function startGlitch() {
      phase = 'glitch';
      phaseStart = Date.now();
      glitchInterval = setInterval(() => {
        const color = GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];
        const offsetX = (Math.random() - 0.5) * 8;
        const offsetY = (Math.random() - 0.5) * 4;
        const scanlineY = Math.random() < 0.6 ? Math.random() * SIZE : undefined;
        drawFrame(ctx!, color, offsetX, offsetY, scanlineY);
        updateFavicon();
      }, GLITCH_FRAME_MS);
    }

    function startPause() {
      phase = 'pause';
      phaseStart = Date.now();
      if (glitchInterval) {
        clearInterval(glitchInterval);
        glitchInterval = null;
      }
      drawFrame(ctx!, '#ffffff', 0, 0);
      updateFavicon();
    }

    startHold();

    const tick = setInterval(() => {
      const elapsed = Date.now() - phaseStart;
      if (phase === 'hold' && elapsed >= HOLD_NORMAL_MS) {
        startGlitch();
      } else if (phase === 'glitch' && elapsed >= GLITCH_BURST_MS) {
        startPause();
      } else if (phase === 'pause' && elapsed >= PAUSE_AFTER_MS) {
        startHold();
      }
    }, 50);

    return () => {
      clearInterval(tick);
      if (glitchInterval) clearInterval(glitchInterval);
      link.remove();
    };
  }, []);

  return null;
}
