# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, getdate, today

from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	ACTIVITY_STAGE_MAP,
	COMPLETED,
	maybe_advance_stage,
	recalculate_batch,
)


SCOUTING = "Disease / Scouting"


class DailyPropagationLog(Document):
	def validate(self):
		self.validate_batch()
		self.validate_counts()
		self.set_batch_details()

	def on_update(self):
		# Runs on insert and on update: the batch totals are derived from its logs.
		recalculate_batch(self.propagation_batch)
		maybe_advance_stage(
			self.propagation_batch,
			ACTIVITY_STAGE_MAP.get(self.activity_type),
			on_date=self.log_date,
		)
		self.load_running_totals()

	def on_trash(self):
		self.flags.recalculate_batch = self.propagation_batch

	def after_delete(self):
		recalculate_batch(self.flags.recalculate_batch or self.propagation_batch)

	# ------------------------------------------------------------------ helpers

	def validate_batch(self):
		batch = frappe.db.get_value(
			"Propagation Batch",
			self.propagation_batch,
			["docstatus", "current_stage", "start_date"],
			as_dict=True,
		)
		if batch.docstatus == 0:
			frappe.throw(
				_("Propagation Batch {0} is a draft. Submit it before logging work against it.").format(
					frappe.bold(self.propagation_batch)
				)
			)
		if batch.docstatus == 2:
			frappe.throw(_("Propagation Batch {0} is cancelled.").format(frappe.bold(self.propagation_batch)))
		if batch.current_stage == COMPLETED:
			frappe.throw(
				_("Propagation Batch {0} is completed and no longer accepts logs.").format(
					frappe.bold(self.propagation_batch)
				)
			)

		if batch.start_date and getdate(self.log_date) < getdate(batch.start_date):
			frappe.throw(
				_("Log Date cannot be before the batch start date {0}.").format(
					frappe.bold(frappe.format(batch.start_date, "Date"))
				)
			)
		if getdate(self.log_date) > getdate(today()):
			frappe.throw(_("Log Date cannot be in the future."))

	def validate_counts(self):
		if cint(self.qty_done_today) < 0:
			frappe.throw(_("Qty Done Today cannot be negative."))
		if cint(self.mortality_today) < 0:
			frappe.throw(_("Mortality Today cannot be negative."))
		if cint(self.affected_qty) < 0:
			frappe.throw(_("Plants Affected cannot be negative."))
		# A scouting round is a log with nothing done and nothing dead: what it
		# records is what was SEEN. Requiring a count here forced the finding to
		# be typed as mortality, which both overstated the loss and lost the
		# disease behind it.
		if self.activity_type == SCOUTING:
			if not cint(self.affected_qty) and not (self.observations or "").strip():
				frappe.throw(_("Say how many plants are affected, or what you saw."))
			return
		if not cint(self.qty_done_today) and not cint(self.mortality_today):
			frappe.throw(_("Record either work done or mortality — a log of zeroes says nothing."))

	def set_batch_details(self):
		batch = frappe.db.get_value(
			"Propagation Batch",
			self.propagation_batch,
			["variety", "propagation_unit", "seedling_request"],
			as_dict=True,
		)
		self.rose_variety = batch.variety
		self.greenhouse = batch.propagation_unit
		self.propagation_order = batch.seedling_request
		if not self.logged_by:
			self.logged_by = frappe.session.user

	def load_running_totals(self):
		"""Read back what the batch rollup wrote, so the in-memory doc agrees with it.

		The running totals span every log of the batch, so they are computed once
		for the whole set rather than per document.
		"""
		totals = frappe.db.get_value(
			"Daily Propagation Log", self.name, ["cumulative_qty", "surviving_qty"], as_dict=True
		)
		if totals:
			self.cumulative_qty = totals.cumulative_qty
			self.surviving_qty = totals.surviving_qty
