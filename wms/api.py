"""
WMS API
Whitelisted methods for WMS functionality
"""

import frappe
from frappe import _
import json

@frappe.whitelist()
def get_wms_settings():
    """Get WMS settings"""
    try:
        settings = frappe.get_cached_doc('WMS Settings', None)
        return settings.as_dict()
    except:
        # Return default settings if not configured
        return {
            'enable_barcode_scanning': 1,
            'enable_route_optimization': 1,
            'enable_sound': 1,
            'enable_vibration': 1
        }

@frappe.whitelist()
def optimize_pick_route(pick_list):
    """
    Optimize the picking route for a pick list
    Uses nearest-neighbor algorithm as a starting point
    """
    doc = frappe.get_doc('Pick List', pick_list)

    if not doc.locations:
        frappe.throw(_("No items to optimize"))

    # Get warehouse layout (would need custom Warehouse Location master)
    # For now, optimize by warehouse -> aisle -> bin
    optimized_locations = []

    # Group by warehouse
    by_warehouse = {}
    for loc in doc.locations:
        wh = loc.warehouse
        if wh not in by_warehouse:
            by_warehouse[wh] = []
        by_warehouse[wh].append(loc)

    # Sort within each warehouse
    for warehouse, items in by_warehouse.items():
        # Sort by location code if available, otherwise by item_code
        sorted_items = sorted(items, key=lambda x: x.get('location') or x.item_code)
        optimized_locations.extend(sorted_items)

    # Update order in pick list
    for idx, loc in enumerate(optimized_locations, start=1):
        loc.idx = idx

    doc.save()

    return {
        'success': True,
        'steps': len(optimized_locations),
        'estimated_time': len(optimized_locations) * 0.5 + 2  # minutes
    }

@frappe.whitelist()
def create_picking_session(pick_list, picker, scan_mode=1):
    """Create a new picking session"""
    session = frappe.get_doc({
        'doctype': 'WMS Pick Session',
        'pick_list': pick_list,
        'picker': picker,
        'scan_mode': scan_mode,
        'status': 'In Progress',
        'start_time': frappe.utils.now()
    })

    session.insert()
    frappe.db.commit()

    return session

@frappe.whitelist()
def get_default_packing_location():
    """Get default packing location from settings"""
    settings = frappe.get_cached_doc('WMS Settings', None)
    return settings.default_packing_location if settings else None

@frappe.whitelist()
def optimize_packing(delivery_note):
    """
    Optimize packing for a delivery note
    Suggests optimal package arrangement
    """
    doc = frappe.get_doc('Delivery Note', delivery_note)

    if not doc.items:
        frappe.throw(_("No items to pack"))

    # Simple bin packing algorithm
    packages = []
    current_package = {'items': [], 'weight': 0, 'volume': 0}

    # Get settings
    settings = frappe.get_cached_doc('WMS Settings', None)
    max_weight = settings.max_package_weight if settings else 25  # kg
    max_volume = settings.max_package_volume if settings else 0.1  # m³

    for item in doc.items:
        item_doc = frappe.get_cached_doc('Item', item.item_code)

        item_weight = (item_doc.weight_per_unit or 0) * item.qty
        item_volume = (item_doc.get('volume_per_unit') or 0) * item.qty

        # Check if item fits in current package
        if (current_package['weight'] + item_weight > max_weight or
            current_package['volume'] + item_volume > max_volume):
            # Start new package
            if current_package['items']:
                packages.append(current_package)

            current_package = {'items': [], 'weight': 0, 'volume': 0}

        current_package['items'].append({
            'item_code': item.item_code,
            'item_name': item.item_name,
            'qty': item.qty
        })
        current_package['weight'] += item_weight
        current_package['volume'] += item_volume

    # Add last package
    if current_package['items']:
        packages.append(current_package)

    return {
        'packages': packages,
        'total_packages': len(packages)
    }

@frappe.whitelist()
def get_item_location(item_code, warehouse):
    """Get optimal location for an item in a warehouse"""
    # Check if we have a Bin with location
    bins = frappe.get_all('Bin',
        filters={
            'item_code': item_code,
            'warehouse': warehouse,
            'actual_qty': ['>', 0]
        },
        fields=['warehouse', 'actual_qty'],
        order_by='actual_qty desc',
        limit=1
    )

    if bins:
        # Would return specific location if Bin had location field
        return bins[0].warehouse

    return None

@frappe.whitelist()
def process_barcode_scan(barcode, stock_entry=None):
    """
    Process a barcode scan
    Returns item details
    """
    # Try to find item by barcode
    item = frappe.db.get_value('Item Barcode',
        {'barcode': barcode},
        ['parent as item_code', 'barcode'],
        as_dict=True
    )

    if not item:
        # Try direct item code match
        item_exists = frappe.db.exists('Item', barcode)
        if item_exists:
            item = {'item_code': barcode, 'barcode': barcode}

    if not item:
        frappe.throw(_("No item found for barcode: {0}").format(barcode))

    # Get item details
    item_doc = frappe.get_cached_doc('Item', item['item_code'])

    return {
        'item_code': item_doc.name,
        'item_name': item_doc.item_name,
        'qty': 1,
        'uom': item_doc.stock_uom,
        'barcode': barcode
    }

