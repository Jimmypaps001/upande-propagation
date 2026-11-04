/**
 * The propagation endpoints the app reads, typed.
 *
 * Nothing here is new: these are the whitelisted methods the desk and the portal
 * dashboard already call (upande_propagation.api, upande_propagation.mobile.api),
 * plus Frappe's own list and report runners for the doctypes that need nothing
 * more. `get_troughs` is the one method added for this app.
 */
import { call, type Envelope } from "@/lib/frappe";

const API = "upande_propagation.api";
const MOBILE = "upande_propagation.mobile.api";

export type Company = string;

export interface Kpis {
  active_batches: number;
  in_nursery: number;
  ready: number;
  mortality: number;
  mortality_rate: number;
  open_requests: number;
  planted_this_month: number;
  sold_this_month: number;
  revenue_this_month: number;
}

export interface FunnelStep {
  label: string;
  value: number;
  percent: number;
}

export interface PipelineRow {
  stage: string;
  batches: number;
  seedlings: number;
  percent: number;
}

export interface Batch {
  name: string;
  batch_title: string | null;
  variety: string | null;
  variety_name: string | null;
  propagation_method: string | null;
  current_stage: string;
  iso_week: number | null;
  iso_year: number | null;
  start_date: string | null;
  company: string | null;
  propagation_unit: string | null;
  mother_block: string | null;
  seedling_request: string | null;
  total_cuttings_planned: number;
  total_cuttings_received: number;
  total_cuttings_actual: number;
  total_mortality: number;
  total_survived: number;
  total_dispatched: number;
  available_to_dispatch: number;
  success_rate: number | null;
  total_cost: number | null;
  cost_per_surviving_seedling: number | null;
  grade_a_count: number;
  grade_b_count: number;
  cull_count: number;
}

export interface RequestRow {
  name: string;
  status: string;
  priority: string | null;
  farm: string | null;
  request_date: string | null;
  required_by_date: string | null;
  total_qty_requested: number;
  total_qty_dispatched: number;
  fulfilment_percentage: number | null;
  overdue?: boolean;
  pending?: number;
}

export interface Dispatch {
  name: string;
  dispatch_date: string;
  purpose: string;
  propagation_batch: string | null;
  variety: string | null;
  qty_dispatched: number;
  grade: string | null;
  farm: string | null;
  target_greenhouse: string | null;
  target_crop_cycle: string | null;
  customer: string | null;
  selling_rate: number | null;
  amount: number | null;
  sales_invoice: string | null;
}

export interface Overview {
  company: string | null;
  companies: string[];
  kpis: Kpis;
  funnel: FunnelStep[];
  pipeline: PipelineRow[];
  batches: Batch[];
  requests: RequestRow[];
  dispatches: Dispatch[];
}

export interface CropInfo {
  name: string;
  crop_key: string;
  accent_color: string | null;
  varieties: string[];
}

/** The crops propagation can be filtered to (Production Crop), with their accents. */
export const crops = () => call<{ crops: CropInfo[] }>(`${API}.get_crops`);

export const overview = (company?: string, crop?: string) =>
  call<Overview>(`${API}.get_overview`, { company: company || null, crop: crop || null });

export const batches = (company: string | undefined, includeCompleted: boolean, crop?: string) =>
  call<{ batches: Batch[]; funnel: FunnelStep[]; pipeline: PipelineRow[] }>(`${API}.get_batches`, {
    company: company || null,
    include_completed: includeCompleted ? 1 : 0,
    crop: crop || null,
  });

export interface StageRow {
  stage: string;
  start_date: string | null;
  end_date: string | null;
  qty_entered: number;
  qty_exited: number;
  days_in_stage: number;
  expected_days: number;
  open: boolean;
  over_expected: boolean;
  lost: number;
}

