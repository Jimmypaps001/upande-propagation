/**
 * What the propagation unit asks the server, and what it tells it.
 *
 * The plan says what should happen; this app is how the unit says what did.
 * Every call here lands on upande_summer_flowers, which already holds the
 * propagation plan, its consignments and its lift profile -- so the phone adds
 * no arithmetic of its own. It reads what is due and posts what happened.
 */
import { api } from './api';
import { endpoint } from './api-module';

export type EventKey = 'TC Received' | 'Roots Withdrawn' | 'Plants To Farm' | 'Loss';

/** What each event moves: material coming in, or plants going out. */
export const EVENTS: { key: EventKey; title: string; blurb: string; counts: 'units' | 'plants' }[] = [
  { key: 'TC Received', title: 'Tissue culture arrived', blurb: 'A lab consignment reaching the unit', counts: 'units' },
  { key: 'Roots Withdrawn', title: 'Roots drawn out', blurb: 'Taken from the cold store to the trough', counts: 'units' },
  { key: 'Plants To Farm', title: 'Plants to the farm', blurb: 'A lift handed over for planting', counts: 'plants' },
  { key: 'Loss', title: 'Plants lost', blurb: 'What did not make it, and why', counts: 'plants' },
];

export interface PlanSummary {
  name: string;
  variety: string;
  farm: string;
  season: string | null;
  status: string | null;
}

export interface Consignment {
  week: string;
  week_iso: string | null;
  form: string | null;
  source: string | null;
  reference: string | null;
  units: number;
  plants: number;
  actual_units: number;
  variance_units: number;
  state: string | null;
  recorded_from: string | null;
  deliver_on: string | null;
}

export interface PlanWeek {
  label: string;
  deliver_on: string;
  promised: number;
  delivered: number;
  variance: number;
  state: string | null;
  uplift: number;
}

export interface PlanDetail {
  propagation_plan: string | null;
  variety?: string;
  farm?: string;
  status?: string;
  reason?: string;
  consignments?: Consignment[];
  weeks?: PlanWeek[];
  actuals?: {
    recorded: number;
    reported_to: string | null;
    weeks_closed: number;
    tc_received: number;
    roots_withdrawn: number;
    plants_to_farm: number;
    plants_lost: number;
    carried_short: number;
    survival_pct: number;
    survival_basis: string | null;
    note: string | null;
  };
}

/** Propagation plans this user can record against, newest season first. */
export async function listPlans(): Promise<PlanSummary[]> {
  const route = endpoint('frappe.client.get_list');
  const res = await api<{ message?: PlanSummary[] }>({
    method: 'GET',
    url: route.path,
    params: {
      doctype: 'Summer Flower Propagation Plan',
      fields: JSON.stringify(['name', 'variety', 'farm', 'season', 'status']),
      filters: JSON.stringify([['status', '!=', 'Rejected']]),
      order_by: 'season_start_year desc, modified desc',
      limit_page_length: 0,
    },
  });
  return res.message ?? [];
}

/** The plan as the unit works to it: consignments due, weeks promised, what is recorded. */
export async function planDetail(plan: string): Promise<PlanDetail> {
  const route = endpoint('propagation_detail');
  const res = await api<{ message?: PlanDetail }>({
    method: 'GET',
    url: route.path,
    params: { propagation_plan: plan },
  });
  return res.message ?? { propagation_plan: null };
}

export interface RecordInput {
  plan: string;
  event: EventKey;
  on: string;
  againstWeek?: string | null;
  units?: number;
  plants?: number;
  reference?: string | null;
  reason?: string | null;
  warehouse?: string | null;
}

/**
 * Record one thing that happened. The server writes a submitted Summer Flower
 * Propagation Actual, which is what the plan reads its variance back from --
 * so a figure typed here is a figure that can be corrected by cancelling,
 * never by retyping.
 */
export async function recordActual(input: RecordInput): Promise<{ name: string; event: string; date: string }> {
  const route = endpoint('record_propagation_actual');
  const res = await api<{ message?: { name: string; event: string; date: string } }>({
    method: 'POST',
    url: route.path,
    data: {
      propagation_plan: input.plan,
      event: input.event,
      actual_date: input.on,
      against_week: input.againstWeek ?? null,
      units: input.units ?? 0,
      plants: input.plants ?? 0,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
      warehouse: input.warehouse ?? null,
    },
  });
  if (!res.message?.name) throw new Error('The server did not say what it recorded.');
  return res.message;
}

/** Propagation units, for the one-time setup screen. */
export async function listUnits(): Promise<string[]> {
  const route = endpoint('frappe.client.get_list');
  const res = await api<{ message?: { name: string }[] }>({
    method: 'GET',
    url: route.path,
    params: {
      doctype: 'Warehouse',
      fields: JSON.stringify(['name']),
      filters: JSON.stringify([['custom_sf_is_propagation_unit', '=', 1], ['disabled', '=', 0]]),
      limit_page_length: 0,
    },
  });
  return (res.message ?? []).map((r) => r.name);
}
