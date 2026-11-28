// The privacy policy and the terms of use: their text comes from src/legal/<name>.md, with the date it last
// changed and its sections listed beside it.
import { legal } from "virtual:docs";
import { Shell } from "../site/Shell";

const OTHER = { privacy: ["/terms", "Terms of Use"], terms: ["/privacy", "Privacy Policy"] } as const;

export function LegalPage({ name }: { name: "privacy" | "terms" }) {
  const d = legal[name];
  const [href, label] = OTHER[name];
  return (
    <Shell path={`/${name}`} className="pg pg-legal">
      <div className="legal">
        <header className="legal-head">
          <span className="eyebrow">
            <i aria-hidden="true" />
            Legal
          </span>
          <h1 className="docs-h1">{d.title}</h1>
          <p className="legal-date">Last updated {d.updated}</p>
        </header>
        <nav className="legal-toc" aria-label="Sections">
          <p className="docs-label">Sections</p>
          <ul>
            {d.headings
              .filter((h) => h.depth === 2)
              .map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
          </ul>
          <p className="legal-other">
            See also the <a href={href}>{label}</a>.
          </p>
        </nav>
        <div className="prose legal-body" dangerouslySetInnerHTML={{ __html: d.html }} />
      </div>
    </Shell>
  );
}
