/** Small uppercase section label with the red status square. */
export function Eyebrow({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`eyebrow ${className}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}
