const columns = 38;
const cellWidth = 6;
const cellHeight = 9;
const width = columns * cellWidth;
const height = 16 * cellHeight;

const tracks = [
  [
    [0, 11],
    [7, 11],
    [14, 4],
    [23, 4],
    [29, 1],
    [37, 1],
  ],
  [
    [0, 6],
    [8, 6],
    [15, 12],
    [24, 12],
    [32, 6],
    [37, 6],
  ],
  [
    [0, 15],
    [11, 15],
    [18, 8],
    [26, 8],
    [32, 11],
    [37, 11],
  ],
].map((points, index) => {
  const cells = points.slice(1).flatMap(([end, to], segment) => {
    const [start, from] = points[segment];
    return Array.from({ length: end - start }, (_, offset) => ({
      column: start + offset,
      row: Math.round(from + ((to - from) * offset) / (end - start)),
      junction: offset === 0 && segment > 0,
    }));
  });
  return { cells, index };
});

export function mountLandingSignals(root) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const color = getComputedStyle(root).color;
  const surfaces = [...root.querySelectorAll('canvas')].map((canvas, side) => {
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (context) {
      context.scale(scale, scale);
      context.font = '10px ui-monospace, monospace';
      context.textBaseline = 'top';
      context.fillStyle = color;
    }
    return { context, side };
  });

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  let timer;
  let frame = 0;

  function paint() {
    for (const { context, side } of surfaces) {
      if (!context) continue;
      context.clearRect(0, 0, width, height);
      for (const { cells, index } of tracks) {
        const pulse = ((frame + index * 16 + side * 24) % 64) - 8;
        for (const { column, row, junction } of cells) {
          const distance = pulse - column;
          const active = !motion.matches && distance >= 0 && distance < 9;
          const glyph = junction ? '+' : active ? '=:.'[Math.floor(distance / 3)] : '.';
          const fade = 1 - column / columns;
          context.globalAlpha = (active ? 0.78 : junction ? 0.46 : 0.31) * fade;
          const x = (side ? columns - 1 - column : column) * cellWidth;
          context.fillText(glyph, x, row * cellHeight);
        }
      }
    }
  }

  function syncMotion() {
    clearInterval(timer);
    if (visible && !document.hidden && !motion.matches) {
      timer = setInterval(() => {
        frame += 1;
        paint();
      }, 90);
    }
  }

  function updateMotion() {
    paint();
    syncMotion();
  }

  paint();
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncMotion();
  });
  observer.observe(root);
  motion.addEventListener('change', updateMotion);
  document.addEventListener('visibilitychange', syncMotion);

  return () => {
    clearInterval(timer);
    observer.disconnect();
    motion.removeEventListener('change', updateMotion);
    document.removeEventListener('visibilitychange', syncMotion);
  };
}
