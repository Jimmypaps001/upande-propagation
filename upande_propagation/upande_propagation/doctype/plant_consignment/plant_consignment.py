# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""One delivery of plant material, from the gate to the ledger.

A consignment is the unit everything downstream hangs off: the quality check is
against it, the stock receipt is against it, the propagation batches are raised
from it and the dispatch to the farm still names it. That is the point -- the
number a driver hands over at the gate is the number the farm quotes back when
a bed fails, and nothing in between is allowed to invent its own.

The number
----------
Year, ISO week, day of week, with **Sunday as 01**::

        2026-42-04        Wednesday of ISO week 42, 2026

That is the format the unit already writes on its own paperwork. A second
consignment on the same day gets `-2`, `-3`, because the alternative is two
documents that claim to be the same delivery.

The number is not the document name on its own -- a bare `2026-42-04` in a list
of links reads like a date and nothing else -- so the document is `PC-2026-42-04`
and the bare code lives on `consignment`, which is the title field and the thing
that carries into `PB-2026-42-04-0001` and onto the dispatch.

What this does NOT do
---------------------
It does not re-implement goods receipt or quality control. ERPNext already has
Purchase Receipt, Quality Inspection, Quality Inspection Template and
Item.inspection_required_before_purchase, and
upande_summer_flowers.summer_flowers.setup.plant_quality has already switched
the template on for all 104 plant items on this site. This builds those
documents from what the phone was told and links them back. The stock figure is
the Stock Ledger's, the inspection is a real Quality Inspection, and a correction
is a cancellation of both.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate, now_datetime, today

TEMPLATE_FALLBACK = "Plant Material Incoming"

# Forms that arrive as living plant material and therefore start propagation
# work. Seeds are bought too, but a seed is not a plantlet and the unit does
# not stage it through callusing.
PROPAGATABLE_FORMS = ("Tissue Culture", "Rooted Cuttings", "Unrooted Cuttings",
                      "Roots", "Plants")


def consignment_code(on_date=None):
	"""`YYYY-WW-DD` for a date, with Sunday as day 01.

	isoweekday() runs Monday 1 .. Sunday 7. The unit counts from Sunday, so the
	modulo rotates Sunday to the front and the +1 makes it 01 rather than 00.
	"""
	d = getdate(on_date or today())
	iso_year, iso_week, _weekday = d.isocalendar()
	dow = (d.isoweekday() % 7) + 1
	return "%d-%02d-%02d" % (iso_year, iso_week, dow)


def next_name(code):
	"""`PC-<code>`, then `PC-<code>-2`, `-3` for repeats on the same day."""
	base = "PC-" + code
	if not frappe.db.exists("Plant Consignment", base):
		return base, code
	n = 2
	while frappe.db.exists("Plant Consignment", "%s-%d" % (base, n)):
		n += 1
	return "%s-%d" % (base, n), "%s-%d" % (code, n)


