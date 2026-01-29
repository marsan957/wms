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

        # Determine order reference
        order_ref = None
        if loc.get('sales_order'):
            order_ref = loc.sales_order
        elif loc.get('material_request'):
            order_ref = loc.material_request
        elif loc.get('work_order'):
            order_ref = loc.work_order

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
            'barcode': get_item_barcode(loc.item_code),
            'order_ref': order_ref,
            'sales_order': loc.get('sales_order') or '',
            'material_request': loc.get('material_request') or '',
            'work_order': loc.get('work_order') or ''
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
def lock_pick_list(pick_list, session_id=None):
    """Lock a pick list for picking by current user"""
    doc = frappe.get_doc('Pick List', pick_list)

    # Check if already locked
    if doc.get('wms_locked_by'):
        # Check if lock is stale (older than 30 minutes)
        if doc.get('wms_locked_at'):
            from frappe.utils import get_datetime, now_datetime
            lock_time = get_datetime(doc.wms_locked_at)
            current_time = now_datetime()
            minutes_diff = (current_time - lock_time).total_seconds() / 60

            if minutes_diff < 30:
                # Check if same session (same tab)
                stored_session = doc.get('wms_session_id')
                if stored_session and stored_session == session_id:
                    # Same tab refreshing - allow
                    doc.wms_locked_at = frappe.utils.now()
                    doc.save(ignore_permissions=True)
                    frappe.db.commit()
                    return {
                        'success': True,
                        'locked': False,
                        'message': 'Pick list locked successfully'
                    }

                # Lock is still valid and it's a different tab/user
                locked_user = frappe.get_value('User', doc.wms_locked_by, 'full_name')
                is_same_user = doc.wms_locked_by == frappe.session.user

                return {
                    'success': False,
                    'locked': True,
                    'locked_by': locked_user,
                    'is_same_user': is_same_user,
                    'message': _('This pick list is currently being picked by {0}').format(locked_user) if not is_same_user else _('This pick list is open in another tab')
                }

    # Lock the pick list
    doc.wms_locked_by = frappe.session.user
    doc.wms_locked_at = frappe.utils.now()
    doc.wms_session_id = session_id
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        'success': True,
        'locked': False,
        'message': 'Pick list locked successfully'
    }

