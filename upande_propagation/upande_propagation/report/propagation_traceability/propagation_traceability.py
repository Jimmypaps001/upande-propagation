# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

# Without a batch filter, only this many batches are traced per run.
BATCH_LIMIT = 20


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "step", "label": _("Step"), "fieldtype": "Data", "width": 230},
		{
			"fieldname": "document_type",
			"label": _("Type"),
			"fieldtype": "Link",
			"options": "DocType",
			"width": 150,
		},
		{
			"fieldname": "document",
			"label": _("Document"),
			"fieldtype": "Dynamic Link",
			"options": "document_type",
			"width": 200,
		},
		{"fieldname": "on_date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "qty", "label": _("Qty"), "fieldtype": "Int", "width": 90},
		{"fieldname": "amount", "label": _("Amount"), "fieldtype": "Currency", "width": 110},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 130},
		{"fieldname": "detail", "label": _("Detail"), "fieldtype": "Data", "width": 320},
	]


def get_data(filters):
	rows = []
	for batch in get_batches(filters):
		rows.extend(trace_batch(batch))
	return rows


def get_batches(filters):
	conditions = {"docstatus": 1}
	if filters.get("propagation_batch"):
		conditions["name"] = filters.propagation_batch
	if filters.get("company"):
		conditions["company"] = filters.company
	if not filters.get("include_completed"):
		conditions["current_stage"] = ("!=", "Completed")

	names = frappe.get_all(
		"Propagation Batch",
		filters=conditions,
		pluck="name",
		order_by="creation desc",
		limit=BATCH_LIMIT + 1,
	)
	truncated = len(names) > BATCH_LIMIT
	if truncated:
		names = names[:BATCH_LIMIT]
		frappe.msgprint(
			_("Showing the {0} most recent batches. Pick a Propagation Batch to trace just one.").format(
				BATCH_LIMIT
			),
			indicator="orange",
		)

	return [frappe.get_doc("Propagation Batch", name) for name in names]


def trace_batch(batch):
	rows = [
		{
			"step": _("▶ Batch {0}").format(batch.name),
			"document_type": "Propagation Batch",
			"document": batch.name,
			"on_date": batch.start_date,
			"qty": cint(batch.total_cuttings_planned),
			"status": batch.current_stage,
			"detail": _("{0}, week {1}/{2}, nursery {3}").format(
				batch.propagation_method,
				cint(batch.iso_week),
				cint(batch.iso_year),
				batch.propagation_unit or _("not set"),
			),
		}
	]

	rows.extend(trace_source(batch))
	rows.extend(trace_demand(batch))
	rows.extend(trace_stages(batch))
	rows.extend(trace_logs(batch))
	rows.extend(trace_dispatches(batch))
	rows.append(summarise(batch))
	return rows


def trace_source(batch):
	"""Where the plant material came from."""
	rows = []
	if batch.mother_block:
		block = frappe.db.get_value(
			"Mother Block",
			batch.mother_block,
			["variety", "status", "plant_count", "total_cuttings_taken", "last_cutting_date"],
			as_dict=True,
		)
		rows.append(
			{
				"step": _("1. Mother block"),
				"document_type": "Mother Block",
				"document": batch.mother_block,
				"on_date": block.last_cutting_date,
				"qty": cint(block.plant_count),
				"status": block.status,
				"detail": _("{0} — {1} cuttings taken to date").format(
					block.variety, cint(block.total_cuttings_taken)
				),
			}
		)

	for harvest in frappe.get_all(
		"Budwood Harvest",
		filters={"propagation_batch": batch.name, "docstatus": 1},
		fields=["name", "number_of_stems", "harvest_datetime", "mother_block"],
		order_by="harvest_datetime asc",
	):
		rows.append(
			{
				"step": _("2. Budwood harvest"),
				"document_type": "Budwood Harvest",
				"document": harvest.name,
				"on_date": getdate(harvest.harvest_datetime) if harvest.harvest_datetime else None,
				"qty": cint(harvest.number_of_stems),
				"status": _("Submitted"),
				"detail": _("stems booked in from {0}").format(harvest.mother_block or _("no block")),
			}
		)
	return rows


def trace_demand(batch):
	"""The farm's own order that the batch answers."""
	if not batch.seedling_request:
		return []

	request = frappe.get_doc("Seedling Request", batch.seedling_request)
	rows = [
		{
			"step": _("3. Seedling request"),
			"document_type": "Seedling Request",
			"document": request.name,
			"on_date": request.request_date,
			"qty": cint(request.total_qty_requested),
			"status": request.status,
			"detail": _("{0} dispatched ({1}%), needed by {2}, farm {3}").format(
				cint(request.total_qty_dispatched),
				flt(request.fulfilment_percentage, 1),
				frappe.format(request.required_by_date, "Date"),
				request.farm or _("not set"),
			),
		}
	]
	return rows


