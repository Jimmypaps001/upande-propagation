# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Read models behind the propagation portal pages.

Everything is derived from the same fields the desk shows, so the pages can
never drift from the documents.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, get_first_day, get_last_day, getdate, today

from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	COMPLETED,
	STAGE_SEQUENCE,
)

# The funnel, in order, with the batch field behind each step.
FUNNEL_STEPS = (
	("Planned", "total_cuttings_planned"),
	("Cuttings received", "total_cuttings_received"),
	("Cuttings stuck", "total_cuttings_actual"),
	("Surviving", "total_survived"),
	("Dispatched", "total_dispatched"),
	("Still available", "available_to_dispatch"),
)

OPEN_REQUEST_STATES = ("Submitted", "In Progress", "Partially Fulfilled")

BATCH_FIELDS = (
	"name",
	"batch_title",
	"variety",
	"variety_name",
	"propagation_method",
	"current_stage",
	"iso_week",
	"iso_year",
	"start_date",
	"company",
	"propagation_unit",
	"mother_block",
	"seedling_request",
	"total_cuttings_planned",
	"total_cuttings_received",
	"total_cuttings_actual",
	"total_mortality",
	"total_survived",
	"total_dispatched",
	"available_to_dispatch",
	"success_rate",
	"total_cost",
	"cost_per_surviving_seedling",
	"cost_per_dispatched_seedling",
	"grade_a_count",
	"grade_b_count",
	"cull_count",
)


# ---------------------------------------------------------------------- crops
def crop_items(crop):
	"""The Items (varieties) that belong to a Production Crop, or None for "all crops".

	Propagation records carry their variety as an Item (Propagation Batch, Seedling Request
	Item, Plant Consignment, Seedling Dispatch, Mother Block, Daily Propagation Log), and
	Production Variety is what says which crop an Item is a variety of. `crop` is the crop's
	crop_key (or its name). An unknown crop matches nothing, rather than everything.
	"""
	if not crop:
		return None
	if not frappe.db.table_exists("Production Variety"):
		return [""]
	name = frappe.db.get_value("Production Crop", {"crop_key": crop}) or (
		crop if frappe.db.exists("Production Crop", crop) else None
	)
	if not name:
		return [""]
	rows = frappe.get_all("Production Variety", filters={"crop": name}, fields=["item", "product"])
	return sorted({r[k] for r in rows for k in ("item", "product") if r.get(k)}) or [""]


def crop_request_names(items):
	"""Seedling Requests with at least one row for these varieties."""
	return frappe.get_all(
		"Seedling Request Item",
		filters={"variety": ("in", items), "parenttype": "Seedling Request"},
		pluck="parent",
		distinct=True,
	) or [""]


def crop_batch_names(items):
	return frappe.get_all("Propagation Batch", filters={"variety": ("in", items)}, pluck="name") or [""]


@frappe.whitelist()
def get_crops():
	"""The crops propagation can be filtered to, each with its accent and varieties.

	Production Crop is the one list of crops; a crop with no variety mapped yet still
	appears (it simply has nothing under it). Records whose variety is on no crop show
	under "All crops" only.
	"""
	check_access()
	if not frappe.db.table_exists("Production Crop"):
		return {"crops": []}
	crops = frappe.get_all(
		"Production Crop",
		filters={"enabled": 1},
		fields=["name", "crop_key", "accent_color"],
		order_by="name asc",
	)
	for c in crops:
		c["varieties"] = crop_items(c.crop_key) if c.crop_key else []
		c["varieties"] = [v for v in (c["varieties"] or []) if v]
	return {"crops": crops}


def check_access():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	if not frappe.has_permission("Propagation Batch", "read"):
		frappe.throw(_("You are not permitted to view propagation data."), frappe.PermissionError)


def month_bounds():
	return get_first_day(today()), get_last_day(today())


