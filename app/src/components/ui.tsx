import type { ReactNode } from 'react';

export function Panel({
  title, sub, right, children, className = '', pad = 'p-4',
}: {
  title?: string; sub?: string; right?: ReactNode; children: ReactNode;
  className?: string; pad?: string;
}) {
  return (
    <section className={`panel relative z-10 ${className}`}>
      {(title || right) && (
        <header className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink2">
                {title}
              </h2>
            )}
            {sub && <p className="mt-1 text-[11.5px] leading-snug text-ink3">{sub}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={title ? `${pad} pt-1` : pad}>{children}</div>
    </section>
  );
}

export function Stat({
  label, value, sub, tone = 'ink', mono = true, size = 'md',
}: {
  label: string; value: ReactNode; sub?: ReactNode;
  tone?: 'ink' | 'mark' | 'up' | 'down' | 'tape' | 'truth';
  mono?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  const toneCls = {
    ink: 'text-ink', mark: 'text-mark', up: 'text-up',
    down: 'text-down', tape: 'text-tape', truth: 'text-truth',
  }[tone];
  const sizeCls = { sm: 'text-[15px]', md: 'text-[20px]', lg: 'text-[30px]' }[size];
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.11em] text-ink3">{label}</div>
      <div className={`mt-1 ${sizeCls} ${mono ? 'num' : ''} leading-none ${toneCls}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] leading-snug text-ink3">{sub}</div>}
    </div>
  );
}

/** A legend swatch. Identity is never colour alone, the label is always here. */
export function Key({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink2">
      <svg width="16" height="8" aria-hidden>
        <line
          x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth="2"
          strokeDasharray={dash ? '3 3' : undefined} strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}

export function Bar({ v, tone = 'mark' }: { v: number; tone?: 'mark' | 'tape' | 'truth' | 'down' }) {
  const bg = { mark: 'bg-mark', tape: 'bg-tape', truth: 'bg-truth', down: 'bg-down' }[tone];
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full ${bg} transition-[width] duration-500`}
           style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
    </div>
  );
}

export function Toggle<T extends string>({
  options, value, onChange,
}: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-void p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === o.id ? 'bg-raised text-ink' : 'text-ink3 hover:text-ink2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
