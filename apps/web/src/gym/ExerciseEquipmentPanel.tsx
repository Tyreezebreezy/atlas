import { useState } from 'react';
import {
  describeLoads,
  describeMaximum,
  EQUIPMENT_TYPES,
  type EffectiveEquipment,
  type MaximumConfirmationOffer,
} from '@atlas/equipment-engine';
import { formatExerciseName } from '@atlas/exercise-library';
import type { Exercise, GymEquipmentInstance } from '@atlas/data-model';
import type { AtlasStorage } from '@atlas/storage';
import { EquipmentForm } from '../equipment/EquipmentForm';
import type { EquipmentChoices, GymsData } from '../equipment/equipmentActions';

interface ExerciseEquipmentPanelProps {
  storage: AtlasStorage;
  data: GymsData;
  exercise: Exercise;
  /** The workout's place; the panel only exists when there is one. */
  locationId: string | null;
  locationName: string | null;
  effective: EffectiveEquipment;
  /** Equipment at the workout's place: the kinds this exercise calls for, and everything else there. */
  choices: EquipmentChoices;
  /**
   * A set of this exercise has been logged, so its machine is fixed for this workout (the session keeps one machine
   * per exercise; changing it would relabel the sets already logged). The panel then only shows what was recorded --
   * no change, no question -- and says why.
   */
  locked: boolean;
  /** "Is 170 lb the maximum on this machine?", when ATLAS has watched the owner reach it again and again. */
  offer: MaximumConfirmationOffer | null;
  /** The owner said "not now" to the which-equipment question for this exercise in this workout. */
  promptDismissed: boolean;
  onDismissPrompt: () => void;
  onChoose: (instance: GymEquipmentInstance) => void;
  /** New equipment was just saved from here; the parent selects it. */
  onCreated: (instance: GymEquipmentInstance) => void;
  onConfirmMax: (instance: GymEquipmentInstance, load: number) => void;
  onDeclineMax: (instance: GymEquipmentInstance) => void;
}

/**
 * vNext Handoff 04B. Which machine this exercise is on, in the workout. Quiet
 * by design -- it is asked once per exercise, never per set, and never blocks
 * logging:
 *
 * - a machine is known (chosen for this workout, or remembered for this
 *   exercise at this place): one line naming it, with its maximum if ATLAS
 *   knows one, and a Change button;
 * - nothing is known and the place has equipment of the kind this exercise
 *   calls for: a short card offering each one, "Add equipment" and "Not now"
 *   (never auto-picked, even when only one fits); everything else at the place
 *   stays one tap away under "Other equipment here";
 * - nothing is known and nothing there fits the exercise (or nothing is set up
 *   at all): a single quiet line, not a question about equipment that cannot
 *   be the answer.
 *
 * - a set of this exercise is logged (`locked`): the machine that was recorded, or
 *   "not recorded", with a Locked badge and the reason -- never a way to change it.
 *
 * Only exercises with a weight to log have equipment at all, and only in a
 * workout that has a place.
 */
