# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Read models behind the plan pages of /propagation_app: propagation plans, motherstock, actuals, plant receipts.

Each one is a thin read of the documents the Summer Flowers planner writes (now owned by this app), narrowed
by farm (company) and crop the same way the rest of the app is: a crop is a Production Crop's crop_key and its
varieties are found through api.crop_items. Nothing is recomputed here; the figures are the ones on the plan.
"""

import frappe
from frappe import _
from frappe.utils import cint

from upande_propagation.api import check_access, crop_items

PLAN_FIELDS = [
	"name", "variety", "farm", "company", "propagation_unit", "season", "season_start_year", "status",
	"production_plan", "raised_from", "total_plants_to_stick", "total_cuttings_required", "peak_weekly_cuttings",
	"peak_week", "weeks_sticking", "cuttings_from_existing", "cuttings_from_new", "cuttings_from_bought",
	"cuttings_uncovered", "plants_short", "stems_at_risk", "tc_plants_required", "tc_order_date", "tc_on_farm_date",
	"first_sticking_date", "total_cost", "tc_cost", "actuals_recorded", "weeks_closed", "tc_received",
	"roots_withdrawn", "plants_to_farm", "plants_lost", "delivered_short", "schedule_warning", "modified",
]

MOTHERSTOCK_PLAN_FIELDS = [
	"name", "variety", "farm", "company", "season", "production_plan", "tc_to_order", "multiplications",
	"generations", "order_by_date", "tc_arrival_date", "first_cut_date", "line_end_date", "peak_pool",
	"cuttings_spare", "mothers_removed", "plants_to_field", "cuttings_required", "weeks_met", "weeks_required",
	"covers", "shortfall", "docstatus",
]

BATCH_FIELDS = [
	"name", "variety", "farm", "company", "batch_status", "generation", "production_plan", "mother_plants",
	"pots_required", "peak_weekly_cuttings", "tc_plants_required", "tc_order_date", "tc_on_farm_date",
	"first_sticking_date", "expiry_date", "total_cost", "docstatus",
]

ACTUAL_FIELDS = [
	"name", "propagation_plan", "variety", "farm", "event", "actual_date", "week_iso", "units", "plants", "supplier",
	"reference", "form", "warehouse", "reason", "recorded_from", "voucher_type", "voucher_no", "season", "docstatus",
]


def _guard(doctype):
	check_access()
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("You are not permitted to view {0}.").format(_(doctype)), frappe.PermissionError)


def _narrow(filters, company, crop, field="variety"):
	if company:
		filters["company"] = company
	items = crop_items(crop)
	if items is not None:
		filters[field] = ("in", items)
	return filters


def _dates(rows, *fields):
	for r in rows:
		for f in fields:
			if r.get(f):
				r[f] = str(r[f])
	return rows


@frappe.whitelist()
def get_propagation_plans(company=None, crop=None):
	"""Every propagation plan, with the figures its form shows, and totals across them."""
	_guard("Summer Flower Propagation Plan")
	rows = frappe.get_all(
		"Summer Flower Propagation Plan",
		filters=_narrow({"docstatus": ("<", 2)}, company, crop),
		fields=PLAN_FIELDS,
		order_by="season_start_year desc, variety asc",
		limit=500,
	)
	_dates(rows, "tc_order_date", "tc_on_farm_date", "first_sticking_date", "modified")
	by_status = {}
	for r in rows:
		by_status[r.status or "Draft"] = by_status.get(r.status or "Draft", 0) + 1
	totals = {k: sum(cint(r.get(k)) for r in rows) for k in (
		"total_plants_to_stick", "total_cuttings_required", "cuttings_uncovered", "plants_short",
		"tc_plants_required", "actuals_recorded", "plants_to_farm", "plants_lost")}
	return {"plans": rows, "totals": totals, "by_status": [{"status": k, "plans": v} for k, v in sorted(by_status.items())]}


@frappe.whitelist()
def get_propagation_plan(name):
	"""One plan with its weeks, intake, sources and allocation."""
	_guard("Summer Flower Propagation Plan")
	doc = frappe.get_doc("Summer Flower Propagation Plan", name)
	doc.check_permission("read")
	out = doc.as_dict()
	return {
		"plan": {k: v for k, v in out.items() if not isinstance(v, list)},
		"weeks": out.get("weeks") or [],
		"intake": out.get("intake") or [],
		"sources": out.get("sources") or [],
		"allocations": out.get("allocations") or out.get("allocation") or [],
	}


@frappe.whitelist()
def get_motherstock(company=None, crop=None):
	"""Motherstock plans (the multiplication line) and motherstock batches (mothers standing)."""
	_guard("Summer Flower Motherstock Plan")
	plans = frappe.get_all(
		"Summer Flower Motherstock Plan",
		filters=_narrow({"docstatus": ("<", 2)}, company, crop),
		fields=MOTHERSTOCK_PLAN_FIELDS,
		order_by="modified desc",
		limit=500,
	)
	batches = frappe.get_all(
		"Summer Flower Motherstock Batch",
		filters=_narrow({"docstatus": ("<", 2)}, company, crop),
		fields=BATCH_FIELDS,
		order_by="modified desc",
		limit=500,
	)
	_dates(plans, "order_by_date", "tc_arrival_date", "first_cut_date", "line_end_date")
	_dates(batches, "tc_order_date", "tc_on_farm_date", "first_sticking_date", "expiry_date")
	return {
		"plans": plans,
		"batches": batches,
		"totals": {
			"plans": len(plans),
			"covering": sum(1 for p in plans if cint(p.covers)),
			"short": sum(cint(p.shortfall) for p in plans),
			"peak_pool": sum(cint(p.peak_pool) for p in plans),
			"batches": len(batches),
			"mother_plants": sum(cint(b.mother_plants) for b in batches),
		},
	}


@frappe.whitelist()
def get_motherstock_plan(name):
	"""One motherstock plan with its generations and week-by-week schedule."""
	_guard("Summer Flower Motherstock Plan")
	doc = frappe.get_doc("Summer Flower Motherstock Plan", name)
	doc.check_permission("read")
	out = doc.as_dict()
	return {
		"plan": {k: v for k, v in out.items() if not isinstance(v, list)},
		"generations": out.get("generation_table") or [],
		"schedule": out.get("schedule") or [],
	}


@frappe.whitelist()
def get_plan_actuals(company=None, crop=None):
	"""Propagation actuals (what really arrived, was struck or left) and each plan's tally of them."""
	_guard("Summer Flower Propagation Actual")
	filters = {"docstatus": ("<", 2)}
	items = crop_items(crop)
	if items is not None:
		filters["variety"] = ("in", items)
	if company:
		filters["propagation_plan"] = (
			"in",
			frappe.get_all("Summer Flower Propagation Plan", filters={"company": company}, pluck="name") or [""],
		)
	rows = frappe.get_all(
		"Summer Flower Propagation Actual", filters=filters, fields=ACTUAL_FIELDS, order_by="actual_date desc, creation desc", limit=1000
	)
	_dates(rows, "actual_date")
	by_event = {}
	for r in rows:
		e = by_event.setdefault(r.event or "(unset)", {"event": r.event or "(unset)", "records": 0, "plants": 0})
		e["records"] += 1
		e["plants"] += cint(r.plants)
	plan_filters = _narrow({"docstatus": ("<", 2)}, company, crop)
	plans = frappe.get_all(
		"Summer Flower Propagation Plan",
		filters=plan_filters,
		fields=["name", "variety", "farm", "season", "status", "actuals_recorded", "weeks_closed", "tc_received",
		        "roots_withdrawn", "plants_to_farm", "plants_lost", "delivered_short"],
		order_by="season_start_year desc, variety asc",
		limit=500,
	)
	return {"actuals": rows, "by_event": sorted(by_event.values(), key=lambda r: -r["plants"]), "plans": plans}


