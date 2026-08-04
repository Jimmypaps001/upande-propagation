# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import make_autoname
from frappe.utils import cint, date_diff, flt, getdate, today

# Ordered nursery pipeline. A batch only ever moves forward through this list;
# "Completed" is the terminal state and is not part of the sequence.
STAGE_SEQUENCE = [
	"Cutting",
	"Sticking",
	"Callusing",
	"Rooting",
	"Nursery",
	"Hardening",
	"Ready for Dispatch",
]

COMPLETED = "Completed"

# Seedlings may leave the nursery from Hardening onwards.
FIRST_DISPATCHABLE_STAGE = "Hardening"

GRAFTED_METHODS = ("Grafting (T-bud)", "Grafting (Splice)", "Stenting")

# Which pipeline stage a Daily Propagation Log implies. "Callusing" has no
# matching activity type, so it is only reached via Advance Stage.
ACTIVITY_STAGE_MAP = {
	"Cutting": "Cutting",
	"Sticking": "Sticking",
	"Germination Count": "Rooting",
	"Nursery Count": "Nursery",
	"Hardening Count": "Hardening",
	"Dispatch Count": "Ready for Dispatch",
	"Mortality Count": None,
}


def stage_index(stage):
	try:
		return STAGE_SEQUENCE.index(stage)
	except ValueError:
		return -1


