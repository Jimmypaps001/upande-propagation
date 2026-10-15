/**
 * Batches: what is standing in the unit, and what happened to it.
 *
 * This half of the app talks to upande_propagation, not upande_summer_flowers.
 * They are two propagation chains on one site -- roses raised from cuttings in
 * a CSU, and summer flowers raised from tissue culture and roots -- and a batch
 * belongs to the first. Keeping them in separate services keeps the two sets of
 * nouns from being mistaken for each other.
 */
import { api } from './api';
import { BATCH_MODULE, endpoint } from './api-module';
import { storage, StorageKeys } from './storage';

/**
 * The unit this phone records for, attached to every call to the propagation
 * server.
 *
 * A propagation unit is a Warehouse and a Warehouse belongs to one company, so
 * the unit chosen at setup is what scopes every list the app shows: the
 * warehouses it may receive into, the farms it may dispatch to, the arrivals
 * and reports it may see. There is deliberately no separate company picker --
 * two things that must agree are two things that can disagree, and the one the
 * operator actually chose is the shed they are standing in.
 *
 * It is attached here rather than at each call site because forgetting it at
 * one site does not fail loudly: it silently widens that screen to every
 * company on the site. Frappe drops arguments a method does not declare, so
 * sending it to a method that has no use for it is free.
 */
async function withUnit(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (params.unit != null || params.company != null) return params;
  try {
    const unit = await storage.get(StorageKeys.unit);
    return unit ? { ...params, unit } : params;
  } catch {
    // Storage can throw before setup finishes. The server then falls back to
    // the user's default company, which is what it did before this existed.
    return params;
  }
}

/**
 * Both helpers are exported because operations-api answers on the same server
 * module. One place that knows how a call to upande_propagation is shaped beats
 * two that agree today.
 */
export async function propGet<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await api<{ message?: T }>({
    method: 'GET',
    url: endpoint(`${BATCH_MODULE}.${method}`).path,
    params: await withUnit(params),
  });
  if (res.message === undefined) throw new Error('The server returned nothing.');
  return res.message;
}

export async function propPost<T>(method: string, data: Record<string, unknown> = {}): Promise<T> {
  const res = await api<{ message?: T }>({
    method: 'POST',
    url: endpoint(`${BATCH_MODULE}.${method}`).path,
    data: await withUnit(data),
  });
  if (res.message === undefined) throw new Error('The server returned nothing.');
  return res.message;
}

const get = propGet;
const post = propPost;

export interface PropUnit {
  name: string;
  capacity_plants: number | null;
  bench_sqm: number | null;
  spec: string | null;
  company: string | null;
}

/** Null where the server could not answer: no capacity set means no utilisation. */
export interface UnitSpace {
  capacity_plants: number;
  on_hand: number;
  free: number | null;
  utilisation_pct: number | null;
  bench_sqm: number;
  plants_per_sqm: number | null;
}

export interface ExpectedDelivery {
  date: string;
  days_out: number;
  overdue_in_stage?: number;
  basis: string;
}

export interface BatchRow {
  name: string;
  batch_title: string | null;
  variety: string | null;
  variety_name: string | null;
  current_stage: string | null;
  start_date: string | null;
  propagation_unit: string | null;
  total_cuttings_actual?: number;
  total_survived: number;
  total_mortality?: number;
  available_to_dispatch: number;
  success_rate?: number;
  seedling_request?: string | null;
  expected_delivery?: ExpectedDelivery | null;
}

export interface VarietyRow {
  variety: string;
  variety_name: string | null;
  batches: number;
  plants: number;
  ready: number;
}

export interface IncomingRow {
  name: string;
  farm: string | null;
  required_by_date: string | null;
  priority: string | null;
  status: string | null;
  total_qty_requested: number;
  total_qty_dispatched: number;
  outstanding: number;
  /** A request names a farm, never a unit, so this list is nursery-wide. */
  unit_scoped: boolean;
}

export interface DiseaseLogRow {
  name: string;
  log_date: string;
  propagation_batch: string | null;
  rose_variety: string | null;
  disease: string | null;
  severity: string | null;
  affected_qty: number;
  treatment_applied: string | null;
  observations: string | null;
  greenhouse: string | null;
  logged_by: string | null;
}