export function ExerciseEquipmentPanel({
  storage,
  data,
  exercise,
  locationId,
  locationName,
  effective,
  choices,
  locked,
  offer,
  promptDismissed,
  onDismissPrompt,
  onChoose,
  onCreated,
  onConfirmMax,
  onDeclineMax,
}: ExerciseEquipmentPanelProps) {
  const [mode, setMode] = useState<'summary' | 'choosing' | 'adding'>('summary');

  if (!locationId || exercise.measurement_type !== 'reps_weight') return null;

  const name = formatExerciseName(exercise.name);
  const known = effective.instance;

  /** "Is 170 lb the maximum on this machine?" -- about the machine, not about this workout's record, so it survives the lock. */
  const offerCard = (instance: GymEquipmentInstance) =>
    offer && (
      <div
        className="atlas-gym-equipment atlas-gym-equipment--offer"
        role="group"
        aria-label="Confirm this machine's maximum"
      >
        <p className="atlas-gym-equipment__question">
          Is {offer.load} {instance.unit} the maximum on this machine?
        </p>
        <p className="atlas-gym-equipment__meta">
          You&rsquo;ve reached it in {offer.sessions} workouts. If it is, ATLAS will stop
          recommending anything heavier here.
        </p>
        <div className="atlas-gym-equipment__choices">
          <button
            type="button"
            className="atlas-btn atlas-btn--primary"
            onClick={() => onConfirmMax(instance, offer.load)}
          >
            Yes
          </button>
          <button
            type="button"
            className="atlas-btn atlas-btn--secondary"
            onClick={() => onDeclineMax(instance)}
          >
            No / not sure
          </button>
        </div>
      </div>
    );

  // ---- a set is logged: the record is fixed -----------------------------------------------------
  if (locked) {
    // Only what the workout RECORDED counts -- a machine merely remembered for the exercise was never written to it.
    const recorded = effective.source === 'session' ? effective.instance : null;
    return (
      <div
        className="atlas-gym-equipment atlas-gym-equipment--locked"
        role="group"
        aria-label={`Equipment for ${name}`}
      >
        <div className="atlas-gym-equipment__line">
          <span>
            <span className="atlas-gym-equipment__label">Equipment </span>
            {recorded ? (
              <>
                <span className="atlas-gym-equipment__name">{recorded.label}</span>
                <span className="atlas-gym-equipment__meta">
                  {' '}
                  &middot; {locationName ?? 'this place'} &middot; {describeMaximum(recorded)}
                </span>
              </>
            ) : (
              <span className="atlas-gym-equipment__meta">not recorded</span>
            )}
          </span>
          <span className="atlas-badge">Locked</span>
        </div>
        <p className="atlas-field__hint">
          {recorded
            ? 'Sets are already logged on this machine, so this exercise stays on it for the rest of the workout.'
            : 'Sets are already logged without a machine, so one cannot be added to this workout.'}{' '}
          To use a different machine, finish this workout and start another.
        </p>
        {recorded && offerCard(recorded)}
      </div>
    );
  }
  const suggestedType = exercise.equipment.find((kind) =>
    EQUIPMENT_TYPES.some((t) => t.type === kind),
  );
  const anyChoice = choices.matching.length + choices.other.length > 0;

  const choose = (instance: GymEquipmentInstance) => {
    setMode('summary');
    onChoose(instance);
  };

  if (mode === 'adding') {
    return (
      <div className="atlas-gym-equipment" role="group" aria-label={`Add equipment for ${name}`}>
        <EquipmentForm
          storage={storage}
          data={data}
          locationId={locationId}
          suggestedType={suggestedType}
          compact
          onSaved={(instance) => {
            setMode('summary');
            onCreated(instance);
          }}
          onCancel={() => setMode('summary')}
        />
      </div>
    );
  }

  const choiceButton = (instance: GymEquipmentInstance, current: GymEquipmentInstance | null) => (
    <button
      key={instance.id}
      type="button"
      className="atlas-btn atlas-btn--secondary atlas-gym-equipment__choice"
      aria-pressed={current ? current.id === instance.id : undefined}
      onClick={() => choose(instance)}
    >
      <span>
        {instance.label}
        {current?.id === instance.id ? ' (current)' : ''}
      </span>
      <span className="atlas-gym-equipment__meta">{describeLoads(instance)}</span>
    </button>
  );

  /** What fits the exercise first; the rest of the place's equipment behind one disclosure. */
  const choiceGroups = (current: GymEquipmentInstance | null) => (
    <>
      {choices.matching.length > 0 && (
        <div className="atlas-gym-equipment__choices">
          {choices.matching.map((i) => choiceButton(i, current))}
        </div>
      )}
      {choices.other.length > 0 && (
        <details className="atlas-gym-equipment__other" open={choices.matching.length === 0}>
          <summary>Other equipment here</summary>
          <div className="atlas-gym-equipment__choices">
            {choices.other.map((i) => choiceButton(i, current))}
          </div>
        </details>
      )}
    </>
  );

  const quietRow = (actions: React.ReactNode) => (
    <div className="atlas-gym-equipment" role="group" aria-label={`Equipment for ${name}`}>
      <div className="atlas-gym-equipment__line">
        <span>
          <span className="atlas-gym-equipment__label">Equipment </span>
          <span className="atlas-gym-equipment__meta">not set</span>
        </span>
        <span className="atlas-gym-equipment__actions">{actions}</span>
      </div>
      {mode === 'choosing' && (
        <>
          {choiceGroups(null)}
          <div className="atlas-gym-equipment__choices">
            <button
              type="button"
              className="atlas-btn atlas-btn--tertiary"
              onClick={() => setMode('adding')}
            >
              Add equipment
            </button>
            <button
              type="button"
              className="atlas-btn atlas-btn--tertiary"
              onClick={() => setMode('summary')}
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ---- a machine is known ---------------------------------------------------------------------
  if (known) {
    return (
      <div className="atlas-gym-equipment" role="group" aria-label={`Equipment for ${name}`}>
        <div className="atlas-gym-equipment__line">
          <span>
            <span className="atlas-gym-equipment__label">Equipment </span>
            <span className="atlas-gym-equipment__name">{known.label}</span>
            <span className="atlas-gym-equipment__meta">
              {' '}
              &middot; {locationName ?? 'this place'} &middot; {describeMaximum(known)}
            </span>
          </span>
          <button
            type="button"
            className="atlas-btn atlas-btn--tertiary"
            onClick={() => setMode(mode === 'choosing' ? 'summary' : 'choosing')}
          >
            {mode === 'choosing' ? 'Done' : 'Change'}
          </button>
        </div>

        {mode === 'choosing' && (
          <>
            {choiceGroups(known)}
            <div className="atlas-gym-equipment__choices">
              <button
                type="button"
                className="atlas-btn atlas-btn--tertiary"
                onClick={() => setMode('adding')}
              >
                Add equipment
              </button>
            </div>
          </>
        )}

        {offerCard(known)}
      </div>
    );
  }

  // ---- nothing known and nothing here fits this exercise: a quiet line, not a question ---------------
  if (choices.matching.length === 0) {
    return quietRow(
      <>
        {anyChoice && mode !== 'choosing' && (
          <button
            type="button"
            className="atlas-btn atlas-btn--tertiary"
            onClick={() => setMode('choosing')}
          >
            Choose
          </button>
        )}
        {mode !== 'choosing' && (
          <button
            type="button"
            className="atlas-btn atlas-btn--tertiary"
            onClick={() => setMode('adding')}
          >
            Add equipment
          </button>
        )}
      </>,
    );
  }

  // ---- nothing known, the owner waved the question off: a quiet line they can reopen -----------------
  if (promptDismissed) {
    return quietRow(
      mode !== 'choosing' && (
        <button
          type="button"
          className="atlas-btn atlas-btn--tertiary"
          onClick={() => setMode('choosing')}
        >
          Choose
        </button>
      ),
    );
  }

  // ---- nothing known, and equipment of the right kind exists here: ask once ---------------------------
  return (
    <div className="atlas-gym-equipment" role="group" aria-label={`Equipment for ${name}`}>
      <p className="atlas-gym-equipment__question">Which equipment are you using?</p>
      {choiceGroups(null)}
      <div className="atlas-gym-equipment__choices">
        <button
          type="button"
          className="atlas-btn atlas-btn--tertiary"
          onClick={() => setMode('adding')}
        >
          + Add equipment
        </button>
        <button
          type="button"
          className="atlas-btn atlas-btn--tertiary"
          onClick={() => {
            setMode('summary');
            onDismissPrompt();
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
