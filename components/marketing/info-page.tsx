import type { ReactNode } from "react";

/**
 * Layout for the static public pages (spec 13.3): a narrow reading column,
 * a short intro, then titled sections. Plain words, no marketing gloss.
 */
export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <header className="space-y-4 border-b border-line pb-10">
        <p className="font-mono text-2xs tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
        <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{title}</h1>
        <div className="text-lg text-fg-muted">{intro}</div>
      </header>
      <div className="divide-y divide-line">{children}</div>
    </article>
  );
}

export function InfoSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="space-y-4 py-10">
      <h2 id={`${id}-title`} className="text-2xl font-semibold text-fg">
        {title}
      </h2>
      <div className="space-y-4 text-fg-muted [&_strong]:font-medium [&_strong]:text-fg">{children}</div>
    </section>
  );
}

/**
 * A fact table. Wide screens get a real table; phones get one card per row
 * (column headings as labels), so no column is ever cut off. Only one of the
 * two is displayed, so assistive technology reads it once.
 */
export function InfoTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <>
      <table className="hidden w-full rounded-md border border-line text-left text-sm sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-fg">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-4 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row" className="px-4 py-2 align-top font-medium text-fg">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} className="px-4 py-2 align-top text-fg-muted">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={caption} className="space-y-3 sm:hidden">
        {rows.map((row, index) => (
          <li key={index} className="rounded-md border border-line p-4 text-sm">
            <p className="font-medium text-fg">{row[0]}</p>
            <dl className="mt-2 space-y-2">
              {row.slice(1).map((cell, cellIndex) => (
                <div key={cellIndex}>
                  <dt className="text-xs text-fg-subtle">{head[cellIndex + 1]}</dt>
                  <dd className="text-fg-muted">{cell}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Steps({ items }: { items: Array<{ title: string; body: ReactNode }> }) {
  return (
    <ol className="space-y-5">
      {items.map((item, index) => (
        <li key={item.title} className="grid grid-cols-[2rem_1fr] gap-3">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-md border border-line-strong font-mono text-xs text-accent"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <p className="font-medium text-fg">{item.title}</p>
            <div className="mt-1 text-fg-muted">{item.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
