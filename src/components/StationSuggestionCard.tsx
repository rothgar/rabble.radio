import type { ReactElement } from 'react';
import { Card, Button } from '@/components/ui';

interface StationSuggestionCardProps {
  tag: string;
  prompt: string;
}

export function StationSuggestionCard({
  tag,
  prompt,
}: StationSuggestionCardProps): ReactElement {
  return (
    <Card
      className="border-dashed"
      data-testid="station-suggestion"
      data-station={tag}
    >
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-title font-semibold text-[var(--color-text)]">{tag}</h2>
          <p className="mt-1 text-body text-[var(--color-text-secondary)]">{prompt}</p>
        </div>
        <div>
          <Button
            href={`/stations/new?tag=${encodeURIComponent(tag)}`}
            variant="secondary"
            size="sm"
            data-testid="station-suggestion-cta"
          >
            Start a show
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default StationSuggestionCard;