export interface LogRow {
  name: string;
  log_date: string;
  propagation_batch?: string;
  activity_type: string;
  rose_variety?: string | null;
  qty_done_today: number;
  mortality_today: number;
  cumulative_qty: number | null;
  surviving_qty: number | null;
  greenhouse?: string | null;
  weather_conditions: string | null;
  logged_by: string | null;
  observations?: string | null;
}

export interface BatchDetail {
  batch: Batch & Record<string, unknown>;
  funnel: FunnelStep[];
  stages: StageRow[];
  mother_block: Record<string, unknown> | null;
  harvests: Array<{ name: string; mother_block: string; item: string; number_of_stems: number; harvest_datetime: string }>;
  request: (RequestRow & { items: Array<{ variety: string; qty_requested: number; qty_dispatched: number; qty_pending: number; target_greenhouse: string | null }> }) | null;
  logs: LogRow[];
  dispatches: Dispatch[];
  invoices: Array<{ name: string; posting_date: string; grand_total: number; outstanding_amount: number; status: string; currency: string }>;
}

export const batchDetail = (name: string) => call<BatchDetail>(`${API}.get_batch_detail`, { name });

export interface NurseryLogs {
  logs: LogRow[];
  by_activity: Array<{ activity_type: string; logs: number; done: number; dead: number }>;
  by_day: Array<{ log_date: string; done: number; dead: number }>;
  by_batch: Array<{ propagation_batch: string; variety: string | null; done: number; dead: number }>;
}

export const nurseryLogs = (company: string | undefined, from?: string, to?: string, crop?: string) =>
  call<NurseryLogs>(`${API}.get_nursery_logs`, { company: company || null, from_date: from || null, to_date: to || null, crop: crop || null });

export interface DispatchBook {
  dispatches: Dispatch[];
  by_purpose: Array<{ purpose: string; dispatches: number; qty: number; amount: number }>;
  by_customer: Array<{ customer: string; dispatches: number; qty: number; amount: number }>;
  by_destination: Array<{ destination?: string; qty: number }>;
  by_month: Array<{ ym: string; planted: number; sold: number; revenue: number }>;
  invoices: Array<{ name: string; posting_date: string; grand_total: number; outstanding_amount: number; status: string; currency: string }>;
}

export const dispatchBook = (company: string | undefined, from?: string, to?: string, crop?: string) =>
  call<DispatchBook>(`${API}.get_dispatch_book`, { company: company || null, from_date: from || null, to_date: to || null, crop: crop || null });

export interface RequestsBook {
  requests: RequestRow[];
  rows: Array<{ parent: string; variety: string; qty_requested: number; qty_dispatched: number; qty_pending: number; target_greenhouse: string | null }>;
  by_status: Array<{ status: string; requests: number; requested: number; dispatched: number }>;
}

export const requestsBook = (company: string | undefined, includeClosed: boolean, crop?: string) =>
  call<RequestsBook>(`${API}.get_requests`, { company: company || null, include_closed: includeClosed ? 1 : 0, crop: crop || null });

export interface MotherStock {
  blocks: Array<{
    name: string; variety: string | null; status: string | null; health_status: string | null; location: string | null;
    plant_count: number; planted_date: string | null; total_cuttings_taken: number; last_cutting_date: string | null;
  }>;
  harvests: Array<{ name: string; mother_block: string; item: string; item_name: string | null; number_of_stems: number; harvest_datetime: string; propagation_batch: string | null }>;
  unassigned: Array<{ name: string }>;
  by_status: Array<{ status: string; blocks: number; plants: number; taken: number }>;
  by_variety: Array<{ variety: string; blocks: number; taken: number }>;
}

export const motherStock = (company?: string, crop?: string) =>
  call<MotherStock>(`${API}.get_mother_stock`, { company: company || null, crop: crop || null });

export interface TroughRow {
  name: string;
  trough_name: string;
  unit: string | null;
  company: string | null;
  state: "Free" | "Occupied" | "Out of Service";
  capacity: number;
  area_sqm: number;
  setting: string | null;
  variety: string | null;
  form: string | null;
  set_date: string | null;
  plants: number;
  frees: string | null;
  fill_pct: number | null;
}