@frappe.whitelist()
def verify_stock_entry_locations(stock_entry):
    """Verify all locations in a stock entry are valid"""
    doc = frappe.get_doc('Stock Entry', stock_entry)

    errors = []

    for item in doc.items:
        # Verify source warehouse
        if item.s_warehouse:
            available = frappe.db.get_value('Bin', {
                'item_code': item.item_code,
                'warehouse': item.s_warehouse
            }, 'actual_qty') or 0

            if available < item.qty:
                errors.append(_("Insufficient {0} in {1}").format(
                    item.item_code, item.s_warehouse
                ))

    return {
        'valid': len(errors) == 0,
        'errors': errors
    }

@frappe.whitelist()
def get_pick_list_details(pick_list):
    """Get detailed information about a pick list"""
    doc = frappe.get_doc('Pick List', pick_list)

    items = []
    for loc in doc.locations:
        item_doc = frappe.get_cached_doc('Item', loc.item_code)

        items.append({
            'idx': loc.idx,
            'item_code': loc.item_code,
            'item_name': loc.item_name,
            'qty': loc.qty,
            'picked_qty': loc.get('picked_qty') or 0,
            'uom': loc.uom,
            'warehouse': loc.warehouse,
            'location': loc.get('location') or '',
            'batch_no': loc.get('batch_no') or '',
            'has_batch_no': item_doc.has_batch_no or 0,
            'image': item_doc.image,
            'barcode': get_item_barcode(loc.item_code)
        })

    return {
        'name': doc.name,
        'status': doc.status,
        'items': items,
        'total_items': len(items),
        'total_qty': sum([item['qty'] for item in items])
    }

def get_item_barcode(item_code):
    """Get primary barcode for an item"""
    barcode = frappe.db.get_value('Item Barcode',
        {'parent': item_code},
        'barcode',
        order_by='idx'
    )
    return barcode or item_code

@frappe.whitelist()
def lock_pick_list(pick_list):
    """Lock a pick list for picking by current user"""
    doc = frappe.get_doc('Pick List', pick_list)

    # Check if already locked by someone else
    if doc.get('wms_locked_by') and doc.wms_locked_by != frappe.session.user:
        # Check if lock is stale (older than 30 minutes)
        if doc.get('wms_locked_at'):
            from frappe.utils import get_datetime, now_datetime
            lock_time = get_datetime(doc.wms_locked_at)
            current_time = now_datetime()
            minutes_diff = (current_time - lock_time).total_seconds() / 60

            if minutes_diff < 30:
                # Lock is still valid
                locked_user = frappe.get_value('User', doc.wms_locked_by, 'full_name')
                return {
                    'success': False,
                    'locked': True,
                    'locked_by': locked_user,
                    'message': _('This pick list is currently being picked by {0}').format(locked_user)
                }

    # Lock the pick list
    doc.wms_locked_by = frappe.session.user
    doc.wms_locked_at = frappe.utils.now()
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        'success': True,
        'locked': False,
        'message': 'Pick list locked successfully'
    }

@frappe.whitelist()
def unlock_pick_list(pick_list):
    """Unlock a pick list"""
    doc = frappe.get_doc('Pick List', pick_list)

    # Only unlock if locked by current user
    if doc.get('wms_locked_by') == frappe.session.user:
        doc.wms_locked_by = None
        doc.wms_locked_at = None
        doc.save(ignore_permissions=True)
        frappe.db.commit()

        return {'success': True, 'message': 'Pick list unlocked'}

    return {'success': False, 'message': 'Not locked by you'}

@frappe.whitelist()
def update_pick_progress(pick_list, item_idx, picked_qty, location=None, batch_no=None, box=None):
    """Update picking progress for a specific item"""
    doc = frappe.get_doc('Pick List', pick_list)

    # Find the location row by idx
    for loc in doc.locations:
        if loc.idx == int(item_idx):
            # Update picked quantity (convert to float)
            loc.picked_qty = float(picked_qty)

            # Update location if scanned
            if location:
                loc.location = location

            # Update batch if scanned
            if batch_no:
                loc.batch_no = batch_no

            # Add custom field for box tracking (if exists)
            if box and hasattr(loc, 'wms_box'):
                loc.wms_box = box

            # Save the document
            doc.save(ignore_permissions=True)
            frappe.db.commit()

            # Publish realtime update
            frappe.publish_realtime('pick_progress_updated', {
                'pick_list': pick_list,
                'item_idx': item_idx,
                'picked_qty': picked_qty
            }, user=frappe.session.user)

            return {'success': True, 'message': 'Pick updated successfully'}

    return {'success': False, 'message': 'Item not found in pick list'}
