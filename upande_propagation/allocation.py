# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Splitting a season's plantings between the units that will raise them.

The farm's plan says what to plant and when. It does not say who raises it, and
for most crops the honest answer is "not one place" -- our own unit takes what
its troughs hold and the rest is bought in from propagators, each with its own
lead time and its own delivery schedule.

So an allocation is a list of destinations with a share, and what comes back is
two different documents' worth of answer:

    our own unit     a trough calendar -- what is planted, when, and the lifts
    a propagator     a delivery schedule -- how many, needed by when

What will not fit in our own troughs is not an error. It is the number that
decides how much to buy, and it is returned rather than absorbed.

Nothing is whitelisted here; mobile/api.py is the app's HTTP surface.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate

from upande_propagation import troughs as T


def split(total, shares):
	"""Split a whole number by share, last share taking the remainder."""
	out, used = [], 0
	for i, s in enumerate(shares):
		part = (total - used) if i == len(shares) - 1 \
			else int(round(total * flt(s) / 100.0))
		out.append(part)
		used += part
	return out


def plan_weeks(production_plan):
	"""The plantings a production plan asks for: [(date, plants), ...]."""
	rows = frappe.get_all(
		"Summer Flower Plan Block",
		filters={"parent": production_plan, "is_new_planting": 1},
		fields=["planting_year", "planting_week", "plants", "sticking_year",
		        "sticking_week"], order_by="planting_year, planting_week")
	import datetime
	out = {}
	for r in rows:
		y, w = cint(r.sticking_year) or cint(r.planting_year), \
			cint(r.sticking_week) or cint(r.planting_week)
		if not (y and w):
			continue
		d = datetime.date.fromisocalendar(y, max(1, min(52, w)), 1)
		out[d] = out.get(d, 0) + cint(r.plants)
	return sorted(out.items())


def allocate(production_plan, destinations, form="Roots", version=None):
	"""Share a plan's plantings out, and work each destination through.

	`destinations` is [{"unit": wh} | {"supplier": s}, "share_pct": n].
	Shares are of the plan's plantings, week by week, so a 30% propagator takes
	30% of every week rather than the first 30% of the season -- the weeks are
	not interchangeable, they are dated.
	"""
	pp = frappe.get_doc("Summer Flower Production Plan", production_plan)
	version = version or pp.protocol
	weeks = plan_weeks(production_plan)
	total = sum(q for _d, q in weeks)

	shares = [flt(d.get("share_pct")) for d in destinations]
	if round(sum(shares), 4) != 100:
		frappe.msgprint(_("Shares total {0}%, not 100%. {1} plants are unallocated.")
		                .format(round(sum(shares), 2),
		                        "{:,}".format(int(total * (100 - sum(shares)) / 100))))

	# Split every week, so each destination gets a dated series not a lump.
	per_dest = [dict(d, weeks=[], plants=0) for d in destinations]
	for when, qty in weeks:
		for dest, part in zip(per_dest, split(qty, shares)):
			if part > 0:
				dest["weeks"].append((when, part))
				dest["plants"] += part

	out = {"production_plan": production_plan, "variety": pp.variety,
	       "farm": pp.farm, "protocol": version, "form": form,
	       "season_plants": total, "weeks": len(weeks), "destinations": []}

	for dest in per_dest:
		row = {"share_pct": dest.get("share_pct"), "plants": dest["plants"],
		       "weeks": len(dest["weeks"])}
		if dest.get("unit"):
			row["kind"] = "own unit"
			row["unit"] = dest["unit"]
			s = T.schedule(dest["unit"], version, form, dest["weeks"])
			row["planted"] = s["planted"]
			row["troughs_used"] = len({r["trough"] for r in s["rows"]})
			row["plantings"] = len(s["rows"])
			row["surplus"] = max(0, s["planted"] - dest["plants"])
			row["short"] = sum(q for _d, q in s["unplaced"])
			row["unplaced_weeks"] = s["unplaced"][:5]
			row["hold_weeks"] = s.get("hold_weeks")
			row["reason"] = s.get("reason")
			row["calendar"] = s["rows"][:6]
		else:
			row["kind"] = "propagator"
			row["supplier"] = dest.get("supplier")
			# A bought plant has to be on the farm the week it would have been
			# planted, so the delivery date is the planting date; the order date
			# is that less the supplier's lead, which lives on the protocol.
			lead = cint(frappe.db.get_value("Crop Protocol Version", version,
			                                "supplier_lead_weeks"))
			row["lead_weeks"] = lead
			row["deliveries"] = [
				{"deliver_on": str(getdate(w)), "plants": q,
				 "order_by": str(add_days(getdate(w), -lead * 7))}
				for w, q in dest["weeks"][:6]]
		out["destinations"].append(row)
	return out