class PropagationBatch(Document):
	def autoname(self):
		# `format:...-{####}` drew its counter from the site-wide empty-prefix
		# Series row, so batch numbers were neither per-week nor sequential.
		self.set_iso_week_year()
		week = cint(self.iso_week) or getdate(today()).isocalendar()[1]
		year = cint(self.iso_year) or getdate(today()).isocalendar()[0]
		self.name = make_autoname(f"PB-{year}-W{week:02d}-.####")

	def validate(self):
		self.set_iso_week_year()
		self.set_variety_name()
		self.set_batch_title()
		self.validate_sources()
		self.validate_quantities()
		self.open_initial_stage()
		self.validate_stages()
		self.calculate_grafting_rate()
		self.calculate_costs()

	def before_update_after_submit(self):
		# validate() does not run once a document is submitted, but stages advance,
		# seedlings get graded and costs land long after submission.
		self.set_batch_title()
		self.validate_quantities()
		self.validate_stages()
		self.calculate_grafting_rate()
		self.calculate_costs()

	def on_submit(self):
		if self.seedling_request:
			update_request(self.seedling_request)

	def before_cancel(self):
		# Guards belong before the docstatus is written, not after.
		if frappe.db.exists("Seedling Dispatch", {"propagation_batch": self.name, "docstatus": 1}):
			frappe.throw(_("Cancel the Seedling Dispatches raised against this batch first."))
		if frappe.db.exists("Daily Propagation Log", {"propagation_batch": self.name}):
			frappe.throw(_("Delete the Daily Propagation Logs for this batch first."))
		if frappe.db.exists("Budwood Harvest", {"propagation_batch": self.name, "docstatus": 1}):
			frappe.throw(_("Unlink the Budwood Harvests booked into this batch first."))

	def on_cancel(self):
		if self.seedling_request:
			update_request(self.seedling_request)

	# ------------------------------------------------------------------ helpers

	def set_iso_week_year(self):
		if not self.start_date:
			return
		iso_year, iso_week, _weekday = getdate(self.start_date).isocalendar()
		self.iso_year = iso_year
		self.iso_week = iso_week

	def set_variety_name(self):
		if self.variety and not self.variety_name:
			self.variety_name = frappe.db.get_value("Item", self.variety, "item_name")

	def set_batch_title(self):
		# title_field is `batch_title`, not `title`, so Frappe's set_title_field()
		# never interpolated its {braced} default — it is built here instead.
		variety = self.variety_name or self.variety or ""
		title = _("Batch {0}/{1}").format(cint(self.iso_week), cint(self.iso_year))
		self.batch_title = f"{title} - {variety}" if variety else title

	def validate_sources(self):
		if self.mother_block:
			block = frappe.db.get_value(
				"Mother Block", self.mother_block, ["variety", "status"], as_dict=True
			)
			if self.variety and block.variety and block.variety != self.variety:
				frappe.throw(
					_("Mother Block {0} carries variety {1}, not {2}.").format(
						frappe.bold(self.mother_block),
						frappe.bold(block.variety),
						frappe.bold(self.variety),
					)
				)
			if block.status != "Active" and self.is_new():
				frappe.throw(
					_("Mother Block {0} is {1} and cannot supply cuttings.").format(
						frappe.bold(self.mother_block), frappe.bold(block.status)
					)
				)

		if self.seedling_request:
			docstatus = cint(frappe.db.get_value("Seedling Request", self.seedling_request, "docstatus"))
			if docstatus == 0:
				frappe.throw(
					_("Seedling Request {0} is a draft. Submit it before propagating against it.").format(
						frappe.bold(self.seedling_request)
					)
				)
			if docstatus == 2:
				frappe.throw(
					_("Seedling Request {0} is cancelled.").format(frappe.bold(self.seedling_request))
				)

		if self.propagation_method in GRAFTED_METHODS:
			if not self.rootstock_variety:
				frappe.throw(
					_("Rootstock Variety is required for {0}.").format(frappe.bold(self.propagation_method))
				)
		else:
			self.rootstock_variety = None
			self.grafting_success_count = 0
			self.grafting_failure_count = 0

	def validate_quantities(self):
		if cint(self.total_cuttings_planned) <= 0:
			frappe.throw(_("Total Cuttings Planned must be greater than zero."))

		for fieldname in (
			"grade_a_count",
			"grade_b_count",
			"cull_count",
			"grafting_success_count",
			"grafting_failure_count",
		):
			if cint(self.get(fieldname)) < 0:
				frappe.throw(_("{0} cannot be negative.").format(_(self.meta.get_label(fieldname))))

		graded = cint(self.grade_a_count) + cint(self.grade_b_count) + cint(self.cull_count)
		survived = cint(self.total_survived)
		if survived and graded > survived:
			frappe.msgprint(
				_("Graded seedlings ({0}) exceed the {1} recorded as surviving.").format(graded, survived),
				alert=True,
			)

	def open_initial_stage(self):
		"""On submit, open the first pipeline stage so a batch is never stageless."""
		if self.docstatus != 1 or self.stages:
			return
		self.append(
			"stages",
			{
				"stage": self.current_stage or STAGE_SEQUENCE[0],
				"start_date": self.start_date or today(),
				"qty_entered": cint(self.total_cuttings_received) or cint(self.total_cuttings_planned),
				"moved_by": frappe.session.user,
			},
		)

	def validate_stages(self):
		expected = get_expected_days()
		seen = set()
		for row in self.stages:
			if row.stage in seen:
				frappe.throw(_("Stage {0} is listed more than once.").format(frappe.bold(row.stage)))
			seen.add(row.stage)

			row.expected_days = cint(expected.get(row.stage))

			if row.end_date and row.start_date and getdate(row.end_date) < getdate(row.start_date):
				frappe.throw(_("Row #{0}: End Date cannot be before Start Date.").format(row.idx))
			if row.start_date:
				until = getdate(row.end_date) if row.end_date else getdate(today())
				row.days_in_stage = max(0, date_diff(until, getdate(row.start_date)))
			if cint(row.qty_entered) and cint(row.qty_exited) > cint(row.qty_entered):
				frappe.throw(_("Row #{0}: Qty Exited cannot exceed Qty Entered.").format(row.idx))

	def calculate_grafting_rate(self):
		attempts = cint(self.grafting_success_count) + cint(self.grafting_failure_count)
		self.grafting_success_rate = (
			flt(cint(self.grafting_success_count) * 100.0 / attempts, 2) if attempts else 0.0
		)

	def calculate_costs(self):
		self.total_cost = flt(self.material_cost) + flt(self.royalty_cost) + flt(self.labour_cost)
		survived = cint(self.total_survived)
		dispatched = cint(self.total_dispatched)
		self.cost_per_surviving_seedling = flt(self.total_cost / survived, 2) if survived else 0.0
		self.cost_per_dispatched_seedling = flt(self.total_cost / dispatched, 2) if dispatched else 0.0


