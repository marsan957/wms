import frappe
from frappe import _

def before_save(doc, method):
    """Actions before Delivery Note is saved"""
    # Calculate packing requirements
    calculate_packing_requirements(doc)

    # Validate packing if required
    if doc.get('wms_require_packing'):
        validate_packing(doc)

def on_submit(doc, method):
    """Actions when Delivery Note is submitted"""
    # Create packing slips if configured
    settings = frappe.get_cached_doc('WMS Settings', None)

    if settings and settings.auto_create_packing_slip:
        create_packing_slips(doc)

    # Update pick list status if linked
    update_linked_pick_list(doc)

def calculate_packing_requirements(doc):
    """Calculate total weight, volume, and packing requirements"""
    if not doc.items:
        return

    total_weight = 0
    total_volume = 0
    fragile_count = 0

    for item in doc.items:
        # Get item details
        item_doc = frappe.get_cached_doc('Item', item.item_code)

        weight = (item_doc.weight_per_unit or 0) * item.qty
        volume = (item_doc.get('volume_per_unit') or 0) * item.qty

        total_weight += weight
        total_volume += volume

        if item_doc.get('is_fragile'):
            fragile_count += 1

    # Store in custom fields if they exist
    if hasattr(doc, 'wms_total_weight'):
        doc.wms_total_weight = total_weight
    if hasattr(doc, 'wms_total_volume'):
        doc.wms_total_volume = total_volume
    if hasattr(doc, 'wms_fragile_items'):
        doc.wms_fragile_items = fragile_count

def validate_packing(doc):
    """Validate that all items have been properly packed"""
    unpacked_items = []

    for item in doc.items:
        packed_qty = item.get('wms_packed_qty') or 0
        if packed_qty < item.qty:
            unpacked_items.append(item.item_code)

    if unpacked_items:
        frappe.throw(_("Following items are not fully packed: {0}").format(
            ", ".join(unpacked_items)
        ))

def create_packing_slips(delivery_note_doc):
    """Create packing slips for the delivery note"""
    try:
        # Check if packing slips already exist
        existing = frappe.db.exists('Packing Slip', {
            'delivery_note': delivery_note_doc.name
        })

        if existing:
            return

        packing_slip = frappe.get_doc({
            'doctype': 'Packing Slip',
            'delivery_note': delivery_note_doc.name,
            'from_case_no': 1,
            'to_case_no': 1
        })

        # Copy items
        for item in delivery_note_doc.items:
            packing_slip.append('items', {
                'item_code': item.item_code,
                'item_name': item.item_name,
                'qty': item.qty,
                'stock_uom': item.stock_uom
            })

        packing_slip.insert(ignore_permissions=True)

        frappe.msgprint(_("Packing slip {0} created").format(packing_slip.name))
    except Exception as e:
        frappe.log_error(f"Failed to create packing slip: {str(e)}")

def update_linked_pick_list(delivery_note_doc):
    """Update status of linked pick list"""
    if not delivery_note_doc.get('pick_list'):
        return

    try:
        pick_list = frappe.get_doc('Pick List', delivery_note_doc.pick_list)

        # Add custom field to track delivery status
        if hasattr(pick_list, 'wms_delivered'):
            pick_list.wms_delivered = 1
            pick_list.save(ignore_permissions=True)
    except Exception as e:
        frappe.log_error(f"Failed to update pick list: {str(e)}")