def trace_stages(batch):
	rows = []
	for row in batch.stages:
		late = cint(row.days_in_stage) > cint(row.expected_days) and row.expected_days
		rows.append(
			{
				"step": _("4. Stage — {0}").format(row.stage),
				"document_type": "Propagation Batch",
				"document": batch.name,
				"on_date": row.start_date,
				"qty": cint(row.qty_entered),
				"status": _("open") if not row.end_date else _("closed"),
				"detail": _("{0} in, {1} out, {2} of {3} expected days{4}").format(
					cint(row.qty_entered),
					cint(row.qty_exited) or "-",
					cint(row.days_in_stage),
					cint(row.expected_days),
					_(" — over expected") if late else "",
				),
			}
		)
	return rows


def trace_logs(batch):
	rows = []
	for log in frappe.get_all(
		"Daily Propagation Log",
		filters={"propagation_batch": batch.name},
		fields=[
			"name",
			"log_date",
			"activity_type",
			"qty_done_today",
			"mortality_today",
			"cumulative_qty",
			"surviving_qty",
			"logged_by",
		],
		order_by="log_date asc, creation asc",
	):
		rows.append(
			{
				"step": _("5. Log — {0}").format(log.activity_type),
				"document_type": "Daily Propagation Log",
				"document": log.name,
				"on_date": log.log_date,
				"qty": cint(log.qty_done_today),
				"status": _("{0} dead").format(cint(log.mortality_today)),
				"detail": _("cumulative {0}, surviving {1}, logged by {2}").format(
					cint(log.cumulative_qty), cint(log.surviving_qty), log.logged_by or _("unknown")
				),
			}
		)
	return rows


def trace_dispatches(batch):
	rows = []
	for dispatch in frappe.get_all(
		"Seedling Dispatch",
		filters={"propagation_batch": batch.name, "docstatus": 1},
		fields=[
			"name",
			"dispatch_date",
			"purpose",
			"qty_dispatched",
			"grade",
			"farm",
			"target_greenhouse",
			"target_crop_cycle",
			"customer",
			"selling_rate",
			"amount",
			"sales_invoice",
			"seedling_request",
		],
		order_by="dispatch_date asc, creation asc",
	):
		if dispatch.purpose == "Sale":
			detail = _("sold to {0} at {1} each").format(dispatch.customer, flt(dispatch.selling_rate, 2))
		else:
			detail = _("planted into {0} ({1})").format(
				dispatch.target_crop_cycle or _("no crop cycle"),
				dispatch.target_greenhouse or _("no greenhouse"),
			)
		rows.append(
			{
				"step": _("6. Dispatch — {0}").format(dispatch.purpose),
				"document_type": "Seedling Dispatch",
				"document": dispatch.name,
				"on_date": dispatch.dispatch_date,
				"qty": cint(dispatch.qty_dispatched),
				"amount": flt(dispatch.amount),
				"status": dispatch.grade or _("ungraded"),
				"detail": _("{0}, farm {1}").format(detail, dispatch.farm or _("not set")),
			}
		)

		if dispatch.sales_invoice:
			invoice = frappe.db.get_value(
				"Sales Invoice",
				dispatch.sales_invoice,
				["posting_date", "grand_total", "outstanding_amount", "status", "customer"],
				as_dict=True,
			)
			rows.append(
				{
					"step": _("7. Invoice"),
					"document_type": "Sales Invoice",
					"document": dispatch.sales_invoice,
					"on_date": invoice.posting_date,
					"amount": flt(invoice.grand_total),
					"status": invoice.status,
					"detail": _("{0}, outstanding {1}").format(
						invoice.customer, flt(invoice.outstanding_amount, 2)
					),
				}
			)
	return rows


def summarise(batch):
	planned = cint(batch.total_cuttings_planned)
	survived = cint(batch.total_survived)
	return {
		"step": _("= Net position"),
		"document_type": "Propagation Batch",
		"document": batch.name,
		"qty": cint(batch.available_to_dispatch),
		"amount": flt(batch.total_cost),
		"status": _("{0}% success").format(flt(batch.success_rate, 1)),
		"detail": _(
			"planned {0}, received {1}, stuck {2}, dead {3}, survived {4}, dispatched {5}, available {6} — "
			"{7} per surviving seedling"
		).format(
			planned,
			cint(batch.total_cuttings_received),
			cint(batch.total_cuttings_actual),
			cint(batch.total_mortality),
			survived,
			cint(batch.total_dispatched),
			cint(batch.available_to_dispatch),
			flt(batch.cost_per_surviving_seedling, 2),
		),
	}
