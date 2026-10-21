import type { ChecklistCriterion } from '@/lib/engine-assets';

export type Status = 'c' | 'nc' | 'i' | 'na' | 'nt';

export interface EngineRow {
  id: string;
  result: Status;
  results_list?: Status[];
  comment?: string;
  details?: Detail[];
  time?: number;
}

export interface Detail {
  tag?: string;
  namespace?: string;
  attributes?: { name: string; namespace?: string; value: string }[];
  xpath?: string;
  selector?: string;
  text?: string;
  extra?: string;
}

/** One row per checklist criterion, after joining engine output to checklist metadata. */
export interface ResultRow {
  id: string;
  result: Status;
  results_list: Status[];
  comment: string;
  details: Detail[];
  time: number;
  criterion: ChecklistCriterion;
  /** true if an automated ruleset evaluated this criterion (vs a manual-only criterion). */
  auto: boolean;
  /** true if a real engine result was overridden to 'nt' because its input is not yet recovered. */
  forcedNt: boolean;
}

export interface RecoveredInputs {
  events: boolean;
  resources: boolean;
}

export interface Scores {
  counts: Record<Status, number>;
  /** automated criteria only (auto === true) */
  automated: number;
  total: number;
  /** conformance over decided automated criteria: c / (c + nc), 0..1, or null if none decided */
  conformance: number | null;
}
