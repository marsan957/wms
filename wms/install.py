"""Installation and setup functions for WMS app"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
import json
import os


def after_install():
    """Run after app installation"""
    create_wms_custom_fields()
    frappe.db.commit()


def create_wms_custom_fields():
    """Create custom fields for WMS functionality"""
    custom_fields_dir = os.path.join(
        frappe.get_app_path('wms'), 'custom_fields'
    )

    if not os.path.exists(custom_fields_dir):
        return

    for filename in os.listdir(custom_fields_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(custom_fields_dir, filename)
            with open(filepath, 'r') as f:
                custom_fields = json.load(f)
                create_custom_fields(custom_fields, update=True)

    print("WMS custom fields created successfully")