export interface TroughBoard {
  troughs: TroughRow[];
  summary: { troughs: number; capacity: number; free: number; occupied: number; out_of_service: number; plants: number };
  settings: Array<{
    name: string; trough: string; propagation_unit: string | null; variety: string | null; form: string | null;
    set_date: string | null; plants: number; plants_lifted: number; plants_remaining: number; fill_pct: number | null;
    status: string; freed_on: string | null;
  }>;
}

export const troughBoard = (company?: string, crop?: string) =>
  call<TroughBoard>(`${API}.get_troughs`, { company: company || null, crop: crop || null });

export interface Consignment {
  name: string;
  consignment: string;
  arrival_date: string | null;
  supplier: string | null;
  supplier_name: string | null;
  variety: string | null;
  variety_name: string | null;
  form: string | null;
  qty_received: number;
  qty_accepted: number;
  qty_rejected: number;
  qty_unbatched: number;
  batches_created: number;
  qc_status: string | null;
  status: string | null;
  warehouse: string | null;
  purchase_receipt: string | null;
  docstatus: number;
}

export const consignments = (company: string | undefined, from?: string, to?: string, crop?: string) =>
  call<Consignment[]>(`${MOBILE}.consignments`, {
    company: company || null,
    from_date: from || null,
    to_date: to || null,
    crop: crop || null,
    limit: 200,
  });

/** Frappe's own list reader (permission checked), for the doctypes with no read model of their own. */
export const list = <T>(doctype: string, fields: string[], opts: { filters?: unknown; order_by?: string; limit?: number } = {}) =>
  call<T[]>("frappe.client.get_list", {
    doctype,
    fields,
    filters: opts.filters ?? [],
    order_by: opts.order_by ?? "modified desc",
    limit_page_length: opts.limit ?? 300,
  });

export interface FlowerTrial {
  name: string;
  trial_name: string;
  greenhouse: string | null;
  crop_type: string | null;
  cycle_status: string | null;
  area: number | null;
  seedling_source: string | null;
  qty_planted: number | null;
  current_live_plants: number | null;
  planting_date: string | null;
  first_harvest_date: string | null;
  total_stems_harvested: number | null;
  overall_rating: number | null;
  recommendation: string | null;
}

export const flowerTrials = (crop?: string) => call<FlowerTrial[]>(`${API}.get_flower_trials`, { crop: crop || null });

const PLANS = "upande_propagation.plans_api";

export interface PlanRow {
  name: string; variety: string | null; farm: string | null; company: string | null; propagation_unit: string | null;
  season: string | null; season_start_year: number | null; status: string | null; production_plan: string | null;
  raised_from: string | null; total_plants_to_stick: number; total_cuttings_required: number; peak_weekly_cuttings: number;
  peak_week: string | null; weeks_sticking: number; cuttings_from_existing: number; cuttings_from_new: number;
  cuttings_from_bought: number; cuttings_uncovered: number; plants_short: number; stems_at_risk: number;
  tc_plants_required: number; tc_order_date: string | null; tc_on_farm_date: string | null; first_sticking_date: string | null;
  total_cost: number | null; tc_cost: number | null; actuals_recorded: number; weeks_closed: number; tc_received: number;
  roots_withdrawn: number; plants_to_farm: number; plants_lost: number; delivered_short: number; schedule_warning: string | null;
}

export interface PlanList {
  plans: PlanRow[];
  totals: Record<string, number>;
  by_status: Array<{ status: string; plans: number }>;
}

export const propagationPlans = (company?: string, crop?: string) =>
  call<PlanList>(`${PLANS}.get_propagation_plans`, { company: company || null, crop: crop || null });

export interface PlanDetail {
  plan: Record<string, unknown>;
  weeks: Array<Record<string, unknown>>;
  intake: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  allocations: Array<Record<string, unknown>>;
}

