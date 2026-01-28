"""Installation and setup functions for WMS app"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def after_install():
    """Run after app installation"""
    create_wms_custom_fields()
    frappe.db.commit()


def create_wms_custom_fields():
    """Create custom fields for WMS functionality"""
    custom_fields = {
        "Pick List": [
            {
                "fieldname": "wms_section",
                "fieldtype": "Section Break",
                "label": "WMS Picking",
                "insert_after": "scan_barcode"
            },
            {
                "fieldname": "wms_locked_by",
                "fieldtype": "Link",
                "label": "Currently Picking",
                "options": "User",
                "read_only": 1,
                "insert_after": "wms_section"
            },
            {
                "fieldname": "wms_locked_at",
                "fieldtype": "Datetime",
                "label": "Lock Time",
                "read_only": 1,
                "insert_after": "wms_locked_by"
            },
            {
                "fieldname": "wms_session_id",
                "fieldtype": "Data",
                "label": "Session ID",
                "read_only": 1,
                "hidden": 1,
                "insert_after": "wms_locked_at"
            },
            {
                "fieldname": "wms_column_break",
                "fieldtype": "Column Break",
                "insert_after": "wms_session_id"
            }
        ]
    }

    create_custom_fields(custom_fields, update=True)
    print("WMS custom fields created successfully")
