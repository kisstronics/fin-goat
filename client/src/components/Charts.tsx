import { formatInr } from '../lib/format';

const ALLOC_COLORS = [
  '#14b8a6',
  '#0ea5e9',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fb923c',
  '#67e8f9',
];

export function AllocationDonut({
  rows,
}: {
  rows: { type: string; label: string; value: number; pct: number }[];
}) {
  const size = 220;
  const stroke = 28;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  if (!rows.length) {
    return <p className="muted">No allocation data yet</p>;
  }

  return (
    <div className="chart-donut-wrap">
      <svg
        className="chart-donut"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Investment allocation"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        {rows.map((row, i) => {
          const len = (Math.max(row.pct, 0) / 100) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={row.type}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ALLOC_COLORS[i % ALLOC_COLORS.length]}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
        <text
          x="50%"
          y="48%"
          textAnchor="middle"
          className="chart-donut-center-label"
        >
          Allocation
        </text>
        <text
          x="50%"
          y="58%"
          textAnchor="middle"
          className="chart-donut-center-value"
        >
          {rows.length} classes
        </text>
      </svg>
      <ul className="chart-legend">
        {rows.map((row, i) => (
          <li key={row.type}>
            <span
              className="chart-swatch"
              style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }}
            />
            <span>{row.label}</span>
            <strong>{row.pct.toFixed(1)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectionLineChart({
  points,
}: {
  points: { label: string; value: number }[];
}) {
  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (points.length < 2) {
    return <p className="muted">Need more projection points</p>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad.left + (i / (points.length - 1)) * innerW;
    const y = pad.top + innerH - ((p.value - min) / span) * innerH;
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${pad.top + innerH} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (span * i) / ticks;
    const y = pad.top + innerH - ((v - min) / span) * innerH;
    return { v, y };
  });

  return (
    <div className="chart-line-wrap">
      <svg
        className="chart-line"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Ten year net worth projection"
      >
        {yTicks.map((t) => (
          <g key={t.y}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={t.y}
              y2={t.y}
              className="chart-grid"
            />
            <text x={pad.left - 8} y={t.y + 4} textAnchor="end" className="chart-axis">
              {compactAxis(t.v)}
            </text>
          </g>
        ))}
        <path d={area} className="chart-area" />
        <path d={line} className="chart-path" />
        {coords.map((c) => (
          <circle key={c.label} cx={c.x} cy={c.y} r={3.5} className="chart-dot" />
        ))}
        {coords.map((c, i) =>
          i % Math.ceil(coords.length / 6) === 0 || i === coords.length - 1 ? (
            <text
              key={`lbl-${c.label}`}
              x={c.x}
              y={height - 10}
              textAnchor="middle"
              className="chart-axis"
            >
              {c.label}
            </text>
          ) : null,
        )}
      </svg>
      <p className="muted tiny chart-caption">
        End of horizon:{' '}
        <strong>{formatInr(points[points.length - 1]?.value || 0, true)}</strong>
      </p>
    </div>
  );
}

function compactAxis(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}k`;
  return `${sign}${Math.round(abs)}`;
}

export function PriceAreaChart({
  bars,
  positive = true,
}: {
  bars: { date: string; close: number }[];
  positive?: boolean;
}) {
  const width = 720;
  const height = 260;
  const pad = { top: 16, right: 12, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (bars.length < 2) {
    return <p className="muted">Not enough price history yet</p>;
  }

  const values = bars.map((b) => b.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = bars.map((b, i) => {
    const x = pad.left + (i / (bars.length - 1)) * innerW;
    const y = pad.top + innerH - ((b.close - min) / span) * innerH;
    return { x, y, ...b };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${pad.top + innerH} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + (span * i) / ticks;
    const y = pad.top + innerH - ((v - min) / span) * innerH;
    return { v, y };
  });

  const labelEvery = Math.max(1, Math.ceil(coords.length / 5));

  return (
    <div className={`chart-line-wrap stock-price-chart${positive ? '' : ' down'}`}>
      <svg
        className="chart-line"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stock price chart"
      >
        {yTicks.map((t) => (
          <g key={t.y}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={t.y}
              y2={t.y}
              className="chart-grid"
            />
            <text
              x={pad.left - 8}
              y={t.y + 4}
              textAnchor="end"
              className="chart-axis"
            >
              {compactAxis(t.v)}
            </text>
          </g>
        ))}
        <path d={area} className="chart-area" />
        <path d={line} className="chart-path" />
        {coords.map((c, i) =>
          i % labelEvery === 0 || i === coords.length - 1 ? (
            <text
              key={`lbl-${c.date}-${i}`}
              x={c.x}
              y={height - 10}
              textAnchor="middle"
              className="chart-axis"
            >
              {formatBarLabel(c.date)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function formatBarLabel(date: string) {
  // Yahoo intraday timestamps may be ISO; daily is YYYY-MM-DD.
  const d = new Date(date.includes('T') ? date : `${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}