class PlantConsignment(Document):
	def autoname(self):
		if self.amended_from:
			# An amendment keeps its own trail; Frappe appends the -1 itself.
			self.name = None
			return
		self.name, self.consignment = next_name(consignment_code(self.arrival_date))

	def validate(self):
		self.set_defaults()
		self.validate_quantity()
		self.validate_warehouses()
		self.set_unbatched()

	def before_submit(self):
		if not self.consignment:
			self.name, self.consignment = next_name(
				consignment_code(self.arrival_date))
		# Submitted means the delivery is recorded, not that it has been looked
		# at. Receiving it onto the ledger is the check's job, and the check is a
		# separate act by a separate person often enough that collapsing the two
		# would put stock on the books nobody has yet inspected.
		self.status = "Awaiting Check"

	def on_cancel(self):
		self.ignore_linked_doctypes = ("GL Entry", "Stock Ledger Entry",
		                               "Repost Item Valuation")
		if frappe.db.exists("Propagation Batch",
		                    {"plant_consignment": self.name, "docstatus": 1}):
			frappe.throw(_("Cancel the propagation batches raised from {0} first.")
			             .format(frappe.bold(self.name)))
		for dt, field in (("Purchase Receipt", "purchase_receipt"),
		                  ("Quality Inspection", "quality_inspection")):
			ref = self.get(field)
			if ref and cint(frappe.db.get_value(dt, ref, "docstatus")) == 1:
				frappe.throw(_("Cancel {0} first -- it is what put this delivery "
				               "on the ledger.").format(
					frappe.utils.get_link_to_form(dt, ref)))
		self.db_set("status", "Cancelled")

	# ------------------------------------------------------------------ helpers

	def set_defaults(self):
		if not self.company:
			self.company = frappe.defaults.get_user_default("Company")
		if not self.currency and self.company:
			self.currency = frappe.get_cached_value("Company", self.company,
			                                        "default_currency")
		if not self.uom and self.variety:
			self.uom = frappe.get_cached_value("Item", self.variety, "stock_uom")
		if not self.consignment:
			self.consignment = consignment_code(self.arrival_date)
		settings = frappe.get_cached_doc("Propagation Settings")
		if not self.warehouse:
			self.warehouse = settings.get("default_receipt_warehouse")
		if not self.rejected_warehouse:
			self.rejected_warehouse = settings.get("default_rejected_warehouse")

	def validate_quantity(self):
		if cint(self.qty_received) <= 0:
			frappe.throw(_("Quantity Received must be greater than zero."))
		if getdate(self.arrival_date) > getdate(today()):
			frappe.throw(_("A delivery cannot arrive in the future."))

	def validate_warehouses(self):
		if self.rejected_warehouse and self.rejected_warehouse == self.warehouse:
			frappe.throw(_("The rejected warehouse cannot be the accepted one. "
			               "ERPNext will not hold rejected stock alongside good "
			               "stock in the same bin."))
		for field in ("warehouse", "rejected_warehouse"):
			wh = self.get(field)
			if wh and self.company and frappe.db.get_value(
					"Warehouse", wh, "company") != self.company:
				frappe.throw(_("{0} does not belong to {1}.").format(
					frappe.bold(wh), frappe.bold(self.company)))

	def warehouse_company_error(self, field, warehouse):
		"""The message validate_warehouses would have given, reusable off-save."""
		owner = frappe.db.get_value("Warehouse", warehouse, "company")
		if owner and self.company and owner != self.company:
			return _("{0} belongs to {1}, but this delivery is {2}'s. Pick a "
			         "warehouse on {2}'s books.").format(
				frappe.bold(warehouse), frappe.bold(owner),
				frappe.bold(self.company))
		return None

	def needs_check(self):
		return cint(frappe.get_cached_value(
			"Item", self.variety, "inspection_required_before_purchase"))

	def set_unbatched(self):
		self.qty_unbatched = max(
			0, cint(self.qty_accepted or self.qty_received)
			- cint(self.plants_batched))


# --------------------------------------------------------------------- the check
def template_for(variety):
	"""The inspection template this variety is checked against."""
	named = frappe.get_cached_value("Item", variety, "quality_inspection_template")
	if named:
		return named
	settings = frappe.get_cached_doc("Propagation Settings")
	chosen = settings.get("quality_inspection_template")
	if chosen:
		return chosen
	if frappe.db.exists("Quality Inspection Template", TEMPLATE_FALLBACK):
		return TEMPLATE_FALLBACK
	return None