export const propagationPlan = (name: string) => call<PlanDetail>(`${PLANS}.get_propagation_plan`, { name });

export interface MotherstockPlan {
  name: string; variety: string | null; farm: string | null; season: string | null; production_plan: string | null;
  tc_to_order: number; multiplications: number; generations: number; order_by_date: string | null; tc_arrival_date: string | null;
  first_cut_date: string | null; line_end_date: string | null; peak_pool: number; cuttings_spare: number; mothers_removed: number;
  plants_to_field: number; cuttings_required: number; weeks_met: number; weeks_required: number; covers: number; shortfall: number;
}
export interface MotherstockBatch {
  name: string; variety: string | null; farm: string | null; batch_status: string | null; generation: number; mother_plants: number;
  pots_required: number; peak_weekly_cuttings: number; tc_plants_required: number; tc_order_date: string | null;
  tc_on_farm_date: string | null; first_sticking_date: string | null; expiry_date: string | null; total_cost: number | null;
}
export interface MotherstockBook {
  plans: MotherstockPlan[];
  batches: MotherstockBatch[];
  totals: { plans: number; covering: number; short: number; peak_pool: number; batches: number; mother_plants: number };
}

export const motherstockBook = (company?: string, crop?: string) =>
  call<MotherstockBook>(`${PLANS}.get_motherstock`, { company: company || null, crop: crop || null });

export interface MotherstockDetail {
  plan: Record<string, unknown>;
  generations: Array<Record<string, unknown>>;
  schedule: Array<Record<string, unknown>>;
}

export const motherstockPlan = (name: string) => call<MotherstockDetail>(`${PLANS}.get_motherstock_plan`, { name });

export interface ActualRow {
  name: string; propagation_plan: string | null; variety: string | null; farm: string | null; event: string | null;
  actual_date: string | null; week_iso: string | null; units: number; plants: number; supplier: string | null;
  reference: string | null; form: string | null; warehouse: string | null; reason: string | null; recorded_from: string | null;
}
export interface ActualsBook {
  actuals: ActualRow[];
  by_event: Array<{ event: string; records: number; plants: number }>;
  plans: Array<{ name: string; variety: string | null; farm: string | null; season: string | null; status: string | null;
    actuals_recorded: number; weeks_closed: number; tc_received: number; roots_withdrawn: number; plants_to_farm: number;
    plants_lost: number; delivered_short: number }>;
}

export const planActuals = (company?: string, crop?: string) =>
  call<ActualsBook>(`${PLANS}.get_plan_actuals`, { company: company || null, crop: crop || null });

export interface ReceiptLine {
  document_type: string; document: string; posting_date: string; supplier: string | null; company: string | null;
  docstatus: number; item_code: string; item_name: string | null; qty: number; received_qty: number; rejected_qty: number;
  planting: string | null; block: string | null; planned_plants: number; variance: number; days_before_planting: number;
  quality_inspection: string | null;
}
export interface ReceiptBook {
  lines: ReceiptLine[];
  totals: { lines: number; qty: number; rejected: number; planned: number; variance: number };
}

export const plantReceipts = (company?: string, from?: string, to?: string, crop?: string) =>
  call<ReceiptBook>(`${PLANS}.get_plant_receipts`, { company: company || null, from_date: from || null, to_date: to || null, crop: crop || null });

export const farms = () => list<{ name: string }>("Company", ["name"], { order_by: "name asc", limit: 100 });

export interface ReportResult {
  columns: Array<{ fieldname: string; label: string; fieldtype?: string }>;
  result: Array<Record<string, unknown>>;
}

export const traceability = (filters: Record<string, unknown>) =>
  call<ReportResult>("frappe.desk.query_report.run", {
    report_name: "Propagation Traceability",
    filters,
    ignore_prepared_report: 1,
  }) as Promise<Envelope<ReportResult>>;
