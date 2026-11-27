// The Killswitch mark and wordmark, the same geometry as the landing page (brand-geometry.ts is generated there).
import { MARK, WORDMARK } from "./brand-geometry";

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={`mark ${className}`} viewBox={MARK.viewBox} aria-hidden="true">
      <path d={MARK.ring} />
      <path d={MARK.bar} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <svg className={`wordmark ${className}`} viewBox={WORDMARK.viewBox} aria-hidden="true">
      <path d={WORDMARK.path} />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`logo ${className}`}>
      <Mark />
      <Wordmark />
      <span className="sr-only">Killswitch</span>
    </span>
  );
}