@frappe.whitelist()
def get_overview(company=None, crop=None):
	"""Everything the overview page draws, in one pass."""
	check_access()

	items = crop_items(crop)
	batch_filters = {"docstatus": 1}
	if company:
		batch_filters["company"] = company
	if items is not None:
		batch_filters["variety"] = ("in", items)

	batches = frappe.get_all("Propagation Batch", filters=batch_filters, fields=list(BATCH_FIELDS))
	active = [b for b in batches if b.current_stage != COMPLETED]

	return {
		"company": company,
		"companies": frappe.get_all("Company", pluck="name", order_by="name asc"),
		"kpis": build_kpis(active, company, items),
		"funnel": build_funnel(active),
		"pipeline": build_pipeline(active),
		"batches": sorted(active, key=lambda b: (b.iso_year or 0, b.iso_week or 0), reverse=True),
		"requests": build_requests(company, items),
		"dispatches": build_dispatches(company, limit=12, items=items),
	}


def build_kpis(active, company=None, items=None):
	first, last = month_bounds()
	dispatch_filters = {"docstatus": 1, "dispatch_date": ("between", [first, last])}
	if company:
		dispatch_filters["company"] = company
	if items is not None:
		dispatch_filters["variety"] = ("in", items)

	dispatched = frappe.get_all(
		"Seedling Dispatch",
		filters=dispatch_filters,
		fields=["purpose", "qty_dispatched", "amount"],
	)
	planted = sum(cint(d.qty_dispatched) for d in dispatched if d.purpose == "Internal Planting")
	sold = sum(cint(d.qty_dispatched) for d in dispatched if d.purpose == "Sale")
	revenue = sum(flt(d.amount) for d in dispatched if d.purpose == "Sale")

	stuck = sum(cint(b.total_cuttings_actual) for b in active)
	dead = sum(cint(b.total_mortality) for b in active)

	request_filters = {"docstatus": 1, "status": ("in", OPEN_REQUEST_STATES)}
	if company:
		request_filters["company"] = company
	if items is not None:
		request_filters["name"] = ("in", crop_request_names(items))

	return {
		"active_batches": len(active),
		"in_nursery": sum(cint(b.total_survived) for b in active),
		"ready": sum(cint(b.available_to_dispatch) for b in active),
		"mortality": dead,
		"mortality_rate": flt(dead * 100.0 / stuck, 1) if stuck else 0.0,
		"open_requests": frappe.db.count("Seedling Request", request_filters),
		"planted_this_month": planted,
		"sold_this_month": sold,
		"revenue_this_month": revenue,
	}


def build_funnel(batches):
	"""Ordered steps with a width percentage, so a template can draw bars."""
	totals = [(label, sum(cint(b.get(fieldname)) for b in batches)) for label, fieldname in FUNNEL_STEPS]
	top = max((value for _label, value in totals), default=0)
	return [
		{
			"label": _(label),
			"value": value,
			"percent": flt(value * 100.0 / top, 1) if top else 0.0,
		}
		for label, value in totals
	]


def build_pipeline(batches):
	"""Seedlings and batch counts sitting at each nursery stage."""
	rows = []
	top = 0
	for stage in STAGE_SEQUENCE:
		at_stage = [b for b in batches if b.current_stage == stage]
		seedlings = sum(cint(b.total_survived) for b in at_stage)
		top = max(top, seedlings)
		rows.append({"stage": stage, "batches": len(at_stage), "seedlings": seedlings})

	for row in rows:
		row["percent"] = flt(row["seedlings"] * 100.0 / top, 1) if top else 0.0
	return rows


def build_requests(company=None, items=None):
	filters = {"docstatus": 1, "status": ("in", OPEN_REQUEST_STATES)}
	if company:
		filters["company"] = company
	if items is not None:
		filters["name"] = ("in", crop_request_names(items))

	requests = frappe.get_all(
		"Seedling Request",
		filters=filters,
		fields=[
			"name",
			"status",
			"priority",
			"farm",
			"request_date",
			"required_by_date",
			"total_qty_requested",
			"total_qty_dispatched",
			"fulfilment_percentage",
		],
		order_by="required_by_date asc",
		limit=12,
	)
	for request in requests:
		request["overdue"] = bool(
			request.required_by_date and getdate(request.required_by_date) < getdate(today())
		)
	return requests


