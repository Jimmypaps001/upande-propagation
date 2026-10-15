/**
 * The day in the unit: what arrived, what is on the bench, what left.
 *
 * Same server module as batches-api -- upande_propagation.mobile.api -- and the
 * same two helpers. Split from it because batches-api answers "what is standing
 * in the unit" and this answers "what did we do today", and the two get opened
 * from opposite ends of the app.
 *
 * The one idea everything here shares is the consignment number. A delivery is
 * numbered year-week-day with Sunday as 01, the batches raised from it carry
 * that number, and so does the dispatch that sends them to the farm. Nothing in
 * this file invents an identifier of its own.
 */
import { propGet, propPost } from './batches-api';

// ------------------------------------------------------------------- pickers
export interface VarietyOption {
  name: string;
  item_name: string | null;
  stock_uom: string | null;
  item_group: string | null;
}

export interface SupplierOption {
  name: string;
  supplier_name: string | null;
  supplier_group: string | null;
  /** This unit has taken a delivery from them before; those sort first. */
  used_before: boolean;
}

export interface WarehouseOption {
  name: string;
  warehouse_name: string | null;
  company: string | null;
  is_unit: number;
  capacity_plants: number | null;
}

export function varieties(search?: string): Promise<VarietyOption[]> {
  return propGet<VarietyOption[]>('varieties', search ? { search } : {});
}

export function suppliers(search?: string): Promise<SupplierOption[]> {
  return propGet<SupplierOption[]>('suppliers', search ? { search } : {});
}

export function warehouses(unitsOnly = false): Promise<WarehouseOption[]> {
  return propGet<WarehouseOption[]>('warehouses', unitsOnly ? { units_only: 1 } : {});
}

/** What the next arrival on this date would be numbered, before it is saved. */
export function nextConsignmentCode(
  arrivalDate?: string,
): Promise<{ consignment: string; arrival_date: string }> {
  return propGet('next_consignment_code', arrivalDate ? { arrival_date: arrivalDate } : {});
}

// ------------------------------------------------------------------ arrivals
export const FORMS = [
  'Tissue Culture',
  'Rooted Cuttings',
  'Unrooted Cuttings',
  'Roots',
  'Plants',
  'Seeds',
] as const;

export type ArrivalForm = (typeof FORMS)[number];

export type ConsignmentStatus =
  | 'Draft'
  | 'Awaiting Check'
  | 'Held'
  | 'Received'
  | 'Rejected'
  | 'Cancelled';

export interface ConsignmentRow {
  name: string;
  consignment: string;
  arrival_date: string | null;
  supplier: string | null;
  supplier_name: string | null;
  variety: string | null;
  variety_name: string | null;
  form: ArrivalForm | null;
  qty_received: number;
  qty_accepted: number;
  qty_rejected: number;
  qty_unbatched: number;
  batches_created: number;
  qc_status: string | null;
  status: ConsignmentStatus;
  warehouse: string | null;
  purchase_receipt: string | null;
  docstatus: number;
}

/** One line of the check sheet, as the template defines it and nobody has answered yet. */
export interface CheckParameter {
  specification: string;
  numeric: number;
  min_value: number;
  max_value: number;
  expected_value: string | null;
  formula: string | null;
  reading_value: string | null;
  status: 'Accepted' | 'Rejected' | null;
}

export interface CheckSheet {
  consignment: string;
  code: string;
  template: string | null;
  variety: string | null;
  variety_name: string | null;
  qty_received: number;
  qc_status: string | null;
  status: ConsignmentStatus;
  warehouse: string | null;
  rejected_warehouse: string | null;
  parameters: CheckParameter[];
  recorded: Record<string, unknown>[];
}

export interface ConsignmentDetail {
  consignment: Record<string, unknown> & {
    name: string;
    consignment: string;
    status: ConsignmentStatus;
    qty_received: number;
    qty_accepted: number;
    qty_rejected: number;
    qty_unbatched: number;
    variety: string | null;
    variety_name: string | null;
    supplier: string | null;
    form: ArrivalForm | null;
    warehouse: string | null;
    rejected_warehouse: string | null;
    arrival_date: string | null;
    supplier_delivery_note: string | null;
    purchase_receipt: string | null;
    quality_inspection: string | null;
    rejection_reason: string | null;
    notes: string | null;
  };
  check: CheckSheet;
  batches: {
    name: string;
    batch_title: string | null;
    current_stage: string | null;
    start_date: string | null;
    total_cuttings_planned: number;
    total_survived: number;
    available_to_dispatch: number;
    propagation_unit: string | null;
    docstatus: number;
  }[];
  can_batch: boolean;
}

