// src/components/StationSuggestionCard.tsx
//
// A suggestion card for an empty station, shown alongside real stations to
// encourage people to start a show in that category.

import Link from 'next/link';
import type { ReactElement } from 'react';

interface StationSuggestionCardProps {
  tag: string;
  prompt: string;
}

export function StationSuggestionCard({
  tag,
  prompt,
}: StationSuggestionCardProps): ReactElement {
  return (
    <section
      className="rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-4"
      data-testid="station-suggestion"
      data-station={tag}
    >
      <h2 className="text-lg font-semibold text-slate-100">{tag}</h2>
      <p className="mt-1 text-sm text-slate-400">{prompt}</p>
      <Link
        href={`/stations/new?tag=${encodeURIComponent(tag)}`}
        className="mt-3 inline-flex rounded-lg border border-sky-600 bg-sky-600/20 px-4 py-2.5 text-sm font-medium text-sky-200 hover:bg-sky-600/30"
        data-testid="station-suggestion-cta"
      >
        Start a show
      </Link>
    </section>
  );
}

export default StationSuggestionCard;
