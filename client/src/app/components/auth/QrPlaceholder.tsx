import { useMemo } from "react";

/**
 * Pure-SVG QR-code-shaped placeholder. Looks like a real QR for visual fidelity
 * but encodes nothing — used while we don't have a real WeChat scan-login backend.
 */
export function QrPlaceholder({ size = 220, seed = 1 }: { size?: number; seed?: number }) {
  const grid = 25; // 25x25 modules
  const cells = useMemo(() => {
    // Deterministic pseudo-random pattern based on seed
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const out: boolean[][] = [];
    for (let y = 0; y < grid; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < grid; x++) {
        // Reserve corners for finder patterns
        const inFinder =
          (x < 7 && y < 7) ||
          (x >= grid - 7 && y < 7) ||
          (x < 7 && y >= grid - 7);
        if (inFinder) row.push(false);
        else row.push(rand() > 0.55);
      }
      out.push(row);
    }
    return out;
  }, [seed]);

  const cell = size / grid;

  const finderPattern = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <rect x={cx * cell} y={cy * cell} width={7 * cell} height={7 * cell} fill="#000" />
      <rect
        x={(cx + 1) * cell}
        y={(cy + 1) * cell}
        width={5 * cell}
        height={5 * cell}
        fill="#fff"
      />
      <rect
        x={(cx + 2) * cell}
        y={(cy + 2) * cell}
        width={3 * cell}
        height={3 * cell}
        fill="#000"
      />
    </g>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      aria-hidden="true"
    >
      <rect width={size} height={size} fill="#fff" />
      {cells.flatMap((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell}
              height={cell}
              fill="#111"
            />
          ) : null
        )
      )}
      {finderPattern(0, 0)}
      {finderPattern(grid - 7, 0)}
      {finderPattern(0, grid - 7)}
      {/* Center brand badge */}
      <rect
        x={size / 2 - cell * 3}
        y={size / 2 - cell * 3}
        width={cell * 6}
        height={cell * 6}
        rx={cell}
        fill="#fff"
      />
      <rect
        x={size / 2 - cell * 2.5}
        y={size / 2 - cell * 2.5}
        width={cell * 5}
        height={cell * 5}
        rx={cell * 0.8}
        fill="#7c3aed"
      />
      <text
        x={size / 2}
        y={size / 2 + cell * 1.4}
        textAnchor="middle"
        fontSize={cell * 3}
        fontWeight={700}
        fill="#fff"
        fontFamily="ui-sans-serif, system-ui"
      >
        AI
      </text>
    </svg>
  );
}