@frappe.whitelist()
def check_sheet(consignment):
	"""The blank check sheet for a consignment: one row per parameter."""
	doc = frappe.get_doc("Plant Consignment", consignment)
	doc.check_permission("read")
	template = template_for(doc.variety)
	rows = []
	if template:
		for r in frappe.get_all(
			"Item Quality Inspection Parameter",
			filters={"parent": template, "parenttype": "Quality Inspection Template"},
			fields=["specification", "numeric", "min_value", "max_value", "value",
			        "formula_based_criteria", "acceptance_formula"],
			order_by="idx asc",
		):
			rows.append({
				"specification": r.specification,
				"numeric": cint(r.numeric),
				"min_value": flt(r.min_value),
				"max_value": flt(r.max_value),
				"expected_value": r.value,
				"formula": r.acceptance_formula if cint(r.formula_based_criteria) else None,
				"reading_value": None,
				"status": None,
			})
	return {
		"consignment": doc.name,
		"code": doc.consignment,
		"template": template,
		"variety": doc.variety,
		"variety_name": doc.variety_name,
		"qty_received": cint(doc.qty_received),
		"qc_status": doc.qc_status,
		"status": doc.status,
		"warehouse": doc.warehouse,
		"rejected_warehouse": doc.rejected_warehouse,
		"parameters": rows,
		"recorded": [r.as_dict() for r in (doc.readings or [])],
	}


def _check_company(doc, field, warehouse):
	"""Refuse a wrong-company warehouse before it reaches the ledger."""
	message = doc.warehouse_company_error(field, warehouse)
	if message:
		frappe.throw(message)