def build_dispatches(company=None, limit=12, items=None):
	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if items is not None:
		filters["variety"] = ("in", items)

	return frappe.get_all(
		"Seedling Dispatch",
		filters=filters,
		fields=[
			"name",
			"dispatch_date",
			"purpose",
			"propagation_batch",
			"variety",
			"qty_dispatched",
			"grade",
			"farm",
			"target_greenhouse",
			"target_crop_cycle",
			"customer",
			"selling_rate",
			"amount",
			"sales_invoice",
		],
		order_by="dispatch_date desc, creation desc",
		limit=limit,
	)


@frappe.whitelist()
def get_batches(company=None, include_completed=0, limit=500, crop=None):
	"""Every submitted batch, newest week first — for the batch list and picker."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if not cint(include_completed):
		filters["current_stage"] = ("!=", COMPLETED)
	items = crop_items(crop)
	if items is not None:
		filters["variety"] = ("in", items)

	batches = frappe.get_all(
		"Propagation Batch",
		filters=filters,
		fields=list(BATCH_FIELDS),
		order_by="iso_year desc, iso_week desc, creation desc",
		limit=cint(limit),
	)
	return {"batches": batches, "funnel": build_funnel(batches), "pipeline": build_pipeline(batches)}


@frappe.whitelist()
def get_nursery_logs(company=None, from_date=None, to_date=None, limit=1000, crop=None):
	"""Daily logs plus per-activity, per-day and per-batch rollups."""
	check_access()

	filters = {}
	if from_date and to_date:
		filters["log_date"] = ("between", [from_date, to_date])
	if company:
		filters["propagation_batch"] = (
			"in",
			frappe.get_all("Propagation Batch", filters={"company": company}, pluck="name") or [""],
		)

	items = crop_items(crop)
	if items is not None:
		filters["rose_variety"] = ("in", items)

	logs = frappe.get_all(
		"Daily Propagation Log",
		filters=filters,
		fields=[
			"name",
			"log_date",
			"propagation_batch",
			"activity_type",
			"rose_variety",
			"qty_done_today",
			"mortality_today",
			"cumulative_qty",
			"surviving_qty",
			"greenhouse",
			"weather_conditions",
			"logged_by",
		],
		order_by="log_date desc, creation desc",
		limit=cint(limit),
	)

	by_activity, by_day, by_batch = {}, {}, {}
	for log in logs:
		activity = by_activity.setdefault(
			log.activity_type or "(unset)",
			{"activity_type": log.activity_type or "(unset)", "logs": 0, "done": 0, "dead": 0},
		)
		activity["logs"] += 1
		activity["done"] += cint(log.qty_done_today)
		activity["dead"] += cint(log.mortality_today)

		day = by_day.setdefault(str(log.log_date), {"log_date": str(log.log_date), "done": 0, "dead": 0})
		day["done"] += cint(log.qty_done_today)
		day["dead"] += cint(log.mortality_today)

		batch = by_batch.setdefault(
			log.propagation_batch,
			{
				"propagation_batch": log.propagation_batch,
				"variety": log.rose_variety,
				"logs": 0,
				"done": 0,
				"dead": 0,
			},
		)
		batch["logs"] += 1
		batch["done"] += cint(log.qty_done_today)
		batch["dead"] += cint(log.mortality_today)

	return {
		"logs": logs,
		"by_activity": sorted(by_activity.values(), key=lambda r: -r["done"]),
		"by_day": [by_day[key] for key in sorted(by_day)],
		"by_batch": sorted(by_batch.values(), key=lambda r: -r["dead"]),
	}


@frappe.whitelist()
def get_dispatch_book(company=None, from_date=None, to_date=None, crop=None):
	"""Dispatches split farm vs sale, with customers, invoices and monthly revenue."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if from_date and to_date:
		filters["dispatch_date"] = ("between", [from_date, to_date])
	items = crop_items(crop)
	if items is not None:
		filters["variety"] = ("in", items)

	dispatches = frappe.get_all(
		"Seedling Dispatch",
		filters=filters,
		fields=[
			"name",
			"dispatch_date",
			"purpose",
			"propagation_batch",
			"variety",
			"qty_dispatched",
			"grade",
			"farm",
			"target_greenhouse",
			"target_crop_cycle",
			"customer",
			"selling_rate",
			"amount",
			"sales_invoice",
			"company",
		],
		order_by="dispatch_date desc, creation desc",
		limit=1000,
	)

	by_purpose, by_customer, by_month, by_destination = {}, {}, {}, {}
	for row in dispatches:
		purpose = by_purpose.setdefault(
			row.purpose, {"purpose": row.purpose, "dispatches": 0, "qty": 0, "amount": 0.0}
		)
		purpose["dispatches"] += 1
		purpose["qty"] += cint(row.qty_dispatched)
		purpose["amount"] += flt(row.amount)

		month = by_month.setdefault(
			str(row.dispatch_date)[:7],
			{"ym": str(row.dispatch_date)[:7], "planted": 0, "sold": 0, "revenue": 0.0},
		)
		if row.purpose == "Sale":
			month["sold"] += cint(row.qty_dispatched)
			month["revenue"] += flt(row.amount)
			customer = by_customer.setdefault(
				row.customer or "(none)",
				{"customer": row.customer or "(none)", "dispatches": 0, "qty": 0, "amount": 0.0},
			)
			customer["dispatches"] += 1
			customer["qty"] += cint(row.qty_dispatched)
			customer["amount"] += flt(row.amount)
		else:
			month["planted"] += cint(row.qty_dispatched)
			key = row.target_crop_cycle or row.target_greenhouse or "(unset)"
			destination = by_destination.setdefault(key, {"destination": key, "dispatches": 0, "qty": 0})
			destination["dispatches"] += 1
			destination["qty"] += cint(row.qty_dispatched)

	invoice_names = [row.sales_invoice for row in dispatches if row.sales_invoice]
	invoices = (
		frappe.get_all(
			"Sales Invoice",
			filters={"name": ("in", invoice_names)},
			fields=[
				"name",
				"customer",
				"posting_date",
				"grand_total",
				"outstanding_amount",
				"status",
				"currency",
			],
			order_by="posting_date desc",
		)
		if invoice_names
		else []
	)

	return {
		"dispatches": dispatches,
		"by_purpose": sorted(by_purpose.values(), key=lambda r: -r["qty"]),
		"by_customer": sorted(by_customer.values(), key=lambda r: -r["amount"]),
		"by_destination": sorted(by_destination.values(), key=lambda r: -r["qty"]),
		"by_month": [by_month[key] for key in sorted(by_month)],
		"invoices": invoices,
	}


