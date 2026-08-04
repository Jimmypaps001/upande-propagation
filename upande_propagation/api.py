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


def check_access():
	if frappe.session.user == "Guest":
		raise frappe.PermissionError
	if not frappe.has_permission("Propagation Batch", "read"):
		frappe.throw(_("You are not permitted to view propagation data."), frappe.PermissionError)


def month_bounds():
	return get_first_day(today()), get_last_day(today())


@frappe.whitelist()
def get_overview(company=None):
	"""Everything the overview page draws, in one pass."""
	check_access()

	batch_filters = {"docstatus": 1}
	if company:
		batch_filters["company"] = company

	batches = frappe.get_all("Propagation Batch", filters=batch_filters, fields=list(BATCH_FIELDS))
	active = [b for b in batches if b.current_stage != COMPLETED]

	return {
		"company": company,
		"companies": frappe.get_all("Company", pluck="name", order_by="name asc"),
		"kpis": build_kpis(active, company),
		"funnel": build_funnel(active),
		"pipeline": build_pipeline(active),
		"batches": sorted(active, key=lambda b: (b.iso_year or 0, b.iso_week or 0), reverse=True),
		"requests": build_requests(company),
		"dispatches": build_dispatches(company, limit=12),
	}


def build_kpis(active, company=None):
	first, last = month_bounds()
	dispatch_filters = {"docstatus": 1, "dispatch_date": ("between", [first, last])}
	if company:
		dispatch_filters["company"] = company

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


def build_requests(company=None):
	filters = {"docstatus": 1, "status": ("in", OPEN_REQUEST_STATES)}
	if company:
		filters["company"] = company

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


def build_dispatches(company=None, limit=12):
	filters = {"docstatus": 1}
	if company:
		filters["company"] = company

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
def get_batches(company=None, include_completed=0, limit=500):
	"""Every submitted batch, newest week first — for the batch list and picker."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if not cint(include_completed):
		filters["current_stage"] = ("!=", COMPLETED)

	batches = frappe.get_all(
		"Propagation Batch",
		filters=filters,
		fields=list(BATCH_FIELDS),
		order_by="iso_year desc, iso_week desc, creation desc",
		limit=cint(limit),
	)
	return {"batches": batches, "funnel": build_funnel(batches), "pipeline": build_pipeline(batches)}


@frappe.whitelist()
def get_nursery_logs(company=None, from_date=None, to_date=None, limit=1000):
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
def get_dispatch_book(company=None, from_date=None, to_date=None):
	"""Dispatches split farm vs sale, with customers, invoices and monthly revenue."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if from_date and to_date:
		filters["dispatch_date"] = ("between", [from_date, to_date])

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
def get_mother_stock(company=None):
	"""Mother blocks and the budwood taken off them."""
	check_access()

	blocks = frappe.get_all(
		"Mother Block",
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
def get_requests(company=None, include_closed=0):
	"""Seedling requests with fulfilment, overdue flags and their rows."""
	check_access()

	filters = {"docstatus": 1}
	if company:
		filters["company"] = company
	if not cint(include_closed):
		filters["status"] = ("in", OPEN_REQUEST_STATES)

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
