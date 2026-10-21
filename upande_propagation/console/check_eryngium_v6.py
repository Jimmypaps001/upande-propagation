# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""A fresh Eryngium plan on the protocol in force, fulfilled gate to farm.

	bench --site <site> execute \\
		upande_propagation.console.check_eryngium_v6.main

Builds a new propagation plan against the CURRENT protocol version -- the four
existing ones are pinned to superseded versions that carry no lifts and no
grades -- then fulfils it through the surfaces the two interfaces use, and
reconciles every figure back to the protocol it came from.

Every number is read from that protocol: the survival rate, the grade split,
the lift waves and their shares, the TC/Roots route split, the sticking to
planting gap. Nothing is hard-coded. A check carrying its own copy of the
numbers only ever proves itself right.

The chain is the real one, including the step the earlier run skipped:

    consignment -> check -> batch -> losses -> lifts -> graded dispatch
                -> planting calendar -> crop cycle

Nothing is left behind: the last line is a rollback.
"""

import json
import time
import traceback

import frappe
from frappe.utils import add_days, cint, flt

from upande_propagation.mobile import api as app
from upande_propagation.upande_propagation.doctype.plant_consignment import (
	plant_consignment as pcmod,
)

VARIETY = "Eryngium Supernova Questar"
FARM = "Kariki Molo"
UNIT = "Torongo CSU Phase 1 - KGOC"
SUPPLIER = "Iribov"
WEEKS_TO_RUN = 6          # enough to prove the chain without writing 27 ledgers

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
	return datetime.date.fromisocalendar(int(year), max(1, min(52, int(week))), 1)


def split(total, shares):
	"""Split a whole number by percentage shares without losing a plant.

	The last share takes the remainder, so the parts always add back to the
	total. Rounding each share independently loses or invents plants, and a
	chain that cannot add up is worse than one that is slightly uneven.
	"""
	out, used = [], 0
	for i, s in enumerate(shares):
		if i == len(shares) - 1:
			out.append(total - used)
		else:
			part = int(round(total * flt(s) / 100.0))
			out.append(part)
			used += part
	return out


def main():
	t0 = time.time()
	company = frappe.db.get_value("Warehouse", UNIT, "company")

	# ------------------------------------------------- the protocol in force
	version = frappe.db.get_value("Crop Protocol Version",
	                              {"variety": VARIETY, "farm": FARM, "is_current": 1},
	                              "name")
	ck("there is a current protocol for %s at %s" % (VARIETY, FARM), bool(version), version)
	if not version:
		return False
	p = frappe.get_doc("Crop Protocol Version", version)

	survival = flt(p.rooting_success_pct) / 100.0
	gap = cint(p.sticking_to_planting_weeks)
	grades = [(g.grade, flt(g.allocation_pct)) for g in (p.grade_allocation or [])]
	tc_lifts = sorted([L for L in (p.lifts or []) if L.form == "Tissue Culture"],
	                  key=lambda L: cint(L.lift_no))
	route = {r.stage: flt(r.share_pct) for r in (p.material_route or []) if flt(r.share_pct)}

	print("\n=== the protocol everything below is derived from ===", flush=True)
	print("  %s (%s, current=%s)" % (p.name, p.version_status, p.is_current), flush=True)
	print("  survival %.0f%% | sticking->planting %s wk | route %s"
	      % (survival * 100, gap, route), flush=True)
	print("  grades: %s" % ", ".join("%s %.0f%%" % g for g in grades), flush=True)
	print("  TC lifts: %s" % ", ".join("#%s @%swk %.1f%%"
	      % (L.lift_no, L.weeks_after_arrival, L.share_pct) for L in tc_lifts), flush=True)

	ck("the protocol states a survival rate", survival > 0, survival)
	ck("the protocol allocates grades", bool(grades), len(grades))
	ck("grade shares total 100%", abs(sum(s for _, s in grades) - 100) < 0.01,
	   sum(s for _, s in grades))
	ck("the protocol defines TC lifts", bool(tc_lifts), len(tc_lifts))
	ck("TC lift shares total 100%",
	   abs(sum(flt(L.share_pct) for L in tc_lifts) - 100) < 0.01,
	   sum(flt(L.share_pct) for L in tc_lifts))

	# ------------------------------------------- the ledger this company needs
	woke = []
	for f in ("stock_received_but_not_billed", "stock_adjustment_account",
	          "expenses_included_in_valuation", "default_inventory_account"):
		acc = frappe.db.get_value("Company", company, f)
		if acc and frappe.db.get_value("Account", acc, "disabled"):
			frappe.db.set_value("Account", acc, "disabled", 0)
			woke.append(acc)
	if woke:
		nt("enabled %d account(s) for this run only: %s" % (len(woke), ", ".join(woke)))

	# ------------------------------------------------------- a new plan on v6
	print("\n=== a new plan, on the protocol in force ===", flush=True)
	plan = None
	try:
		# The weeks are not ours to invent: the controller derives them from the
		# production plan's proposed plantings, so a plan built on a production
		# plan with no blocks saves with no weeks at all. Reuse the production
		# plan the existing propagation plan was built from -- same 27 plantings,
		# same 940,224 plants -- and let the controller do its own work.
		src = frappe.get_doc("Summer Flower Propagation Plan", "SFPROP-2026-00013")
		prod = src.production_plan
		blocks = frappe.db.count("Summer Flower Plan Block",
		                         {"parent": prod, "is_new_planting": 1})
		ck("the production plan has plantings to raise for", blocks > 0,
		   "%s carries %d new planting(s)" % (prod, blocks))

		# One propagation plan per variety per season, by design -- a second
		# would size the same bench twice. Retire the incumbent for the length
		# of this run so the replacement can be built the way a planner would.
		frappe.db.set_value("Summer Flower Propagation Plan", src.name,
		                    "status", "Rejected")
		nt("retired %s for this run so a replacement can be built" % src.name)

		pr = frappe.new_doc("Summer Flower Propagation Plan")
		pr.production_plan = prod
		pr.status = "Approved"
		pr.insert(ignore_permissions=True)
		plan = frappe.get_doc("Summer Flower Propagation Plan", pr.name)
		ck("a replacement plan saves", True,
		   "%s, %d week(s)" % (plan.name, len(plan.weeks)))

		# The guard this check was missing. Without it a plan that saved with no
		# weeks sailed through every tally below, because nothing compared to
		# nothing is always equal, and the run reported a clean pass having done
		# precisely nothing.
		ck("the replacement plan has weeks to work from", len(plan.weeks) > 0,
		   "%d week(s)" % len(plan.weeks))
		if not plan.weeks:
			frappe.db.rollback()
			return False

		ck("the replacement picked up the protocol in force",
		   plan.protocol == version,
		   "plan %s vs current %s" % (plan.protocol, version))
		ck("it carries the same plantings as the plan it replaces",
		   cint(plan.total_plants_to_stick) == cint(src.total_plants_to_stick),
		   "%s vs %s" % (plan.total_plants_to_stick, src.total_plants_to_stick))

		# Only the first few weeks are fulfilled: the chain is what is under
		# test, not the patience of whoever reads the output.
		plan.weeks = plan.weeks[:WEEKS_TO_RUN]
	except Exception:
		ck("a replacement plan saves", False,
		   traceback.format_exc().splitlines()[-1][:170])
		frappe.db.rollback()
		return False

	# -------------------------------------------------------------- fulfil it
	print("\n=== fulfilment, week by week ===", flush=True)
	whs = [w["name"] for w in app.warehouses(unit=UNIT, limit=500)]
	reject_wh = next((w for w in whs if w != UNIT), None)
	tally = dict.fromkeys(("ordered", "received", "lost", "survived", "dispatched",
	                       "planted", "consignments", "batches", "dispatches",
	                       "calendars", "cycles"), 0)
	by_grade = {}
	errors = []

	for w in plan.weeks:
		need = cint(w.plants_to_stick)
		# What must arrive so that `need` survives, at the protocol's own rate.
		gross = int(round(need / survival)) if survival else need
		lost = gross - need
		tag = "%s-W%02d" % (w.year, cint(w.week_no))
		try:
			det = app.new_consignment(
				supplier=SUPPLIER, variety=VARIETY, qty_received=gross,
				arrival_date=w.week_start_date, form="Tissue Culture",
				warehouse=UNIT, rejected_warehouse=reject_wh, rate=1.0,
				supplier_delivery_note="DN-%s" % tag, unit=UNIT, submit=1)
			cname = det["consignment"]["name"]
			tally["consignments"] += 1
			tally["ordered"] += gross
			tally["received"] += gross

			frappe.get_doc({
				"doctype": "File", "file_name": "waybill-%s.txt" % cname,
				"attached_to_doctype": "Plant Consignment",
				"attached_to_name": cname, "is_private": 1,
				"content": "waybill %s" % tag}).insert(ignore_permissions=True)

			pcmod.accept(consignment=cname, accepted=gross, rejected=0)

			b = app.create_batch(plant_consignment=cname, qty=gross,
			                     propagation_unit=UNIT)
			bname = b["batch"]          # a name, not a dict
			tally["batches"] += 1

			if lost:
				app.record_mortality(
					batches=json.dumps([bname]), qty=lost,
					log_date=add_days(w.week_start_date, 7),
					observations="%.0f%% survival per %s" % (survival * 100, p.name))
				tally["lost"] += lost
			tally["survived"] += need

			# The survivors come off in the protocol's lift waves, and each
			# wave is graded by the protocol's own allocation.
			wave_qty = split(need, [flt(L.share_pct) for L in tc_lifts])
			sent = 0
			for L, qty in zip(tc_lifts, wave_qty):
				if qty <= 0:
					continue
				when = add_days(w.week_start_date, cint(L.weeks_after_arrival) * 7)
				parts = split(qty, [s for _, s in grades])
				for (gname, _s), gqty in zip(grades, parts):
					if gqty <= 0:
						continue
					app.dispatch_batch(
						propagation_batch=bname, qty_dispatched=gqty, farm=FARM,
						dispatch_date=when, grade=gname, source_warehouse=UNIT,
						submit=1)
					tally["dispatches"] += 1
					tally["dispatched"] += gqty
					by_grade[gname] = by_grade.get(gname, 0) + gqty
					sent += gqty

			# the step the earlier run skipped
			cal = frappe.new_doc("Planting Calendar")
			cal.variety, cal.farm, cal.company = VARIETY, FARM, company
			cal.crop_protocol_version = version
			cal.planting_year, cal.planting_week = w.year, cint(w.week_no)
			cal.sticking_date = w.week_start_date
			cal.planting_date = w.deliver_on
			cal.plants = need
			cal.plants_received = sent
			cal.seedling_source = "In-house Propagation"
			cal.propagation_batch = bname
			cal.insert(ignore_permissions=True)
			tally["calendars"] += 1

			cc = frappe.new_doc("Crop Cycle")
			cc.farm, cc.variety, cc.company = FARM, VARIETY, company
			cc.crop_type, cc.status = "Production", "Active"
			cc.planting_date = w.deliver_on
			cc.qty_planted = cc.plants_standing = sent
			cc.seedling_source = "In-house Propagation"
			cc.propagation_batch = bname
			cc.insert(ignore_permissions=True)
			frappe.db.set_value("Planting Calendar", cal.name, "crop_cycle", cc.name)
			tally["cycles"] += 1
			tally["planted"] += sent

			print("  %-10s need %7s  order %7s  lose %6s  send %7s  %s / %s / %s"
			      % (tag, need, gross, lost, sent, bname, cal.name, cc.name), flush=True)
		except Exception as e:
			msg = str(e).replace("\n", " ")[:120]
			errors.append("%s: %s" % (tag, msg))
			print("  %-10s !! %s" % (tag, msg), flush=True)

	# ------------------------------------------------------- does it all tally
	print("\n=== does it tally? ===", flush=True)
	need_total = sum(cint(w.plants_to_stick) for w in plan.weeks)
	print("  ordered %s | received %s | lost %s | survived %s | dispatched %s | planted %s"
	      % tuple("{:,}".format(tally[k]) for k in
	              ("ordered", "received", "lost", "survived", "dispatched", "planted")),
	      flush=True)
	print("  by grade: %s" % ", ".join("%s %s" % (g, "{:,}".format(q))
	                                   for g, q in sorted(by_grade.items())), flush=True)

	ck("every week was received", tally["consignments"] == len(plan.weeks),
	   "%d of %d" % (tally["consignments"], len(plan.weeks)))
	ck("received minus lost equals what survived",
	   tally["received"] - tally["lost"] == tally["survived"],
	   "%s - %s != %s" % (tally["received"], tally["lost"], tally["survived"]))
	ck("what survived is what the plan asked to stick",
	   tally["survived"] == need_total, "%s vs %s" % (tally["survived"], need_total))
	ck("everything that survived was dispatched",
	   tally["dispatched"] == tally["survived"],
	   "%s vs %s" % (tally["dispatched"], tally["survived"]))
	ck("the grades add back to the dispatches",
	   sum(by_grade.values()) == tally["dispatched"],
	   "%s vs %s" % (sum(by_grade.values()), tally["dispatched"]))
	ck("what reached the farm was planted",
	   tally["planted"] == tally["dispatched"],
	   "%s vs %s" % (tally["planted"], tally["dispatched"]))
	ck("a planting calendar row exists for every week",
	   tally["calendars"] == len(plan.weeks),
	   "%d of %d" % (tally["calendars"], len(plan.weeks)))
	ck("a crop cycle exists for every week", tally["cycles"] == len(plan.weeks),
	   "%d of %d" % (tally["cycles"], len(plan.weeks)))

	# the grade split must be the protocol's, within a plant per week of rounding
	for gname, share in grades:
		want = tally["dispatched"] * share / 100.0
		got = by_grade.get(gname, 0)
		ck("grade %s is %.0f%% of what went out" % (gname, share),
		   abs(got - want) <= len(plan.weeks) * len(tc_lifts),
		   "%s vs %.0f expected" % ("{:,}".format(got), want))

	cal_total = frappe.db.sql("""select sum(plants), sum(plants_received)
		from `tabPlanting Calendar` where crop_protocol_version=%s""", version)[0]
	ck("the planting calendar carries the plan's own figure",
	   cint(cal_total[0]) == need_total,
	   "calendar %s vs plan %s" % (cal_total[0], need_total))
	ck("the calendar's received equals what was dispatched",
	   cint(cal_total[1]) == tally["dispatched"],
	   "calendar %s vs dispatched %s" % (cal_total[1], tally["dispatched"]))
	ck("every calendar row cites the current protocol",
	   not frappe.db.exists("Planting Calendar",
	                        {"variety": VARIETY, "crop_protocol_version": ["!=", version]}))

	if errors:
		print("\n=== errors ===", flush=True)
		for e in errors:
			print("   !", e, flush=True)

	print("\n%d passed, %d failed, %d notes, %.0fs"
	      % (len(PASS), len(FAIL), len(NOTE), time.time() - t0), flush=True)
	for f in FAIL:
		print("  failed:", f, flush=True)
	frappe.db.rollback()
	print("ROLLED BACK -- the site is unchanged", flush=True)
	return not FAIL
