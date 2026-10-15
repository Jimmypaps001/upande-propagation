# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""What a batch is allowed to be doing, according to its protocol.

The activity list on a Daily Propagation Log is the same eight options for every
batch on the site, and most of them are wrong for any given one. A variety raised
from tissue culture has no motherstock, so nobody is taking cuttings from it; a
consignment of rooted cuttings has already been stuck, so sticking it again is a
typing error; and a motherstock worked on a two-week multiplication cycle cannot
have cuttings taken off it eight days running.

Those are not opinions, they are in the protocol:

	Crop Protocol Version.material_route     where the plants come from
	  .stage      TC / Cuttings (Own) / Motherstock / Bought-in Plants / Roots ...
	  .step       Sticking / Rooting / Tray / Pot / Hardening ...
	Crop Protocol Version.cycle_time_weeks   how far apart cutting rounds are
	Crop Protocol Version.max_multiplication_cycles
	Plant Consignment.form                   what physically turned up

so this reads them and answers one question: for this batch, today, which
activities may be recorded, and for the ones that may not, why not.

Reached over HTTP through upande_propagation.mobile.api and nowhere else, so
there is one name per call for the app to know.

It fails open. A variety with no approved protocol, or a protocol with an empty
material route, allows everything -- a rule derived from nothing is not a rule,
and a unit blocked from writing down work it actually did will simply stop
writing anything down.
"""

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, today

from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	ACTIVITY_STAGE_MAP,
	STAGE_SEQUENCE,
	stage_index,
)

ACTIVITIES = (
	"Cutting", "Sticking", "Germination Count", "Nursery Count",
	"Hardening Count", "Dispatch Count", "Mortality Count", "Disease / Scouting",
)

# Activities that are a count of what is standing there. They are true whatever
# the plants came from, so no route rule touches them.
ALWAYS = ("Mortality Count", "Disease / Scouting")

# Route stages that mean there IS something on this farm to cut from.
CUTTING_SOURCES = ("Cuttings (Own)", "Motherstock", "Budwoods")

# Route steps that mean unrooted material is stuck into a medium here. A tray
# step counts: a deflasked plantlet goes into a tray exactly as a cutting does,
# and the nursery calls both sticking.
STICKING_STEPS = ("Sticking", "Rooting", "Tray", "Germination")

# What a consignment arrives as, and the work that is therefore already done.
# A rooted cutting has been stuck; a plant has been through the whole nursery.
FORM_ALREADY_DONE = {
	"Tissue Culture": ("Cutting",),
	"Rooted Cuttings": ("Cutting", "Sticking"),
	"Unrooted Cuttings": ("Cutting",),
	"Roots": ("Cutting", "Sticking"),
	"Plants": ("Cutting", "Sticking", "Germination Count"),
	"Seeds": ("Cutting",),
}


def protocol_version(variety, farm=None):
	"""The protocol in force for a variety, or None.

	Crop Protocol Version is an upande_summer_flowers doctype. A site running
	propagation without summer flowers has no such table, and asking for it is
	how this module would take the whole log screen down with it.
	"""
	if not variety or not frappe.db.exists("DocType", "Crop Protocol Version"):
		return None
	filters = {"variety": variety, "version_status": "Active"}
	if farm:
		rows = frappe.get_all("Crop Protocol Version",
		                      filters=dict(filters, farm=farm),
		                      pluck="name", order_by="version desc", limit=1)
		if rows:
			return rows[0]
	rows = frappe.get_all("Crop Protocol Version", filters=filters, pluck="name",
	                      order_by="version desc", limit=1)
	return rows[0] if rows else None


def route_of(version):
	"""The stages and steps the protocol's material route names."""
	if not version:
		return set(), set()
	rows = frappe.get_all(
		"Crop Material Stage",
		filters={"parent": version, "parenttype": "Crop Protocol Version"},
		fields=["stage", "step"])
	return ({r.stage for r in rows if r.stage},
	        {r.step for r in rows if r.step})


def _last_cutting(batch):
	return frappe.db.get_value(
		"Daily Propagation Log",
		{"propagation_batch": batch, "activity_type": "Cutting"},
		"log_date", order_by="log_date desc")


def _cutting_rounds(batch):
	return frappe.db.count("Daily Propagation Log",
	                       {"propagation_batch": batch, "activity_type": "Cutting"})


