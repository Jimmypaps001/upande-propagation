# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, now_datetime

from upande_propagation.upande_propagation.doctype.mother_block.mother_block import (
	update_cutting_totals,
)
from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	COMPLETED,
	recalculate_batch,
)


class BudwoodHarvest(Document):
	def validate(self):
		self.set_harvest_datetime()
		self.validate_stems()
		self.validate_mother_block()
		self.validate_propagation_batch()

	def before_update_after_submit(self):
		# `propagation_batch` is editable after submit and validate() no longer runs.
		self.validate_propagation_batch()

	def on_submit(self):
		self.update_sources()

	def on_cancel(self):
		self.update_sources()

	def on_update_after_submit(self):
		# `propagation_batch` is editable after submit, so cuttings can be booked
		# into a batch later. Both the old and the new batch need re-adding up.
		before = self.get_doc_before_save()
		previous = before.propagation_batch if before else None
		if previous and previous != self.propagation_batch:
			recalculate_batch(previous)
		self.update_sources()

	# ------------------------------------------------------------------ helpers

	def set_harvest_datetime(self):
		# Read-only field with nothing to fill it: every record on record was NULL.
		if not self.harvest_datetime:
			self.harvest_datetime = now_datetime()

	def validate_stems(self):
		if cint(self.number_of_stems) <= 0:
			frappe.throw(_("Number Of Stems must be greater than zero."))

	def validate_mother_block(self):
		if not self.mother_block:
			return

		block = frappe.db.get_value("Mother Block", self.mother_block, ["variety", "status"], as_dict=True)
		if block.variety and self.item and block.variety != self.item:
			frappe.throw(
				_("Mother Block {0} carries variety {1}, not {2}.").format(
					frappe.bold(self.mother_block), frappe.bold(block.variety), frappe.bold(self.item)
				)
			)
		if block.status != "Active" and self.docstatus == 0:
			frappe.throw(
				_("Mother Block {0} is {1} and cannot be harvested from.").format(
					frappe.bold(self.mother_block), frappe.bold(block.status)
				)
			)

	def validate_propagation_batch(self):
		if not self.propagation_batch:
			return

		batch = frappe.db.get_value(
			"Propagation Batch",
			self.propagation_batch,
			["docstatus", "current_stage", "variety"],
			as_dict=True,
		)
		if batch.docstatus != 1:
			frappe.throw(
				_("Propagation Batch {0} must be submitted before cuttings can be booked into it.").format(
					frappe.bold(self.propagation_batch)
				)
			)
		if batch.current_stage == COMPLETED:
			frappe.throw(_("Propagation Batch {0} is completed.").format(frappe.bold(self.propagation_batch)))
		if batch.variety and self.item and batch.variety != self.item:
			frappe.throw(
				_("Propagation Batch {0} is propagating {1}, not {2}.").format(
					frappe.bold(self.propagation_batch), frappe.bold(batch.variety), frappe.bold(self.item)
				)
			)

	def update_sources(self):
		if self.mother_block:
			update_cutting_totals(self.mother_block)
		if self.propagation_batch:
			recalculate_batch(self.propagation_batch)
