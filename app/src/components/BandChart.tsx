import { useMemo, useRef, useState } from 'react';
import { Key } from './ui';

export interface Frame {
  h: number;        // hours since close
  mid: number;      // Noctis mark
  lo: number;       // mid - 1σ
  hi: number;       // mid + 1σ
  tape: number;     // on-chain last trade
  truth: number;    // latent truth (hidden until settlement)
}

interface Props {
  frames: Frame[];
  close: number;
  cursorH: number;
  windowHours: number;
  /** Official opening print, once the auction has run. */
  openPrint?: number;
  revealTruth: boolean;
  onScrub?: (h: number) => void;
  height?: number;
}

const PAD = { t: 14, r: 62, b: 26, l: 8 };

export function BandChart({
  frames, close, cursorH, windowHours, openPrint, revealTruth, onScrub, height = 260,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hoverH, setHoverH] = useState<number | null>(null);

  // Track width without a resize library.
  const measure = (el: HTMLDivElement | null) => {
    if (!el) return;
    wrapRef.current = el;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
  };

  const { yMin, yMax } = useMemo(() => {
    const vals: number[] = [close];
    for (const f of frames) vals.push(f.lo, f.hi, f.tape, ...(revealTruth ? [f.truth] : []));
    if (openPrint) vals.push(openPrint);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.18 || close * 0.01;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [frames, close, openPrint, revealTruth]);

  const iw = Math.max(120, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const X = (h: number) => PAD.l + (h / windowHours) * iw;
  const Y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const visible = frames.filter((f) => f.h <= cursorH + 1e-9);

  const path = (key: 'mid' | 'tape' | 'truth') =>
    visible.map((f, i) => `${i ? 'L' : 'M'}${X(f.h).toFixed(2)},${Y(f[key]).toFixed(2)}`).join(' ');

  const bandPath = visible.length
    ? [
        ...visible.map((f, i) => `${i ? 'L' : 'M'}${X(f.h).toFixed(2)},${Y(f.hi).toFixed(2)}`),
        ...visible.slice().reverse().map((f) => `L${X(f.h).toFixed(2)},${Y(f.lo).toFixed(2)}`),
        'Z',
      ].join(' ')
    : '';

  const cur = visible[visible.length - 1];
  const hovered =
    hoverH == null ? null : visible.reduce((a, b) =>
      Math.abs(b.h - hoverH) < Math.abs(a.h - hoverH) ? b : a, visible[0]);

  const ticks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => yMin + ((yMax - yMin) * i) / (n - 1));
  }, [yMin, yMax]);

  const hourTicks = useMemo(() => {
    const step = windowHours > 40 ? 12 : 4;
    const out: number[] = [];
    for (let h = 0; h <= windowHours + 0.01; h += step) out.push(h);
    return out;
  }, [windowHours]);

  const pos = (e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return ((e.clientX - r.left - PAD.l) / iw) * windowHours;
  };

  return (
    <div ref={measure} className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Key color="var(--color-mark)" label="Noctis mark ±1σ" />
        <Key color="var(--color-tape)" label="On-chain last trade" />
        {revealTruth && <Key color="var(--color-truth)" label="Latent truth / official open" />}
        <Key color="var(--color-ink3)" label="Friday close" dash />
      </div>

      <svg
        width={w} height={height} role="img"
        aria-label="Noctis fair value with one-sigma uncertainty band over the closed window"
        onMouseMove={(e) => setHoverH(pos(e))}
        onMouseLeave={() => setHoverH(null)}
        onClick={(e) => onScrub?.(Math.max(0, Math.min(windowHours, pos(e))))}
        style={{ cursor: onScrub ? 'crosshair' : 'default' }}
      >
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c98500" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#c98500" stopOpacity="0.10" />
          </linearGradient>
          <pattern id="future" width="7" height="7" patternTransform="rotate(45)"
                   patternUnits="userSpaceOnUse">
            <rect width="7" height="7" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="#171b23" strokeWidth="2.5" />
          </pattern>
        </defs>

        {/* recessive grid */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + iw} y1={Y(v)} y2={Y(v)} stroke="#20242c" strokeWidth="1" />
            <text x={PAD.l + iw + 8} y={Y(v) + 3.5} fill="#6b7484" fontSize="10.5"
                  className="num">{v.toFixed(2)}</text>
          </g>
        ))}
        {hourTicks.map((h) => (
          <text key={h} x={X(h)} y={height - 8} fill="#6b7484" fontSize="10" textAnchor="middle" className="num">
            +{h}h
          </text>
        ))}

        {/* Friday close: an annotation, not a series */}
        <line x1={PAD.l} x2={PAD.l + iw} y1={Y(close)} y2={Y(close)}
              stroke="#6b7484" strokeWidth="1.25" strokeDasharray="4 4" />
        <text x={PAD.l + iw + 8} y={Y(close) - 5} fill="#9aa3b2" fontSize="9.5"
              className="num">close</text>

        {/* The part of the window that has not happened yet. Nyx cannot see it
            either, and pretending otherwise is the failure mode this whole
            project is about. */}
        {cursorH < windowHours - 0.01 && (
          <g>
            <rect
              x={X(cursorH)} y={PAD.t} width={PAD.l + iw - X(cursorH)} height={ih}
              fill="url(#future)"
            />
            <text
              x={(X(cursorH) + PAD.l + iw) / 2} y={PAD.t + 14}
              fill="#4b5361" fontSize="10" textAnchor="middle"
              letterSpacing="0.12em"
            >
              NOT YET HAPPENED
            </text>
          </g>
        )}

        {bandPath && <path d={bandPath} fill="url(#bandFill)" />}

        <path d={path('tape')} fill="none" stroke="#3987e5" strokeWidth="1.6"
              strokeOpacity="0.85" strokeLinejoin="round" />
        {revealTruth && (
          <path d={path('truth')} fill="none" stroke="#1baf7a" strokeWidth="1.8"
                strokeDasharray="5 3" strokeLinejoin="round" />
        )}
        <path d={path('mid')} fill="none" stroke="#c98500" strokeWidth="2.2"
              strokeLinejoin="round" strokeLinecap="round" />

        {/* the reopening auction */}
        {openPrint != null && (
          <g>
            <line x1={X(windowHours)} x2={X(windowHours)} y1={PAD.t} y2={PAD.t + ih}
                  stroke="#1baf7a" strokeWidth="1" strokeOpacity=".5" />
            <circle cx={X(windowHours)} cy={Y(openPrint)} r="5.5" fill="#1baf7a"
                    stroke="#08090c" strokeWidth="2" />
            <text x={X(windowHours) - 8} y={Y(openPrint) - 9} fill="#1baf7a" fontSize="10.5"
                  textAnchor="end" className="num">open {openPrint.toFixed(2)}</text>
          </g>
        )}

        {/* live cursor */}
        {cur && (
          <g>
            <line x1={X(cur.h)} x2={X(cur.h)} y1={PAD.t} y2={PAD.t + ih}
                  stroke="#c98500" strokeWidth="1" strokeOpacity=".45" />
            <circle cx={X(cur.h)} cy={Y(cur.mid)} r="4.5" fill="#c98500"
                    stroke="#08090c" strokeWidth="2" />
          </g>
        )}

        {/* hover crosshair */}
        {hovered && (
          <g pointerEvents="none">
            <line x1={X(hovered.h)} x2={X(hovered.h)} y1={PAD.t} y2={PAD.t + ih}
                  stroke="#9aa3b2" strokeWidth="1" strokeDasharray="2 3" strokeOpacity=".6" />
          </g>
        )}
      </svg>

      {hovered && (
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink2">
          <span className="num text-ink3">+{hovered.h.toFixed(1)}h</span>
          <span><span className="text-mark">Mark</span>{' '}
            <span className="num text-ink">{hovered.mid.toFixed(2)}</span>{' '}
            <span className="num text-ink3">±{(hovered.hi - hovered.mid).toFixed(2)}</span></span>
          <span><span className="text-tape">Book</span>{' '}
            <span className="num text-ink">{hovered.tape.toFixed(2)}</span></span>
          {revealTruth && (
            <span><span className="text-truth">Truth</span>{' '}
              <span className="num text-ink">{hovered.truth.toFixed(2)}</span></span>
          )}
        </div>
      )}
    </div>
  );
}
