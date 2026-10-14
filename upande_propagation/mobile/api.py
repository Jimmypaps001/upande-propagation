# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Mobile API -- every endpoint the Upande Propagation app calls for batches.

The same shape as upande_summer_flowers.mobile.api: one surface for the phone,
nothing clever behind it. The work stays in the app's own modules --
upande_propagation.api already builds the overview and the batch chain, and the
doctype controllers already do the arithmetic -- so a figure the phone shows is
the figure the dashboard shows.

What this adds that nothing else had:

	the unit's own spec and how full it is   (capacity lives on the Warehouse)
	when a batch should reach the farm       (worked from the stage durations)
	a scan that resolves a QR to a batch     (the QR carries the name, nothing else)

A QR carries the batch name and only the batch name. Everything else is looked
up live, so a label printed in week 32 still tells the truth in week 44 -- which
is the whole point of putting it on a batch that moves between benches.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today

from upande_propagation import api as _api

# The order a batch moves through. Taken from the doctype, not re-typed: the
# Select is the one true list and a copy here would drift from it.
STAGE_ORDER = (
	"Cutting", "Sticking", "Callusing", "Rooting",
	"Nursery", "Hardening", "Ready for Dispatch", "Completed",
)
READY = "Ready for Dispatch"
DONE = "Completed"


def _guard():
	"""Signed in, and allowed to see propagation at all."""
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in."), frappe.PermissionError)
	if not frappe.has_permission("Propagation Batch", "read"):
		frappe.throw(_("You are not permitted to view propagation data."),
					 frappe.PermissionError)


def _stage_days():
	"""Expected days per stage, as Propagation Settings has them."""
	settings = frappe.get_single("Propagation Settings")
	return {r.stage: cint(r.expected_days) for r in (settings.stage_durations or [])}


def _expected_delivery(batch, days):
	"""When this batch should be ready to leave for the farm.

	Counted forward from where the batch actually is, not from when it started:
	a batch that sat three weeks in callusing is three weeks late, and a date
	worked from the start date alone would never say so.

	Returns None for a batch that is finished, because there is nothing left to
	wait for, and for one whose stage is not in the ladder at all.
	"""
	stage = batch.get("current_stage")
	if not stage or stage == DONE or stage not in STAGE_ORDER:
		return None
	if stage == READY:
		return {"date": str(getdate(today())), "days_out": 0, "basis": _("ready now")}

	here = STAGE_ORDER.index(stage)
	rest = STAGE_ORDER[here + 1:STAGE_ORDER.index(READY) + 1]

	# How long this stage has already had. The stage row is the honest source;
	# the batch start date is the fallback for a batch whose rows are thin.
	started = None
	for row in (batch.get("stages") or []):
		if row.get("stage") == stage and row.get("start_date"):
			started = getdate(row["start_date"])
			break
	if not started and batch.get("start_date"):
		started = getdate(batch["start_date"])

	expected_here = days.get(stage, 0)
	if started:
		elapsed = (getdate(today()) - started).days
		left_here = max(0, expected_here - elapsed)
		overdue = max(0, elapsed - expected_here)
	else:
		left_here, overdue = expected_here, 0

	out = left_here + sum(days.get(s, 0) for s in rest)
	return {
		"date": str(add_days(today(), out)),
		"days_out": out,
		"overdue_in_stage": overdue,
		"basis": _("{0} days left in {1}, then {2}").format(
			left_here, stage, ", ".join(rest) or _("nothing")),
	}


# ------------------------------------------------------------------- the unit
@frappe.whitelist()
def propagation_units():
	"""The units batches are raised in, with the spec of each.

	A unit standing empty between batches still belongs here, which is why this
	reads the flag on the Warehouse rather than the units named on batches.
	"""
	_guard()
	return frappe.get_all(
		"Warehouse",
		filters={"custom_prop_is_unit": 1, "disabled": 0},
		fields=["name", "custom_prop_capacity_plants as capacity_plants",
				"custom_prop_bench_sqm as bench_sqm",
				"custom_prop_spec as spec", "company"],
		order_by="name asc",
	)


