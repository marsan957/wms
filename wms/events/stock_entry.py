import frappe
from frappe import _

def validate(doc, method):
    """Validate Stock Entry"""
    # Validate warehouse locations if WMS is enabled
    if doc.get('wms_verify_locations'):
        validate_warehouse_locations(doc)

    # Auto-suggest optimal source locations
    suggest_source_locations(doc)

def validate_warehouse_locations(doc):
    """Validate that warehouse locations are correct"""
    for item in doc.items:
        if item.s_warehouse:
            # Verify item exists in source warehouse
            available_qty = frappe.db.get_value('Bin', {
                'item_code': item.item_code,
                'warehouse': item.s_warehouse
            }, 'actual_qty') or 0

            if available_qty < item.qty:
                frappe.throw(_(
                    "Row {0}: Insufficient quantity in {1}. "
                    "Available: {2}, Required: {3}"
                ).format(item.idx, item.s_warehouse, available_qty, item.qty))

def suggest_source_locations(doc):
    """Suggest optimal source locations based on stock levels"""
    if doc.stock_entry_type != 'Material Transfer':
        return

    for item in doc.items:
        if not item.s_warehouse or item.get('wms_source_location'):
            continue

        # Find best location with sufficient stock
        location = get_optimal_location(item.item_code, item.s_warehouse, item.qty)

        if location and hasattr(item, 'wms_source_location'):
            item.wms_source_location = location

def get_optimal_location(item_code, warehouse, required_qty):
    """
    Get optimal warehouse location for picking
    Priority: FIFO, nearest to packing area, fullest bins
    """
    # This is a placeholder - would need custom Warehouse Location doctype
    # For now, return None
    return None
