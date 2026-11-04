// Copyright (c) 2026, Upande and contributors
// For license information, please see license.txt

frappe.ui.form.on("Plant Consignment", {
	setup(frm) {
		// Only an order from this supplier, and one that has been submitted -- a
		// receipt cannot be made against a draft.
		frm.set_query("purchase_order", () => ({
			filters: { supplier: frm.doc.supplier, docstatus: 1 },
		}));
	},

	async purchase_order(frm) {
		// The order says what the plants cost: an outside propagator is paid the
		// charge per plant that was agreed when the plan was approved.
		if (!frm.doc.purchase_order) return;
		const po = await frappe.db.get_doc("Purchase Order", frm.doc.purchase_order);
		const line = (po.items || []).find((i) => i.item_code === frm.doc.variety) || (po.items || [])[0];
		if (line) {
			frm.set_value("rate", line.rate);
			if (!frm.doc.variety) frm.set_value("variety", line.item_code);
			// Received where the order said the plants would be delivered.
			if (!frm.doc.warehouse && line.warehouse) frm.set_value("warehouse", line.warehouse);
		}
		if (po.currency && !frm.doc.currency) frm.set_value("currency", po.currency);
	},
});
