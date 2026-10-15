# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, get_link_to_form, getdate, today

from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	COMPLETED,
	FIRST_DISPATCHABLE_STAGE,
	recalculate_batch,
	stage_index,
)
from upande_propagation.upande_propagation.doctype.seedling_request.seedling_request import (
	update_fulfilment,
)


class SeedlingDispatch(Document):
	def validate(self):
		self.set_purpose_fields()
		self.set_batch_details()
		self.validate_batch()
		self.validate_quantity()
		self.validate_request()
		self.validate_destination()

	def on_submit(self):
		self.update_sources()
		self.move_stock()

	def on_cancel(self):
		self.ignore_linked_doctypes = ("GL Entry", "Stock Ledger Entry",
		                               "Repost Item Valuation")
		self.cancel_stock()
		self.update_sources()

	# ------------------------------------------------------------------ helpers

	def set_purpose_fields(self):
		"""A sale leaves the farm; internal planting stays on it. Never both."""
		if self.purpose == "Sale":
			# A sale does not fulfil the farm's own seedling demand.
			self.seedling_request = None
			self.target_crop_cycle = None
			self.amount = flt(self.selling_rate) * cint(self.qty_dispatched)
		else:
			self.customer = None
			self.selling_rate = 0
			self.amount = 0

	def set_batch_details(self):
		batch = frappe.db.get_value(
			"Propagation Batch",
			self.propagation_batch,
			["variety", "seedling_request", "available_to_dispatch", "current_stage",
			 "company", "propagation_unit", "consignment_code"],
			as_dict=True,
		)
		self.variety = batch.variety
		self.plant_consignment = batch.consignment_code
		if not self.source_warehouse:
			self.source_warehouse = batch.propagation_unit
		self.available_to_dispatch = cint(batch.available_to_dispatch)
		self.current_stage = batch.current_stage
		if not self.seedling_request and self.purpose != "Sale":
			self.seedling_request = batch.seedling_request
		# Derived, not defaulted. Company is mandatory, so Frappe fills it from
		# the session before this runs, and on a multi-company site that default
		# is somebody else's company -- which the stock transfer then refuses,
		# correctly, because the batch's unit does not belong to it.
		if batch.company:
			self.company = batch.company
		if not self.received_by:
			self.received_by = frappe.session.user
		if not self.farm and self.seedling_request:
			self.farm = frappe.db.get_value("Seedling Request", self.seedling_request, "farm")

	def validate_batch(self):
		docstatus = cint(frappe.db.get_value("Propagation Batch", self.propagation_batch, "docstatus"))
		if docstatus != 1:
			frappe.throw(
				_("Propagation Batch {0} must be submitted before seedlings can leave it.").format(
					frappe.bold(self.propagation_batch)
				)
			)

		if self.current_stage != COMPLETED and stage_index(self.current_stage) < stage_index(
			FIRST_DISPATCHABLE_STAGE
		):
			frappe.throw(
				_("Batch {0} is at {1}. Seedlings can only be dispatched from {2} onwards.").format(
					frappe.bold(self.propagation_batch),
					frappe.bold(self.current_stage),
					frappe.bold(FIRST_DISPATCHABLE_STAGE),
				)
			)

		if getdate(self.dispatch_date) > getdate(today()):
			frappe.throw(_("Dispatch Date cannot be in the future."))

	def validate_quantity(self):
		if cint(self.qty_dispatched) <= 0:
			frappe.throw(_("Qty Dispatched must be greater than zero."))

		# available_to_dispatch already excludes this document while it is a draft.
		if self.docstatus == 0 and cint(self.qty_dispatched) > cint(self.available_to_dispatch):
			frappe.throw(
				_("Only {0} seedlings are available to dispatch from batch {1}.").format(
					frappe.bold(cint(self.available_to_dispatch)), frappe.bold(self.propagation_batch)
				)
			)

	def validate_request(self):
		if not self.seedling_request:
			return

		docstatus = cint(frappe.db.get_value("Seedling Request", self.seedling_request, "docstatus"))
		if docstatus != 1:
			frappe.throw(
				_("Seedling Request {0} is not submitted.").format(frappe.bold(self.seedling_request))
			)

		varieties = frappe.get_all(
			"Seedling Request Item",
			filters={"parent": self.seedling_request, "parenttype": "Seedling Request"},
			pluck="variety",
		)
		if self.variety not in varieties:
			frappe.throw(
				_("Seedling Request {0} does not ask for {1}.").format(
					frappe.bold(self.seedling_request), frappe.bold(self.variety)
				)
			)

	def validate_destination(self):
		if self.purpose == "Sale":
			if not self.customer:
				frappe.throw(_("Customer is required to sell seedlings."))
			if flt(self.selling_rate) <= 0:
				frappe.throw(_("Rate Per Seedling must be greater than zero for a sale."))
		elif not self.target_greenhouse and not self.target_crop_cycle:
			frappe.throw(
				_("Set a Target Greenhouse or Target Crop Cycle so the seedlings can be traced to a bed.")
			)

	# ------------------------------------------------------------------- stock

	def move_stock(self):
		"""Hand the seedlings over on the ledger, not only on paper.

		A dispatch to one of our own farms is a transfer between two warehouses
		we own, so it is a Stock Entry and nothing more exotic. A sale leaves on
		the invoice instead, and a dispatch with nowhere to transfer to -- no
		unit, or a destination recorded only as a crop cycle -- stays a paper
		record and says so rather than inventing a warehouse.
		"""
		if self.purpose == "Sale" or self.stock_entry:
			return
		entry_type = frappe.db.get_single_value(
			"Propagation Settings", "dispatch_stock_entry_type")
		if not entry_type:
			return
		if not self.source_warehouse or not self.target_greenhouse:
			frappe.msgprint(
				_("No stock was moved: {0} needs both a propagation unit to leave "
				  "and a target greenhouse to arrive in.").format(self.name),
				alert=True, indicator="orange")
			return
		if self.source_warehouse == self.target_greenhouse:
			return

		se = frappe.new_doc("Stock Entry")
		se.stock_entry_type = entry_type
		se.purpose = frappe.db.get_value(
			"Stock Entry Type", entry_type, "purpose") or "Material Transfer"
		se.company = self.company
		se.posting_date = getdate(self.dispatch_date)
		se.set_posting_time = 1
		se.append("items", {
			"item_code": self.variety,
			"qty": cint(self.qty_dispatched),
			"s_warehouse": self.source_warehouse,
			"t_warehouse": self.target_greenhouse,
		})
		se.remarks = _("Seedling Dispatch {0}{1}").format(
			self.name,
			_(" -- consignment {0}").format(self.plant_consignment)
			if self.plant_consignment else "")
		se.flags.ignore_permissions = True
		try:
			se.insert()
			se.submit()
		except Exception:
			# A transfer that cannot post must not silently swallow the dispatch,
			# and must not take the dispatch down with it either: the seedlings
			# have physically gone. The entry is left for someone to fix.
			frappe.log_error(frappe.get_traceback(),
			                 "Seedling Dispatch %s: stock entry" % self.name)
			frappe.msgprint(
				_("The seedlings were dispatched but the stock transfer did not "
				  "post. Check the error log and move the stock by hand."),
				alert=True, indicator="red")
			return
		self.db_set("stock_entry", se.name)

	def cancel_stock(self):
		if not self.stock_entry:
			return
		if cint(frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus")) == 1:
			se = frappe.get_doc("Stock Entry", self.stock_entry)
			se.flags.ignore_permissions = True
			se.cancel()

	def update_sources(self):
		# The batch rollup refreshes dispatched/available, then the request.
		recalculate_batch(self.propagation_batch, update_seedling_request=False)
		if self.seedling_request:
			update_fulfilment(self.seedling_request)


def apply_invoice_defaults(invoice, dispatch):
	"""Fill site-specific Sales Invoice fields from Propagation Settings.

	Sites make their own fields mandatory on Sales Invoice (business unit, farm,
	and so on). Rather than hard-code any of them, each is configured once as a
	fieldname/value pair; a value written as `{fieldname}` is copied off the
	dispatch.
	"""
	try:
		settings = frappe.get_cached_doc("Propagation Settings")
	except frappe.DoesNotExistError:
		return

	for row in settings.sales_invoice_defaults:
		field = invoice.meta.get_field(row.fieldname)
		if not field:
			continue

		value = (row.value or "").strip()
		source = None
		if value.startswith("{") and value.endswith("}"):
			source = value[1:-1]
			value = dispatch.get(source)

		if value:
			invoice.set(row.fieldname, value)
		elif field.reqd and source:
			# Fail with something actionable instead of a bare MandatoryError.
			frappe.throw(
				_("{0} is empty on {1}, but Propagation Settings maps it to the mandatory {2} field.").format(
					frappe.bold(_(dispatch.meta.get_label(source))),
					frappe.bold(dispatch.name),
					frappe.bold(_(field.label)),
				)
			)


@frappe.whitelist()
def make_sales_invoice(dispatch):
	"""Raise a draft Sales Invoice for a sold dispatch and link it back."""
	doc = frappe.get_doc("Seedling Dispatch", dispatch)
	doc.check_permission("read")

	if doc.purpose != "Sale":
		frappe.throw(_("Only dispatches with purpose Sale can be invoiced."))
	if doc.docstatus != 1:
		frappe.throw(_("Submit the dispatch before invoicing it."))
	if doc.sales_invoice and frappe.db.get_value("Sales Invoice", doc.sales_invoice, "docstatus") != 2:
		frappe.throw(
			_("Dispatch {0} is already invoiced by {1}.").format(
				frappe.bold(doc.name), get_link_to_form("Sales Invoice", doc.sales_invoice)
			)
		)

	company = frappe.get_cached_doc("Company", doc.company)
	# Seedlings are sold out of the nursery they were raised in.
	warehouse = doc.target_greenhouse or frappe.db.get_value(
		"Propagation Batch", doc.propagation_batch, "propagation_unit"
	)

	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = doc.customer
	invoice.company = doc.company
	invoice.posting_date = doc.dispatch_date
	invoice.set_posting_time = 1
	# Accounting only — the module keeps no stock ledger for seedlings.
	invoice.update_stock = 0
	invoice.remarks = _("Seedlings from propagation batch {0} (dispatch {1})").format(
		doc.propagation_batch, doc.name
	)
	invoice.append(
		"items",
		{
			"item_code": doc.variety,
			"qty": cint(doc.qty_dispatched),
			"rate": flt(doc.selling_rate),
			"description": _("Rooted seedlings — batch {0}, grade {1}").format(
				doc.propagation_batch, doc.grade or _("ungraded")
			),
			"warehouse": warehouse,
			"income_account": company.default_income_account,
			"cost_center": company.cost_center,
		},
	)
	apply_invoice_defaults(invoice, doc)
	invoice.insert()

	doc.db_set("sales_invoice", invoice.name)
	return invoice.name