def batch_activities(batch, on_date=None):
	"""Every activity, each with a verdict and the reason behind it.

	The phone shows all eight either way -- a greyed row that says why is worth
	far more than a short list that looks arbitrary -- so this never filters,
	it annotates.
	"""
	doc = frappe.db.get_value(
		"Propagation Batch", batch,
		["name", "variety", "variety_name", "current_stage", "docstatus",
		 "plant_consignment", "company", "propagation_unit"], as_dict=True)
	if not doc:
		frappe.throw(_("No such batch: {0}").format(batch))

	on_date = getdate(on_date or today())
	farm = None
	version = protocol_version(doc.variety, farm)
	stages, steps = route_of(version)
	spec = {}
	if version:
		spec = frappe.db.get_value(
			"Crop Protocol Version", version,
			["cycle_time_weeks", "max_multiplication_cycles",
			 "motherstock_life_weeks", "weeks_on_tray", "weeks_on_pot",
			 "hardening_weeks", "rooting_success_pct", "route_summary"],
			as_dict=True) or {}

	form = None
	if doc.plant_consignment:
		form = frappe.db.get_value("Plant Consignment", doc.plant_consignment, "form")

	here = stage_index(doc.current_stage)
	out = []
	for activity in ACTIVITIES:
		verdict = _verdict(doc, activity, here, form, version, stages, steps,
		                   spec, on_date)
		out.append(dict(activity=activity, **verdict))

	return {
		"batch": doc.name,
		"variety": doc.variety,
		"variety_name": doc.variety_name,
		"current_stage": doc.current_stage,
		"consignment": doc.plant_consignment,
		"form": form,
		"protocol": version,
		"route_summary": spec.get("route_summary"),
		"route_stages": sorted(stages),
		"route_steps": sorted(steps),
		"cycle_time_weeks": cint(spec.get("cycle_time_weeks")),
		"max_cycles": cint(spec.get("max_multiplication_cycles")),
		"cutting_rounds": _cutting_rounds(doc.name),
		"activities": out,
		"allowed": [a["activity"] for a in out if a["allowed"]],
	}


def _verdict(doc, activity, here, form, version, stages, steps, spec, on_date):
	"""One activity, judged. Order matters: the clearest reason wins."""
	if activity in ALWAYS:
		return {"allowed": True, "reason": None, "next_allowed_on": None}

	if cint(doc.docstatus) != 1:
		return {"allowed": False,
		        "reason": _("Submit the batch before recording work against it."),
		        "next_allowed_on": None}

	# 1. Where the batch actually is. Work can be caught up, never run ahead:
	#    a hardening count on a batch still in callusing is a count of plants
	#    that are not there.
	target = ACTIVITY_STAGE_MAP.get(activity)
	if target and here >= 0 and stage_index(target) > here:
		return {"allowed": False,
		        "reason": _("{0} belongs to {1}. This batch is at {2} -- move it "
		                    "forward first.").format(activity, target,
		                                             doc.current_stage),
		        "next_allowed_on": None}

	# 2. What arrived. A rooted cutting has been stuck already, by the supplier.
	if form and activity in FORM_ALREADY_DONE.get(form, ()):
		return {"allowed": False,
		        "reason": _("This batch came in as {0}, so {1} was done before it "
		                    "reached us.").format(form.lower(), activity.lower()),
		        "next_allowed_on": None}

	# 3. What the protocol's route says this crop is raised from. Silent route,
	#    no rule -- see the module docstring.
	if stages or steps:
		if activity == "Cutting" and not (stages & set(CUTTING_SOURCES)):
			return {"allowed": False,
			        "reason": _("{0} is raised from {1} here. There is no "
			                    "motherstock on this farm to take cuttings "
			                    "from.").format(
				        doc.variety_name or doc.variety,
				        spec.get("route_summary") or ", ".join(sorted(stages))),
			        "next_allowed_on": None}
		# Only when the route actually itemises its steps. Most routes on this
		# site are two stage rows and nothing else -- TC to Plants -- and
		# reading "no sticking step" off a route that lists no steps at all
		# would refuse the one job the unit exists to do.
		if activity == "Sticking" and steps and not (steps & set(STICKING_STEPS)):
			return {"allowed": False,
			        "reason": _("The protocol for {0} has no sticking step -- "
			                    "it goes {1}.").format(
				        doc.variety_name or doc.variety,
				        spec.get("route_summary") or " then ".join(sorted(steps))),
			        "next_allowed_on": None}

	# 4. The multiplication cycle. Cuttings come off motherstock on a rhythm,
	#    and a round logged inside it is the same round being written twice.
	if activity == "Cutting":
		weeks = cint(spec.get("cycle_time_weeks"))
		last = _last_cutting(doc.name)
		if weeks and last:
			due = add_days(getdate(last), weeks * 7)
			if getdate(on_date) < due:
				return {"allowed": False,
				        "reason": _("Cuttings were last taken on {0}. {1} is "
				                    "worked on a {2}-week cycle, so the next "
				                    "round is due on {3}.").format(
					        last, doc.variety_name or doc.variety, weeks, due),
				        "next_allowed_on": str(due)}
		cycles = cint(spec.get("max_multiplication_cycles"))
		if cycles and _cutting_rounds(doc.name) >= cycles:
			return {"allowed": False,
			        "reason": _("{0} rounds of cuttings have been taken and the "
			                    "protocol allows {0}. The motherstock is spent.")
			        .format(cycles),
			        "next_allowed_on": None}

	return {"allowed": True, "reason": None, "next_allowed_on": None}


