// A wallet at a glance: 5 x 5 LED squares, mirrored left to right, read from its address. The web app draws
// the same face for the same wallet (apps/dashboard/src/kit.tsx), so the bar's chip and the app's rail match.
export function Identicon({ address, size = 20 }: { address: string; size?: number }) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");
  const n = (i: number) => parseInt(hex[i], 16) || 0;
  const cells: { x: number; y: number; on: number }[] = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 3; x++) {
      const on = n(y * 3 + x) >= 8 ? (n(20 + y * 3 + x) >= 6 ? 2 : 1) : 0;
      cells.push({ x, y, on });
      if (x < 2) cells.push({ x: 4 - x, y, on });
    }
  if (!cells.some((c) => c.on)) cells[cells.length - 1].on = 2;
  return (
    <svg className="idn" width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect className="idn-bg" width="30" height="30" rx="7" />
      {cells.map((c) => (
        <rect key={`${c.x}.${c.y}`} className={c.on === 2 ? "on" : c.on ? "dim" : "off"} x={3 + c.x * 5} y={3 + c.y * 5} width="4" height="4" />
      ))}
    </svg>
  );
}
