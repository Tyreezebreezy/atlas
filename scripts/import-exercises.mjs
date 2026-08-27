#!/usr/bin/env node
// One-time/rerunnable import: transforms the upstream hasaneyldrm/exercises-dataset
// JSON (English text + structured metadata only -- no media, see docs/EXERCISE_DATA.md
// for why) into ATLAS's Exercise[] shape.
//
// Usage: node scripts/import-exercises.mjs <path to source exercises.json> <output path>
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [sourcePath, outputPath] = process.argv.slice(2);

if (!sourcePath || !outputPath) {
  console.error('Usage: node scripts/import-exercises.mjs <source exercises.json> <output path>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(sourcePath, 'utf-8'));
const now = new Date().toISOString();

// ponytail: source has no rep/time/distance classification, so this is a
// one-line heuristic (cardio -> time, everything else -> reps_weight), not a
// real classifier. Known-imperfect for e.g. planks filed under "waist" --
// correct those by hand as they're noticed, see docs/EXERCISE_DATA.md.
const exercises = raw.map((record) => ({
  id: randomUUID(),
  created_at: now,
  updated_at: now,
  version: 1,
  device_id: 'seed',
  deleted_at: null,
  name: record.name,
  aliases: [],
  category: record.body_part,
  equipment: [record.equipment],
  target_muscle: record.target,
  secondary_muscles: record.secondary_muscles,
  instructions: record.instruction_steps.en,
  movement_pattern: null,
  is_unilateral: null,
  measurement_type: record.body_part === 'cardio' ? 'time' : 'reps_weight',
  default_rest_seconds: null,
  is_custom: false,
  source: 'hasaneyldrm/exercises-dataset',
  source_id: record.id,
  user_notes: null,
  enrichment: null,
}));

writeFileSync(outputPath, JSON.stringify(exercises));
console.log(`Wrote ${exercises.length} exercises to ${outputPath}`);
