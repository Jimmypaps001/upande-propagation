/**
 * The planning side of the server, as the unit needs to read it.
 *
 * propagation-api.ts is the recording half: what happened, written down. This
 * is the half that says what was supposed to happen -- the production plan, the
 * protocol in force, the motherstock behind it, and the orders still to arrive.
 *
 * Every call lands on upande_summer_flowers.mobile.api, which is the one
 * surface the server offers the phone. What answers behind it -- planning_api,
 * crop_protocol, plant_receipt, tc_supply -- is the server's business.
 */
import { api } from './api';
import { endpoint } from './api-module';

async function get<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await api<{ message?: T }>({ method: 'GET', url: endpoint(path).path, params });
  if (res.message === undefined) throw new Error('The server returned nothing.');
  return res.message;
}

async function post<T>(path: string, data: Record<string, unknown> = {}): Promise<T> {
  const res = await api<{ message?: T }>({ method: 'POST', url: endpoint(path).path, data });
  if (res.message === undefined) throw new Error('The server returned nothing.');
  return res.message;
}

// ------------------------------------------------------------------ the plan
export interface ProductionPlan {
  name: string;
  label: string;
  variety: string | null;
  farm: string | null;
  season: string | null;
  status: string | null;
  workflow_state: string | null;
  docstatus: number;
  is_authoritative: boolean;
  budget: string | null;
  total_demand_stems: number;
  total_production_stems: number;
  coverage_pct: number;
  weeks_in_deficit: number;
  weeks_covered: number;
  new_beds_required: number;
}

export interface PlansResult {
  plans: ProductionPlan[];
  default: string | null;
  demand_seasons: number[];
  draft_count: number;
  approved_count: number;
}

/** Every production plan in scope, newest first, each labelled by crop and coverage. */
export function productionPlans(variety?: string, farm?: string): Promise<PlansResult> {
  return get<PlansResult>('production_plans', dropEmpty({ variety, farm }));
}

// -------------------------------------------------------------- the protocol
export interface ProtocolGrade {
  grade: string;
  pct: number;
  price: number;
}

export interface ProtocolRouteRow {
  stage: string | null;
  row_type: string | null;
  weeks?: number;
  loss_pct?: number;
  [k: string]: unknown;
}

export interface ProtocolDetail {
  version: string;
  variety: string | null;
  farm: string | null;
  crop_protocol: string | null;
  status: string | null;
  version_no: number | null;
  effective_from: string | null;
  is_current: boolean;
  /** Which of the three routes chose this version: picked, plan, or in force. */
  source: string;
  for_plan: string | null;
  change_reason: string | null;
  editable: boolean;
  fields: Record<string, unknown>;
  derived: Record<string, number>;
  route: ProtocolRouteRow[];
  route_summary: string | null;
  grades: ProtocolGrade[];
  has_motherstock: number;
  bought_at: string | null;
  versions: { name: string; version: number; version_status: string; change_reason: string | null }[];
}

/** The protocol sheet. A plan names its own pinned version; without one, the version in force. */
export function protocolDetail(args: {
  version?: string;
  plan?: string;
  variety?: string;
  farm?: string;
}): Promise<ProtocolDetail> {
  return get<ProtocolDetail>('protocol_detail', dropEmpty(args));
}

export interface SaveProtocolResult {
  version: string;
  /** True when an Active version was amended into a fresh Draft rather than edited. */
  amended: boolean;
  status: string;
  detail: ProtocolDetail;
}

/**
 * Apply protocol edits. A Draft is edited where it stands; an Active version is
 * never touched, because crop cycles are pinned to the parameters they ran
 * under -- so the server amends it into a new Draft, and that needs a reason.
 */
export function saveProtocol(input: {
  version: string;
  changes: Record<string, unknown>;
  changeReason?: string | null;
  grades?: ProtocolGrade[] | null;
}): Promise<SaveProtocolResult> {
  return post<SaveProtocolResult>('save_protocol', {
    version: input.version,
    changes: JSON.stringify(input.changes),
    grades: input.grades ? JSON.stringify(input.grades) : undefined,
    change_reason: input.changeReason ?? undefined,
  });
}

/**
 * Hand the protocol to the approver. The server refuses without a change reason
 * on the protocol, and approving stays in the desk with an Agriculture Manager.
 */
export function submitProtocolForApproval(protocol: string): Promise<string> {
  return post<string>('submit_protocol_for_approval', { protocol });
}