# ---------------------------------------------------------------------- rollups


def get_expected_days():
	"""Expected days per stage, from Propagation Settings."""
	try:
		settings = frappe.get_cached_doc("Propagation Settings")
	except frappe.DoesNotExistError:
		return {}
	return {row.stage: cint(row.expected_days) for row in settings.stage_durations if row.stage}


def recalculate_batch(batch_name, update_seedling_request=True):
	"""Recompute every derived number on a batch from its source documents.

	Sources: Budwood Harvest (cuttings in), Daily Propagation Log (work done and
	mortality) and Seedling Dispatch (seedlings out).
	"""
	if not batch_name or not frappe.db.exists("Propagation Batch", batch_name):
		return

	batch = frappe.get_doc("Propagation Batch", batch_name)

	received = sum(
		cint(row.number_of_stems)
		for row in frappe.get_all(
			"Budwood Harvest",
			filters={"propagation_batch": batch_name, "docstatus": 1},
			fields=["number_of_stems"],
		)
	)

	logs = frappe.get_all(
		"Daily Propagation Log",
		filters={"propagation_batch": batch_name},
		fields=["activity_type", "qty_done_today", "mortality_today"],
	)
	cuttings = sum(cint(log.qty_done_today) for log in logs if log.activity_type == "Cutting")
	stuck = sum(cint(log.qty_done_today) for log in logs if log.activity_type == "Sticking")
	mortality = sum(cint(log.mortality_today) for log in logs)

	# Cuttings taken is the truth once logged; otherwise fall back to what was
	# stuck, then to the stems booked in from the mother blocks.
	actual = cuttings or stuck or received

	dispatched = sum(
		cint(row.qty_dispatched)
		for row in frappe.get_all(
			"Seedling Dispatch",
			filters={"propagation_batch": batch_name, "docstatus": 1},
			fields=["qty_dispatched"],
		)
	)

	base = actual or received
	survived = max(0, base - mortality)
	available = max(0, survived - dispatched)

	denominator = base or cint(batch.total_cuttings_planned)
	success_rate = flt(survived * 100.0 / denominator, 2) if denominator else 0.0

	total_cost = flt(batch.material_cost) + flt(batch.royalty_cost) + flt(batch.labour_cost)

	batch.db_set(
		{
			"total_cuttings_received": received,
			"total_cuttings_actual": actual,
			"total_mortality": mortality,
			"total_survived": survived,
			"total_dispatched": dispatched,
			"available_to_dispatch": available,
			"success_rate": success_rate,
			"total_cost": total_cost,
			"cost_per_surviving_seedling": flt(total_cost / survived, 2) if survived else 0.0,
			"cost_per_dispatched_seedling": flt(total_cost / dispatched, 2) if dispatched else 0.0,
		},
		update_modified=False,
		notify=True,
	)

	refresh_log_running_totals(batch_name)

	if update_seedling_request and batch.seedling_request:
		update_request(batch.seedling_request)


def refresh_log_running_totals(batch_name):
	"""Rewrite cumulative_qty / surviving_qty on every log of a batch.

	Editing or deleting an early log shifts the running totals of every later
	one, so they are always recomputed as a set.

	`cumulative_qty` is the running total of that activity. `surviving_qty` is
	the population still alive, so it counts one base activity only — counting
	every activity would tally the same seedlings several times over and would
	not reconcile with the batch's own total_survived.
	"""
	logs = frappe.get_all(
		"Daily Propagation Log",
		filters={"propagation_batch": batch_name},
		fields=["name", "activity_type", "qty_done_today", "mortality_today"],
		order_by="log_date asc, creation asc",
	)
	if not logs:
		return

	base_activity = "Cutting" if any(log.activity_type == "Cutting" for log in logs) else "Sticking"
	fallback_base = cint(frappe.db.get_value("Propagation Batch", batch_name, "total_cuttings_received"))

	per_activity = {}
	base = 0
	mortality_so_far = 0
	for log in logs:
		cumulative = per_activity.get(log.activity_type, 0) + cint(log.qty_done_today)
		per_activity[log.activity_type] = cumulative
		if log.activity_type == base_activity:
			base += cint(log.qty_done_today)
		mortality_so_far += cint(log.mortality_today)

		frappe.db.set_value(
			"Daily Propagation Log",
			log.name,
			{
				"cumulative_qty": cumulative,
				"surviving_qty": max(0, (base or fallback_base) - mortality_so_far),
			},
			update_modified=False,
		)


