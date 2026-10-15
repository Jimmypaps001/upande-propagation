# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""The day in the propagation unit: arrivals, batches, moves, dispatches.

Everything here is a thin shell over documents that already exist. An arrival is
a Plant Consignment, a move is Propagation Batch.advance_stage, mortality is a
Daily Propagation Log and a dispatch is a Seedling Dispatch. Nothing is
recomputed and no figure is stored twice.

What this adds is the shape of the work rather than the shape of the schema: a
unit does not move one batch, it moves the bench -- six trays that finished
callusing together go to rooting together -- so move_batches takes a list, does
them one at a time, and says plainly which ones would not go and why. A loop on
the phone would have given six separate round trips, six separate failures and
no way to tell a partial move from a total one.

Nothing here is whitelisted. upande_propagation.mobile.api is the one HTTP
surface the app knows about, and a second whitelisted name for the same function
is a second thing to keep in step with it -- and one that can be called with
arguments the mobile wrapper would have refused.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate, today

from upande_propagation.upande_propagation.doctype.plant_consignment.plant_consignment import (
	PROPAGATABLE_FORMS,
)
from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	COMPLETED,
	STAGE_SEQUENCE,
	advance_stage,
	stage_index,
)

PLANT_GROUP_FALLBACK = "Summer Flowers"


def _guard(doctype="Propagation Batch", perm="read"):
	if frappe.session.user == "Guest":
		frappe.throw(_("Please sign in."), frappe.PermissionError)
	if not frappe.has_permission(doctype, perm):
		frappe.throw(_("You are not permitted to do that."), frappe.PermissionError)


def _clean(exc):
	"""A thrown message, without the HTML Frappe wraps its links in."""
	import re

	msg = getattr(exc, "message", None) or str(exc)
	msg = re.sub(r"<[^>]+>", "", frappe.utils.strip_html_tags(msg) or msg)
	return (msg or _("could not be moved")).strip()


def plant_item_group():
	return frappe.db.get_single_value(
		"Propagation Settings", "seedling_item_group") or PLANT_GROUP_FALLBACK


# ------------------------------------------------------------------- the pickers
def varieties(search=None, limit=50):
	"""The items a consignment can be of: plant material, nothing else."""
	_guard()
	filters = {"item_group": plant_item_group(), "disabled": 0}
	if search:
		filters["item_name"] = ["like", "%%%s%%" % search]
	return frappe.get_all("Item", filters=filters,
	                      fields=["name", "item_name", "stock_uom", "item_group"],
	                      order_by="item_name asc", limit=cint(limit) or 50)


def suppliers(search=None, limit=50):
	"""Suppliers, newest-used first, because a unit buys from the same few labs."""
	_guard()
	filters = {"disabled": 0}
	if search:
		filters["supplier_name"] = ["like", "%%%s%%" % search]
	recent = frappe.get_all(
		"Plant Consignment", filters={"docstatus": ["<", 2]},
		fields=["supplier"], order_by="creation desc", limit=200)
	seen, order = set(), []
	for r in recent:
		if r.supplier and r.supplier not in seen:
			seen.add(r.supplier)
			order.append(r.supplier)
	rows = frappe.get_all("Supplier", filters=filters,
	                      fields=["name", "supplier_name", "supplier_group"],
	                      order_by="supplier_name asc", limit=cint(limit) or 50)
	rows.sort(key=lambda r: (order.index(r["name"]) if r["name"] in seen else 999,
	                         r["supplier_name"] or ""))
	for r in rows:
		r["used_before"] = r["name"] in seen
	return rows


def warehouses(search=None, units_only=0, limit=50):
	"""Where plants can be received, or benched."""
	_guard()
	filters = {"is_group": 0, "disabled": 0}
	if cint(units_only):
		filters["custom_prop_is_unit"] = 1
	if search:
		filters["name"] = ["like", "%%%s%%" % search]
	return frappe.get_all(
		"Warehouse", filters=filters,
		fields=["name", "warehouse_name", "company",
		        "custom_prop_is_unit as is_unit",
		        "custom_prop_capacity_plants as capacity_plants"],
		order_by="custom_prop_is_unit desc, name asc", limit=cint(limit) or 50)


def next_consignment_code(arrival_date=None):
	"""What the next arrival on this date would be numbered. Shown before saving."""
	_guard()
	from upande_propagation.upande_propagation.doctype.plant_consignment.plant_consignment import (
		consignment_code,
		next_name,
	)
	_name, code = next_name(consignment_code(arrival_date))
	return {"consignment": code, "arrival_date": str(getdate(arrival_date or today()))}


