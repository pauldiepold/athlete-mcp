/**
 * Reduziert einen rohen Final-Surge-WorkoutList-Eintrag auf die reine Plan-Seite.
 * Setzt ADR-0001 um: alle Ist-/Messdaten werden verworfen.
 */

export interface RawActivity {
  activity_type_name?: string | null;
  activity_sub_type_name?: string | null;
}

export interface RawWorkout {
  workout_date?: string | null;
  name?: string | null;
  description?: string | null;
  is_race?: boolean;
  Activities?: RawActivity[] | null;
}

export interface PlannedWorkout {
  date: string;
  name: string;
  description: string;
  sport: string;
  focus: string | null;
  rest_day: boolean;
  is_race: boolean;
}

export function formatWorkout(raw: RawWorkout): PlannedWorkout {
  const first = raw.Activities?.[0];
  const sport = first?.activity_type_name ?? "";
  const focus = first?.activity_sub_type_name ?? null;

  return {
    date: (raw.workout_date ?? "").slice(0, 10),
    name: raw.name ?? "",
    description: raw.description ?? "",
    sport,
    focus,
    rest_day: sport === "Ruhetag",
    is_race: (raw.is_race ?? false) || focus === "Termin" || focus === "Test-Race",
  };
}