@frappe.whitelist()
def get_mother_stock(company=None, crop=None):
	"""Mother blocks and the budwood taken off them."""
	check_access()

	items = crop_items(crop)
	blocks = frappe.get_all(
		"Mother Block",
		filters={"variety": ("in", items)} if items is not None else {},
		fields=[
			"name",
			"variety",
			"status",
			"health_status",
			"location",
			"plant_count",
			"planted_date",
			"total_cuttings_taken",
			"last_cutting_date",
		],
		order_by="total_cuttings_taken desc",
		limit=500,
	)

	harvest_filters = {"docstatus": 1}
	if items is not None:
		harvest_filters["item"] = ("in", items)
	harvests = frappe.get_all(
		"Budwood Harvest",
		filters=harvest_filters,
		fields=[
			"name",
			"mother_block",
			"item",
			"item_name",
			"number_of_stems",
			"harvest_datetime",
			"propagation_batch",
		],
		order_by="harvest_datetime desc",
		limit=500,
	)

	by_status, by_variety = {}, {}
	for block in blocks:
		status = by_status.setdefault(
			block.status or "(unset)",
			{"status": block.status or "(unset)", "blocks": 0, "plants": 0, "taken": 0},
		)
		status["blocks"] += 1
		status["plants"] += cint(block.plant_count)
		status["taken"] += cint(block.total_cuttings_taken)

		variety = by_variety.setdefault(
			block.variety or "(unset)", {"variety": block.variety or "(unset)", "blocks": 0, "taken": 0}
		)
		variety["blocks"] += 1
		variety["taken"] += cint(block.total_cuttings_taken)

	unassigned = [row for row in harvests if not row.propagation_batch]

	return {
		"blocks": blocks,
		"harvests": harvests,
		"unassigned": unassigned,
		"by_status": sorted(by_status.values(), key=lambda r: -r["blocks"]),
		"by_variety": sorted(by_variety.values(), key=lambda r: -r["taken"]),
	}