# ---------------------------------------------------------------------- arrivals
def consignments(status=None, variety=None, supplier=None, from_date=None,
                 to_date=None, limit=60):
	"""The arrivals history -- what the arrivals screen opens on."""
	_guard("Plant Consignment")
	filters = {"docstatus": ["<", 2]}
	if status:
		filters["status"] = status
	if variety:
		filters["variety"] = variety
	if supplier:
		filters["supplier"] = supplier
	if from_date:
		filters["arrival_date"] = [">=", getdate(from_date)]
	if to_date:
		filters["arrival_date"] = (["between", [getdate(from_date), getdate(to_date)]]
		                           if from_date else ["<=", getdate(to_date)])
	rows = frappe.get_all(
		"Plant Consignment", filters=filters,
		fields=["name", "consignment", "arrival_date", "supplier", "variety",
		        "variety_name", "form", "qty_received", "qty_accepted",
		        "qty_rejected", "qty_unbatched", "batches_created", "qc_status",
		        "status", "warehouse", "purchase_receipt", "docstatus"],
		order_by="arrival_date desc, creation desc", limit=cint(limit) or 60)
	for r in rows:
		r["supplier_name"] = frappe.get_cached_value(
			"Supplier", r["supplier"], "supplier_name") if r["supplier"] else None
		r["arrival_date"] = str(r["arrival_date"]) if r["arrival_date"] else None
	return rows


def consignment_detail(consignment):
	"""One arrival, with its check sheet and everything raised off it."""
	_guard("Plant Consignment")
	from upande_propagation.upande_propagation.doctype.plant_consignment.plant_consignment import (
		check_sheet,
	)

	doc = frappe.get_doc("Plant Consignment", consignment)
	doc.check_permission("read")
	payload = doc.as_dict()
	for key in ("arrival_date", "checked_on"):
		if payload.get(key):
			payload[key] = str(payload[key])
	return {
		"consignment": payload,
		"check": check_sheet(consignment),
		"batches": frappe.get_all(
			"Propagation Batch",
			filters={"plant_consignment": consignment, "docstatus": ["<", 2]},
			fields=["name", "batch_title", "current_stage", "start_date",
			        "total_cuttings_planned", "total_survived",
			        "available_to_dispatch", "propagation_unit", "docstatus"],
			order_by="creation asc"),
		"can_batch": (doc.status == "Received"
		              and doc.form in PROPAGATABLE_FORMS
		              and cint(doc.qty_unbatched) > 0),
	}


def new_consignment(supplier, variety, qty_received, arrival_date=None,
                    form="Tissue Culture", warehouse=None, rejected_warehouse=None,
                    rate=0, supplier_delivery_note=None, uom=None,
                    propagation_plan=None, notes=None, company=None,
                    submit=1):
	"""Write down a delivery. Supplier, variety, quantity -- and it has a number.

	Submitted by default: an arrival that sits in draft is one the unit has to
	remember to come back to, and the number it was given at the gate is already
	on the paperwork.
	"""
	_guard("Plant Consignment", "create")
	doc = frappe.new_doc("Plant Consignment")
	doc.arrival_date = getdate(arrival_date or today())
	doc.supplier = supplier
	doc.variety = variety
	doc.form = form
	doc.qty_received = cint(qty_received)
	doc.uom = uom
	doc.rate = flt(rate)
	doc.warehouse = warehouse
	doc.rejected_warehouse = rejected_warehouse
	doc.supplier_delivery_note = supplier_delivery_note
	doc.propagation_plan = propagation_plan
	doc.notes = notes
	doc.company = company
	doc.insert()
	if cint(submit):
		doc.submit()
	return consignment_detail(doc.name)