@frappe.whitelist()
def accept(consignment, accepted, rejected=0, readings=None, reason=None,
           rejected_warehouse=None, supplier_delivery_note=None):
	"""Record the check, then put what passed on the ledger.

	The operator's split decides the outcome, not the readings: a reading that
	sits outside a placeholder threshold nobody agronomic has signed off is not
	a reason to refuse a delivery that the person holding it can see is fine.
	The readings are kept because they are the evidence, and they are what the
	Quality Inspection carries.

	An all-rejected delivery writes no Purchase Receipt. Nothing of it entered
	the farm, so putting it through the accepted warehouse to take it straight
	out again would be two ledger entries describing a lorry that turned round.
	"""
	doc = frappe.get_doc("Plant Consignment", consignment)
	doc.check_permission("submit")
	if doc.docstatus != 1:
		frappe.throw(_("Submit {0} before checking it.").format(doc.name))
	if doc.status == "Received":
		frappe.throw(_("{0} has already been received on {1}.").format(
			doc.name, frappe.utils.get_link_to_form(
				"Purchase Receipt", doc.purchase_receipt)))

	accepted, rejected = cint(accepted), cint(rejected)
	if accepted < 0 or rejected < 0:
		frappe.throw(_("A quantity cannot be negative."))
	if accepted + rejected > cint(doc.qty_received):
		frappe.throw(_("Accepted ({0}) and rejected ({1}) come to more than the "
		               "{2} that arrived.").format(
			accepted, rejected, cint(doc.qty_received)))
	if accepted + rejected == 0:
		frappe.throw(_("Say how many passed and how many were turned away."))
	if rejected and not (rejected_warehouse or doc.rejected_warehouse):
		frappe.throw(_("{0} were rejected, so a rejected warehouse is needed.")
		             .format(rejected))
	if rejected and reason is None:
		reason = doc.rejection_reason

	if isinstance(readings, str):
		readings = frappe.parse_json(readings or "[]")

	if rejected_warehouse:
		# db_set writes straight past validate(), and on a submitted document
		# validate() never runs again anyway -- so the company check that
		# guards this field on save does not guard it here. Without this, a
		# warehouse belonging to another company goes onto the Purchase
		# Receipt, ERPNext refuses the submit, and the delivery is Held for a
		# reason the operator cannot see or fix.
		_check_company(doc, "rejected_warehouse", rejected_warehouse)
		doc.db_set("rejected_warehouse", rejected_warehouse, update_modified=False)
	if supplier_delivery_note:
		doc.db_set("supplier_delivery_note", supplier_delivery_note,
		           update_modified=False)
		doc.supplier_delivery_note = supplier_delivery_note

	_clear_stale(doc, accepted, rejected)
	_store_readings(doc, readings)

	if accepted <= 0:
		# Nothing entered the farm. A Quality Inspection needs a stock document
		# to reference and there is none, so the evidence stays on the readings
		# table above, which is why that table exists.
		doc.db_set({
			"qty_accepted": 0, "qty_rejected": rejected,
			"rejection_reason": reason, "qc_status": "Rejected",
			"quality_inspection": None, "purchase_receipt": None,
			"checked_by": frappe.session.user, "checked_on": now_datetime(),
			"status": "Rejected", "qty_unbatched": 0,
		}, update_modified=False)
		return {"consignment": doc.name, "code": doc.consignment,
		        "qc_status": "Rejected", "status": "Rejected",
		        "accepted": 0, "rejected": rejected, "held": False,
		        "purchase_receipt": None, "quality_inspection": None,
		        "failed": [], "message": _("The whole delivery was turned away. "
		                                   "Nothing was received onto the ledger.")}

	receipt = _reuse_or_make_receipt(doc, accepted, rejected, reason)
	# An item nobody asks an inspection of gets none. Raising an empty one to
	# keep the shape tidy would put a rubber stamp in the quality record.
	qi = _make_inspection(doc, receipt, readings, reason) if doc.needs_check() else None
	if qi:
		frappe.db.set_value("Purchase Receipt Item", {"parent": receipt.name},
		                    "quality_inspection", qi.name, update_modified=False)

	failed = [r.specification for r in qi.readings if r.status == "Rejected"] if qi else []
	held = bool(qi) and qi.status == "Rejected"
	refusal = None
	if not held:
		receipt.reload()
		# The savepoint goes here and not earlier: a refused submit must undo the
		# submit, not the receipt and inspection the held delivery still needs.
		frappe.db.savepoint("receipt_submit")
		try:
			receipt.submit()
		except Exception as e:
			# Sites put their own rules on a goods receipt -- karenroses will not
			# submit one without the supplier's paperwork attached -- and the
			# unit at the gate cannot be expected to know them in advance. The
			# delivery is held with the site's own words rather than the app
			# pretending the stock went through.
			frappe.db.rollback(save_point="receipt_submit")
			held = True
			refusal = frappe.utils.strip_html_tags(
				getattr(e, "message", None) or str(e)).strip()

	qc = ("Accepted" if not rejected and not failed
	      else "Partially Accepted")
	status = "Held" if held else "Received"
	doc.db_set({
		"qty_accepted": accepted,
		"qty_rejected": rejected,
		"rejection_reason": reason,
		"qc_status": qc,
		"quality_inspection": qi.name if qi else None,
		"purchase_receipt": receipt.name,
		"checked_by": frappe.session.user,
		"checked_on": now_datetime(),
		"status": status,
		# Held stock is not on the ledger, so there is nothing to bench yet.
		"qty_unbatched": 0 if held else accepted,
	}, update_modified=False)

	return {
		"consignment": doc.name,
		"code": doc.consignment,
		"qc_status": qc,
		"status": status,
		"accepted": accepted,
		"rejected": rejected,
		"held": held,
		"failed": failed,
		"purchase_receipt": receipt.name,
		"quality_inspection": qi.name if qi else None,
		"message": (refusal if refusal else
		            _("The check failed on {0}. {1} plant(s) are being held and "
		              "nothing has gone onto the ledger -- correct the reading "
		              "and check it again, or have the office submit receipt {2} "
		              "on its own authority.").format(
			          ", ".join(failed), accepted, receipt.name)
		            if held else
		            _("{0} received into {1} on {2}.").format(
			            accepted, doc.warehouse, receipt.name)),
	}


