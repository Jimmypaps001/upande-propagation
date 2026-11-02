# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""What was actually set into a trough, against what the plan asked for.

The planner chooses troughs -- so many of this size, set in these weeks -- and
until now there was nothing to check that against. Occupancy was derived from
the plantings a trough was assumed to serve, which answers "what should be in
there" and never "what is". A trough that was set late, set short, or set with
something else entirely looked identical to one set exactly to plan.

So a setting is a record. One trough, one date, one batch, and the lifts the
protocol says will come off it. A batch may hold several of them: a thousand
roots do not go into one trough, and the troughs they do go into are rarely
set on the same morning, which is why this is its own record rather than a
table on the batch.

It holds the trough until the last lift is taken. That is the whole point of
recording it: a trough standing full is a trough the next planting cannot have,
and the plan needs to know which ones those are before it promises them.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, flt, getdate

STANDING = ("Standing", "Partly Lifted")


class TroughSetting(Document):
	def validate(self):
		self.fill_from_batch()
		self.check_capacity()
		self.check_trough_is_free()
		self.plan_the_lifts()
		self.roll_up()

	def on_submit(self):
		self.roll_up()

	def on_update_after_submit(self):
		"""A lift is recorded months after the trough was set and submitted, and
		validate does not run on a submitted document -- so the roll-up has to
		be done here or the status would stay Standing on a trough that has been
		emptied."""
		self.roll_up()
		for f in ("status", "plants_lifted", "plants_remaining", "freed_on"):
			self.db_set(f, self.get(f), update_modified=False)
		for r in self.lifts:
			r.db_set("variance", r.variance, update_modified=False)

	# ------------------------------------------------------------------ setup
	def fill_from_batch(self):
		"""A setting belongs to a batch, and the batch already knows most of it."""
		if not self.propagation_batch:
			return
		b = frappe.db.get_value("Propagation Batch", self.propagation_batch,
		                        ["variety", "propagation_unit"], as_dict=True)
		if not b:
			return
		if not self.variety:
			self.variety = b.variety
		if b.variety and self.variety and b.variety != self.variety:
			frappe.throw(_("{0} is raising {1}, so a trough on it cannot be set "
			               "with {2}.").format(self.propagation_batch, b.variety,
			                                   self.variety),
			             title=_("Two varieties in one batch"))

	def check_capacity(self):
		"""A trough holds what it holds. Over-filling it is not a plan, it is a
		number that will not be there at lifting."""
		cap = cint(frappe.db.get_value("Propagation Trough", self.trough,
		                               "plants_per_trough"))
		self.capacity_plants = cap
		if cint(self.plants) <= 0:
			frappe.throw(_("Say how many plants went into {0}.").format(self.trough))
		if cap and cint(self.plants) > cap:
			frappe.throw(
				_("{0} holds {1} plants and this setting puts {2} in it. A trough "
				  "is planted full or not at all -- use another trough for the "
				  "rest.").format(self.trough, f"{cap:,}", f"{cint(self.plants):,}"),
				title=_("More than the trough holds"))
		self.fill_pct = round(cint(self.plants) * 100.0 / cap, 2) if cap else 0

	def check_trough_is_free(self):
		"""One setting at a time. A trough still holding a crop cannot take
		another, and the overlap is what the planner has to be told about."""
		if self.docstatus == 2:
			return
		rows = frappe.get_all(
			"Trough Setting",
			filters={"trough": self.trough, "name": ["!=", self.name or ""],
			         "docstatus": ["<", 2], "status": ["in", STANDING]},
			fields=["name", "set_date", "freed_on", "variety"])
		mine_from = getdate(self.set_date) if self.set_date else None
		for r in rows:
			if not mine_from:
				continue
			# Held from the day it was set until its last lift. A setting with no
			# freed date yet is still holding the trough.
			held_to = getdate(r.freed_on) if r.freed_on else None
			if held_to and held_to < mine_from:
				continue
			if getdate(r.set_date) > mine_from and held_to is None:
				# The other one starts later and has no end: still a clash.
				pass
			frappe.throw(
				_("{0} is still holding {1} -- set {2}{3}. A trough carries one "
				  "setting at a time; lift that one first, or use another trough."
				  ).format(r.name, self.trough, r.set_date,
				           _(", freed %s") % r.freed_on if r.freed_on else ""),
				title=_("The trough is occupied"))

	# ------------------------------------------------------------------ lifts
	def plan_the_lifts(self):
		"""Date the lifts from the protocol, keeping anything already recorded.

		The protocol says a trough pays back in lifts -- 45% at sixteen weeks,
		30% at eighteen, 25% at twenty -- so the due dates follow from the day it
		was set. What was actually taken is typed against them, and the two sit
		side by side rather than one overwriting the other.
		"""
		if not self.crop_protocol_version or not self.set_date:
			return
		sched = self._lift_table()
		if not sched:
			return
		done = {cint(r.lift_no): (r.lift_date, cint(r.plants_taken), r.destination,
		                          r.notes)
		        for r in (self.lifts or [])}
		self.set("lifts", [])
		plants, used = cint(self.plants), 0
		for i, L in enumerate(sched):
			due = int(round(plants * flt(L["share_pct"]) / 100.0))
			if i == len(sched) - 1:
				due = plants - used          # the last lift takes the remainder
			used += due
			no = i + 1
			when, taken, dest, notes = done.get(no, (None, 0, None, None))
			self.append("lifts", {
				"lift_no": no,
				"due_date": add_days(getdate(self.set_date),
				                     7 * cint(L["weeks_after"])),
				"plants_due": due,
				"lift_date": when,
				"plants_taken": taken,
				"variance": (cint(taken) - due) if when else 0,
				"destination": dest,
				"notes": notes,
			})

	def _lift_table(self):
		"""The protocol's lifts for the form this trough was set with."""
		try:
			v = frappe.get_cached_doc("Crop Protocol Version",
			                          self.crop_protocol_version)
		except frappe.DoesNotExistError:
			return []
		want = (self.form or "").strip().lower()
		# "TC" on the route is "Tissue Culture" on the lift table: the same thing
		# said twice, and joining them on an exact string found nothing.
		alias = {"tissue culture": ("tissue culture", "tc"),
		         "roots": ("roots", "root"),
		         "cuttings": ("cuttings", "cutting"),
		         "plants": ("plants", "plant")}.get(want, (want,))
		rows = [{"weeks_after": cint(L.weeks_after_arrival),
		         "share_pct": flt(L.share_pct)}
		        for L in (v.get("lifts") or [])
		        if (L.form or "").strip().lower() in alias]
		return sorted(rows, key=lambda r: r["weeks_after"])

	# ----------------------------------------------------------------- state
	def roll_up(self):
		"""Standing, part lifted, or done -- read off the lifts, never typed."""
		rows = [r for r in (self.lifts or [])]
		taken = sum(cint(r.plants_taken) for r in rows if r.lift_date)
		self.plants_lifted = taken
		self.plants_remaining = max(0, cint(self.plants) - taken)
		for r in rows:
			r.variance = (cint(r.plants_taken) - cint(r.plants_due)) \
				if r.lift_date else 0
		if self.status == "Discarded":
			return
		if rows and all(r.lift_date for r in rows):
			self.status = "Lifted"
			self.freed_on = max(getdate(r.lift_date) for r in rows)
		elif taken:
			self.status = "Partly Lifted"
			self.freed_on = None
		else:
			self.status = "Standing"
			self.freed_on = None