// ------------------------------------------------------------- motherstock
export interface MotherstockBatch {
  name: string;
  variety: string | null;
  farm: string | null;
  batch_status: string | null;
  generation: number | null;
  tc_plants_required: number;
  mother_plants: number;
  pots_required: number;
  bench_sqm: number;
  tc_order_date: string | null;
  tc_on_farm_date: string | null;
  expiry_date: string | null;
  total_cost: number;
  tc_cost: number;
}

export interface MotherstockLine {
  /** Absent when the protocol raises its plants from a pool rather than motherstock. */
  chosen?: {
    tc: number;
    multiplications: number;
    order_by: string | null;
    first_cut_date: string | null;
    line_end_date: string | null;
    peak_pool: number;
    weeks_met: number;
    shortfall: number;
    covers: number;
    order_late: boolean;
  };
  peak?: { cuttings: number; week_label: string | null; per_mother_per_week: number };
  saved?: MotherstockBatch[];
  reason?: string;
  [k: string]: unknown;
}

export function motherstockLine(plan: string): Promise<MotherstockLine> {
  return get<MotherstockLine>('motherstock_line', { plan });
}

export function motherstockBatches(variety?: string, farm?: string): Promise<MotherstockBatch[]> {
  return get<MotherstockBatch[]>('motherstock_batches', dropEmpty({ variety, farm }));
}

// ---------------------------------------------------------------- arrivals
export interface OrderLine {
  po_item: string;
  idx: number;
  item_code: string;
  item_name: string | null;
  ordered: number;
  received: number;
  outstanding: number;
  uom: string | null;
  warehouse: string | null;
  schedule_date: string | null;
  planting: string | null;
}

export interface OpenOrder {
  purchase_order: string;
  supplier: string;
  supplier_name: string | null;
  transaction_date: string | null;
  status: string | null;
  currency: string | null;
  lines: OrderLine[];
}

export interface OpenOrdersResult {
  orders: OpenOrder[];
  item_groups: string[];
  /** Header fields this site makes mandatory on a Purchase Receipt. */
  required_on_receipt: string[];
}

/** Orders with plant material still to come. A line received in full is not one. */
export function openPlantOrders(args: { supplier?: string; variety?: string; farm?: string } = {}):
  Promise<OpenOrdersResult> {
  return get<OpenOrdersResult>('open_plant_orders', dropEmpty(args));
}

export interface ReceiptLineInput {
  po_item: string;
  accepted: number;
  rejected?: number;
  rejected_warehouse?: string | null;
  rejection_reason?: string | null;
}

export interface DraftReceipt {
  name: string;
  docstatus: number;
  supplier: string;
  posting_date: string;
  total_qty: number;
  lines: { item_code: string; accepted: number; rejected: number }[];
}

/**
 * Write down what arrived, as a DRAFT receipt. Submitting moves stock and posts
 * to the ledger, and that is not the phone's to do -- the office submits once
 * the delivery has been checked against the invoice.
 */
export function draftPlantReceipt(input: {
  purchaseOrder: string;
  lines: ReceiptLineInput[];
  postingDate?: string | null;
  supplierDeliveryNote?: string | null;
  rejectedWarehouse?: string | null;
}): Promise<DraftReceipt> {
  return post<DraftReceipt>('draft_plant_receipt', {
    purchase_order: input.purchaseOrder,
    lines: JSON.stringify(input.lines),
    posting_date: input.postingDate ?? undefined,
    supplier_delivery_note: input.supplierDeliveryNote ?? undefined,
    rejected_warehouse: input.rejectedWarehouse ?? undefined,
  });
}

/** The labs this site can order from. Pending ones are offered and named as pending. */
export function tcSuppliers(search?: string): Promise<{ names: string[]; pending: string[] }> {
  return get<{ names: string[]; pending: string[] }>('tc_suppliers', dropEmpty({ search }));
}

/** Frappe drops undefined params, but an empty string is a filter that matches nothing. */
function dropEmpty<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

// ----------------------------------------------------------- the unit calendar
export interface PropagationVariety {
  variety: string;
  variety_name: string | null;
  plans: number;
  plants_to_stick: number;
  farms: string[];
  next_sticking: string | null;
}