def allocate_by_capacity(production_plan, units, suppliers=None,
                         form="Roots", version=None):
	"""Fill our own troughs first, then buy the rest.

	The other way round -- asserting a share and discovering the troughs cannot
	hold it -- produces a plan that looks balanced and is not: a 50% allocation
	to a unit with three turns of four troughs in it is 11% of the season and
	539,000 plants of silent shortfall.

	So each unit is offered the season in turn and takes what its troughs will
	actually hold, week by week, with the calendar respected. What no unit can
	take is what has to be bought, and that number is the output, not an error.
	"""
	pp = frappe.get_doc("Summer Flower Production Plan", production_plan)
	version = version or pp.protocol
	weeks = plan_weeks(production_plan)
	total = sum(q for _d, q in weeks)

	out = {"production_plan": production_plan, "variety": pp.variety,
	       "farm": pp.farm, "protocol": version, "form": form,
	       "season_plants": total, "weeks": len(weeks), "destinations": []}

	remaining = list(weeks)
	for unit in (units or []):
		if not remaining:
			break
		s = T.schedule(unit, version, form, remaining)
		# What it takes OFF THE PLAN is what it covered. It plants more than
		# that -- troughs go in full -- and the surplus is reported beside it
		# rather than counted as demand met twice.
		took = s.get("covered", s["planted"])
		out["destinations"].append({
			"kind": "own unit", "unit": unit,
			"plants": took,
			"planted": s["planted"],
			"surplus": s.get("surplus", 0),
			"share_pct": round(took * 100.0 / total, 2) if total else 0,
			"troughs": s.get("troughs"),
			"troughs_used": len({r["trough"] for r in s["rows"]}),
			"plantings": len(s["rows"]),
			"hold_weeks": s.get("hold_weeks"),
			"reason": s.get("reason"),
			"calendar": s["rows"][:6],
		})
		# What it could not take passes to the next unit, then to the market.
		remaining = [(d, q) for d, q in s["unplaced"] if q > 0]

	short = sum(q for _d, q in remaining)
	if short and suppliers:
		shares = [flt(x.get("share_pct")) for x in suppliers]
		if round(sum(shares), 4) != 100:
			shares = [100.0 / len(suppliers)] * len(suppliers)
		lead = cint(frappe.db.get_value("Crop Protocol Version", version,
		                                "supplier_lead_weeks"))
		buckets = [[] for _ in suppliers]
		for when, qty in remaining:
			for i, part in enumerate(split(qty, shares)):
				if part > 0:
					buckets[i].append((when, part))
		for sup, share, rows in zip(suppliers, shares, buckets):
			qty = sum(q for _d, q in rows)
			out["destinations"].append({
				"kind": "propagator", "supplier": sup.get("supplier"),
				"plants": qty,
				"share_pct": round(qty * 100.0 / total, 2) if total else 0,
				"of_shortfall_pct": share,
				"weeks": len(rows), "lead_weeks": lead,
				"deliveries": [{"deliver_on": str(getdate(w)), "plants": q,
				                "order_by": str(add_days(getdate(w), -lead * 7))}
				               for w, q in rows[:6]],
			})
		short = 0
	out["unallocated"] = short
	out["unallocated_weeks"] = remaining[:6] if short else []
	return out


def delivery_calendar(production_plan, units=None, form="Roots", version=None):
	"""When each unit's troughs actually hand plants over, for a whole plan.

	`allocate_by_capacity` answers who raises what. This answers when the farm
	gets it, which is a later and lumpier calendar: a trough is planted full,
	so the week that wanted 2,000 roots plants 7,000 and those come off over
	the protocol's lift weeks.

	Units are offered the season in turn, exactly as the allocation does it, so
	the two cannot disagree about which unit holds which week.
	"""
	pp = frappe.get_doc("Summer Flower Production Plan", production_plan)
	version = version or pp.protocol
	if units is None:
		units = frappe.get_all("Warehouse",
		                       filters={"custom_prop_is_unit": 1, "disabled": 0},
		                       pluck="name")
	weeks = plan_weeks(production_plan)
	total = sum(q for _d, q in weeks)

	out = {"production_plan": production_plan, "variety": pp.variety,
	       "farm": pp.farm, "protocol": version, "form": form,
	       "season_plants": total, "units": [], "by_week": {}, "bought_in": {}}

	remaining = list(weeks)
	for unit in (units or []):
		if not remaining:
			break
		d = T.deliveries(unit, version, form, remaining)
		if d.get("reason") or not d["rows"]:
			continue
		out["units"].append({
			"unit": unit,
			"planted": d["planted"],
			"delivered": d["delivered"],
			"covered": d["covered"],
			"surplus": d["surplus"],
			"troughs": d["troughs"],
			"hold_weeks": d["hold_weeks"],
			"rows": d["rows"],
			"by_week": d["by_week"],
		})
		for on, qty in d["by_week"].items():
			out["by_week"].setdefault(on, {})[unit] = \
				out["by_week"].setdefault(on, {}).get(unit, 0) + qty
		# What this unit could not take stays on the table for the next one.
		remaining = [(getdate(w), cint(q)) for w, q in (d.get("unplaced") or [])]

	# Whatever no unit's troughs could hold is bought in as plants, and it
	# arrives on the week it was wanted rather than on a lift date.
	for when, qty in remaining:
		out["bought_in"][str(getdate(when))] = \
			out["bought_in"].get(str(getdate(when)), 0) + cint(qty)
	return out