# ----------------------------------------------------------------------- batches
def create_batch(plant_consignment, qty=None, propagation_unit=None,
                 propagation_method="Own-root Cutting", start_date=None,
                 seedling_request=None, notes=None, submit=1):
	"""Take a received consignment onto the bench as a batch.

	The batch inherits the variety, the unit and its number from the arrival, so
	the only decision here is how many of the delivery this batch is -- a lab
	consignment is often split across two benches and two start dates.
	"""
	_guard("Propagation Batch", "create")
	c = frappe.get_doc("Plant Consignment", plant_consignment)
	if c.status != "Received":
		frappe.throw(_("{0} is {1}. Check it in before benching it.").format(
			c.name, c.status))
	if c.form not in PROPAGATABLE_FORMS:
		frappe.throw(_("{0} arrived as {1}, which does not go onto a bench.")
		             .format(c.name, c.form))

	qty = cint(qty) or cint(c.qty_unbatched)
	if qty <= 0:
		frappe.throw(_("There is nothing left of {0} to batch.").format(c.name))

	doc = frappe.new_doc("Propagation Batch")
	doc.plant_consignment = c.name
	doc.start_date = getdate(start_date or today())
	doc.variety = c.variety
	doc.propagation_method = propagation_method
	# Where the batch starts depends on what turned up. Tissue culture and
	# unrooted cuttings still have to be stuck; rooted material is past that and
	# starting it at Sticking would invite a log of work nobody did.
	doc.current_stage = ("Sticking" if c.form in ("Tissue Culture",
	                                              "Unrooted Cuttings")
	                     else "Nursery" if c.form == "Plants"
	                     else "Rooting")
	doc.total_cuttings_planned = qty
	doc.total_cuttings_received = qty
	doc.propagation_unit = propagation_unit or c.warehouse
	doc.seedling_request = seedling_request
	doc.company = c.company
	doc.notes = notes
	doc.insert()
	if cint(submit):
		doc.submit()
	return {"batch": doc.name, "consignment": c.name, "code": c.consignment,
	        "stage": doc.current_stage, "qty": qty,
	        "unit": doc.propagation_unit, "docstatus": doc.docstatus}


def move_batches(batches, stage=None, on_date=None, propagation_unit=None,
                 notes=None):
	"""Move a bench, not a batch. Each one judged on its own, nothing silently skipped.

	A failure on one does not stop the rest: the plants have physically moved and
	refusing the whole set because one batch is already at that stage would leave
	the unit with five records that disagree with the bench.
	"""
	_guard("Propagation Batch", "write")
	if isinstance(batches, str):
		batches = frappe.parse_json(batches) if batches.strip().startswith("[") \
			else [b.strip() for b in batches.split(",") if b.strip()]
	if not batches:
		frappe.throw(_("Say which batches moved."))
	if stage and stage not in STAGE_SEQUENCE and stage != COMPLETED:
		frappe.throw(_("{0} is not a nursery stage.").format(stage))

	from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
		complete_batch,
	)

	moved, refused = [], []
	for i, name in enumerate(batches):
		# A savepoint per batch: without one, the first refusal would poison the
		# transaction and take the batches that did move down with it.
		point = "move_%d" % i
		frappe.db.savepoint(point)
		try:
			now_at = (complete_batch(name) if stage == COMPLETED
			          else advance_stage(name, stage=stage, notes=notes))
			if propagation_unit:
				frappe.db.set_value("Propagation Batch", name,
				                    "propagation_unit", propagation_unit)
			moved.append({"batch": name, "stage": now_at,
			              "unit": propagation_unit})
		except Exception as e:
			frappe.db.rollback(save_point=point)
			refused.append({"batch": name, "reason": _clean(e)})

	return {"moved": moved, "refused": refused,
	        "stage": stage, "unit": propagation_unit,
	        "on_date": str(getdate(on_date or today()))}


def record_mortality(batches, qty, log_date=None, observations=None):
	"""Losses across one or several batches.

	The quantity is per batch, not split between them: a unit counts the dead
	tray by tray and a figure divided by the server would be a figure nobody
	counted.
	"""
	_guard("Daily Propagation Log", "create")
	if isinstance(batches, str):
		batches = frappe.parse_json(batches) if batches.strip().startswith("[") \
			else [b.strip() for b in batches.split(",") if b.strip()]
	if isinstance(qty, str) and qty.strip().startswith("{"):
		qty = frappe.parse_json(qty)

	written, refused = [], []
	for i, name in enumerate(batches):
		dead = cint(qty.get(name) if isinstance(qty, dict) else qty)
		if dead <= 0:
			continue
		point = "dead_%d" % i
		frappe.db.savepoint(point)
		try:
			doc = frappe.new_doc("Daily Propagation Log")
			doc.propagation_batch = name
			doc.activity_type = "Mortality Count"
			doc.log_date = getdate(log_date or today())
			doc.mortality_today = dead
			doc.observations = observations
			doc.insert()
			written.append({"batch": name, "log": doc.name, "mortality": dead})
		except Exception as e:
			frappe.db.rollback(save_point=point)
			refused.append({"batch": name, "reason": _clean(e)})
	return {"written": written, "refused": refused}


