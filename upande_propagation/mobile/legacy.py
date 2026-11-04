# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""The roses mobile app's propagation endpoints, kept as the app calls them.

Ported from upande_agriculture.mobile.api when upande_agriculture was retired.
The roses app posts a JSON body and reads frappe.response["data"]; the newer
upande_propagation.mobile.api takes keyword arguments and returns a value.
The shapes differ (no docstatus filter here, other fields, other errors), so
these are not folded into the newer endpoints: the old paths are pointed at
this module by override_whitelisted_methods in hooks.py instead.

	upande_agriculture.mobile.api.productionCreateSeedlingRequest
	upande_agriculture.mobile.api.productionListSeedlingRequests
	upande_agriculture.mobile.api.productionListPropagationBatches
	upande_agriculture.mobile.api.productionRecordPropagationLog
	upande_agriculture.mobile.api.productionListGrowerCandidates
"""

import frappe


@frappe.whitelist()
def productionCreateSeedlingRequest():
    data = frappe.request.get_json() or {}
    required_by_date = (data.get("required_by_date") or "").strip()
    priority = (data.get("priority") or "Medium").strip()
    farm = (data.get("farm") or "").strip()
    target_farm_block = (data.get("target_farm_block") or "").strip()
    reason = (data.get("reason") or "").strip()
    items = data.get("items") or []

    # Resolve a default Company. `frappe.defaults.get_user_default` isn't safe in
    # the sandbox on every site, so read Global Defaults or pick the first Company.
    company = (data.get("company") or "").strip()
    if not company:
        try:
            company = frappe.db.get_single_value("Global Defaults", "default_company") or ""
        except Exception:
            company = ""
    if not company:
        rows = frappe.get_all("Company", fields=["name"], limit=1)
        if rows:
            company = rows[0].get("name") or ""

    if not required_by_date:
        frappe.response["data"] = {"error": "required_by_date is required."}
    elif not items or not isinstance(items, list):
        frappe.response["data"] = {"error": "items is required (non-empty list)."}
    elif not company:
        frappe.response["data"] = {"error": "Cannot resolve a default Company for the request."}
    else:
        try:
            doc = frappe.new_doc("Seedling Request")
            doc.requested_by = frappe.session.user
            doc.request_date = frappe.utils.today()
            doc.required_by_date = required_by_date
            if priority:
                doc.priority = priority
            if farm:
                doc.farm = farm
            if target_farm_block:
                doc.target_farm_block = target_farm_block
            if reason:
                doc.reason = reason
            doc.company = company

            for it in items:
                variety = (it.get("variety") or "").strip()
                qty = it.get("qty")
                if not variety or qty is None:
                    continue
                row = doc.append("items", {})
                row.variety = variety
                row.qty_requested = int(qty)
                stem_length = (it.get("stem_length") or "").strip()
                if stem_length and frappe.get_meta("Seedling Request Item").has_field("stem_length"):
                    row.stem_length = stem_length

            if not doc.get("items"):
                frappe.response["data"] = {"error": "No valid items provided (variety + qty required per row)."}
            else:
                doc.insert(ignore_permissions=True)
                frappe.db.commit()
                frappe.response["data"] = {
                    "status": "success",
                    "name": doc.name,
                    "message": "Seedling Request " + doc.name + " created.",
                }
        except Exception as e:
            frappe.db.rollback()
            frappe.log_error("productionCreateSeedlingRequest error: " + str(e))
            frappe.response["data"] = {"error": str(e)}


@frappe.whitelist()
def productionListSeedlingRequests():
    data = frappe.request.get_json() or {}
    status = (data.get("status") or "").strip()
    limit = int(data.get("limit") or 100)
    if limit > 500: limit = 500

    try:
        filters = {}
        if status:
            filters["status"] = status

        rows = frappe.get_all(
            "Seedling Request",
            filters=filters,
            fields=["name", "status", "request_date", "required_by_date",
                    "priority", "farm", "target_farm_block",
                    "total_qty_requested", "total_qty_dispatched",
                    "fulfilment_percentage", "days_to_fulfil", "reason",
                    "requested_by"],
            order_by="creation desc",
            limit=limit,
        )

        requests = []
        for r in rows:
            requests.append({
                "name": r.get("name") or "",
                "status": r.get("status") or "",
                "request_date": str(r.get("request_date") or ""),
                "required_by_date": str(r.get("required_by_date") or ""),
                "priority": r.get("priority") or "",
                "farm": r.get("farm") or "",
                "target_farm_block": r.get("target_farm_block") or "",
                "total_qty_requested": int(r.get("total_qty_requested") or 0),
                "total_qty_dispatched": int(r.get("total_qty_dispatched") or 0),
                "fulfilment_percentage": float(r.get("fulfilment_percentage") or 0),
                "days_to_fulfil": int(r.get("days_to_fulfil") or 0),
                "reason": r.get("reason") or "",
                "requested_by": r.get("requested_by") or "",
            })

        frappe.response["data"] = {"count": len(requests), "requests": requests}
    except Exception as e:
        frappe.log_error("productionListSeedlingRequests error: " + str(e))
        frappe.response["data"] = {"error": str(e)}


@frappe.whitelist()
def productionListPropagationBatches():
    data = frappe.request.get_json() or {}
    stage = (data.get("stage") or "").strip()
    variety = (data.get("variety") or "").strip()
    search = (data.get("search") or "").strip()
    limit = int(data.get("limit") or 100)
    if limit > 500: limit = 500

    try:
        filters = {}
        if stage:
            filters["current_stage"] = stage
        if variety:
            filters["variety"] = variety
        if search:
            filters["name"] = ["like", "%" + search + "%"]

        rows = frappe.get_all(
            "Propagation Batch",
            filters=filters,
            fields=["name", "variety", "variety_name", "propagation_method",
                    "current_stage", "iso_week", "iso_year", "start_date",
                    "total_cuttings_planned", "total_cuttings_actual",
                    "total_mortality", "total_survived",
                    "available_to_dispatch", "total_dispatched",
                    "success_rate", "propagation_unit", "company"],
            order_by="creation desc",
            limit=limit,
        )

        batches = []
        for r in rows:
            batches.append({
                "name": r.get("name") or "",
                "variety": r.get("variety") or "",
                "variety_name": r.get("variety_name") or "",
                "propagation_method": r.get("propagation_method") or "",
                "current_stage": r.get("current_stage") or "",
                "iso_week": r.get("iso_week") or 0,
                "iso_year": r.get("iso_year") or 0,
                "start_date": str(r.get("start_date") or ""),
                "total_cuttings_planned": int(r.get("total_cuttings_planned") or 0),
                "total_cuttings_actual": int(r.get("total_cuttings_actual") or 0),
                "total_mortality": int(r.get("total_mortality") or 0),
                "total_survived": int(r.get("total_survived") or 0),
                "available_to_dispatch": int(r.get("available_to_dispatch") or 0),
                "total_dispatched": int(r.get("total_dispatched") or 0),
                "success_rate": float(r.get("success_rate") or 0),
                "propagation_unit": r.get("propagation_unit") or "",
                "company": r.get("company") or "",
            })

        frappe.response["data"] = {"count": len(batches), "batches": batches}
    except Exception as e:
        frappe.log_error("productionListPropagationBatches error: " + str(e))
        frappe.response["data"] = {"error": str(e)}


@frappe.whitelist()
def productionRecordPropagationLog():
    data = frappe.request.get_json() or {}
    batch = (data.get("propagation_batch") or "").strip()
    log_date = (data.get("log_date") or "").strip()
    activity_type = (data.get("activity_type") or "").strip()
    qty_done = data.get("qty_done_today")
    mortality = data.get("mortality_today")
    surviving = data.get("surviving_qty")
    weather = (data.get("weather_conditions") or "").strip()
    observations = (data.get("observations") or "").strip()

    if not batch:
        frappe.response["data"] = {"error": "propagation_batch is required."}
    elif not log_date:
        frappe.response["data"] = {"error": "log_date is required."}
    elif not activity_type:
        frappe.response["data"] = {"error": "activity_type is required."}
    elif qty_done is None:
        frappe.response["data"] = {"error": "qty_done_today is required."}
    else:
        try:
            # Read the batch to enrich the log
            b = frappe.get_doc("Propagation Batch", batch)
            doc = frappe.new_doc("Daily Propagation Log")
            doc.log_date = log_date
            doc.propagation_batch = batch
            doc.activity_type = activity_type
            doc.qty_done_today = int(qty_done)
            if mortality is not None:
                doc.mortality_today = int(mortality)
            if surviving is not None:
                doc.surviving_qty = int(surviving)
            if weather:
                doc.weather_conditions = weather
            if observations:
                doc.observations = observations
            doc.logged_by = frappe.session.user
            # Propagate variety + greenhouse from the batch for downstream reports
            if b.get("variety"):
                doc.rose_variety = b.get("variety")
            if b.get("propagation_unit"):
                doc.greenhouse = b.get("propagation_unit")
            doc.insert(ignore_permissions=True)
            frappe.db.commit()

            frappe.response["data"] = {
                "status": "success",
                "name": doc.name,
                "message": "Logged " + activity_type + " for batch " + batch + ".",
            }
        except Exception as e:
            frappe.db.rollback()
            frappe.log_error("productionRecordPropagationLog error: " + str(e))
            frappe.response["data"] = {"error": str(e)}


@frappe.whitelist()
def productionListGrowerCandidates():
    data = frappe.request.get_json() or {}
    search = (data.get('search') or '').strip()
    limit = int(data.get('limit') or 50)
    if limit > 200:
        limit = 200
    try:
        filters = {'status': 'Active', 'designation': 'Grower'}
        if search:
            filters['employee_name'] = ['like', '%' + search + '%']
        rows = frappe.get_all('Employee', filters=filters, fields=['name', 'employee_name'], order_by='employee_name asc', limit=limit)
        out = []
        for r in rows:
            out.append({'employee': r.get('name') or '', 'employee_name': r.get('employee_name') or r.get('name') or ''})
        frappe.response['data'] = {'count': len(out), 'candidates': out}
    except Exception as e:
        frappe.log_error('productionListGrowerCandidates error: ' + str(e))
        frappe.response['data'] = {'error': str(e)}
