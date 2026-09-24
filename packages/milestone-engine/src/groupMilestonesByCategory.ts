import type { Exercise, Milestone } from '@atlas/data-model';
import { groupMilestones, semanticTarget } from './groupMilestones';

/**
 * vNext Handoff 03B (§15). The category a milestone is shown under. A
 * milestone is in exactly one, so no achievement is ever drawn twice.
 *
 * What is being measured decides it for the four dimensions that are not
 * about a lift (benchmark / consistency / program / body). For a lift-style
 * goal, authorship decides: ATLAS's own catalog is "Performance", the owner's
 * own targets are "User-defined" -- so a personal goal like "Squat 100 x 6"
 * stays easy to find instead of dissolving into the catalog.
 */
export type MilestoneCategory =
  | 'performance'
  | 'benchmark'
  | 'consistency'
  | 'program'
  | 'body'
  | 'user_defined';

export const MILESTONE_CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  performance: 'Performance',
  benchmark: 'Benchmark',
  consistency: 'Consistency',
  program: 'Program',
  body: 'Body',
  user_defined: 'User-defined',
};

const CATEGORY_ORDER: MilestoneCategory[] = [
  'performance',
  'benchmark',
  'consistency',
  'program',
  'body',
  'user_defined',
];

export function milestoneCategory(milestone: Milestone): MilestoneCategory {
  switch (milestone.dimension) {
    case 'benchmark_threshold':
      return 'benchmark';
    case 'consistency':
      return 'consistency';
    case 'program_completion':
      return 'program';
    case 'body_weight':
      return 'body';
    default:
      return milestone.is_builtin ? 'performance' : 'user_defined';
  }
}

/**
 * Program completion is defined (Handoff 02) as "every ProgramDay has been
 * run at least once" -- which is not the same as finishing a training block
 * (ATLAS has no block/cycle model yet), so surfacing "Training Block
 * Complete" would misstate what happened. Hidden everywhere by default; the
 * record is untouched and still evaluates. Flip the option once a real
 * block/cycle model exists.
 */
export function isMilestoneVisible(
  milestone: Milestone,
  options: { showProgramCompletion?: boolean } = {},
): boolean {
  return milestone.dimension !== 'program_completion' || options.showProgramCompletion === true;
}

export interface MilestoneSection {
  /** The exercise the ladder is for, or null when the category is a flat list (its cards carry their own titles). */
  heading: string | null;
  exerciseId: string | null;
  milestones: Milestone[];
}

export interface MilestoneCategoryGroup {
  category: MilestoneCategory;
  label: string;
  count: number;
  sections: MilestoneSection[];
}

/**
 * Groups milestones by category, in a fixed category order, leaving empty
 * categories out entirely. Lift-style categories are laid out as one ladder
 * per exercise (`groupMilestones`); the rest are a single flat list ordered
 * by target.
 */
export function groupMilestonesByCategory(
  milestones: Milestone[],
  exercisesById: Map<string, Exercise>,
  options: { showProgramCompletion?: boolean } = {},
): MilestoneCategoryGroup[] {
  const byCategory = new Map<MilestoneCategory, Milestone[]>();
  for (const milestone of milestones) {
    if (!isMilestoneVisible(milestone, options)) continue;
    const category = milestoneCategory(milestone);
    const list = byCategory.get(category) ?? [];
    list.push(milestone);
    byCategory.set(category, list);
  }

  const result: MilestoneCategoryGroup[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCategory = byCategory.get(category);
    if (!inCategory || inCategory.length === 0) continue;
    const isLadder = category === 'performance' || category === 'user_defined';
    const sections: MilestoneSection[] = isLadder
      ? groupMilestones(inCategory, exercisesById).map((group) => ({
          heading: group.displayName,
          exerciseId: group.exerciseId,
          milestones: group.milestones,
        }))
      : [
          {
            heading: null,
            exerciseId: null,
            milestones: [...inCategory].sort((a, b) => semanticTarget(a) - semanticTarget(b)),
          },
        ];
    result.push({ category, label: MILESTONE_CATEGORY_LABELS[category], count: inCategory.length, sections });
  }
  return result;
}
