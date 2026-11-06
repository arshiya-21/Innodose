export const pad2 = (n: number) => String(n).padStart(2, '0');

/** seconds since midnight -> "HH:MM:SS" */
export function hms(t: number) {
  t = ((t % 86400) + 86400) % 86400;
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