@frappe.whitelist()
def get_wms_dashboard_data():
    """Get WMS dashboard statistics and open pick lists"""
    from frappe.utils import today

    # Get statistics
    stats = {
        'open_picks': frappe.db.count('Pick List', {'status': 'Open', 'docstatus': 0}),
        'in_progress': frappe.db.count('Pick List', {'wms_locked_by': ['is', 'set']}),
        'completed_today': frappe.db.count('Pick List', {
            'status': 'Completed',
            'modified': ['>=', today()]
        })
    }

    # Get open pick lists
    pick_lists = frappe.get_all('Pick List',
        filters={'status': 'Open', 'docstatus': 0},
        fields=['name', 'status', 'wms_locked_by', 'wms_locked_at', 'creation'],
        order_by='creation desc',
        limit=20
    )

    # Add user names and item counts
    for pick in pick_lists:
        if pick.wms_locked_by:
            pick['locked_by_name'] = frappe.get_value('User', pick.wms_locked_by, 'full_name')

        # Count items
        pick['total_items'] = frappe.db.count('Pick List Item', {'parent': pick.name})

    return {
        'stats': stats,
        'pick_lists': pick_lists
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

@frappe.whitelist()
def create_delivery_notes_from_pick_list(pick_list):
    """
    Auto-create delivery notes grouped by sales order
    Called when picking is complete
    """
    doc = frappe.get_doc('Pick List', pick_list)

    if not doc.locations:
        frappe.throw(_("No items in pick list"))

    # Group items by sales_order
    order_groups = {}
    for loc in doc.locations:
        # Get the sales order reference from location
        order_ref = loc.get('sales_order') or 'NO_ORDER'

        if order_ref not in order_groups:
            order_groups[order_ref] = []
        order_groups[order_ref].append(loc)

    # Create delivery note per order
    created_dns = []
    for order_ref, items in order_groups.items():
        # Skip material requests/work orders for now
        if order_ref == 'NO_ORDER':
            continue

        try:
            dn = _create_delivery_note(doc, items, order_ref)
            created_dns.append(dn.name)
        except Exception as e:
            frappe.log_error(f"Error creating delivery note for {order_ref}: {str(e)}")
            frappe.throw(_("Failed to create delivery note for {0}: {1}").format(order_ref, str(e)))

    return {
        'success': True,
        'delivery_notes': created_dns,
        'count': len(created_dns)
    }

def _create_delivery_note(pick_list_doc, location_items, sales_order_ref):
    """
    Helper function to create a delivery note from pick list items
    """
    # Get sales order to fetch customer and other details
    sales_order = frappe.get_doc('Sales Order', sales_order_ref)

    # Create new delivery note
    dn = frappe.new_doc('Delivery Note')
    dn.customer = sales_order.customer
    dn.posting_date = frappe.utils.today()
    dn.set_posting_time = 0

    # Link to pick list
    if hasattr(dn, 'pick_list'):
        dn.pick_list = pick_list_doc.name

    # Copy customer details from sales order
    dn.customer_name = sales_order.customer_name
    dn.contact_person = sales_order.contact_person
    dn.contact_display = sales_order.contact_display
    dn.contact_mobile = sales_order.contact_mobile
    dn.contact_email = sales_order.contact_email
    dn.shipping_address_name = sales_order.shipping_address_name
    dn.shipping_address = sales_order.shipping_address
    dn.dispatch_address_name = sales_order.dispatch_address_name
    dn.dispatch_address = sales_order.dispatch_address
    dn.company = sales_order.company

    # Add items from pick list locations
    for loc in location_items:
        # Find corresponding item in sales order
        so_item = None
        for item in sales_order.items:
            if item.item_code == loc.item_code:
                so_item = item
                break

        if not so_item:
            continue

        # Add item to delivery note
        dn_item = dn.append('items', {})
        dn_item.item_code = loc.item_code
        dn_item.item_name = loc.item_name
        dn_item.description = so_item.description
        dn_item.qty = loc.picked_qty or loc.qty
        dn_item.uom = loc.uom or loc.stock_uom
        dn_item.stock_uom = loc.stock_uom
        dn_item.conversion_factor = so_item.conversion_factor
        dn_item.warehouse = loc.warehouse
        dn_item.against_sales_order = sales_order_ref
        dn_item.so_detail = so_item.name

        # Transfer box assignment from pick list
        if hasattr(loc, 'wms_box') and loc.wms_box:
            dn_item.wms_box = loc.wms_box

        # Initialize packed qty to 0
        if hasattr(dn_item, 'wms_packed_qty'):
            dn_item.wms_packed_qty = 0

    # Save delivery note
    dn.insert(ignore_permissions=True)

    frappe.msgprint(_("Created Delivery Note {0} for {1}").format(dn.name, sales_order_ref))

    return dn

@frappe.whitelist()
def get_unpacked_delivery_notes():
    """
    Get list of delivery notes ready for packing
    Returns DNs that are draft or have unpacked items
    """
    # Query delivery notes that have pick_list and are not fully packed
    dns = frappe.db.sql("""
        SELECT DISTINCT
            dn.name,
            dn.customer,
            dn.customer_name,
            dn.posting_date,
            dn.pick_list,
            COUNT(DISTINCT dni.name) as total_items,
            SUM(dni.qty) as total_qty,
            SUM(IFNULL(dni.wms_packed_qty, 0)) as packed_qty
        FROM `tabDelivery Note` dn
        INNER JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
        WHERE dn.docstatus = 0
            AND dn.pick_list IS NOT NULL
            AND dn.pick_list != ''
            AND (dn.wms_packing_complete IS NULL OR dn.wms_packing_complete = 0)
        GROUP BY dn.name
        HAVING packed_qty < total_qty
        ORDER BY dn.creation DESC
    """, as_dict=True)

    return dns

@frappe.whitelist()
def get_delivery_note_details(delivery_note):
    """
    Get detailed packing information for a delivery note
    Similar to get_pick_list_details
    """
    dn = frappe.get_doc('Delivery Note', delivery_note)

    items = []
    for item in dn.items:
        items.append({
            'idx': item.idx,
            'item_code': item.item_code,
            'item_name': item.item_name,
            'description': item.description,
            'qty': item.qty,
            'stock_uom': item.stock_uom,
            'warehouse': item.warehouse,
            'wms_box': item.get('wms_box') or '',
            'wms_packed_qty': item.get('wms_packed_qty') or 0,
            'wms_package_no': item.get('wms_package_no') or '',
            'image': frappe.db.get_value('Item', item.item_code, 'image')
        })

    return {
        'name': dn.name,
        'customer': dn.customer,
        'customer_name': dn.customer_name,
        'pick_list': dn.get('pick_list'),
        'items': items,
        'total_items': len(items)
    }

@frappe.whitelist()
def lock_delivery_note(delivery_note, session_id=None):
    """
    Lock a delivery note for packing by current user
    Similar to lock_pick_list
    """
    doc = frappe.get_doc('Delivery Note', delivery_note)

    # Check if already locked
    if doc.get('wms_locked_by'):
        locked_by = doc.wms_locked_by
        locked_at = doc.wms_locked_at
        locked_session = doc.get('wms_session_id')

        # Check if lock is still valid (30 minutes)
        if locked_at:
            lock_age = frappe.utils.time_diff_in_seconds(frappe.utils.now(), locked_at)
            if lock_age < 1800:  # 30 minutes
                # Check if same session (tab refresh)
                if session_id and locked_session == session_id:
                    # Same session, allow
                    return {'success': True, 'message': 'Lock refreshed'}

                # Different user or different session
                is_same_user = locked_by == frappe.session.user
                return {
                    'success': False,
                    'locked_by': locked_by,
                    'is_same_user': is_same_user,
                    'message': f'This delivery note is being packed by {locked_by}' if not is_same_user
                              else 'This delivery note is being packed in another tab'
                }

    # Lock is expired or doesn't exist, acquire lock
    doc.wms_locked_by = frappe.session.user
    doc.wms_locked_at = frappe.utils.now()
    doc.wms_session_id = session_id
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {'success': True, 'message': 'Delivery note locked successfully'}

@frappe.whitelist()
def unlock_delivery_note(delivery_note):
    """Unlock a delivery note"""
    try:
        doc = frappe.get_doc('Delivery Note', delivery_note)

        # Only allow unlocking if locked by current user
        if doc.get('wms_locked_by') == frappe.session.user:
            doc.wms_locked_by = None
            doc.wms_locked_at = None
            doc.wms_session_id = None
            doc.save(ignore_permissions=True)
            frappe.db.commit()

        return {'success': True}
    except Exception as e:
        frappe.log_error(f"Error unlocking delivery note: {str(e)}")
        return {'success': False, 'message': str(e)}

@frappe.whitelist()
def update_packing_progress(delivery_note, item_idx, packed_qty, package_no, weight=None):
    """
    Update packing progress for a specific item
    Similar to update_pick_progress
    """
    doc = frappe.get_doc('Delivery Note', delivery_note)

    # Find item by idx
    for item in doc.items:
        if item.idx == int(item_idx):
            item.wms_packed_qty = float(packed_qty)
            if package_no:
                item.wms_package_no = package_no

            doc.save(ignore_permissions=True)
            frappe.db.commit()

            # Publish realtime update
            frappe.publish_realtime('pack_progress_updated', {
                'delivery_note': delivery_note,
                'item_idx': item_idx,
                'packed_qty': packed_qty
            }, user=frappe.session.user)

            return {'success': True, 'message': 'Packing progress updated successfully'}

    return {'success': False, 'message': 'Item not found in delivery note'}

@frappe.whitelist()
def confirm_packing(delivery_note, packages):
    """
    Mark packing as complete
    Validates all items are packed
    """
    doc = frappe.get_doc('Delivery Note', delivery_note)

    # Validate all items are packed
    for item in doc.items:
        packed_qty = item.get('wms_packed_qty') or 0
        if packed_qty < item.qty:
            return {
                'success': False,
                'message': f'Item {item.item_code} is not fully packed ({packed_qty}/{item.qty})'
            }

    # Mark as packing complete
    if hasattr(doc, 'wms_packing_complete'):
        doc.wms_packing_complete = 1

    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        'success': True,
        'message': 'Packing completed successfully'
    }

