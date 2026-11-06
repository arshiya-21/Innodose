import type { FlowStatus } from '@/api/types';
import { Pill } from '@/components/ui';
import machineImg from '@/assets/images/inodose-machine.png';

/** Machine picture with the pouring (amber L-shaped) and dosing (blue) arrows, as in the Figma frame. */
export function FlowDiagram({ flow, stopped = false, disconnected = false }: { flow: FlowStatus; stopped?: boolean; disconnected?: boolean }) {
  const pourFill = stopped ? 'var(--color-gray-300)' : 'linear-gradient(90deg,var(--color-flow-pouring-from),var(--color-flow-pouring-to))';
  const pourHead = stopped ? 'var(--color-gray-300)' : 'var(--color-flow-pouring-to)';
  const dose = stopped ? 'var(--color-gray-300)' : 'var(--color-flow-dosing)';
  return (
    <div className={disconnected ? 'opacity-45 saturate-50' : undefined}>
      <div className="flex justify-center">
        <Pill className="h-7 gap-[7px] px-3.5 text-[14px]">
          Main Hopper Level: <span className="font-semibold">{flow.hopperLevel}</span>
        </Pill>
      </div>
      <div className="relative mt-1 h-[224px]">
        <img src={machineImg} alt="Inodose machine" className="absolute bottom-0 left-0 z-[1] h-[222px] w-[160px] object-contain" />
        <Arrow
          kind="pour"
          bar={85}
          left={234}
          fill={pourFill}
          head={pourHead}
          from={stopped ? 'var(--color-gray-300)' : 'var(--color-flow-pouring-from)'}
          label={flow.pouringLabel}
          meta={flow.pouringTempC != null && flow.pouringSeconds != null ? [`${flow.pouringTempC} °C`, `${flow.pouringSeconds} sec`] : []}
        />
        <Arrow kind="dose" bar={177} left={160} fill={dose} head={dose} label={flow.dosingLabel} meta={flow.dosingSeconds == null ? [] : [`${flow.dosingSeconds} sec`]} />
      </div>
    </div>
  );
}

function Arrow({ kind, label, bar, left, fill, head, from, meta }: { kind: 'pour' | 'dose'; label: string; bar: number; left: number; fill: string; head: string; from?: string; meta: string[] }) {
  const dose = kind === 'dose';
  return (
    <>
      {!dose && (
        <span
          aria-hidden
          className="absolute block"
          style={{ left, top: bar - 38, width: 12, height: 50, borderBottomLeftRadius: 10, background: `linear-gradient(180deg,rgba(255,255,255,0),${from} 76%)` }}
        />
      )}
      <span
        aria-hidden
        className="absolute block"
        style={{ left: dose ? 120 : left, right: 16, top: bar, height: 12, borderBottomLeftRadius: dose ? 0 : 10, background: dose ? `linear-gradient(90deg,rgba(255,255,255,0),${head} 80px)` : fill }}
      />
      <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden className="absolute block" style={{ right: 0, top: bar - 4 }}>
        <polygon points="0,0 16,10 0,20" fill={head} />
      </svg>
      <p
        className="absolute whitespace-nowrap text-[16px] font-semibold leading-none"
        style={{
          right: 40,
          top: bar - 23,
          color: /stopped|off|idle/i.test(label) ? 'var(--color-brand-red)' : 'var(--color-gray-600)',
        }}
      >
        {label}
      </p>
      {meta.length > 0 && (
        <p className="absolute flex items-center gap-[9px] whitespace-nowrap text-[14px] font-semibold leading-none tabular-nums text-gray-600" style={{ right: 40, top: bar + 21 }}>
          {meta.map((m, i) => (
            <span key={m} className="flex items-center gap-[9px]">
              {i > 0 && <span aria-hidden className="h-[11px] w-px bg-gray-300" />}
              {m}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