def _clear_stale(doc, accepted=None, rejected=None):
	"""Drop the paperwork a previous attempt at this check left as a draft.

	Re-checking is the ordinary case -- a reading is mistyped, or a count is
	recounted -- and leaving the first attempt's draft receipt behind would give
	the office two receipts for one lorry.

	With one exception, and it is the reason a Held delivery can be released at
	all. A site rule can refuse the goods receipt until the supplier's delivery
	note is attached to it. The unit attaches the note TO THAT DRAFT and checks
	the delivery in again -- so deleting the draft threw away the only thing
	that had changed, the new receipt was empty too, and the delivery was held
	forever with no sequence of actions that freed it. A draft carrying
	attachments, for the same quantities, is kept.
	"""
	receipt = doc.get("purchase_receipt")
	if not receipt or not frappe.db.exists("Purchase Receipt", receipt):
		return
	if cint(frappe.db.get_value("Purchase Receipt", receipt, "docstatus")) != 0:
		# It went through. There is nothing stale about it.
		return
	if accepted is not None and _receipt_is_answerable(receipt, accepted, rejected):
		return

	qi = doc.get("quality_inspection")

	# Links first, in the order they point: the consignment holds both, the
	# receipt line holds the inspection. Frappe refuses to cancel or delete
	# anything still pointed at, so each one has to be let go before the thing
	# it names can be.
	doc.db_set("quality_inspection", None, update_modified=False)
	doc.db_set("purchase_receipt", None, update_modified=False)
	frappe.db.set_value("Purchase Receipt Item", {"parent": receipt},
	                    "quality_inspection", None, update_modified=False)

	# Nothing of either reached the stock ledger -- that is why the delivery was
	# held -- so there is no trail here worth keeping against the noise of two
	# receipts for one lorry.
	if qi and frappe.db.exists("Quality Inspection", qi):
		qi_doc = frappe.get_doc("Quality Inspection", qi)
		qi_doc.flags.ignore_permissions = True
		qi_doc.flags.ignore_links = True
		if qi_doc.docstatus == 1:
			qi_doc.cancel()
		frappe.delete_doc("Quality Inspection", qi, force=True,
		                  ignore_permissions=True)
	frappe.delete_doc("Purchase Receipt", receipt, force=True,
	                  ignore_permissions=True)


def _store_readings(doc, readings):
	"""Keep the sheet on the consignment, whatever happens to the inspection."""
	doc.set("readings", [])
	for r in (readings or []):
		doc.append("readings", {
			"specification": r.get("specification"),
			"numeric": cint(r.get("numeric")),
			"min_value": flt(r.get("min_value")),
			"max_value": flt(r.get("max_value")),
			"reading_value": r.get("reading_value"),
			"expected_value": r.get("expected_value"),
			"status": r.get("status"),
		})
	doc.flags.ignore_validate_update_after_submit = True
	doc.save(ignore_permissions=True)


def _receipt_is_answerable(receipt, accepted, rejected):
	"""Does this held draft now carry what it was refused for, for these counts?

	Attachments are the only thing a unit can add to a held receipt, and the
	quantities have to still describe the same delivery -- a recount makes the
	old draft, and whatever is attached to it, a statement about something else.
	"""
	row = frappe.db.get_value("Purchase Receipt Item", {"parent": receipt},
	                          ["qty", "rejected_qty"], as_dict=True)
	if not row:
		return False
	if cint(row.qty) != cint(accepted) or cint(row.rejected_qty) != cint(rejected or 0):
		return False
	return bool(frappe.get_all("File", limit=1, filters={
		"attached_to_doctype": "Purchase Receipt", "attached_to_name": receipt}))


