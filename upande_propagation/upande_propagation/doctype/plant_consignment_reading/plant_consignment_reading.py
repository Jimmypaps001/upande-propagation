# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class PlantConsignmentReading(Document):
	"""One line of the check sheet, as it was entered at the gate.

	A copy, not the record: the Quality Inspection is the record. This is kept
	on the consignment so that a delivery turned away in full -- which raises no
	receipt, and therefore can carry no inspection -- still has its evidence.
	"""
	pass