def update_request(seedling_request):
	from upande_propagation.upande_propagation.doctype.seedling_request.seedling_request import (
		update_fulfilment,
	)

	update_fulfilment(seedling_request)


def maybe_advance_stage(batch_name, stage, on_date=None, qty=None):
	"""Move a batch forward to `stage` if it is not already there or beyond."""
	if not stage:
		return

	batch = frappe.get_doc("Propagation Batch", batch_name)
	if batch.docstatus != 1 or batch.current_stage == COMPLETED:
		return
	if stage_index(stage) <= stage_index(batch.current_stage):
		return

	_move_to_stage(batch, stage, on_date=on_date, qty=qty)
	batch.flags.ignore_permissions = True
	batch.save()


def _move_to_stage(batch, stage, on_date=None, qty=None, notes=None):
	on_date = getdate(on_date or today())

	open_row = None
	for row in batch.stages:
		if row.stage == batch.current_stage and not row.end_date:
			open_row = row
			break

	moving_qty = cint(qty) if qty is not None else cint(batch.total_survived)
	if open_row:
		open_row.end_date = on_date
		open_row.qty_exited = moving_qty or cint(open_row.qty_entered)
		if notes:
			open_row.notes = notes

	existing = next((row for row in batch.stages if row.stage == stage), None)
	if existing:
		existing.start_date = existing.start_date or on_date
		existing.end_date = None
		existing.qty_entered = moving_qty or cint(existing.qty_entered)
	else:
		batch.append(
			"stages",
			{
				"stage": stage,
				"start_date": on_date,
				"qty_entered": moving_qty or cint(batch.total_cuttings_actual),
				"moved_by": frappe.session.user,
				"notes": notes,
			},
		)

	batch.current_stage = stage


# ----------------------------------------------------------------- desk actions


@frappe.whitelist()
def advance_stage(batch, stage=None, qty=None, notes=None):
	"""Move a batch to the next stage, or to an explicitly named later stage."""
	doc = frappe.get_doc("Propagation Batch", batch)
	doc.check_permission("write")

	if doc.docstatus != 1:
		frappe.throw(_("Submit the batch before advancing its stage."))
	if doc.current_stage == COMPLETED:
		frappe.throw(_("Batch {0} is already completed.").format(frappe.bold(batch)))

	current = stage_index(doc.current_stage)
	if stage:
		if stage_index(stage) <= current:
			frappe.throw(
				_("{0} is not ahead of the current stage {1}.").format(
					frappe.bold(stage), frappe.bold(doc.current_stage)
				)
			)
		target = stage
	else:
		if current >= len(STAGE_SEQUENCE) - 1:
			frappe.throw(_("Batch is at the last stage. Use Complete Batch to close it."))
		target = STAGE_SEQUENCE[current + 1]

	_move_to_stage(doc, target, qty=qty, notes=notes)
	doc.save()
	return doc.current_stage


@frappe.whitelist()
def complete_batch(batch):
	"""Close the open stage and mark the batch Completed."""
	doc = frappe.get_doc("Propagation Batch", batch)
	doc.check_permission("write")

	if doc.docstatus != 1:
		frappe.throw(_("Submit the batch before completing it."))
	if doc.current_stage == COMPLETED:
		return doc.current_stage

	for row in doc.stages:
		if not row.end_date:
			row.end_date = today()
			row.qty_exited = cint(row.qty_exited) or cint(doc.total_survived)

	doc.current_stage = COMPLETED
	doc.save()
	return doc.current_stage


@frappe.whitelist()
def recalculate(batch):
	doc = frappe.get_doc("Propagation Batch", batch)
	doc.check_permission("write")
	recalculate_batch(batch)
	return True
