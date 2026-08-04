# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, date_diff, flt, getdate


class SeedlingRequest(Document):
	def validate(self):
		self.validate_dates()
		self.validate_items()
		self.calculate_totals()
		self.set_status()

	def before_update_after_submit(self):
		# Frappe skips validate() once a document is submitted, so the totals and
		# status have to be re-derived here when dispatches land.
		self.calculate_totals()
		self.set_status()

	def before_cancel(self):
		if frappe.db.exists("Propagation Batch", {"seedling_request": self.name, "docstatus": 1}):
			frappe.throw(_("Cancel the Propagation Batches raised against this request first."))

	# ------------------------------------------------------------------ helpers

	def validate_dates(self):
		if self.required_by_date and self.request_date:
			if getdate(self.required_by_date) < getdate(self.request_date):
				frappe.throw(_("Required By Date cannot be before the Request Date."))

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Add at least one variety to request."))

		for row in self.items:
			if cint(row.qty_requested) <= 0:
				frappe.throw(_("Row #{0}: Qty Requested must be greater than zero.").format(row.idx))
			if cint(row.qty_dispatched) < 0:
				frappe.throw(_("Row #{0}: Qty Dispatched cannot be negative.").format(row.idx))

	def calculate_totals(self):
		requested = dispatched = 0
		for row in self.items:
			row.qty_pending = max(0, cint(row.qty_requested) - cint(row.qty_dispatched))
			requested += cint(row.qty_requested)
			dispatched += cint(row.qty_dispatched)

		self.total_qty_requested = requested
		self.total_qty_dispatched = dispatched
		self.fulfilment_percentage = flt(dispatched * 100.0 / requested, 2) if requested else 0.0
		self.days_to_fulfil = self.get_days_to_fulfil(requested, dispatched)

	def get_days_to_fulfil(self, requested, dispatched):
		"""Days from request to the dispatch that completed it (0 until fulfilled)."""
		if not requested or dispatched < requested or not self.request_date:
			return 0

		dates = frappe.get_all(
			"Seedling Dispatch",
			filters={"seedling_request": self.name, "docstatus": 1},
			pluck="dispatch_date",
		)
		if not dates:
			return 0
		return max(0, date_diff(getdate(max(dates)), getdate(self.request_date)))

	def set_status(self):
		if self.docstatus == 0:
			self.status = "Draft"
			return
		if self.docstatus == 2:
			self.status = "Cancelled"
			return

		requested = cint(self.total_qty_requested)
		dispatched = cint(self.total_qty_dispatched)

		if dispatched <= 0:
			in_propagation = frappe.db.exists(
				"Propagation Batch", {"seedling_request": self.name, "docstatus": 1}
			)
			self.status = "In Progress" if in_propagation else "Submitted"
		elif dispatched < requested:
			self.status = "Partially Fulfilled"
		else:
			self.status = "Fulfilled"


def update_fulfilment(seedling_request):
	"""Re-derive dispatched quantities, totals and status from submitted dispatches."""
	if not seedling_request or not frappe.db.exists("Seedling Request", seedling_request):
		return

	doc = frappe.get_doc("Seedling Request", seedling_request)
	if doc.docstatus != 1:
		return

	dispatched_by_variety = {}
	for row in frappe.get_all(
		"Seedling Dispatch",
		filters={"seedling_request": seedling_request, "docstatus": 1},
		fields=["variety", "qty_dispatched"],
	):
		dispatched_by_variety[row.variety] = dispatched_by_variety.get(row.variety, 0) + cint(
			row.qty_dispatched
		)

	# Allocate each variety's dispatches across its request rows, in row order.
	for row in doc.items:
		available = dispatched_by_variety.get(row.variety, 0)
		allocated = min(available, cint(row.qty_requested))
		dispatched_by_variety[row.variety] = available - allocated
		row.qty_dispatched = allocated

	# Anything dispatched beyond what a row asked for still counts as delivered.
	for row in doc.items:
		extra = dispatched_by_variety.get(row.variety, 0)
		if extra:
			row.qty_dispatched = cint(row.qty_dispatched) + extra
			dispatched_by_variety[row.variety] = 0

	doc.flags.ignore_permissions = True
	doc.save()
