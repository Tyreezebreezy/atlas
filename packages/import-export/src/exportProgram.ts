import type { AtlasStorage } from '@atlas/storage';
import { templateToPlanWorkout } from './exportWorkout';
import { ATLAS_PLAN_FORMAT, type AtlasProgramDocument, type PlanProgram } from './types';

/** Exports a Program as a portable atlas-plan-v1 document, inlining every
 * referenced WorkoutTemplate's content directly -- `template_id` is
 * meaningless outside this installation's database, so the day's actual
 * workout content is embedded instead of referenced. */
export async function exportProgram(
  programId: string,
  storage: AtlasStorage,
): Promise<AtlasProgramDocument> {
  const program = await storage.programs.get(programId);
  if (!program) throw new Error(`Program ${programId} not found.`);
  const library = await storage.exercises.getAll();
  const templates = await storage.workoutTemplates.getAll();
  const templateById = new Map(templates.map((template) => [template.id, template] as const));

  const weeks: PlanProgram['weeks'] = [];
  for (const week of [...program.weeks].sort((a, b) => a.order - b.order)) {
    const days: PlanProgram['weeks'][number]['days'] = [];
    for (const day of [...week.days].sort((a, b) => a.order - b.order)) {
      const template = templateById.get(day.template_id);
      if (!template) continue; // a deleted/missing template shouldn't block exporting the rest
      days.push({ label: day.label, workout: templateToPlanWorkout(template, library) });
    }
    weeks.push({ label: week.label, days });
  }

  return {
    format: ATLAS_PLAN_FORMAT,
    kind: 'program',
    exported_at: new Date().toISOString(),
    program: { name: program.name, description: program.description, weeks },
  };
}
