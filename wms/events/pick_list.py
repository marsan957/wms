import frappe
from frappe import _

def validate(doc, method):
    """Validate Pick List before save"""
    # Add custom validation logic
    validate_warehouse_locations(doc)
    calculate_pick_metrics(doc)

def on_submit(doc, method):
    """Actions to perform when Pick List is submitted"""
    # Create picking session if auto-create is enabled
    settings = frappe.get_cached_doc('WMS Settings', None)

    if settings and settings.auto_create_pick_session:
        create_picking_session(doc)

def before_cancel(doc, method):
    """Actions before Pick List is cancelled"""
    # Clean up any related picking sessions
    sessions = frappe.get_all('WMS Pick Session',
        filters={'pick_list': doc.name, 'status': ['!=', 'Completed']},
        pluck='name'
    )

    for session in sessions:
        session_doc = frappe.get_doc('WMS Pick Session', session)
        session_doc.status = 'Cancelled'
        session_doc.save()

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

def create_picking_session(pick_list_doc):
    """Create a WMS Pick Session for this Pick List"""
    try:
        session = frappe.get_doc({
            'doctype': 'WMS Pick Session',
            'pick_list': pick_list_doc.name,
            'picker': frappe.session.user,
            'status': 'Open',
            'start_time': frappe.utils.now()
        })
        session.insert(ignore_permissions=True)

        frappe.msgprint(_("Picking session {0} created").format(session.name))
    except Exception as e:
        frappe.log_error(f"Failed to create picking session: {str(e)}")
