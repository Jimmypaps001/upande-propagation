# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""Placing a planting into troughs, and knowing when they come free again.

Demand is smooth; troughs are not. A trough is planted full or not at all, so a
week wanting 2,000 plants and a trough taking 7,000 plants 7,000 -- the surplus
is not waste, it is the next weeks' lifts taken from the same trough.

Nothing here is stored on the trough. A planting holds a trough from the day it
goes in until the last lift is taken, which is the protocol's `lifts` plus its
`turnaround_weeks`; reading it keeps a protocol change from leaving stale
occupancy behind on fifty troughs.

Nothing is whitelisted. The app's HTTP surface is mobile/api.py.
"""

import frappe
from frappe.utils import add_days, cint, flt, getdate


def unit_troughs(unit, active_only=True):
	"""Every trough standing in a unit, largest first."""
	filters = {"propagation_unit": unit}
	if active_only:
		filters["is_active"] = 1
		filters["status"] = ["!=", "Out of Service"]
	return frappe.get_all(
		"Propagation Trough", filters=filters,
		fields=["name", "trough_name", "plants_per_trough", "area_sqm", "status"],
		order_by="plants_per_trough desc, trough_name asc")


# The route names the stage a crop is bought at; the lift table names the form
# that comes off a trough. They are the same thing said twice -- "TC" there,
# "Tissue Culture" here -- and the two were joined on an exact string, so a
# tissue culture planting could never find its own lifts. Every unit then
# reported that it could not work out when a trough came free, and seated
# nothing, for want of a word.
_FORM_ALIAS = {
	"tc": "Tissue Culture",
	"tissue culture": "Tissue Culture",
	"roots": "Roots",
	"roots (own)": "Roots",
}


def canonical_form(name):
	"""One spelling for a form, whichever table it was read from."""
	return _FORM_ALIAS.get((name or "").strip().lower(), name)


def hold_weeks(version, form):
	"""How long a planting of this form holds a trough.

	Until the last lift is taken, then the turnaround. A form with no lifts has
	no answer here, and returning zero would silently free the trough the day it
	was planted -- so it returns None and the caller must say it cannot place.
	"""
	v = frappe.get_doc("Crop Protocol Version", version) if isinstance(version, str) else version
	want = canonical_form(form)
	lifts = [L for L in (v.lifts or []) if canonical_form(L.form) == want]
	if not lifts:
		return None
	last = max(cint(L.weeks_after_arrival) for L in lifts)
	return last + cint(v.get("turnaround_weeks"))


def lift_schedule(version, form, planted_on, planted_qty):
	"""What comes out of one planting, and when.

	The shares are the protocol's. The last lift takes the remainder so the
	lifts add back to what went in -- rounding each share on its own loses or
	invents plants, and a trough that cannot add up is worse than an uneven one.
	"""
	v = frappe.get_doc("Crop Protocol Version", version) if isinstance(version, str) else version
	want = canonical_form(form)
	lifts = sorted([L for L in (v.lifts or []) if canonical_form(L.form) == want],
	               key=lambda L: cint(L.lift_no))
	out, used = [], 0
	for i, L in enumerate(lifts):
		qty = (cint(planted_qty) - used) if i == len(lifts) - 1 \
			else int(round(cint(planted_qty) * flt(L.share_pct) / 100.0))
		used += qty
		out.append({
			"lift_no": cint(L.lift_no),
			"weeks_after": cint(L.weeks_after_arrival),
			"ready_on": str(add_days(getdate(planted_on), cint(L.weeks_after_arrival) * 7)),
			"share_pct": flt(L.share_pct),
			"plants": qty,
		})
	return out


def place(unit, version, form, wanted, planted_on):
	"""Fill troughs for `wanted` plants, and say what that actually plants.

	Returns the troughs used, what goes in them, what comes out and when, and
	the surplus -- the difference between what the week asked for and what a
	whole trough takes. The surplus is reported rather than hidden because it
	is the number that decides whether to plant this week at all.
	"""
	troughs = unit_troughs(unit)
	held = hold_weeks(version, form)
    # No lifts for this form: we cannot say when the trough frees, so we do not
    # pretend to place it.
	if held is None:
		return {"placed": [], "planted": 0, "wanted": cint(wanted), "surplus": 0,
		        "unplaced": cint(wanted), "lifts": [],
		        "reason": "%s has no lifts for %s, so there is no way to know when a "
		                  "trough would come free." % (
			                  version if isinstance(version, str) else version.name, form)}
	if not troughs:
		return {"placed": [], "planted": 0, "wanted": cint(wanted), "surplus": 0,
		        "unplaced": cint(wanted), "lifts": [],
		        "reason": "%s has no troughs." % unit}

	placed, planted, remaining = [], 0, cint(wanted)
	for t in troughs:
		if remaining <= 0:
			break
		cap = cint(t.plants_per_trough)
		if cap <= 0:
			continue
		placed.append({"trough": t.name, "trough_name": t.trough_name,
		               "plants": cap,
		               "free_on": str(add_days(getdate(planted_on), held * 7))})
		planted += cap
		remaining -= cap

	lifts = lift_schedule(version, form, planted_on, planted) if planted else []
	return {
		"placed": placed,
		"planted": planted,
		"wanted": cint(wanted),
		# A full trough plants more than the week asked for. That surplus is
		# lifted in later weeks, not thrown away.
		"surplus": max(0, planted - cint(wanted)),
		"unplaced": max(0, remaining),
		"hold_weeks": held,
		"lifts": lifts,
	}


def occupancy(unit, version, form, plantings):
	"""Which troughs are busy when, given a list of (date, qty) plantings."""
	held = hold_weeks(version, form)
	if held is None:
		return []
	rows = []
	for on, qty in plantings:
		r = place(unit, version, form, qty, on)
		for p in r["placed"]:
			rows.append({"trough": p["trough_name"], "planted_on": str(getdate(on)),
			             "plants": p["plants"], "free_on": p["free_on"]})
	return sorted(rows, key=lambda r: (r["planted_on"], r["trough"]))


def schedule(unit, version, form, weeks):
	"""Walk a season's plantings through a unit's troughs, in order.

	`weeks` is [(date, plants wanted), ...]. A trough taken in week 3 is not
	free again until its last lift, so this holds a calendar rather than
	answering each week as though it were the only one -- which is what made
	`place()` on its own cheerfully plant the same trough five times.

	What will not fit is returned, not dropped. A unit that cannot take the
	whole allocation is the finding, and it is what sends the rest outside.
	"""
	held = hold_weeks(version, form)
	if held is None:
		return {"rows": [], "unplaced": [(str(getdate(d)), cint(q)) for d, q in weeks],
		        "planted": 0, "wanted": sum(cint(q) for _d, q in weeks),
		        "reason": "no lifts for %s, so a trough's release date is unknown" % form}
	troughs = unit_troughs(unit)
	if not troughs:
		return {"rows": [], "unplaced": [(str(getdate(d)), cint(q)) for d, q in weeks],
		        "planted": 0, "wanted": sum(cint(q) for _d, q in weeks),
		        "reason": "%s has no troughs" % unit}

	free_on = {t["name"]: None for t in troughs}   # None = never used yet
	rows, unplaced, planted = [], [], 0

	for when, want in sorted(weeks, key=lambda w: str(getdate(w[0]))):
		when = getdate(when)
		want = cint(want)
		if want <= 0:
			continue
		remaining = want
		for t in troughs:
			if remaining <= 0:
				break
			busy = free_on[t["name"]]
			if busy and getdate(busy) > when:
				continue                      # still holding an earlier planting
			cap = cint(t["plants_per_trough"])
			if cap <= 0:
				continue
			release = add_days(when, held * 7)
			rows.append({
				"trough": t["trough_name"], "planted_on": str(when),
				"plants": cap, "free_on": str(release),
				"lifts": lift_schedule(version, form, when, cap),
			})
			free_on[t["name"]] = release
			planted += cap
			remaining -= cap
		if remaining > 0:
			unplaced.append((str(when), remaining))

	wanted_total = sum(cint(q) for _d, q in weeks)
	short = sum(q for _d, q in unplaced)
	return {"rows": rows, "unplaced": unplaced, "planted": planted,
	        "wanted": wanted_total, "hold_weeks": held, "troughs": len(troughs),
	        # What it PLANTED and what it COVERED of the ask are different
	        # numbers: a trough is planted full, so a week wanting 1,000 is
	        # covered by 1,000 and plants 7,000. Allocating on `planted` double
	        # counts that surplus against what still has to be bought.
	        "covered": wanted_total - short,
	        "surplus": max(0, planted - (wanted_total - short))}


@frappe.whitelist()
def deliveries(unit, version, form, weeks):
	"""What actually leaves a unit, week by week, for a season's plantings.

	`schedule()` answers "can these troughs hold the season"; this answers the
	farm's question, which is a different one: not what was stuck, but what
	arrives and when.

	They are not the same shape. A week wanting 2,000 roots plants a 7,000
	trough, and those 7,000 come off in lifts spread over the protocol's lift
	weeks -- so the farm's deliveries are lumpier than its demand and land on
	different dates. Reporting demand back as though it were delivery is what
	made a trough-bound plan look like a smooth one.
	"""
	if isinstance(weeks, str):
		weeks = frappe.parse_json(weeks or "[]")
	s = schedule(unit, version, form, weeks)
	if s.get("reason"):
		return {"rows": [], "by_week": {}, "planted": 0, "delivered": 0,
		        "reason": s["reason"]}

	by_week, rows = {}, []
	for r in s["rows"]:
		for L in r.get("lifts") or []:
			if cint(L["plants"]) <= 0:
				continue
			on = str(getdate(L["ready_on"]))
			by_week[on] = by_week.get(on, 0) + cint(L["plants"])
			rows.append({
				"ready_on": on,
				"plants": cint(L["plants"]),
				"lift_no": cint(L["lift_no"]),
				"trough": r["trough"],
				"planted_on": r["planted_on"],
				"trough_lot": cint(r["plants"]),
			})
	rows.sort(key=lambda x: (x["ready_on"], x["trough"], x["lift_no"]))
	return {
		"rows": rows,
		"by_week": by_week,
		"planted": cint(s["planted"]),
		"delivered": sum(by_week.values()),
		"covered": cint(s.get("covered") or 0),
		"surplus": cint(s.get("surplus") or 0),
		"troughs": s.get("troughs"),
		"hold_weeks": s.get("hold_weeks"),
		"unplaced": s.get("unplaced") or [],
	}
