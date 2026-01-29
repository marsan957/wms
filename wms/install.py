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
        ],
        "Delivery Note": [
            {
                "fieldname": "wms_packing_section",
                "fieldtype": "Section Break",
                "label": "WMS Packing",
                "insert_after": "scan_barcode"
            },
            {
                "fieldname": "pick_list",
                "fieldtype": "Link",
                "label": "Pick List",
                "options": "Pick List",
                "read_only": 1,
                "insert_after": "wms_packing_section"
            },
            {
                "fieldname": "wms_packing_complete",
                "fieldtype": "Check",
                "label": "Packing Complete",
                "read_only": 1,
                "insert_after": "pick_list"
            },
            {
                "fieldname": "wms_shipment",
                "fieldtype": "Link",
                "label": "Shipment",
                "options": "WMS Shipment",
                "read_only": 1,
                "insert_after": "wms_packing_complete"
            },
            {
                "fieldname": "wms_packing_column_break",
                "fieldtype": "Column Break",
                "insert_after": "wms_shipment"
            },
            {
                "fieldname": "wms_locked_by",
                "fieldtype": "Link",
                "label": "Currently Packing",
                "options": "User",
                "read_only": 1,
                "insert_after": "wms_packing_column_break"
            },
            {
                "fieldname": "wms_locked_at",
                "fieldtype": "Datetime",
                "label": "Pack Lock Time",
                "read_only": 1,
                "insert_after": "wms_locked_by"
            },
            {
                "fieldname": "wms_session_id",
                "fieldtype": "Data",
                "label": "Pack Session ID",
                "read_only": 1,
                "hidden": 1,
                "insert_after": "wms_locked_at"
            }
        ],
        "Delivery Note Item": [
            {
                "fieldname": "wms_box",
                "fieldtype": "Data",
                "label": "Box",
                "read_only": 1,
                "insert_after": "warehouse"
            },
            {
                "fieldname": "wms_packed_qty",
                "fieldtype": "Float",
                "label": "Packed Qty",
                "default": "0",
                "insert_after": "wms_box"
            },
            {
                "fieldname": "wms_package_no",
                "fieldtype": "Data",
                "label": "Package No",
                "insert_after": "wms_packed_qty"
            }
        ],
        "Pick List Item": [
            {
                "fieldname": "wms_box",
                "fieldtype": "Data",
                "label": "Box",
                "insert_after": "picked_qty"
            }
        ]
    }

    create_custom_fields(custom_fields, update=True)
    print("WMS custom fields created successfully")