export function consignments(
  args: { status?: ConsignmentStatus; variety?: string; supplier?: string } = {},
): Promise<ConsignmentRow[]> {
  const params: Record<string, unknown> = {};
  if (args.status) params.status = args.status;
  if (args.variety) params.variety = args.variety;
  if (args.supplier) params.supplier = args.supplier;
  return propGet<ConsignmentRow[]>('consignments', params);
}

export function consignmentDetail(consignment: string): Promise<ConsignmentDetail> {
  return propGet<ConsignmentDetail>('consignment_detail', { consignment });
}

export function newConsignment(input: {
  supplier: string;
  variety: string;
  qty: number;
  arrivalDate?: string;
  form?: ArrivalForm;
  warehouse?: string;
  rejectedWarehouse?: string;
  rate?: number;
  deliveryNote?: string;
  notes?: string;
}): Promise<ConsignmentDetail> {
  return propPost<ConsignmentDetail>('new_consignment', {
    supplier: input.supplier,
    variety: input.variety,
    qty_received: input.qty,
    arrival_date: input.arrivalDate ?? undefined,
    form: input.form ?? 'Tissue Culture',
    warehouse: input.warehouse ?? undefined,
    rejected_warehouse: input.rejectedWarehouse ?? undefined,
    rate: input.rate ?? 0,
    supplier_delivery_note: input.deliveryNote ?? undefined,
    notes: input.notes ?? undefined,
  });
}

export interface CheckResult {
  consignment: string;
  code: string;
  qc_status: string;
  status: ConsignmentStatus;
  accepted: number;
  rejected: number;
  /** True when the stock did NOT go onto the ledger, and why is in `message`. */
  held: boolean;
  failed: string[];
  purchase_receipt: string | null;
  quality_inspection: string | null;
  message: string;
}

/**
 * The quality check, and the stock receipt that follows a pass.
 *
 * Every reading is the operator's verdict, not a threshold's: the shipped
 * template's numbers are placeholders nobody agronomic has signed off, so the
 * phone shows them as guidance and the person holding the plants decides.
 */
export function checkConsignment(input: {
  consignment: string;
  accepted: number;
  rejected?: number;
  readings?: CheckParameter[];
  reason?: string;
  rejectedWarehouse?: string;
  deliveryNote?: string;
}): Promise<CheckResult> {
  return propPost<CheckResult>('check_consignment', {
    consignment: input.consignment,
    accepted: input.accepted,
    rejected: input.rejected ?? 0,
    readings: JSON.stringify(input.readings ?? []),
    reason: input.reason ?? undefined,
    rejected_warehouse: input.rejectedWarehouse ?? undefined,
    supplier_delivery_note: input.deliveryNote ?? undefined,
  });
}

// ------------------------------------------------------------------ the work
export function createBatch(input: {
  consignment: string;
  qty?: number;
  unit?: string;
  method?: string;
  startDate?: string;
}): Promise<{
  batch: string;
  consignment: string;
  code: string;
  stage: string;
  qty: number;
  unit: string | null;
  docstatus: number;
}> {
  return propPost('create_batch', {
    plant_consignment: input.consignment,
    qty: input.qty ?? undefined,
    propagation_unit: input.unit ?? undefined,
    propagation_method: input.method ?? 'Own-root Cutting',
    start_date: input.startDate ?? undefined,
  });
}

export interface MoveResult {
  moved: { batch: string; stage: string; unit: string | null }[];
  refused: { batch: string; reason: string }[];
  stage: string | null;
  unit: string | null;
  on_date: string;
}

/**
 * Move a bench, not a batch. Each one is judged on its own and the refusals come
 * back named, so a partial move reads as a partial move.
 */
export function moveBatches(input: {
  batches: string[];
  stage?: string;
  unit?: string;
  notes?: string;
}): Promise<MoveResult> {
  return propPost<MoveResult>('move_batches', {
    batches: JSON.stringify(input.batches),
    stage: input.stage ?? undefined,
    propagation_unit: input.unit ?? undefined,
    notes: input.notes ?? undefined,
  });
}

export function recordMortality(input: {
  batches: string[];
  qty: number;
  on?: string;
  observations?: string;
}): Promise<{
  written: { batch: string; log: string; mortality: number }[];
  refused: { batch: string; reason: string }[];
}> {
  return propPost('record_mortality', {
    batches: JSON.stringify(input.batches),
    qty: input.qty,
    log_date: input.on ?? undefined,
    observations: input.observations ?? undefined,
  });
}

