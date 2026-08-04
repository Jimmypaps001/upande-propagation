// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

const STAGE_SEQUENCE = [
	"Cutting",
	"Sticking",
	"Callusing",
	"Rooting",
	"Nursery",
	"Hardening",
	"Ready for Dispatch",
];

const BATCH_METHODS = "upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch";

function iso_week_year(date_str) {
	// ISO-8601: the Thursday of the current week decides week and year.
	const date = frappe.datetime.str_to_obj(date_str);
	const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const day_number = (target.getUTCDay() + 6) % 7;
	target.setUTCDate(target.getUTCDate() - day_number + 3);
	const iso_year = target.getUTCFullYear();
	const first_thursday = new Date(Date.UTC(iso_year, 0, 4));
	const first_day_number = (first_thursday.getUTCDay() + 6) % 7;
	first_thursday.setUTCDate(first_thursday.getUTCDate() - first_day_number + 3);
	const iso_week = 1 + Math.round((target - first_thursday) / (7 * 24 * 3600 * 1000));
	return { iso_week, iso_year };
}

frappe.ui.form.on("Propagation Batch", {
	setup(frm) {
		frm.set_query("mother_block", () => {
			const filters = { status: "Active" };
			if (frm.doc.variety) {
				filters.variety = frm.doc.variety;
			}
			return { filters };
		});

		frm.set_query("seedling_request", () => ({
			filters: { docstatus: 1, status: ["not in", ["Fulfilled", "Cancelled"]] },
		}));
	},

	refresh(frm) {
		frm.trigger("propagation_method");
		frm.trigger("show_indicators");

		if (frm.doc.docstatus !== 1) {
			return;
		}

		if (frm.doc.current_stage !== "Completed") {
			frm.add_custom_button(__("Advance Stage"), () => frm.trigger("advance_stage"), __("Stage"));
			frm.add_custom_button(__("Complete Batch"), () => frm.trigger("complete_batch"), __("Stage"));

			frm.add_custom_button(
				__("Daily Log"),
				() => frappe.new_doc("Daily Propagation Log", { propagation_batch: frm.doc.name }),
				__("Create")
			);
		}

		if (frm.doc.available_to_dispatch > 0) {
			frm.add_custom_button(
				__("Seedling Dispatch"),
				() =>
					frappe.new_doc("Seedling Dispatch", {
						propagation_batch: frm.doc.name,
						seedling_request: frm.doc.seedling_request,
						qty_dispatched: frm.doc.available_to_dispatch,
						target_greenhouse: frm.doc.propagation_unit,
						company: frm.doc.company,
					}),
				__("Create")
			);
		}

		frm.add_custom_button(__("Recalculate Totals"), () => {
			frappe.call({
				method: `${BATCH_METHODS}.recalculate`,
				args: { batch: frm.doc.name },
				freeze: true,
				callback: () => frm.reload_doc(),
			});
		});
	},

	show_indicators(frm) {
		if (frm.doc.docstatus !== 1 || !frm.doc.current_stage) {
			return;
		}
		frm.dashboard.add_indicator(
			__("Stage: {0}", [__(frm.doc.current_stage)]),
			frm.doc.current_stage === "Completed" ? "green" : "blue"
		);
		if (frm.doc.available_to_dispatch > 0) {
			frm.dashboard.add_indicator(
				__("{0} ready to dispatch", [frm.doc.available_to_dispatch]),
				"orange"
			);
		}
	},

	start_date(frm) {
		if (!frm.doc.start_date) {
			return;
		}
		const { iso_week, iso_year } = iso_week_year(frm.doc.start_date);
		frm.set_value("iso_week", iso_week);
		frm.set_value("iso_year", iso_year);
	},

	propagation_method(frm) {
		frm.toggle_reqd(
			"rootstock_variety",
			frm.doc.propagation_method && frm.doc.propagation_method !== "Own-root Cutting"
		);
	},

	advance_stage(frm) {
		const options = STAGE_SEQUENCE.slice(STAGE_SEQUENCE.indexOf(frm.doc.current_stage) + 1);
		if (!options.length) {
			frappe.msgprint(__("Batch is at the last stage. Use Complete Batch to close it."));
			return;
		}

		frappe.prompt(
			[
				{
					fieldname: "stage",
					label: __("Move To"),
					fieldtype: "Select",
					options: options.join("\n"),
					default: options[0],
					reqd: 1,
				},
				{
					fieldname: "qty",
					label: __("Qty Moving"),
					fieldtype: "Int",
					default: frm.doc.total_survived || frm.doc.total_cuttings_actual,
					description: __("Seedlings entering the new stage"),
				},
				{ fieldname: "notes", label: __("Notes"), fieldtype: "Small Text" },
			],
			(values) => {
				frappe.call({
					method: `${BATCH_METHODS}.advance_stage`,
					args: { batch: frm.doc.name, ...values },
					freeze: true,
					callback: () => frm.reload_doc(),
				});
			},
			__("Advance Stage"),
			__("Move")
		);
	},

	complete_batch(frm) {
		frappe.confirm(__("Close this batch? No further logs or dispatches will be accepted."), () => {
			frappe.call({
				method: `${BATCH_METHODS}.complete_batch`,
				args: { batch: frm.doc.name },
				freeze: true,
				callback: () => frm.reload_doc(),
			});
		});
	},
});