def _reuse_or_make_receipt(doc, accepted, rejected, reason):
	"""The receipt this check should submit -- the held one, if there is one.

	A site rule can refuse the goods receipt (karenroses will not submit one
	without the supplier's delivery note attached). The delivery is then Held
	and the draft receipt is kept, because that is the document the unit has to
	attach the paperwork to.

	Making a fresh receipt on the next check threw that attachment away: the
	unit attached the note to the held receipt, checked the delivery in again,
	and the brand-new receipt had nothing attached to it either. There was no
	sequence of actions that released a Held delivery. So a draft receipt
	already raised for this consignment is reused, and only a change in what
	was accepted or rejected makes a new one.
	"""
	existing = doc.get("purchase_receipt")
	if existing and frappe.db.exists("Purchase Receipt", existing):
		pr = frappe.get_doc("Purchase Receipt", existing)
		if pr.docstatus == 0:
			row = pr.items[0] if pr.items else None
			same = (row is not None
			        and cint(row.qty) == cint(accepted)
			        and cint(row.get("rejected_qty")) == cint(rejected))
			if same:
				return pr
			# The numbers moved, so the old draft is wrong and whatever is
			# attached to it describes a different delivery. It goes, and the
			# caller is told the paperwork has to go on the new one.
			frappe.delete_doc("Purchase Receipt", pr.name, force=1,
			                  ignore_permissions=True, delete_permanently=True)
	return _make_receipt(doc, accepted, rejected, reason)


def _receipt_item(doc):
	"""The item a delivery is booked against. Roots are not plants.

	A root is bought, stored for a year, planted and lifted; what comes off it
	is a plant. Booking both against the one item makes 7,000 roots read as
	7,000 standing plants, and it breaks the only join there is between a
	goods receipt and a propagation plan -- the plan reads its receipts off the
	stock ledger by item code, so a receipt on the wrong item is a receipt the
	plan never sees.

	The site already keeps a separate "<variety> Roots" item for every variety
	that is bought that way, and the protocol's material route names it. Where
	neither exists the variety stands, because inventing an item here would put
	a stock record against something nobody buys.
	"""
	form = (doc.get("form") or "").strip()
	if form != "Roots":
		return doc.variety

	# The protocol is the authority on which item a stage is bought as. Read
	# through the plan when the delivery names one -- defensively, because
	# propagation does not require the summer flower app to be installed.
	plan = doc.get("propagation_plan")
	if plan:
		try:
			version = frappe.db.get_value(
				"Summer Flower Propagation Plan", plan, "protocol")
			if version:
				item = frappe.db.get_value("Crop Material Stage",
				                           {"parent": version, "stage": "Roots"},
				                           "item")
				if item and frappe.db.exists("Item", item):
					return item
		except Exception:
			frappe.clear_last_message()

	convention = "%s Roots" % doc.variety
	if frappe.db.exists("Item", convention):
		return convention
	return doc.variety


def _make_receipt(doc, accepted, rejected, reason):
	"""A Purchase Receipt with no purchase order behind it.

	Plant material turns up against an order often enough, but not always, and
	the unit at the gate cannot be made to wait for buying to raise one. ERPNext
	allows a receipt without an order and this is that case.
	"""
	pr = frappe.new_doc("Purchase Receipt")
	pr.supplier = doc.supplier
	pr.company = doc.company
	pr.currency = doc.currency or frappe.get_cached_value(
		"Company", doc.company, "default_currency")
	pr.posting_date = getdate(doc.arrival_date)
	pr.set_posting_time = 1
	pr.supplier_delivery_note = (doc.supplier_delivery_note
	                             or _("Consignment {0}").format(doc.consignment))
	item = _receipt_item(doc)
	row = pr.append("items", {
		"item_code": item,
		"qty": accepted,
		"rejected_qty": rejected,
		"received_qty": accepted + rejected,
		# The UOM of the item actually being booked, not of the variety -- a
		# roots item need not be stocked in the same unit as the plant.
		"uom": doc.uom or frappe.get_cached_value("Item", item, "stock_uom"),
		"rate": flt(doc.rate),
		"warehouse": doc.warehouse,
	})
	if rejected:
		row.rejected_warehouse = doc.rejected_warehouse
		if reason and frappe.db.has_column("Purchase Receipt Item",
		                                   "custom_rejection_reason"):
			row.custom_rejection_reason = reason
	if frappe.db.has_column("Purchase Receipt", "custom_plant_consignment"):
		pr.custom_plant_consignment = doc.name
	pr.flags.ignore_permissions = True
	pr.insert()
	_copy_attachments(doc, pr)
	return pr