export interface UnitOverview {
  unit: (PropUnit & { capacity_plants: number }) | null;
  space: UnitSpace;
  by_stage: { stage: string; batches: number; plants: number }[];
  varieties: VarietyRow[];
  batches: BatchRow[];
  due_out: BatchRow[];
  incoming: IncomingRow[];
  diseases: DiseaseLogRow[];
}

export function propagationUnits(): Promise<PropUnit[]> {
  return get<PropUnit[]>('propagation_units');
}

export function unitOverview(unit?: string): Promise<UnitOverview> {
  return get<UnitOverview>('unit_overview', unit ? { unit } : {});
}

export function listBatches(args: {
  unit?: string;
  stage?: string;
  variety?: string;
  includeCompleted?: boolean;
} = {}): Promise<BatchRow[]> {
  const params: Record<string, unknown> = {};
  if (args.unit) params.unit = args.unit;
  if (args.stage) params.stage = args.stage;
  if (args.variety) params.variety = args.variety;
  if (args.includeCompleted) params.include_completed = 1;
  return get<BatchRow[]>('batches', params);
}

export interface BatchDetail {
  batch: Record<string, unknown> & { name: string };
  funnel: { label: string; value: number; percent: number }[];
  stages: Record<string, unknown>[];
  logs: {
    name: string;
    log_date: string;
    activity_type: string;
    qty_done_today: number;
    mortality_today: number;
    observations: string | null;
    logged_by: string | null;
  }[];
  dispatches: Record<string, unknown>[];
  expected_delivery: ExpectedDelivery | null;
  qr: string;
}

export function batchDetail(batch: string): Promise<BatchDetail> {
  return get<BatchDetail>('batch_detail', { batch });
}

export type ScanResult =
  | { kind: 'batch'; name: string; detail: BatchDetail }
  | { kind: 'variety'; name: string; batches: BatchRow[] }
  | { kind: 'unknown'; code: string };

/**
 * Resolve what the camera read. The server says which kind it was rather than
 * leaving the phone to guess, so a mis-scan opens nothing instead of the wrong
 * thing.
 */
export function scan(code: string): Promise<ScanResult> {
  return get<ScanResult>('scan', { code });
}

export function diseases(search?: string): Promise<
  { name: string; common_name: string; scientific_name: string | null }[]
> {
  return get('diseases', search ? { search } : {});
}

export function diseaseLog(args: { unit?: string; batch?: string } = {}): Promise<DiseaseLogRow[]> {
  const params: Record<string, unknown> = {};
  if (args.batch) params.batch = args.batch;
  else if (args.unit) params.unit = args.unit;
  return get<DiseaseLogRow[]>('disease_log', params);
}

export const ACTIVITIES = [
  'Cutting',
  'Sticking',
  'Germination Count',
  'Nursery Count',
  'Hardening Count',
  'Dispatch Count',
  'Mortality Count',
  'Disease / Scouting',
] as const;

export type Activity = (typeof ACTIVITIES)[number];
export const SCOUTING: Activity = 'Disease / Scouting';

export interface LogInput {
  batch: string;
  activity: Activity;
  on?: string | null;
  qtyDone?: number;
  mortality?: number;
  observations?: string | null;
  weather?: string | null;
  disease?: string | null;
  severity?: string | null;
  affected?: number;
  treatment?: string | null;
  scanned?: string | null;
}

/**
 * Write one log. The server fills the variety, the unit and the running totals
 * off the batch, so nothing is sent that the batch already knows.
 */
export function addLog(input: LogInput): Promise<{
  name: string;
  log_date: string;
  activity_type: string;
  batch: string;
}> {
  return post('add_log', {
    propagation_batch: input.batch,
    activity_type: input.activity,
    log_date: input.on ?? undefined,
    qty_done_today: input.qtyDone ?? 0,
    mortality_today: input.mortality ?? 0,
    observations: input.observations ?? undefined,
    weather_conditions: input.weather ?? undefined,
    disease: input.disease ?? undefined,
    severity: input.severity ?? undefined,
    affected_qty: input.affected ?? 0,
    treatment_applied: input.treatment ?? undefined,
    scan_barcode: input.scanned ?? undefined,
  });
}
