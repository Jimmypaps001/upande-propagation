# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""The whole arrival chain, against real site data, rolled back at the end.

	bench --site <site> execute \\
		upande_propagation.console.check_arrival_chain.main

Gate to farm in one pass: a delivery is written down and numbered, checked
against the quality template, received onto the ledger, benched as batches,
moved up the stage ladder, logged against, dispatched to a farm with the stock
entry that goes with it, and counted in the reports.

It is written against the site rather than against fixtures on purpose. Every
expensive surprise this chain has produced came from the site and not from the
code -- a mandatory supplier delivery note, a server script demanding the
paperwork be attached, a company default that does not match the warehouse, a
disabled item, a quality threshold nobody signed off. A fixture would have
passed through all five.

Nothing is left behind: the last line is a rollback.
"""

import frappe
from frappe.utils import add_days, today

from upande_propagation import operations as ops
from upande_propagation import protocol_rules as rules
from upande_propagation.upande_propagation.doctype.plant_consignment import (
	plant_consignment as pc,
)

PASS, FAIL = [], []


def check(label, cond, extra=""):
	(PASS if cond else FAIL).append(label)
	print(("  ok   " if cond else "  FAIL ") + label
	      + ((" -- " + str(extra)) if extra else ""))


def main():
	frappe.set_user("Administrator")
	from upande_propagation.patches.v1_0 import seed_arrival_defaults
	seed_arrival_defaults.execute()

	s = frappe.get_single("Propagation Settings")
	print("settings: template=%s entry=%s warehouse=%s" % (
		s.get("quality_inspection_template"), s.get("dispatch_stock_entry_type"),
		s.get("default_receipt_warehouse")))

	# --------------------------------------------------------------- the number
	code = pc.consignment_code("2026-10-14")   # a Wednesday
	check("Wednesday is day 04", code.endswith("-04"), code)
	check("Sunday is day 01", pc.consignment_code("2026-10-11").endswith("-01"),
		pc.consignment_code("2026-10-11"))
	check("Saturday is day 07", pc.consignment_code("2026-10-17").endswith("-07"),
		pc.consignment_code("2026-10-17"))
	check("week number is the ISO one", code.split("-")[1] == "42", code)

	# --------------------------------------------------------------- the pickers
	vs = ops.varieties(limit=5)
	check("varieties are plant items", bool(vs), len(vs))
	sup = ops.suppliers(limit=3)
	check("suppliers come back", bool(sup))
	whs = ops.warehouses(limit=5)
	check("warehouses come back", bool(whs))

	enabled = ops.varieties(limit=200)
	pick = [v for v in enabled if "Eryngium" in (v["item_name"] or "")] or enabled
	variety = pick[0]["name"]
	print("variety under test:", variety)
	supplier = frappe.get_all("Supplier", filters={"disabled": 0}, pluck="name", limit=1)[0]
	unit = "Torongo CSU Phase 1 - KR"
	company = frappe.db.get_value("Warehouse", unit, "company")
	reject_wh = frappe.get_all(
		"Warehouse", filters={"company": company, "is_group": 0, "disabled": 0,
							"name": ["!=", unit]}, pluck="name", limit=1)[0]

	# ---------------------------------------------------------------- the arrival
	res = ops.new_consignment(
		supplier=supplier, variety=variety, qty_received=1000,
		arrival_date=today(), form="Tissue Culture", warehouse=unit,
		rejected_warehouse=reject_wh, rate=12.5,
		supplier_delivery_note="DN-TEST-1", company=company)
	cname = res["consignment"]["name"]
	ccode = res["consignment"]["consignment"]
	print("consignment:", cname, "/", ccode)
	check("consignment named PC-<code>", cname == "PC-" + ccode, cname)
	check("submitted and awaiting check",
		res["consignment"]["status"] == "Awaiting Check",
		res["consignment"]["status"])
	check("check sheet has parameters", len(res["check"]["parameters"]) >= 5,
		len(res["check"]["parameters"]))
	check("sheet names the template", res["check"]["template"], res["check"]["template"])

	# a second one the same day gets a distinct number
	res2 = ops.new_consignment(supplier=supplier, variety=variety, qty_received=10,
							arrival_date=today(), warehouse=unit, company=company,
							supplier_delivery_note="DN-TEST-2")
	check("second arrival that day is numbered apart",
		res2["consignment"]["name"] != cname, res2["consignment"]["name"])

	# ------------------------------------------------------------------ the check
	def sheet(params, fail=None):
		rows = []
		for p in params:
			mid = ((p["min_value"] + p["max_value"]) / 2.0) if p["numeric"] else None
			rows.append({"specification": p["specification"], "numeric": p["numeric"],
						"min_value": p["min_value"], "max_value": p["max_value"],
						"reading_value": (str(mid) if p["numeric"] else "Good"),
						"status": ("Rejected" if p["specification"] == fail
									else "Accepted")})
		return rows


	readings = sheet(res["check"]["parameters"])
	out = ops.consignment_detail(cname)
	check("nothing to batch before the check", not out["can_batch"])
	check("the delivery knows it has no paperwork yet",
	      out["paperwork_needed"] is True and out["attachments"] == [],
	      out["paperwork_needed"])

	# karenroses will not submit a goods receipt without the supplier's paperwork
	# on it, so the gate photo has to travel with the consignment.
	noproof = pc.accept(cname, accepted=900, rejected=100, readings=readings,
						reason="Overheated in transit", rejected_warehouse=reject_wh)
	check("a receipt with no paperwork is held, not crashed",
		noproof["held"] is True, noproof["status"])
	check("and the site's own words come back",
		"attach" in (noproof["message"] or "").lower(), noproof["message"][:90])

	for target in (cname, res2["consignment"]["name"]):
		frappe.get_doc({"doctype": "File", "file_name": "waybill.txt",
						"content": "waybill", "is_private": 1,
						"attached_to_doctype": "Plant Consignment",
						"attached_to_name": target}).insert()

	out = ops.consignment_detail(cname)
	check("and knows once the waybill is on it",
	      out["paperwork_needed"] is False and len(out["attachments"]) == 1,
	      len(out["attachments"]))

	done = pc.accept(cname, accepted=900, rejected=100, readings=readings,
					reason="Overheated in transit", rejected_warehouse=reject_wh)
	print("check:", done)
	check("partially accepted", done["qc_status"] == "Partially Accepted",
		done["qc_status"])
	check("a purchase receipt was raised", done["purchase_receipt"])
	check("a quality inspection was raised", done["quality_inspection"])
	pr = frappe.get_doc("Purchase Receipt", done["purchase_receipt"])
	check("receipt is submitted", pr.docstatus == 1, pr.docstatus)
	check("accepted qty on the receipt", pr.items[0].qty == 900, pr.items[0].qty)
	check("rejected qty on the receipt", pr.items[0].rejected_qty == 100,
		pr.items[0].rejected_qty)
	check("rejected stock went elsewhere",
		pr.items[0].rejected_warehouse == reject_wh, pr.items[0].rejected_warehouse)
	check("the inspection is linked on the line",
		pr.items[0].quality_inspection == done["quality_inspection"])
	check("the gate photo travelled onto the receipt",
	      frappe.db.count("File", {"attached_to_doctype": "Purchase Receipt",
	                               "attached_to_name": pr.name}) >= 1)
	qi = frappe.get_doc("Quality Inspection", done["quality_inspection"])
	check("inspection is submitted", qi.docstatus == 1, qi.docstatus)
	check("inspection carries the readings", len(qi.readings) >= 5, len(qi.readings))

	# a failed reading holds the delivery off the ledger instead of forcing it
	held = pc.accept(res2["consignment"]["name"], accepted=10, rejected=0,
					readings=sheet(res2["check"]["parameters"],
									fail="Pests and Diseases"))
	print("held:", held["status"], held["failed"], "|", held["message"][:80])
	check("a failed reading holds the delivery", held["held"] is True, held["status"])
	check("and names what failed", "Pests and Diseases" in held["failed"], held["failed"])
	check("its receipt stays a draft",
		frappe.db.get_value("Purchase Receipt", held["purchase_receipt"],
							"docstatus") == 0)
	check("nothing of it can be benched",
		frappe.db.get_value("Plant Consignment", res2["consignment"]["name"],
							"qty_unbatched") == 0)
	# re-checking clears the first attempt rather than leaving two receipts
	again = pc.accept(res2["consignment"]["name"], accepted=10, rejected=0,
					readings=sheet(res2["check"]["parameters"]))
	check("re-checking it through receives it", again["status"] == "Received",
		again["status"])
	left = frappe.db.count("Purchase Receipt", {
		"docstatus": 0,
		"name": ["in", [held["purchase_receipt"], again["purchase_receipt"]]]})
	check("no draft receipt was left behind", left == 0, left)
	check("the one receipt that stands is submitted",
		frappe.db.get_value("Purchase Receipt", again["purchase_receipt"],
							"docstatus") == 1)

	detail = ops.consignment_detail(cname)
	check("900 are now batchable", detail["consignment"]["qty_unbatched"] == 900,
		detail["consignment"]["qty_unbatched"])
	check("can_batch is on", detail["can_batch"])

	# ---------------------------------------------------------- stock actually moved
	bin_qty = frappe.db.get_value("Bin", {"item_code": variety, "warehouse": unit},
								"actual_qty")
	check("stock landed in the unit", (bin_qty or 0) >= 900, bin_qty)

	# ------------------------------------------------------------------ the batch
	b = ops.create_batch(cname, qty=500, propagation_unit=unit)
	print("batch:", b)
	check("batch carries the consignment number",
		b["batch"].startswith("PB-" + ccode), b["batch"])
	check("tissue culture starts at sticking", b["stage"] == "Sticking", b["stage"])
	b2 = ops.create_batch(cname, qty=400, propagation_unit=unit)
	check("the rest went into a second batch", b2["batch"] != b["batch"], b2["batch"])
	left = frappe.db.get_value("Plant Consignment", cname, "qty_unbatched")
	check("nothing left to batch", left == 0, left)

	over = None
	try:
		ops.create_batch(cname, qty=50)
	except Exception as e:
		over = str(e)
	check("a batch beyond the delivery is refused", over, (over or "")[:70])

	# ------------------------------------------------------------ what it may record
	acts = rules.batch_activities(b["batch"])
	print("protocol:", acts["protocol"], "route:", acts["route_stages"])
	allowed = set(acts["allowed"])
	print("allowed:", sorted(allowed))
	check("mortality is always allowed", "Mortality Count" in allowed)
	check("scouting is always allowed", "Disease / Scouting" in allowed)
	check("hardening count is not offered mid-nursery",
		"Hardening Count" not in allowed)
	cutting = next(a for a in acts["activities"] if a["activity"] == "Cutting")
	check("cutting is refused on a TC batch, with a reason",
		not cutting["allowed"] and cutting["reason"], cutting["reason"])

	blocked = None
	try:
		frappe.get_doc({"doctype": "Daily Propagation Log",
						"propagation_batch": b["batch"], "activity_type": "Cutting",
						"log_date": today(), "qty_done_today": 10}).insert()
	except Exception as e:
		blocked = str(e)
	check("and the log itself is refused", blocked, (blocked or "")[:80])

	log = frappe.get_doc({"doctype": "Daily Propagation Log",
						"propagation_batch": b["batch"],
						"activity_type": "Sticking", "log_date": today(),
						"qty_done_today": 500}).insert()
	check("sticking is accepted", log.name)

	# ----------------------------------------------------------------- the moves
	mv = ops.move_batches([b["batch"], b2["batch"]], stage="Rooting", notes="bench 3")
	print("move:", mv)
	check("both batches moved", len(mv["moved"]) == 2, mv)
	mv2 = ops.move_batches([b["batch"]], stage="Sticking")
	check("a backwards move is refused and named",
		len(mv2["refused"]) == 1, mv2)
	check("the refusal says why", mv2["refused"][0]["reason"],
		mv2["refused"][0]["reason"][:70])

	# re-home to another trough
	mv3 = ops.move_batches([b["batch"]], stage="Nursery", propagation_unit=reject_wh)
	check("a move can re-home the batch",
		frappe.db.get_value("Propagation Batch", b["batch"], "propagation_unit")
		== reject_wh)
	frappe.db.set_value("Propagation Batch", b["batch"], "propagation_unit", unit)

	# -------------------------------------------------------------------- losses
	dead = ops.record_mortality([b["batch"], b2["batch"]], qty=25)
	check("mortality written to both", len(dead["written"]) == 2, dead)
	surv = frappe.db.get_value("Propagation Batch", b["batch"], "total_survived")
	check("the batch lost 25", surv == 475, surv)

	# ------------------------------------------------------------------ the ladder
	plan = rules.stage_plan(b["batch"])
	check("the ladder has seven rungs", len(plan["ladder"]) == 7, len(plan["ladder"]))
	check("the current rung is marked",
		any(r["state"] == "current" for r in plan["ladder"]))

	# ------------------------------------------------------------------ dispatch
	ops.move_batches([b["batch"]], stage="Hardening")
	targets = ops.dispatch_targets()
	check("dispatch targets come back", targets["farms"] and targets["greenhouses"])
	target_gh = frappe.get_all(
		"Warehouse", filters={"company": company, "is_group": 0, "disabled": 0,
							"name": ["not in", (unit, reject_wh)]},
		pluck="name", limit=1)[0]
	d = ops.dispatch_batch(b["batch"], qty_dispatched=100,
						target_greenhouse=target_gh,
						farm=targets["farms"][0]["name"])
	print("dispatch:", d)
	check("dispatch carries the consignment", d["consignment"] == ccode, d["consignment"])
	if not d["stock_entry"]:
		# The transfer is caught and logged rather than raised, so without this
		# the failure reads as a silent None.
		err = frappe.get_all("Error Log", fields=["error"],
		                     order_by="creation desc", limit=1)
		print("  no transfer. last error log:",
		      (err[0]["error"] or "")[-300:] if err else "nothing logged")
	check("a stock entry moved the plants", d["stock_entry"], d["stock_entry"])
	if d["stock_entry"]:
		se = frappe.get_doc("Stock Entry", d["stock_entry"])
		check("transfer is submitted", se.docstatus == 1)
		check("out of the unit", se.items[0].s_warehouse == unit, se.items[0].s_warehouse)
		check("into the greenhouse", se.items[0].t_warehouse == target_gh,
			se.items[0].t_warehouse)

	# ------------------------------------------------------------------- reports
	rep = ops.reports(from_date=add_days(today(), -7))
	print("reports:", rep["arrivals"]["consignments"], "arrivals /",
		rep["stock"]["on_hand"], "on hand /", rep["dispatches"]["plants"], "out")
	check("the arrival is in the report", rep["arrivals"]["consignments"] >= 1)
	check("received and accepted are both counted",
		rep["arrivals"]["received"] >= 1000 and rep["arrivals"]["accepted"] >= 900,
		(rep["arrivals"]["received"], rep["arrivals"]["accepted"]))
	check("reject percentage is worked out", rep["arrivals"]["reject_pct"] > 0,
		rep["arrivals"]["reject_pct"])
	check("stock at hand splits by stage", rep["stock"]["by_stage"])
	check("the dispatch is counted", rep["dispatches"]["plants"] >= 100,
		rep["dispatches"]["plants"])
	check("losses are counted off the logs", rep["losses"]["plants"] >= 50,
		rep["losses"]["plants"])
	check("by supplier is filled", rep["arrivals"]["by_supplier"])

	# --------------------------------------------------------- the plan calendar
	from upande_summer_flowers.summer_flowers import planning_api as pa
	vlist = pa.propagation_varieties()
	check("plans list has varieties to filter by", bool(vlist), len(vlist))
	if vlist:
		sched = pa.propagation_schedule(variety=vlist[0]["variety"])
		kinds = {e["kind"] for e in sched.get("events", [])}
		print("schedule for", vlist[0]["variety"], ":", len(sched.get("events", [])),
			"events", sorted(kinds))
		check("the schedule has events", sched.get("events"), len(sched.get("events", [])))
		check("it says when to stick", "stick" in kinds or "tc_order" in kinds, kinds)
		check("establishment phases are named", sched.get("phases") is not None)

	print()
	print("%d passed, %d failed (everything rolled back)"
	      % (len(PASS), len(FAIL)))
	for f in FAIL:
		print("  failed:", f)
	frappe.db.rollback()
	return not FAIL