@frappe.whitelist()
def unit_overview(unit=None):
	"""What is standing in a unit now, what is coming, and how full it is."""
	_guard()
	spec = {}
	if unit:
		spec = frappe.db.get_value(
			"Warehouse", unit,
			["name", "custom_prop_capacity_plants as capacity_plants",
			 "custom_prop_bench_sqm as bench_sqm", "custom_prop_spec as spec"],
			as_dict=True) or {}

	filters = {"docstatus": 1, "current_stage": ["!=", DONE]}
	if unit:
		filters["propagation_unit"] = unit
	batches = frappe.get_all(
		"Propagation Batch", filters=filters,
		fields=["name", "batch_title", "variety", "variety_name", "current_stage",
				"start_date", "iso_week", "iso_year", "propagation_unit",
				"total_cuttings_actual", "total_survived", "total_mortality",
				"available_to_dispatch", "success_rate", "seedling_request"],
		order_by="start_date asc")

	days = _stage_days()
	for b in batches:
		# The stage rows are needed for the date, and only for the date.
		b["stages"] = frappe.get_all(
			"Propagation Batch Stage",
			filters={"parent": b["name"], "parenttype": "Propagation Batch"},
			fields=["stage", "start_date", "end_date"])
		b["expected_delivery"] = _expected_delivery(b, days)
		b.pop("stages", None)

	on_hand = sum(cint(b["total_survived"]) for b in batches)
	capacity = cint(spec.get("capacity_plants"))

	by_stage = []
	for stage in STAGE_ORDER:
		at = [b for b in batches if b["current_stage"] == stage]
		if at:
			by_stage.append({
				"stage": stage,
				"batches": len(at),
				"plants": sum(cint(b["total_survived"]) for b in at),
			})

	varieties = {}
	for b in batches:
		key = b["variety"] or _("unnamed")
		v = varieties.setdefault(key, {
			"variety": key, "variety_name": b["variety_name"],
			"batches": 0, "plants": 0, "ready": 0})
		v["batches"] += 1
		v["plants"] += cint(b["total_survived"])
		v["ready"] += cint(b["available_to_dispatch"])

	# Due out soonest first: the thing a unit plans its week around.
	due = sorted(
		[b for b in batches if b.get("expected_delivery")],
		key=lambda b: b["expected_delivery"]["date"])

	return {
		"unit": spec or None,
		"space": {
			"capacity_plants": capacity,
			"on_hand": on_hand,
			"free": max(0, capacity - on_hand) if capacity else None,
			# Without a capacity there is no utilisation, and a 0 here would
			# read as an empty unit rather than an unanswered question.
			"utilisation_pct": flt(on_hand * 100.0 / capacity, 1) if capacity else None,
			"bench_sqm": flt(spec.get("bench_sqm")),
			"plants_per_sqm": (flt(on_hand / flt(spec.get("bench_sqm")), 1)
							   if flt(spec.get("bench_sqm")) else None),
		},
		"by_stage": by_stage,
		"varieties": sorted(varieties.values(), key=lambda v: -v["plants"]),
		"batches": batches,
		"due_out": due[:20],
		"incoming": _incoming(unit),
		"diseases": disease_log(unit=unit, limit=10),
	}


def _incoming(unit=None):
	"""Requests still to be met. A request names a farm, never a unit.

	So this is not filtered by unit and says so: it is what the nursery as a
	whole still owes, which is the honest answer to what is coming.
	"""
	rows = frappe.get_all(
		"Seedling Request",
		filters={"docstatus": 1, "status": ["in", _api.OPEN_REQUEST_STATES]},
		fields=["name", "farm", "required_by_date", "priority", "status",
				"total_qty_requested", "total_qty_dispatched"],
		order_by="required_by_date asc", limit=20)
	for r in rows:
		r["outstanding"] = max(0, cint(r["total_qty_requested"])
							   - cint(r["total_qty_dispatched"]))
		r["unit_scoped"] = False
	return rows


# ------------------------------------------------------------------ batches
@frappe.whitelist()
def batches(unit=None, stage=None, variety=None, include_completed=0, limit=100):
	"""Batches, narrowed the way the phone narrows them."""
	_guard()
	filters = {"docstatus": 1}
	if unit:
		filters["propagation_unit"] = unit
	if stage:
		filters["current_stage"] = stage
	elif not cint(include_completed):
		filters["current_stage"] = ["!=", DONE]
	if variety:
		filters["variety"] = variety
	return frappe.get_all(
		"Propagation Batch", filters=filters,
		fields=["name", "batch_title", "variety", "variety_name", "current_stage",
				"start_date", "propagation_unit", "total_survived",
				"available_to_dispatch", "total_mortality", "success_rate"],
		order_by="start_date desc", limit=cint(limit) or 100)