@frappe.whitelist()
def create_shipment(delivery_note, packages, carrier=None, tracking_no=None, shipment_date=None, notes=None):
    """
    Create WMS Shipment record linked to delivery note
    """
    import json

    # Parse packages if it's a string
    if isinstance(packages, str):
        packages = json.loads(packages)

    dn = frappe.get_doc('Delivery Note', delivery_note)

    # Create shipment document
    try:
        shipment = frappe.new_doc('WMS Shipment')
        shipment.delivery_note = delivery_note
        shipment.customer = dn.customer
        shipment.shipment_date = shipment_date or frappe.utils.today()
        shipment.carrier = carrier or ''
        shipment.tracking_number = tracking_no or ''
        shipment.status = 'Draft'
        shipment.notes = notes or ''

        # Calculate totals
        total_weight = 0
        total_packages = len(packages)

        # Add packages
        for pkg in packages:
            package_row = shipment.append('packages', {})
            package_row.package_no = pkg.get('package_no', '')
            package_row.weight = pkg.get('weight', 0)
            package_row.items_count = pkg.get('items_count', 0)
            package_row.package_items = json.dumps(pkg.get('items', []))

            total_weight += pkg.get('weight', 0)

        shipment.total_weight = total_weight
        shipment.total_packages = total_packages

        shipment.insert(ignore_permissions=True)
        frappe.db.commit()

        # Update delivery note with shipment link
        if hasattr(dn, 'wms_shipment'):
            dn.wms_shipment = shipment.name
            dn.save(ignore_permissions=True)
            frappe.db.commit()

        return {
            'success': True,
            'shipment': shipment.name,
            'message': f'Shipment {shipment.name} created successfully'
        }

    except Exception as e:
        frappe.log_error(f"Error creating shipment: {str(e)}")
        return {
            'success': False,
            'message': str(e)
        }