# --------------------------------------------------------------------- dispatch
def dispatch_targets(farm=None):
	"""Where seedlings can go: our farms, and the greenhouses on them."""
	_guard("Seedling Dispatch")
	farms = frappe.get_all("Farm", filters={"disabled": 0},
	                       fields=["name", "farm_name", "company"],
	                       order_by="farm_name asc")
	houses = frappe.get_all(
		"Warehouse", filters={"is_group": 0, "disabled": 0},
		fields=["name", "warehouse_name", "company"], order_by="name asc",
		limit=500)
	requests = frappe.get_all(
		"Seedling Request",
		filters={"docstatus": 1,
		         "status": ["in", ("Submitted", "In Progress", "Partially Fulfilled")]},
		fields=["name", "farm", "required_by_date", "total_qty_requested",
		        "total_qty_dispatched"], order_by="required_by_date asc", limit=50)
	for r in requests:
		r["outstanding"] = max(0, cint(r["total_qty_requested"])
		                       - cint(r["total_qty_dispatched"]))
		r["required_by_date"] = str(r["required_by_date"]) if r["required_by_date"] else None
	return {"farms": farms, "greenhouses": houses, "requests": requests}


def dispatch_batch(propagation_batch, qty_dispatched, target_greenhouse=None,
                   farm=None, dispatch_date=None, grade=None,
                   seedling_request=None, source_warehouse=None, notes=None,
                   submit=1):
	"""Send seedlings to the farm, and move the stock with them."""
	_guard("Seedling Dispatch", "create")
	doc = frappe.new_doc("Seedling Dispatch")
	doc.dispatch_date = getdate(dispatch_date or today())
	doc.purpose = "Internal Planting"
	doc.propagation_batch = propagation_batch
	doc.qty_dispatched = cint(qty_dispatched)
	doc.grade = grade
	doc.farm = farm
	doc.target_greenhouse = target_greenhouse
	doc.source_warehouse = source_warehouse
	doc.seedling_request = seedling_request
	doc.notes = notes
	doc.insert()
	if cint(submit):
		doc.submit()
	doc.reload()
	return {"dispatch": doc.name, "batch": propagation_batch,
	        "qty": cint(doc.qty_dispatched), "stock_entry": doc.stock_entry,
	        "consignment": doc.plant_consignment, "docstatus": doc.docstatus}


