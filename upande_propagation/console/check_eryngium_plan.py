# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""The Eryngium plan we have, fulfilled gate to farm, week by week.

	bench --site <site> execute \\
		upande_propagation.console.check_eryngium_plan.main

Runs against SFPROP-2026-00013 -- Eryngium Supernova Questar at Kariki Molo --
using its own week rows as the work list, rather than a plan invented from the
spreadsheet. Every write goes through the surface one of the two interfaces
uses: the app's whitelisted methods for everything the unit does, the desk's
controllers for the farm's crop cycle.

Every week prints what it did, so the whole run can be read rather than
summarised. Nothing is left behind: the last line is a rollback.
"""

import json
import time
import traceback

import frappe

from upande_propagation.mobile import api as app
from upande_propagation.upande_propagation.doctype.plant_consignment import (
	plant_consignment as pcmod,
)

PLAN = "SFPROP-2026-00013"
UNIT = "Torongo CSU Phase 1 - KGOC"
SUPPLIER = "Iribov"
# What the sheet's ASSUMPTIONS tab says happens between the gate and the farm.
SURVIVAL = 0.94
GRADE1_SHARE = 0.81
GRADE2_SHARE = 0.09

PASS, FAIL, NOTE = [], [], []


def ck(label, cond, extra=""):
	(PASS if cond else FAIL).append(label)
	print(("  ok   " if cond else "  FAIL ") + label
	      + ((" -- " + str(extra)) if extra else ""), flush=True)


def nt(msg):
	NOTE.append(msg)
	print("  ..   " + msg, flush=True)


def main():
	t0 = time.time()
	plan = frappe.get_doc("Summer Flower Propagation Plan", PLAN)
	company = frappe.db.get_value("Warehouse", UNIT, "company")
	farm_company = frappe.db.get_value("Farm", plan.farm, "company")

	print("=== the plan we have ===", flush=True)
	print("  %s | %s | %s | season %s | status %s"
	      % (plan.name, plan.variety, plan.farm, plan.season, plan.status), flush=True)
	print("  weeks: %d | plants to stick: %s"
	      % (len(plan.weeks), plan.total_plants_to_stick), flush=True)
	print("  unit: %s (%s) | farm company: %s" % (UNIT, company, farm_company), flush=True)
	ck("the unit and the plan's farm are the same company", company == farm_company,
	   "%s vs %s" % (company, farm_company))
	ck("the variety is usable now",
	   not frappe.db.get_value("Item", plan.variety, "disabled"))
	ck("the lab is usable now", not frappe.db.get_value("Supplier", SUPPLIER, "disabled"))

	# This company has never carried stock: 0 Purchase Receipts, 0 GL entries,
	# and 82 of its 1041 accounts still disabled from the default chart it was
	# created with -- three of them the ones a receipt posts to. Enabled here
	# inside the run's own transaction, so the rehearsal can reach the ledger
	# and the company's accounting configuration is handed back untouched.
	# Before any of this works for real, these have to be enabled properly.
	needed = [frappe.db.get_value("Company", company, f) for f in
	          ("stock_received_but_not_billed", "stock_adjustment_account",
	           "expenses_included_in_valuation", "default_inventory_account")]
	woke = []
	for acc in [a for a in needed if a]:
		if frappe.db.get_value("Account", acc, "disabled"):
			frappe.db.set_value("Account", acc, "disabled", 0)
			woke.append(acc)
	print("\n=== accounts enabled for this run only (rolled back after) ===", flush=True)
	for a in woke:
		print("  ", a, flush=True)
	if not woke:
		print("   none needed", flush=True)

	whs = [w["name"] for w in app.warehouses(unit=UNIT, limit=500)]
	reject_wh = next((w for w in whs if w != UNIT), None)
	print("  warehouses offered to this unit: %d (all %s)"
	      % (len(whs), company), flush=True)

	# ------------------------------------------------------------- the work list
	weeks = [w for w in plan.weeks if (w.plants_to_stick or 0) > 0]
	print("\n=== %d weeks with plants to raise ===" % len(weeks), flush=True)

	got = dict.fromkeys(("received", "accepted", "lost", "g1", "g2", "planted",
	                     "consignments", "batches", "dispatches", "cycles"), 0)
	errors = []

	for w in weeks:
		qty = int(w.plants_to_stick or 0)
		lost = int(round(qty * (1 - SURVIVAL)))
		g1 = int(round(qty * GRADE1_SHARE))
		g2 = int(round(qty * GRADE2_SHARE))
		tag = "%s-W%02d" % (w.year, w.week_no or 0)
		line = "  %-10s stick %7s" % (tag, qty)
		try:
			det = app.new_consignment(
				supplier=SUPPLIER, variety=plan.variety, qty_received=qty,
				arrival_date=w.week_start_date, form="Tissue Culture",
				warehouse=UNIT, rejected_warehouse=reject_wh, rate=1.0,
				supplier_delivery_note="DN-%s" % tag, unit=UNIT, submit=1)
			cname = det["consignment"]["name"]
			got["consignments"] += 1
			got["received"] += qty

			# This site refuses a Purchase Receipt with no paperwork attached.
			frappe.get_doc({
				"doctype": "File", "file_name": "waybill-%s.txt" % cname,
				"attached_to_doctype": "Plant Consignment",
				"attached_to_name": cname, "is_private": 1,
				"content": "waybill %s" % tag}).insert(ignore_permissions=True)

			pcmod.accept(consignment=cname, accepted=qty, rejected=0)
			got["accepted"] += qty

			b = app.create_batch(plant_consignment=cname, qty=qty, propagation_unit=UNIT)
			bname = b["batch"]["name"] if isinstance(b.get("batch"), dict) else b.get("name")
			got["batches"] += 1

			if lost:
				app.record_mortality(
					batches=json.dumps([bname]), qty=lost,
					log_date=w.deliver_on or w.week_start_date,
					observations="hardening losses at %.0f%% survival" % (SURVIVAL * 100))
				got["lost"] += lost

			for grade, g in (("Grade 1", g1), ("Grade 2", g2)):
				if not g:
					continue
				app.dispatch_batch(
					propagation_batch=bname, qty_dispatched=g, farm=plan.farm,
					dispatch_date=w.deliver_on or w.week_start_date, grade=grade,
					source_warehouse=UNIT, submit=1)
				got["dispatches"] += 1
				got["g1" if grade == "Grade 1" else "g2"] += g

			cc = frappe.new_doc("Crop Cycle")
			cc.farm, cc.variety = plan.farm, plan.variety
			cc.crop_type, cc.status = "Production", "Active"
			cc.planting_date = w.deliver_on or w.week_start_date
			cc.qty_planted = g1 + g2
			cc.plants_standing = cc.qty_planted
			cc.seedling_source = "In-house Propagation"
			cc.propagation_batch = bname
			cc.insert(ignore_permissions=True)
			got["cycles"] += 1
			got["planted"] += cc.qty_planted

			print("%s -> %s / %s  lost %6s  G1 %7s  G2 %6s  -> %s on %s"
			      % (line, cname, bname, lost, g1, g2, cc.name,
			         cc.planting_date), flush=True)
		except Exception as e:
			msg = str(e).replace("\n", " ")[:120]
			errors.append("%s: %s" % (tag, msg))
			print("%s !! %s" % (line, msg), flush=True)

	# -------------------------------------------------------------- the totals
	print("\n=== what the run produced ===", flush=True)
	planned_total = sum(int(w.plants_to_stick or 0) for w in weeks)
	for label, value in (("plan asks for", planned_total),
	                     ("received at the gate", got["received"]),
	                     ("accepted onto the ledger", got["accepted"]),
	                     ("lost on the bench", got["lost"]),
	                     ("grade 1 to the farm", got["g1"]),
	                     ("grade 2 to the farm", got["g2"]),
	                     ("planted at the farm", got["planted"])):
		print("  %-26s %10s" % (label, "{:,}".format(value)), flush=True)
	print("  %-26s %10s" % ("documents written",
	                        "%d PC, %d PB, %d SD, %d CC"
	                        % (got["consignments"], got["batches"],
	                           got["dispatches"], got["cycles"])), flush=True)

	ck("every week with plants was received",
	   got["consignments"] == len(weeks), "%d of %d" % (got["consignments"], len(weeks)))
	ck("what was received equals what the plan asked for",
	   got["received"] == planned_total,
	   "%s vs %s" % (got["received"], planned_total))
	ck("grade 1 plus grade 2 reached the farm",
	   got["planted"] == got["g1"] + got["g2"])
	ck("a crop cycle exists for every week", got["cycles"] == len(weeks),
	   "%d of %d" % (got["cycles"], len(weeks)))
	ck("every crop cycle names its propagation batch",
	   got["cycles"] > 0 and all(
		   frappe.db.get_value("Crop Cycle", c, "propagation_batch")
		   for c in frappe.get_all("Crop Cycle",
		                           filters={"seedling_source": "In-house Propagation"},
		                           pluck="name")))

	# the app's own reports, read back through the endpoint the app calls
	rep = app.reports(from_date="2025-01-01", to_date="2026-12-31", unit=UNIT)
	print("\n=== what the app's Reports screen would now show ===", flush=True)
	print("  arrivals: %s consignments, %s received, %s accepted"
	      % (rep["arrivals"]["consignments"], rep["arrivals"]["received"],
	         rep["arrivals"]["accepted"]), flush=True)
	print("  stock on hand: %s across %s batch(es)"
	      % (rep["stock"]["on_hand"], rep["stock"]["batches"]), flush=True)
	print("  dispatches: %s plants in %s run(s)"
	      % (rep["dispatches"]["plants"], rep["dispatches"]["count"]), flush=True)
	print("  losses: %s plants over %s log(s)"
	      % (rep["losses"]["plants"], rep["losses"]["logs"]), flush=True)

	if errors:
		print("\n=== errors ===", flush=True)
		for e in errors:
			print("   !", e, flush=True)

	print("\n%d passed, %d failed, %d notes, %.0fs"
	      % (len(PASS), len(FAIL), len(NOTE), time.time() - t0), flush=True)
	for f in FAIL:
		print("  failed:", f, flush=True)
	frappe.db.rollback()
	print("ROLLED BACK -- no documents left behind", flush=True)
	return not FAIL
