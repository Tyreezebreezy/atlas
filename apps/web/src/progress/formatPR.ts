import type { PersonalRecord } from '@atlas/data-model';

export function formatSeconds(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export interface PRDescription {
  title: string;
  value: string;
}

/** Short title+value pair for a PR card, e.g. { title: "5-Rep PR", value: "205 lb x 5" }. */
export function describePR(pr: PersonalRecord): PRDescription {
  switch (pr.kind) {
    case 'max_load':
      return { title: 'Max Load PR', value: `${pr.value} lb${pr.reps ? ` × ${pr.reps}` : ''}` };
    case 'rep':
      return { title: 'Rep PR', value: `${pr.value} reps` };
    case 'rep_range':
      return { title: `${pr.reps}-Rep PR`, value: `${pr.value} lb × ${pr.reps}` };
    case 'estimated_1rm':
      return { title: 'Estimated 1RM PR', value: `${Math.round(pr.value)} lb` };
    case 'volume':
      return { title: 'Volume PR', value: `${Math.round(pr.value).toLocaleString()} lb` };
    case 'timed':
      return { title: 'Duration PR', value: formatSeconds(pr.value) };
    case 'distance':
      return { title: 'Distance PR', value: `${pr.value} m` };
    case 'bodyweight':
      return { title: 'Rep PR', value: `${pr.value} reps` };
    case 'weighted_bodyweight':
      return {
        title: 'Added Load PR',
        value: `+${pr.value} lb${pr.reps ? ` × ${pr.reps}` : ''}`,
      };
    default: {
      const exhaustive: never = pr.kind;
      throw new Error(`Unhandled PR kind: ${String(exhaustive)}`);
    }
  }
}