# ---------------------------------------------------------------------- reports
def reports(from_date=None, to_date=None, variety=None, farm=None, unit=None):
	"""Consignments in, plants standing, seedlings out -- over one window.

	Three questions a unit manager is asked every week, answered off the same
	documents the screens use, so the report and the screen cannot disagree.
	Stock at hand is the batch rollup, which counts logs rather than typed
	totals: a batch nobody has logged against contributes nothing, deliberately.
	"""
	_guard()
	to_date = getdate(to_date or today())
	from_date = getdate(from_date or add_days(to_date, -90))

	# --- what came in
	cfilters = {"docstatus": 1,
	            "arrival_date": ["between", [from_date, to_date]]}
	if variety:
		cfilters["variety"] = variety
	arrivals = frappe.get_all(
		"Plant Consignment", filters=cfilters,
		fields=["name", "consignment", "arrival_date", "supplier", "variety",
		        "variety_name", "form", "qty_received", "qty_accepted",
		        "qty_rejected", "status", "qc_status"],
		order_by="arrival_date desc")
	for a in arrivals:
		a["arrival_date"] = str(a["arrival_date"])
	received_total = sum(cint(a["qty_received"]) for a in arrivals)
	accepted_total = sum(cint(a["qty_accepted"]) for a in arrivals)
	rejected_total = sum(cint(a["qty_rejected"]) for a in arrivals)

	by_supplier = {}
	for a in arrivals:
		s = by_supplier.setdefault(a["supplier"] or _("unknown"), {
			"supplier": a["supplier"],
			"supplier_name": frappe.get_cached_value(
				"Supplier", a["supplier"], "supplier_name") if a["supplier"] else None,
			"consignments": 0, "received": 0, "accepted": 0, "rejected": 0})
		s["consignments"] += 1
		s["received"] += cint(a["qty_received"])
		s["accepted"] += cint(a["qty_accepted"])
		s["rejected"] += cint(a["qty_rejected"])
	for s in by_supplier.values():
		s["reject_pct"] = (flt(s["rejected"] * 100.0 / s["received"], 1)
		                   if s["received"] else 0.0)

	# --- what is standing
	bfilters = {"docstatus": 1, "current_stage": ["!=", COMPLETED]}
	if variety:
		bfilters["variety"] = variety
	if unit:
		bfilters["propagation_unit"] = unit
	standing = frappe.get_all(
		"Propagation Batch", filters=bfilters,
		fields=["name", "variety", "variety_name", "current_stage",
		        "propagation_unit", "start_date", "total_survived",
		        "total_mortality", "available_to_dispatch",
		        "total_cuttings_planned"])
	on_hand = sum(cint(b["total_survived"]) for b in standing)
	ready = sum(cint(b["available_to_dispatch"]) for b in standing)

	by_stage, by_variety, by_unit = {}, {}, {}
	for b in standing:
		for key, bucket, label in (("current_stage", by_stage, "stage"),
		                           ("variety", by_variety, "variety"),
		                           ("propagation_unit", by_unit, "unit")):
			k = b[key] or _("unassigned")
			row = bucket.setdefault(k, {label: k, "batches": 0, "plants": 0,
			                            "ready": 0, "mortality": 0})
			row["batches"] += 1
			row["plants"] += cint(b["total_survived"])
			row["ready"] += cint(b["available_to_dispatch"])
			row["mortality"] += cint(b["total_mortality"])
	for row in by_variety.values():
		row["variety_name"] = frappe.get_cached_value(
			"Item", row["variety"], "item_name") if row["variety"] else None

	# --- what went out
	dfilters = {"docstatus": 1,
	            "dispatch_date": ["between", [from_date, to_date]]}
	if variety:
		dfilters["variety"] = variety
	if farm:
		dfilters["farm"] = farm
	dispatches = frappe.get_all(
		"Seedling Dispatch", filters=dfilters,
		fields=["name", "dispatch_date", "propagation_batch", "variety",
		        "variety_name", "qty_dispatched", "farm", "target_greenhouse",
		        "purpose", "grade", "stock_entry", "plant_consignment"],
		order_by="dispatch_date desc")
	for d in dispatches:
		d["dispatch_date"] = str(d["dispatch_date"])
	dispatched_total = sum(cint(d["qty_dispatched"]) for d in dispatches)
	by_farm = {}
	for d in dispatches:
		k = d["farm"] or _("unassigned")
		row = by_farm.setdefault(k, {"farm": k, "dispatches": 0, "plants": 0})
		row["dispatches"] += 1
		row["plants"] += cint(d["qty_dispatched"])

	# --- losses over the same window, off the logs rather than the batch totals
	losses = frappe.db.sql("""
		select sum(l.mortality_today) as dead, count(*) as logs
		from `tabDaily Propagation Log` l
		join `tabPropagation Batch` b on b.name = l.propagation_batch
		where l.log_date between %(from_date)s and %(to_date)s
		  and b.docstatus = 1
		  {variety}
	""".format(variety="and b.variety = %(variety)s" if variety else ""),
		{"from_date": from_date, "to_date": to_date, "variety": variety},
		as_dict=True)[0]

	return {
		"window": {"from_date": str(from_date), "to_date": str(to_date),
		           "variety": variety, "farm": farm, "unit": unit},
		"arrivals": {
			"consignments": len(arrivals),
			"received": received_total,
			"accepted": accepted_total,
			"rejected": rejected_total,
			"reject_pct": (flt(rejected_total * 100.0 / received_total, 1)
			               if received_total else 0.0),
			"by_supplier": sorted(by_supplier.values(),
			                      key=lambda r: -r["received"]),
			"rows": arrivals[:60],
		},
		"stock": {
			"batches": len(standing),
			"on_hand": on_hand,
			"ready_to_dispatch": ready,
			"by_stage": [by_stage[s] for s in STAGE_SEQUENCE if s in by_stage],
			"by_variety": sorted(by_variety.values(), key=lambda r: -r["plants"]),
			"by_unit": sorted(by_unit.values(), key=lambda r: -r["plants"]),
		},
		"dispatches": {
			"count": len(dispatches),
			"plants": dispatched_total,
			"by_farm": sorted(by_farm.values(), key=lambda r: -r["plants"]),
			"rows": dispatches[:60],
		},
		"losses": {"plants": cint(losses.dead), "logs": cint(losses.logs)},
	}
