# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""A QR code for a label, as a data URI the print format can drop into an <img>.

PNG rather than SVG: these labels are printed through wkhtmltopdf, whose SVG
support is patchy enough that a code can come out blank on the page and perfect
on screen -- which nobody notices until a bench of labels will not scan.

The payload is the batch name and nothing else. A label lives on a tray that
moves between benches for three months, so anything else encoded in it would be
a fact frozen on the day it was printed; the name is the one thing that cannot
go stale, and everything else is looked up when it is scanned.
"""

import base64
import io

import frappe


def qr_data_uri(payload, box_size=4, border=2):
	"""A scannable PNG of `payload`, inline, so the label carries no file."""
	if not payload:
		return ""
	try:
		import qrcode
	except ImportError:
		frappe.log_error("qrcode is not installed", "Propagation label")
		return ""

	img = qrcode.make(str(payload), box_size=int(box_size), border=int(border))
	buf = io.BytesIO()
	img.save(buf, format="PNG")
	return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@frappe.whitelist()
def batch_qr(batch, box_size=6):
	"""The same code, for anything that wants it outside a print format."""
	if frappe.session.user == "Guest":
		frappe.throw(frappe._("Please sign in."), frappe.PermissionError)
	if not frappe.db.exists("Propagation Batch", batch):
		frappe.throw(frappe._("No such batch: {0}").format(batch))
	return {"batch": batch, "payload": batch,
			"data_uri": qr_data_uri(batch, box_size=box_size)}