// ---------------------------------------------------------------- the protocol
export interface ActivityVerdict {
  activity: string;
  allowed: boolean;
  /** Why not. Shown on the greyed row, because a short list looks arbitrary. */
  reason: string | null;
  next_allowed_on: string | null;
}

export interface BatchActivities {
  batch: string;
  variety: string | null;
  variety_name: string | null;
  current_stage: string | null;
  consignment: string | null;
  form: ArrivalForm | null;
  protocol: string | null;
  route_summary: string | null;
  route_stages: string[];
  route_steps: string[];
  cycle_time_weeks: number;
  max_cycles: number;
  cutting_rounds: number;
  activities: ActivityVerdict[];
  allowed: string[];
}

export function batchActivities(batch: string, on?: string): Promise<BatchActivities> {
  return propGet<BatchActivities>('batch_activities', on ? { batch, on_date: on } : { batch });
}

export interface StageRung {
  stage: string;
  state: 'done' | 'current' | 'past' | 'ahead';
  start_date: string | null;
  end_date: string | null;
  days_in_stage: number;
  expected_days: number;
  /** What the crop protocol says, in days. Null where it says nothing. */
  protocol_days: number | null;
  qty_entered: number;
  qty_exited: number;
}

export function stagePlan(batch: string): Promise<{
  batch: string;
  current_stage: string | null;
  protocol: string | null;
  ladder: StageRung[];
  establishment_weeks: number;
}> {
  return propGet('stage_plan', { batch });
}

// ------------------------------------------------------------------- dispatch
export interface DispatchTargets {
  farms: { name: string; farm_name: string | null; company: string | null }[];
  greenhouses: { name: string; warehouse_name: string | null; company: string | null }[];
  requests: {
    name: string;
    farm: string | null;
    required_by_date: string | null;
    total_qty_requested: number;
    total_qty_dispatched: number;
    outstanding: number;
  }[];
}

export function dispatchTargets(): Promise<DispatchTargets> {
  return propGet<DispatchTargets>('dispatch_targets');
}

export function dispatchBatch(input: {
  batch: string;
  qty: number;
  greenhouse?: string;
  farm?: string;
  on?: string;
  grade?: string;
  request?: string;
}): Promise<{
  dispatch: string;
  batch: string;
  qty: number;
  stock_entry: string | null;
  consignment: string | null;
  docstatus: number;
}> {
  return propPost('dispatch_batch', {
    propagation_batch: input.batch,
    qty_dispatched: input.qty,
    target_greenhouse: input.greenhouse ?? undefined,
    farm: input.farm ?? undefined,
    dispatch_date: input.on ?? undefined,
    grade: input.grade ?? undefined,
    seedling_request: input.request ?? undefined,
  });
}

// -------------------------------------------------------------------- reports
export interface Reports {
  window: { from_date: string; to_date: string; variety: string | null; farm: string | null; unit: string | null };
  arrivals: {
    consignments: number;
    received: number;
    accepted: number;
    rejected: number;
    reject_pct: number;
    by_supplier: {
      supplier: string | null;
      supplier_name: string | null;
      consignments: number;
      received: number;
      accepted: number;
      rejected: number;
      reject_pct: number;
    }[];
    rows: ConsignmentRow[];
  };
  stock: {
    batches: number;
    on_hand: number;
    ready_to_dispatch: number;
    by_stage: { stage: string; batches: number; plants: number; ready: number; mortality: number }[];
    by_variety: {
      variety: string;
      variety_name: string | null;
      batches: number;
      plants: number;
      ready: number;
      mortality: number;
    }[];
    by_unit: { unit: string; batches: number; plants: number; ready: number; mortality: number }[];
  };
  dispatches: {
    count: number;
    plants: number;
    by_farm: { farm: string; dispatches: number; plants: number }[];
    rows: {
      name: string;
      dispatch_date: string;
      propagation_batch: string;
      variety: string | null;
      variety_name: string | null;
      qty_dispatched: number;
      farm: string | null;
      target_greenhouse: string | null;
      grade: string | null;
      stock_entry: string | null;
      plant_consignment: string | null;
    }[];
  };
  losses: { plants: number; logs: number };
}

export function reports(
  args: { from?: string; to?: string; variety?: string; farm?: string; unit?: string } = {},
): Promise<Reports> {
  const params: Record<string, unknown> = {};
  if (args.from) params.from_date = args.from;
  if (args.to) params.to_date = args.to;
  if (args.variety) params.variety = args.variety;
  if (args.farm) params.farm = args.farm;
  if (args.unit) params.unit = args.unit;
  return propGet<Reports>('reports', params);
}
