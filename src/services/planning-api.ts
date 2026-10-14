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
