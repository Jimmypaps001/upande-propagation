// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Seedling Dispatch", {
	setup(frm) {
		frm.set_query("propagation_batch", () => ({
			filters: { docstatus: 1, available_to_dispatch: [">", 0] },
		}));

		frm.set_query("seedling_request", () => ({
			filters: { docstatus: 1, status: ["not in", ["Fulfilled", "Cancelled"]] },
		}));

		// Crop Cycle holds its varieties in a child table, so company is the
		// only sensible narrowing filter here.
		frm.set_query("target_crop_cycle", () => {
			const filters = {};
			if (frm.doc.company) {
				filters.company = frm.doc.company;
			}
			return { filters };
		});
	},

	refresh(frm) {
		if (frm.doc.available_to_dispatch) {
			frm.dashboard.add_indicator(
				__("{0} available in batch", [frm.doc.available_to_dispatch]),
				frm.doc.qty_dispatched > frm.doc.available_to_dispatch ? "red" : "green"
			);
		}

		if (frm.doc.docstatus === 1 && frm.doc.purpose === "Sale" && !frm.doc.sales_invoice) {
			frm.add_custom_button(__("Sales Invoice"), () => {
				frappe.call({
					method: "upande_propagation.upande_propagation.doctype.seedling_dispatch.seedling_dispatch.make_sales_invoice",
					args: { dispatch: frm.doc.name },
					freeze: true,
					callback: (r) => {
						if (r.message) {
							frappe.set_route("Form", "Sales Invoice", r.message);
						}
					},
				});
			}, __("Create"));
		}
	},

	purpose(frm) {
		frm.trigger("set_amount");
	},

	qty_dispatched(frm) {
		frm.trigger("set_amount");
	},

	selling_rate(frm) {
		frm.trigger("set_amount");
	},

	set_amount(frm) {
		const amount = frm.doc.purpose === "Sale" ? (frm.doc.selling_rate || 0) * (frm.doc.qty_dispatched || 0) : 0;
		frm.set_value("amount", amount);
	},

	propagation_batch(frm) {
		if (!frm.doc.propagation_batch) {
			return;
		}
		frappe.db.get_value(
			"Propagation Batch",
			frm.doc.propagation_batch,
			["available_to_dispatch", "current_stage", "propagation_unit", "company"],
			(value) => {
				if (!value) {
					return;
				}
				frm.set_value("available_to_dispatch", value.available_to_dispatch);
				frm.set_value("current_stage", value.current_stage);
				if (!frm.doc.target_greenhouse) {
					frm.set_value("target_greenhouse", value.propagation_unit);
				}
				if (!frm.doc.company) {
					frm.set_value("company", value.company);
				}
				if (!frm.doc.qty_dispatched) {
					frm.set_value("qty_dispatched", value.available_to_dispatch);
				}
			}
		);
	},
});