/** The varieties that have a propagation plan, which is what the filter offers. */
export function propagationVarieties(farm?: string): Promise<PropagationVariety[]> {
  return get<PropagationVariety[]>('propagation_varieties', farm ? { farm } : {});
}

export type ScheduleKind =
  | 'tc_order'
  | 'tc_arrive'
  | 'consignment'
  | 'consignment_ready'
  | 'stick'
  | 'root'
  | 'nursery'
  | 'harden'
  | 'to_farm'
  // The motherstock line the cuttings come off. Without these the calendar
  // asks for 4,000 cuttings in a week with nothing standing to cut them from,
  // and the multiplication weeks never appear at all.
  | 'ms_tc_order'
  | 'ms_tc_arrive'
  | 'ms_cuttable'
  | 'ms_multiply'
  | 'ms_productive'
  | 'ms_first_cut'
  | 'ms_full'
  | 'ms_renew'
  | 'ms_expire';

export interface ScheduleEvent {
  date: string;
  iso_year: number;
  week_no: number;
  week_label: string;
  kind: ScheduleKind;
  kind_label: string;
  title: string;
  qty: number | null;
  note: string | null;
  /**
   * `plan` where the date is stored on the plan, `derived` where it is the
   * sticking date plus what the protocol says the phase takes. The screen says
   * which, because one can be chased and the other cannot.
   */
  source: 'plan' | 'derived' | 'motherstock';
  ref: string | null;
}

export interface PropagationSchedule {
  propagation_plan: string | null;
  plan?: string;
  variety?: string | null;
  farm?: string | null;
  status?: string;
  reason?: string;
  protocol?: string | null;
  totals?: Record<string, number | string>;
  events: ScheduleEvent[];
  by_week: { week: string; events: ScheduleEvent[] }[];
  phases: { phase: string; weeks: number; note: string }[];
  route_summary?: string | null;
  cycle_time_weeks?: number;
  max_cycles?: number;
  motherstock?: MotherstockLinePlan[];
  /** "no motherstock line for this variety" — bought-in, not broken. */
  motherstock_reason?: string | null;
}

/**
 * One variety's plan as dated work: order the tissue culture, stick, root, pot,
 * harden, deliver.
 */
export function propagationSchedule(args: {
  propagationPlan?: string;
  plan?: string;
  variety?: string;
  farm?: string;
  from?: string;
}): Promise<PropagationSchedule> {
  const params: Record<string, unknown> = {};
  if (args.propagationPlan) params.propagation_plan = args.propagationPlan;
  if (args.plan) params.plan = args.plan;
  if (args.variety) params.variety = args.variety;
  if (args.farm) params.farm = args.farm;
  if (args.from) params.from_date = args.from;
  return get<PropagationSchedule>('propagation_schedule', params);
}

// ----------------------------------------------------- what the unit must do
//
// The unit does not argue with demand -- by the time a plan reaches it the
// argument is settled and the plan is approved. These two calls carry the only
// things it owns: what leaves for the farms, and the motherstock the cuttings
// come off.

export interface DeliveryRow {
  plan: string;
  variety: string | null;
  farm: string | null;
  season: string | null;
  protocol: string | null;
  deliver_on: string;
  week_label: string;
  stuck_in_week: string | null;
  plant_week: string | null;
  plants: number;
  delivered: number;
  outstanding: number;
  variance: number;
  state: string;
  delivered_on: string | null;
  /** Where this week's plants come from, which is how the unit raises them. */
  source: {
    existing_motherstock: number;
    new_motherstock: number;
    bought: number;
  };
  notes: string | null;
}

export interface DeliveryWeek {
  week: string;
  deliver_on: string;
  farms: string[];
  plants: number;
  delivered: number;
  outstanding: number;
  rows: DeliveryRow[];
}

export interface DeliverySchedule {
  weeks: DeliveryWeek[];
  rows: DeliveryRow[];
  from_date?: string;
  to_date?: string;
  totals: { plants: number; delivered: number; outstanding: number; weeks: number };
  farms: string[];
  varieties: string[];
  /** Why the list is empty, when it is. An empty lorry list and a broken
   *  screen look identical without it. */
  reason?: string | null;
}

/** What the unit owes the farms, by week. Approved plans only. */
export function deliverySchedule(opts: {
  farm?: string;
  variety?: string;
  from_date?: string;
  weeks?: number;
} = {}): Promise<DeliverySchedule> {
  return get<DeliverySchedule>('delivery_schedule', dropEmpty({
    farm: opts.farm,
    variety: opts.variety,
    from_date: opts.from_date,
    weeks: opts.weeks != null ? String(opts.weeks) : undefined,
  }));
}

