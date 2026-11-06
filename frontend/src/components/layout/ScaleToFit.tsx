import { useEffect, useRef, useState, type ReactNode } from 'react';
import { config } from '@/config';

/**
 * The HMI is designed on a 1920px-wide artboard. This wrapper renders it at 1920px
 * and scales it to the available width (CSS zoom, falling back to transform).
 */
export function ScaleToFit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: config.designWidth, height: 1080 });
  const [zoom] = useState(() => typeof CSS !== 'undefined' && CSS.supports?.('zoom', '1'));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = size.width / config.designWidth;
  const style = zoom
    ? { width: config.designWidth, height: size.height / scale, zoom: scale }
    : { width: config.designWidth, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: 'top left' };

  return (
    <div ref={ref} className="h-full w-full overflow-hidden">
      <div style={style}>{children}</div>
    </div>
  );
}