@frappe.whitelist()
def get_plant_receipts(company=None, from_date=None, to_date=None, crop=None):
	"""Plant lines on Purchase Receipts and Purchase Invoices: delivered against what the planting was approved for."""
	check_access()
	from upande_propagation import plant_receipt

	groups = list(plant_receipt.plant_item_groups())
	items = crop_items(crop)
	out = []
	for parent_dt in plant_receipt.RECEIPT_DOCTYPES:
		if not frappe.has_permission(parent_dt, "read"):
			continue
		child = f"{parent_dt} Item"
		parent_filters = {"docstatus": ("<", 2)}
		if company:
			parent_filters["company"] = company
		if from_date and to_date:
			parent_filters["posting_date"] = ("between", [from_date, to_date])
		parents = frappe.get_all(
			parent_dt, filters=parent_filters, fields=["name", "posting_date", "supplier", "supplier_name", "company", "docstatus"]
		)
		if not parents:
			continue
		pmap = {p.name: p for p in parents}
		line_filters = {"parent": ("in", list(pmap)), "parenttype": parent_dt, "item_group": ("in", groups)}
		if items is not None:
			line_filters["item_code"] = ("in", items)
		fields = ["name", "parent", "item_code", "item_name", "qty", "custom_planting_calendar", "custom_block",
		          "custom_planned_plants", "custom_plant_variance", "custom_days_before_planting", "quality_inspection"]
		if parent_dt == "Purchase Receipt":
			fields += ["received_qty", "rejected_qty"]
		lines = frappe.get_all(child, filters=line_filters, fields=fields, order_by="parent desc, idx asc", limit=2000)
		for ln in lines:
			p = pmap[ln.parent]
			out.append({
				"document_type": parent_dt,
				"document": ln.parent,
				"posting_date": str(p.posting_date),
				"supplier": p.supplier_name or p.supplier,
				"company": p.company,
				"docstatus": p.docstatus,
				"item_code": ln.item_code,
				"item_name": ln.item_name,
				"qty": cint(ln.qty),
				"received_qty": cint(ln.get("received_qty")) or cint(ln.qty),
				"rejected_qty": cint(ln.get("rejected_qty")),
				"planting": ln.custom_planting_calendar,
				"block": ln.custom_block,
				"planned_plants": cint(ln.custom_planned_plants),
				"variance": cint(ln.custom_plant_variance),
				"days_before_planting": cint(ln.custom_days_before_planting),
				"quality_inspection": ln.quality_inspection,
			})
	out.sort(key=lambda r: (r["posting_date"], r["document"]), reverse=True)
	return {
		"lines": out,
		"totals": {
			"lines": len(out),
			"qty": sum(r["qty"] for r in out),
			"rejected": sum(r["rejected_qty"] for r in out),
			"planned": sum(r["planned_plants"] for r in out),
			"variance": sum(r["variance"] for r in out),
		},
	}