def enforce(batch, activity_type, log_date=None):
	"""Refuse a log the protocol does not allow. Called from the log controller."""
	verdicts = batch_activities(batch, on_date=log_date)
	for row in verdicts["activities"]:
		if row["activity"] == activity_type and not row["allowed"]:
			frappe.throw(row["reason"], title=_("Not this batch, not today"))
	return True


# ------------------------------------------------------------------ the ladder
def stage_plan(batch):
	"""The stage ladder for a batch, with what the protocol expects of each.

	The nursery ladder is the app's own (Propagation Settings), the week counts
	are the crop's (Crop Protocol Version). Shown side by side because a unit
	that is three weeks past the protocol's rooting window needs to see both
	numbers, not an average of them.
	"""
	doc = frappe.db.get_value(
		"Propagation Batch", batch,
		["name", "variety", "current_stage", "start_date"], as_dict=True)
	if not doc:
		frappe.throw(_("No such batch: {0}").format(batch))

	settings = frappe.get_cached_doc("Propagation Settings")
	expected = {r.stage: cint(r.expected_days) for r in (settings.stage_durations or [])}
	rows = {r.stage: r for r in frappe.get_all(
		"Propagation Batch Stage",
		filters={"parent": batch, "parenttype": "Propagation Batch"},
		fields=["stage", "start_date", "end_date", "days_in_stage",
		        "qty_entered", "qty_exited"])}

	version = protocol_version(doc.variety)
	spec = frappe.db.get_value(
		"Crop Protocol Version", version,
		["weeks_on_tray", "weeks_on_pot", "hardening_weeks",
		 "sticking_to_planting_weeks", "establishment_weeks"],
		as_dict=True) if version else {}
	protocol_days = {
		"Callusing": None,
		"Rooting": cint(spec.get("weeks_on_tray")) * 7 or None,
		"Nursery": cint(spec.get("weeks_on_pot")) * 7 or None,
		"Hardening": cint(spec.get("hardening_weeks")) * 7 or None,
	}

	here = stage_index(doc.current_stage)
	ladder = []
	for i, stage in enumerate(STAGE_SEQUENCE):
		row = rows.get(stage)
		ladder.append({
			"stage": stage,
			"state": ("done" if row and row.end_date
			          else "current" if i == here
			          else "past" if i < here else "ahead"),
			"start_date": str(row.start_date) if row and row.start_date else None,
			"end_date": str(row.end_date) if row and row.end_date else None,
			"days_in_stage": cint(row.days_in_stage) if row else 0,
			"expected_days": cint(expected.get(stage)),
			"protocol_days": protocol_days.get(stage),
			"qty_entered": cint(row.qty_entered) if row else 0,
			"qty_exited": cint(row.qty_exited) if row else 0,
		})
	return {"batch": batch, "current_stage": doc.current_stage,
	        "protocol": version, "ladder": ladder,
	        "establishment_weeks": cint(spec.get("establishment_weeks")) if spec else 0}
