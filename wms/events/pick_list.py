import frappe
from frappe import _

def validate(doc, method):
    """Validate Pick List before save"""
    # Add custom validation logic
    validate_warehouse_locations(doc)
    calculate_pick_metrics(doc)

def on_submit(doc, method):
    """Actions to perform when Pick List is submitted"""
    pass

def before_cancel(doc, method):
    """Actions before Pick List is cancelled"""
    pass

def validate_warehouse_locations(doc):
    """Validate that all items have proper warehouse locations"""
    for item in doc.locations:
        if not item.warehouse:
            frappe.throw(_("Row {0}: Warehouse is required").format(item.idx))

def calculate_pick_metrics(doc):
    """Calculate metrics like estimated time, distance, etc."""
    if not doc.locations:
        return

    # Calculate total items and quantity
    total_qty = sum([item.qty for item in doc.locations])
    total_items = len(doc.locations)

    # Estimate picking time (can be made more sophisticated)
    # Assume 30 seconds per item + 2 minutes setup
    estimated_minutes = (total_items * 0.5) + 2

    # Add to doc (as custom fields if they exist)
    if hasattr(doc, 'wms_total_items'):
        doc.wms_total_items = total_items
    if hasattr(doc, 'wms_total_qty'):
        doc.wms_total_qty = total_qty
    if hasattr(doc, 'wms_estimated_minutes'):
        doc.wms_estimated_minutes = estimated_minutes