def _copy_attachments(doc, pr):
	"""Move the delivery's paperwork onto the receipt it becomes.

	The photo of the waybill is taken once, at the gate, against the thing the
	driver handed over. A site that requires a goods receipt to carry its
	paperwork is asking for that same photo, and asking the office to go and
	find it again is how a receipt sits unsubmitted for a week.
	"""
	files = frappe.get_all(
		"File", filters={"attached_to_doctype": "Plant Consignment",
		                 "attached_to_name": doc.name},
		fields=["file_url", "file_name", "is_private"])
	if doc.delivery_note_photo and not any(
			f.file_url == doc.delivery_note_photo for f in files):
		files.append(frappe._dict({
			"file_url": doc.delivery_note_photo,
			"file_name": doc.delivery_note_photo.rsplit("/", 1)[-1],
			"is_private": 1 if "/private/" in doc.delivery_note_photo else 0}))
	for f in files:
		frappe.get_doc({
			"doctype": "File",
			"file_url": f.file_url,
			"file_name": f.file_name,
			"is_private": f.is_private,
			"attached_to_doctype": "Purchase Receipt",
			"attached_to_name": pr.name,
		}).insert(ignore_permissions=True)
	return len(files)


def _make_inspection(doc, receipt, readings, reason):
	"""The real Quality Inspection, filled from the template and the sheet.

	Each reading is marked manual_inspection, so the verdict is the one the
	person holding the plants gave and ERPNext does not quietly recompute it
	against a threshold. That matters here: the thresholds on the shipped
	template are placeholders nobody agronomic has signed off -- plant_quality
	says so on every run -- and a delivery refused by an unapproved number is
	worse than one refused by a person.

	The header status then follows the rows, which is ERPNext's own rule and the
	right one. A rejected inspection holds the receipt as a draft rather than
	forcing it through, because Stock Settings on this site is set to Stop and
	overriding that from a phone is not this module's decision to make.
	"""
	qi = frappe.new_doc("Quality Inspection")
	qi.inspection_type = "Incoming"
	qi.reference_type = "Purchase Receipt"
	qi.reference_name = receipt.name
	# The same item the receipt books, or ERPNext refuses to match the
	# inspection to the receipt line and the delivery is held on a message
	# about an item nobody chose.
	qi.item_code = _receipt_item(doc)
	qi.sample_size = min(cint(doc.qty_received), 100) or 1
	qi.report_date = getdate(doc.arrival_date)
	qi.inspected_by = frappe.session.user
	qi.quality_inspection_template = template_for(doc.variety)
	qi.remarks = reason or doc.notes

	qi.flags.ignore_permissions = True
	qi.insert()

	by_spec = {r.get("specification"): r for r in (readings or [])}
	for row in (qi.readings or []):
		given = by_spec.get(row.specification) or {}
		row.manual_inspection = 1
		if given.get("reading_value") is not None:
			row.reading_value = given.get("reading_value")
			row.reading_1 = given.get("reading_value")
		# A parameter nobody was asked about is not a failure.
		row.status = given.get("status") or "Accepted"
	qi.save(ignore_permissions=True)
	qi.reload()
	qi.submit()
	qi.reload()
	return qi


# ------------------------------------------------------------------ what is left
def refresh_batched(consignment):
	"""Recount what has been taken into batches. Read back, never accumulated."""
	if not consignment or not frappe.db.exists("Plant Consignment", consignment):
		return
	rows = frappe.get_all(
		"Propagation Batch",
		filters={"plant_consignment": consignment, "docstatus": ["<", 2]},
		fields=["name", "total_cuttings_planned"])
	taken = sum(cint(r.total_cuttings_planned) for r in rows)
	accepted = cint(frappe.db.get_value("Plant Consignment", consignment,
	                                    "qty_accepted"))
	frappe.db.set_value("Plant Consignment", consignment, {
		"batches_created": len(rows),
		"plants_batched": taken,
		"qty_unbatched": max(0, accepted - taken),
	}, update_modified=False)