export interface MotherstockStep {
  step: string;
  week_label: string;
  target_date: string;
  mother_plants: number;
  pots: number;
  notes: string | null;
  kind: string;
  kind_label: string;
  batch: string;
  done: boolean;
}

/** The motherstock line as the propagation unit works it: the richer read
 *  used by the cutting/multiplication calendar, distinct from the planning
 *  office's costing view above. */
export interface MotherstockLinePlan {
  name: string;
  variety: string | null;
  farm: string | null;
  batch_status: string | null;
  generation: number;
  mother_plants: number;
  pots_required: number;
  bench_sqm: number;
  effective_peak_cuttings: number;
  build_up_cycles: number;
  multiplication_factor: number;
  tc_plants_required: number;
  first_sticking_date: string | null;
  max_pc_date: string | null;
  productive_weeks: number;
  expiry_date: string | null;
  renewal_tc_order_date: string | null;
  schedule_warning: string | null;
  cutting_from: string | null;
  cuttings_per_week: number;
  steps: MotherstockStep[];
}

export interface MotherstockPlan {
  variety: string | null;
  farm: string | null;
  batches: MotherstockLinePlan[];
  steps: MotherstockStep[];
  kinds?: Record<string, string>;
  /** "no motherstock line for this variety" — bought-in, not broken. */
  reason?: string | null;
}

/** How this variety's cuttings are raised: when cut, when multiplied. */
export function motherstockPlan(opts: {
  variety?: string;
  farm?: string;
  propagation_plan?: string;
} = {}): Promise<MotherstockPlan> {
  return get<MotherstockPlan>('motherstock_plan', dropEmpty({
    variety: opts.variety,
    farm: opts.farm,
    propagation_plan: opts.propagation_plan,
  }));
}

// --------------------------------------------------------- the farm's view
//
// The same plan read from the other end. A unit asks what it owes; a farm asks
// what is coming, when, and from whom -- and a week that is 90% bought in is a
// different conversation, with a different person, from one that is ours.

export interface FarmPlanSource {
  name: string;
  plants: number;
  /** How this lot reaches the farm. A trough lift is a measured date and
   *  quantity; an allocated share is a season total spread evenly over the
   *  plan's weeks, which is a guess at the shape of the season. */
  kind: 'trough lift' | 'bought in' | 'allocated share';
}

export interface FarmPlanWeek {
  week: string;
  deliver_on: string;
  plants: number;
  varieties: string[];
  /** True when this week came from the real trough calendar rather than from
   *  a share spread evenly across the season. */
  from_calendar: boolean;
  sources: FarmPlanSource[];
}

/** One trough's lift landing on the farm. */
export interface FarmPlanLot {
  ready_on: string;
  plants: number;
  lift_no: number;
  trough: string;
  planted_on: string;
  /** What went into the trough -- a trough is planted full, so this is the
   *  minimum planting, not the quantity the week asked for. */
  trough_lot: number;
  unit: string;
  variety: string;
}

export interface FarmPlan {
  farm: string;
  from_date?: string;
  to_date?: string;
  weeks: FarmPlanWeek[];
  own_units: string[];
  totals: {
    plants: number;
    weeks: number;
    from_own_units: number;
    from_troughs?: number;
    bought_in?: number;
    /** What the plan asked for. */
    demand?: number;
    /** What the troughs make it, over and above the demand, because a trough
     *  is planted full or not at all. Real plants the farm must find ground for. */
    surplus?: number;
  };
  varieties: string[];
  lots?: FarmPlanLot[];
  calendar_weeks?: number;
  plans_on_calendar?: string[];
  reason?: string | null;
}

/** What a farm expects to receive, week by week, and who raises each lot. */
export function farmPlan(opts: {
  farm: string;
  variety?: string;
  from_date?: string;
  weeks?: number;
  include_past?: boolean;
}): Promise<FarmPlan> {
  return get<FarmPlan>('farm_plan', dropEmpty({
    farm: opts.farm,
    variety: opts.variety,
    from_date: opts.from_date,
    weeks: opts.weeks != null ? String(opts.weeks) : undefined,
    include_past: opts.include_past ? '1' : undefined,
  }));
}