@frappe.whitelist()
def get_requests(company=None, include_closed=0, crop=None):
	"""Seedling requests with fulfilment, overdue flags and their rows."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if not cint(include_closed):
		filters["status"] = ("in", OPEN_REQUEST_STATES)
	items = crop_items(crop)
	if items is not None:
		filters["name"] = ("in", crop_request_names(items))

	requests = frappe.get_all(
		"Seedling Request",
		filters=filters,
		fields=[
			"name",
			"status",
			"priority",
			"farm",
			"company",
			"requested_by",
			"request_date",
			"required_by_date",
			"total_qty_requested",
			"total_qty_dispatched",
			"fulfilment_percentage",
			"days_to_fulfil",
			"reason",
		],
		order_by="required_by_date asc",
		limit=300,
	)

	by_status = {}
	for request in requests:
		request["overdue"] = bool(
			request.required_by_date
			and getdate(request.required_by_date) < getdate(today())
			and request.status != "Fulfilled"
		)
		request["pending"] = max(0, cint(request.total_qty_requested) - cint(request.total_qty_dispatched))
		status = by_status.setdefault(
			request.status, {"status": request.status, "requests": 0, "requested": 0, "dispatched": 0}
		)
		status["requests"] += 1
		status["requested"] += cint(request.total_qty_requested)
		status["dispatched"] += cint(request.total_qty_dispatched)

	rows = (
		frappe.get_all(
			"Seedling Request Item",
			filters={"parent": ("in", [r.name for r in requests]), "parenttype": "Seedling Request"},
			fields=[
				"parent",
				"variety",
				"qty_requested",
				"qty_dispatched",
				"qty_pending",
				"target_greenhouse",
			],
			order_by="parent asc, idx asc",
		)
		if requests
		else []
	)

	return {
		"requests": requests,
		"rows": rows,
		"by_status": sorted(by_status.values(), key=lambda r: -r["requests"]),
	}


@frappe.whitelist()
def get_flower_trials(crop=None):
	"""Flower Trials, narrowed to a crop through the propagation batch they were raised from.

	A trial has no variety of its own, so a trial with no batch (or a batch whose variety is on no
	crop) shows under "All crops" only.
	"""
	check_access()
	if not frappe.has_permission("Flower Trial", "read"):
		frappe.throw(_("You are not permitted to view flower trials."), frappe.PermissionError)
	filters = {}
	items = crop_items(crop)
	if items is not None:
		filters["propagation_batch"] = ("in", crop_batch_names(items))
	return frappe.get_all(
		"Flower Trial",
		filters=filters,
		fields=[
			"name", "trial_name", "greenhouse", "crop_type", "cycle_status", "area", "seedling_source", "qty_planted",
			"current_live_plants", "planting_date", "first_harvest_date", "total_stems_harvested", "overall_rating",
			"recommendation", "propagation_batch",
		],
		order_by="modified desc",
		limit=300,
	)


@frappe.whitelist()
def get_troughs(company=None, crop=None):
	"""Every active trough with what is standing in it, and the recent settings.

	A trough is Occupied when a Trough Setting still holds it (Standing or Partly
	Lifted), Free when nothing does, and Out of Service when the desk says so. The
	holding comes from troughs.settings_holding, the one place that decides it.
	"""
	check_access()
	from upande_propagation import troughs as _troughs

	filters = {"is_active": 1}
	if company:
		filters["company"] = company
	rows = frappe.get_all(
		"Propagation Trough",
		filters=filters,
		fields=["name", "trough_name", "propagation_unit", "company", "status", "plants_per_trough", "area_sqm"],
		order_by="propagation_unit asc, trough_name asc",
	)
	held = {}
	for unit in {r.propagation_unit for r in rows if r.propagation_unit}:
		held.update(_troughs.settings_holding(unit))

	items = crop_items(crop)
	troughs = []
	for r in rows:
		setting = held.get(r.name)
		# With a crop picked, a trough standing another crop's plants is not that crop's to show.
		if items is not None and setting and setting.variety not in items:
			continue
		if r.status == "Out of Service":
			state = "Out of Service"
		else:
			state = "Occupied" if setting else "Free"
		capacity = cint(r.plants_per_trough)
		troughs.append(
			{
				"name": r.name,
				"trough_name": r.trough_name,
				"unit": r.propagation_unit,
				"company": r.company,
				"state": state,
				"capacity": capacity,
				"area_sqm": flt(r.area_sqm),
				"setting": setting.name if setting else None,
				"variety": setting.variety if setting else None,
				"form": setting.form if setting else None,
				"set_date": str(setting.set_date) if setting and setting.set_date else None,
				"plants": cint(setting.plants_remaining) if setting else 0,
				"frees": str(setting.freed_on) if setting and setting.freed_on else None,
				"fill_pct": flt(cint(setting.plants_remaining) * 100.0 / capacity, 1) if setting and capacity else None,
			}
		)

	summary = {"troughs": len(troughs), "capacity": sum(t["capacity"] for t in troughs)}
	for state in ("Free", "Occupied", "Out of Service"):
		summary[state.lower().replace(" ", "_")] = sum(1 for t in troughs if t["state"] == state)
	summary["plants"] = sum(t["plants"] for t in troughs)

	setting_filters = {"docstatus": ["<", 2]}
	if company:
		setting_filters["company"] = company
	if items is not None:
		setting_filters["variety"] = ("in", items)
	settings = (
		frappe.get_all(
			"Trough Setting",
			filters=setting_filters,
			fields=[
				"name", "trough", "propagation_unit", "variety", "form", "set_date", "plants",
				"plants_lifted", "plants_remaining", "fill_pct", "status", "freed_on",
			],
			order_by="set_date desc, creation desc",
			limit=100,
		)
		if frappe.db.table_exists("Trough Setting")
		else []
	)
	for s in settings:
		s["set_date"] = str(s.set_date) if s.set_date else None
		s["freed_on"] = str(s.freed_on) if s.freed_on else None
	return {"troughs": troughs, "summary": summary, "settings": settings}


@frappe.whitelist()
def get_batch_detail(name):
	"""One batch, every document that touched it, in chain order."""
	check_access()

	batch = frappe.get_doc("Propagation Batch", name)
	batch.check_permission("read")

	return {
		"batch": batch,
		"funnel": build_funnel([frappe._dict(batch.as_dict())]),
		"stages": build_stage_timeline(batch),
		"mother_block": get_mother_block(batch),
		"harvests": frappe.get_all(
			"Budwood Harvest",
			filters={"propagation_batch": batch.name, "docstatus": 1},
			fields=["name", "mother_block", "item", "number_of_stems", "harvest_datetime"],
			order_by="harvest_datetime asc",
		),
		"request": get_request(batch),
		"logs": frappe.get_all(
			"Daily Propagation Log",
			filters={"propagation_batch": batch.name},
			fields=[
				"name",
				"log_date",
				"activity_type",
				"qty_done_today",
				"mortality_today",
				"cumulative_qty",
				"surviving_qty",
				"weather_conditions",
				"logged_by",
				"observations",
			],
			order_by="log_date asc, creation asc",
		),
		"dispatches": frappe.get_all(
			"Seedling Dispatch",
			filters={"propagation_batch": batch.name, "docstatus": 1},
			fields=[
				"name",
				"dispatch_date",
				"purpose",
				"qty_dispatched",
				"grade",
				"farm",
				"target_greenhouse",
				"target_crop_cycle",
				"customer",
				"selling_rate",
				"amount",
				"sales_invoice",
			],
			order_by="dispatch_date asc, creation asc",
		),
		"invoices": get_invoices(batch),
	}


def build_stage_timeline(batch):
	rows = []
	for row in batch.stages:
		expected = cint(row.expected_days)
		actual = cint(row.days_in_stage)
		rows.append(
			{
				"stage": row.stage,
				"start_date": row.start_date,
				"end_date": row.end_date,
				"qty_entered": cint(row.qty_entered),
				"qty_exited": cint(row.qty_exited),
				"days_in_stage": actual,
				"expected_days": expected,
				"open": not row.end_date,
				"over_expected": bool(expected and actual > expected),
				"lost": max(0, cint(row.qty_entered) - cint(row.qty_exited)) if row.end_date else 0,
			}
		)
	return rows


def get_mother_block(batch):
	if not batch.mother_block:
		return None
	return frappe.db.get_value(
		"Mother Block",
		batch.mother_block,
		[
			"name",
			"variety",
			"status",
			"health_status",
			"plant_count",
			"planted_date",
			"total_cuttings_taken",
			"last_cutting_date",
		],
		as_dict=True,
	)


def get_request(batch):
	if not batch.seedling_request:
		return None

	request = frappe.db.get_value(
		"Seedling Request",
		batch.seedling_request,
		[
			"name",
			"status",
			"priority",
			"farm",
			"requested_by",
			"request_date",
			"required_by_date",
			"total_qty_requested",
			"total_qty_dispatched",
			"fulfilment_percentage",
			"days_to_fulfil",
			"reason",
		],
		as_dict=True,
	)
	request["items"] = frappe.get_all(
		"Seedling Request Item",
		filters={"parent": request.name, "parenttype": "Seedling Request"},
		fields=["variety", "qty_requested", "qty_dispatched", "qty_pending", "target_greenhouse"],
		order_by="idx asc",
	)
	return request


def get_invoices(batch):
	names = [
		row.sales_invoice
		for row in frappe.get_all(
			"Seedling Dispatch",
			filters={"propagation_batch": batch.name, "docstatus": 1},
			fields=["sales_invoice"],
		)
		if row.sales_invoice
	]
	if not names:
		return []

	return frappe.get_all(
		"Sales Invoice",
		filters={"name": ("in", names)},
		fields=[
			"name",
			"customer",
			"posting_date",
			"grand_total",
			"outstanding_amount",
			"status",
			"currency",
		],
		order_by="posting_date asc",
	)


# ---------------------------------------------------------------- flower trials
def _trial_variety(trial):
	for table in ("bed_range", "bed_details"):
		for row in trial.get(table) or []:
			if row.get("variety"):
				return row.get("variety")
	return None


@frappe.whitelist()
def promote_trial_to_cycle(
	trial_name: str,
	greenhouse: str,
	planting_date: str,
	uproot_cycle_name: str | None = None,
) -> dict:
	"""Create a Crop Cycle from an approved Flower Trial.

	Crop Cycle belongs to upande_production; it is reached by name only, so this
	app never imports production code. Ported from upande_agriculture.api.

	The variety is the one planted in the trial's beds (Bed Range first, then
	the individual bed overview). upande_agriculture read it from `variety_yield`,
	but that field is an Int (stems/m2/yr), so the cycle came out with variety 0.
	"""
	trial = frappe.get_doc("Flower Trial", trial_name)
	if (trial.get("recommendation") or "").strip() != "Approve for Production":
		frappe.throw(_("Trial is not approved for production."))

	variety = _trial_variety(trial)
	if not variety:
		frappe.throw(_("Flower Trial {0} has no variety planted in its beds.").format(trial_name))

	# The protocol linked to this variety (best effort; may be None).
	proto_name = (
		frappe.db.get_value("Crop Protocol", {"variety_item": variety}, "name")
		if variety else None
	)

	# A new planting ends the cycle it replaces.
	if uproot_cycle_name:
		frappe.db.set_value("Crop Cycle", uproot_cycle_name, {
			"status": "Ended",
			"cycle_end_date": getdate(planting_date),
		})

	cycle = frappe.get_doc({
		"doctype": "Crop Cycle",
		"greenhouse": greenhouse,
		"variety": variety,
		"crop_protocol": proto_name,
		"planting_date": getdate(planting_date),
		"status": "Active",
		"breeder": trial.get("breeder"),
		"notes": f"From Flower Trial {trial_name}",
	}).insert(ignore_permissions=True)

	return {"crop_cycle": cycle.name, "greenhouse": greenhouse}
