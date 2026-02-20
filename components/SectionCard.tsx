import type { ReactNode } from "react";

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card section-card ${className ?? ""}`.trim()}>
      {(title || subtitle || actions) && (
        <header className="section-head">
          <div>
            {title ? <h1 className="section-title">{title}</h1> : null}
            {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="section-actions">{actions}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}