@frappe.whitelist()
def batch_detail(batch):
	"""One batch end to end, plus when it should reach the farm."""
	_guard()
	out = _api.get_batch_detail(batch)
	doc = out.get("batch")
	payload = doc.as_dict() if hasattr(doc, "as_dict") else dict(doc or {})
	out["expected_delivery"] = _expected_delivery(payload, _stage_days())
	out["qr"] = batch
	return out


@frappe.whitelist()
def scan(code):
	"""Resolve what was scanned, or typed when the camera will not play.

	A QR from a label carries a batch name. A barcode on a variety carries an
	item. Saying which it was lets the phone open the right screen instead of
	guessing, and saying it found nothing is better than opening the wrong one.
	"""
	_guard()
	code = (code or "").strip()
	if not code:
		frappe.throw(_("Nothing was scanned."))

	if frappe.db.exists("Propagation Batch", code):
		return {"kind": "batch", "name": code, "detail": batch_detail(code)}

	# A label that has been through a polytunnel is often read in lower case.
	hit = frappe.db.get_value("Propagation Batch", {"name": ["like", code]}, "name")
	if hit:
		return {"kind": "batch", "name": hit, "detail": batch_detail(hit)}

	if frappe.db.exists("Item", code):
		return {"kind": "variety", "name": code,
				"batches": batches(variety=code)}
	hit = frappe.db.get_value("Item", {"item_name": code}, "name")
	if hit:
		return {"kind": "variety", "name": hit, "batches": batches(variety=hit)}

	return {"kind": "unknown", "code": code}


# --------------------------------------------------------------------- logs
@frappe.whitelist()
def diseases(search=None):
	"""What can be reported, so the phone offers a list rather than free text."""
	_guard()
	filters = {}
	if search:
		filters["common_name"] = ["like", "%%%s%%" % search]
	return frappe.get_all("Disease", filters=filters,
						  fields=["name", "common_name", "scientific_name"],
						  order_by="common_name asc", limit=50)


@frappe.whitelist()
def disease_log(unit=None, batch=None, limit=50):
	"""Scouting rounds, newest first."""
	_guard()
	filters = {"activity_type": "Disease / Scouting"}
	if batch:
		filters["propagation_batch"] = batch
	elif unit:
		filters["greenhouse"] = unit
	if not frappe.db.has_column("Daily Propagation Log", "disease"):
		return []
	return frappe.get_all(
		"Daily Propagation Log", filters=filters,
		fields=["name", "log_date", "propagation_batch", "rose_variety",
				"disease", "severity", "affected_qty", "treatment_applied",
				"observations", "greenhouse", "logged_by"],
		order_by="log_date desc, creation desc", limit=cint(limit) or 50)


@frappe.whitelist()
def add_log(propagation_batch, activity_type, log_date=None, qty_done_today=0,
            mortality_today=0, observations=None, weather_conditions=None,
            disease=None, severity=None, affected_qty=0, treatment_applied=None,
            scan_barcode=None):
	"""Write one log against a batch.

	The controller fills in the variety, the unit and the running totals off the
	batch, so nothing here is passed that the batch already knows -- a figure
	typed twice is a figure that can disagree with itself.
	"""
	_guard()
	if not frappe.db.exists("Propagation Batch", propagation_batch):
		frappe.throw(_("No such batch: {0}").format(propagation_batch))
	if activity_type == "Disease / Scouting" and not disease:
		frappe.throw(_("Say which disease was found."))

	doc = frappe.new_doc("Daily Propagation Log")
	doc.propagation_batch = propagation_batch
	doc.activity_type = activity_type
	doc.log_date = getdate(log_date) if log_date else getdate(today())
	doc.qty_done_today = cint(qty_done_today)
	doc.mortality_today = cint(mortality_today)
	doc.observations = observations
	doc.weather_conditions = weather_conditions
	doc.scan_barcode = scan_barcode
	if activity_type == "Disease / Scouting":
		doc.disease = disease
		doc.severity = severity
		doc.affected_qty = cint(affected_qty)
		doc.treatment_applied = treatment_applied
	doc.insert()
	return {"name": doc.name, "log_date": str(doc.log_date),
			"activity_type": doc.activity_type,
			"batch": doc.propagation_batch}
