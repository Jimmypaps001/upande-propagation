# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Eryngium Supernova 2025, gate to farm, reconciled to the tracking sheet.

	bench --site <site> execute \\
		upande_propagation.console.check_eryngium_2025.main

Driven only through what the two interfaces drive: the app's whitelisted
surface for everything the unit does, and the desk's own workflow actions and
controllers for the master data, the plan, and the farm's crop cycle. Nothing
is written here that a person could not write from one of those two places.

The spreadsheet is the acceptance criterion, not this script. Where a figure
disagrees with it the difference is printed rather than smoothed over.

Nothing is left behind: the last line is a rollback.
"""

import json
import time
import traceback

import frappe
from frappe.model.workflow import apply_workflow

from upande_propagation.mobile import api as app
from upande_propagation.upande_propagation.doctype.plant_consignment import (
	plant_consignment as pcmod,
)

SHEET = ("/tmp/claude-1000/-home-james-frappe-bench-v16/"
         "c1fc7388-0d21-4d04-aaa8-ac40c6d463aa/scratchpad/supernova2025.json")

VARIETY = "Eryngium Supernova Questar"
ROOTS = "Eryngium Supernova Questar Roots"
UNIT = "Torongo CSU Phase 1 - KGOC"
FARMS = {"KD": "Kudenga", "KN": "Kariki Naivasha"}
FORM_ITEM = {"TC": VARIETY, "Roots": ROOTS}
# The sheet writes the lab's short name; the ledger carries its registered one.
SUPPLIER_ALIAS = {"Stokman": "STOKMAN ROZEN KENYA LTD"}

PASS, FAIL, NOTE = [], [], []


def ck(label, cond, extra=""):
	(PASS if cond else FAIL).append(label)
	print(("  ok   " if cond else "  FAIL ") + label
	      + ((" -- " + str(extra)) if extra else ""), flush=True)


def nt(msg):
	NOTE.append(msg)
	print("  ..   " + msg, flush=True)


def monday(year, week):
	import datetime
	return datetime.date.fromisocalendar(int(year), max(1, min(53, int(week))), 1)


def main():
	t0 = time.time()
	ship = json.load(open(SHEET))
	company = frappe.db.get_value("Warehouse", UNIT, "company")
	print("%d shipments | %s | %s\n" % (len(ship), UNIT, company), flush=True)

	# -------------------------------------------- 1. DESK: approve the varieties
	print("=== 1. DESK: Item Approval workflow ===", flush=True)
	for v in (VARIETY, ROOTS):
		d = frappe.get_doc("Item", v)
		try:
			if d.workflow_state == "Draft":
				d = apply_workflow(d, "Submit for Approval")
			if d.workflow_state in ("Pending Approval", "Rejected"):
				d = apply_workflow(d, "Approve")
		except Exception as e:
			nt("%s: %s" % (v, str(e)[:90]))
		st = frappe.db.get_value("Item", v, ["workflow_state", "disabled"], as_dict=True)
		ck("%s approved and enabled" % v,
		   st.workflow_state == "Approved" and not st.disabled, dict(st))

	# ------------------------------------------------------- 2. DESK: the labs
	print("\n=== 2. DESK: a supplier for every source ===", flush=True)
	sup = {}
	for s in sorted({x["source"] for x in ship}):
		name = (frappe.db.get_value("Supplier", {"supplier_name": SUPPLIER_ALIAS.get(s, s)}, "name")
		        or frappe.db.get_value("Supplier", {"supplier_name": ["like", "%%%s%%" % s]}, "name"))
		if not name:
			d = frappe.new_doc("Supplier")
			d.supplier_name = s
			d.supplier_group = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
			d.default_currency = frappe.get_cached_value("Company", company, "default_currency")
			# The site's Supplier Management script and the doctype both insist
			# on these. Placeholders here; that a "Roots" supplier has to be
			# invented at all is a finding, not a detail -- root shipments have
			# no lab behind them in the sheet, only the word "Roots".
			d.country = frappe.db.get_value("Company", company, "country") or "Kenya"
			d.tax_id = "REHEARSAL-%s" % s.upper()[:8]
			d.append("accounts", {"company": company,
			                      "account": frappe.db.get_value(
				                      "Company", company, "default_payable_account")})
			d.insert(ignore_permissions=True)
			name = d.name
			nt("invented supplier %r -- not on file" % s)
		sup[s] = name
		print("    %-12s -> %s" % (s, name), flush=True)
	ck("every source maps to a supplier", all(sup.values()), sup)

	# ------------------------------------------ 3. DESK: the 2025 plan chain
	print("\n=== 3. DESK: demand -> production plan -> propagation plan ===", flush=True)
	plan = None
	try:
		md = frappe.new_doc("Summer Flower Market Demand")
		md.variety, md.farm, md.company = VARIETY, FARMS["KD"], company
		md.target_years_ahead = 1
		md.insert(ignore_permissions=True)
		pp = frappe.new_doc("Summer Flower Production Plan")
		pp.variety, pp.farm = VARIETY, FARMS["KD"]
		pp.market_demand, pp.season_start_year = md.name, "2025"
		pp.insert(ignore_permissions=True)
		pr = frappe.new_doc("Summer Flower Propagation Plan")
		pr.production_plan, pr.variety, pr.farm = pp.name, VARIETY, FARMS["KD"]
		pr.season, pr.season_start_year, pr.status = "2025", 2025, "Approved"
		for s in ship:
			pr.append("weeks", {
				"year": s["year"], "week_no": s["week"],
				"week_start_date": monday(s["year"], s["week"]),
				"plants_to_stick": s["planned"], "cuttings_required": s["planned"],
				"from_bought": s["planned"], "baseline_plants": s["planned"],
				"deliver_on": monday(s["delivery_year"] or s["year"],
				                     s["delivery_week"] or s["week"])})
		pr.insert(ignore_permissions=True)
		plan = pr.name
		ck("the 2025 plan chain saves", True,
		   "%s -> %s -> %s (%d weeks)" % (md.name, pp.name, pr.name, len(pr.weeks)))
	except Exception:
		ck("the 2025 plan chain saves", False,
		   traceback.format_exc().splitlines()[-1][:170])

	# --------------------------------------- 4. APP: fulfil the 22 shipments
	print("\n=== 4. APP: the shipments, gate to farm ===", flush=True)
	got = dict.fromkeys(
		("received", "accepted", "lost", "g1", "g2", "planted",
		 "consignments", "batches", "dispatches", "cycles", "skipped"), 0)
	errors = []
	whs = [w["name"] for w in app.warehouses(unit=UNIT, limit=500)]
	reject_wh = next((w for w in whs if w != UNIT), None)

	for s in ship:
		tag = "%s w%02d %s %s" % (s["form"], s["week"], s["source"], s["farm_code"])
		if not s["actual"]:
			got["skipped"] += 1
			continue
		try:
			item = FORM_ITEM[s["form"]]
			det = app.new_consignment(
				supplier=sup[s["source"]], variety=item, qty_received=s["actual"],
				arrival_date=monday(s["year"], s["week"]),
				form="Tissue Culture" if s["form"] == "TC" else "Roots",
				warehouse=UNIT, rejected_warehouse=reject_wh, rate=1.0,
				supplier_delivery_note=(s["dnote"] or "DN-%s-%s" % (s["year"], s["week"]))[:40],
				unit=UNIT, submit=1)
			cname = det["consignment"]["name"]
			got["consignments"] += 1
			got["received"] += s["actual"]

			# This site refuses a Purchase Receipt with no paperwork attached.
			frappe.get_doc({
				"doctype": "File", "file_name": "waybill-%s.txt" % cname,
				"attached_to_doctype": "Plant Consignment",
				"attached_to_name": cname, "is_private": 1,
				"content": "waybill %s" % tag}).insert(ignore_permissions=True)

			pcmod.accept(consignment=cname, accepted=s["actual"], rejected=0)
			got["accepted"] += s["actual"]

			b = app.create_batch(plant_consignment=cname, qty=s["actual"],
			                     propagation_unit=UNIT)
			bname = b["batch"]["name"] if isinstance(b.get("batch"), dict) else b.get("name")
			got["batches"] += 1

			if s["lost"]:
				app.record_mortality(
					batches=json.dumps([bname]), qty=s["lost"],
					log_date=monday(s["year"], min(52, s["week"] + 4)),
					observations="hardening losses, %s" % tag)
				got["lost"] += s["lost"]

			farm = FARMS[s["farm_code"]]
			for grade, qty, wk in (
					("Grade 1", s["grade1"], s["grade1_week"] or s["delivery_week"]),
					("Grade 2", s["grade2"], s["delivery_week"])):
				if not qty:
					continue
				app.dispatch_batch(
					propagation_batch=bname, qty_dispatched=qty, farm=farm,
					dispatch_date=monday(s["delivery_year"] or s["year"], wk),
					grade=grade, source_warehouse=UNIT, submit=1)
				got["dispatches"] += 1
				got["g1" if grade == "Grade 1" else "g2"] += qty

			cc = frappe.new_doc("Crop Cycle")
			cc.farm, cc.variety = farm, item
			cc.crop_type, cc.status = "Production", "Active"
			cc.planting_date = monday(s["delivery_year"] or s["year"], s["delivery_week"])
			cc.qty_planted = s["grade1"] + s["grade2"]
			cc.plants_standing = cc.qty_planted
			cc.seedling_source = "In-house Propagation"
			cc.propagation_batch = bname
			cc.insert(ignore_permissions=True)
			got["cycles"] += 1
			got["planted"] += cc.qty_planted
			print("    %-22s -> %s  %s plants" % (tag, cname, s["actual"]), flush=True)
		except Exception as e:
			errors.append("%s: %s" % (tag, str(e).replace("\n", " ")[:130]))
			print("    %-22s !! %s" % (tag, str(e).replace("\n", " ")[:90]), flush=True)

	print("\n  %d shipments with stock, %d skipped (nothing delivered), %d errors"
	      % (got["consignments"], got["skipped"], len(errors)), flush=True)

	# ------------------------------------------------------ 5. reconciliation
	print("\n=== 5. reconcile against the tracking sheet ===", flush=True)
	exp = {k: sum(x[k] for x in ship) for k in ("actual", "lost", "grade1", "grade2")}
	for label, e, a in (("received", exp["actual"], got["received"]),
	                    ("lost on the bench", exp["lost"], got["lost"]),
	                    ("grade 1 to the farm", exp["grade1"], got["g1"]),
	                    ("grade 2 to the farm", exp["grade2"], got["g2"]),
	                    ("planted at the farms",
	                     exp["grade1"] + exp["grade2"], got["planted"])):
		ck("%-22s" % label, e == a, "sheet %s / ERP %s (%+d)" % (e, a, a - e))
	print("  wrote: %d consignments, %d batches, %d dispatches, %d crop cycles"
	      % (got["consignments"], got["batches"], got["dispatches"], got["cycles"]),
	      flush=True)
	if errors:
		print("\n  errors:", flush=True)
		for e in errors[:12]:
			print("   !", e, flush=True)

	print("\n%d passed, %d failed, %d notes, %.0fs"
	      % (len(PASS), len(FAIL), len(NOTE), time.time() - t0), flush=True)
	for f in FAIL:
		print("  failed:", f, flush=True)
	frappe.db.rollback()
	print("ROLLED BACK -- the site is unchanged", flush=True)
	return not FAIL
