# WMS Development Guide

Guide för att bygga ut WMS-appen med fler funktioner.

## Skapa DocTypes

### 1. WMS Settings (SingleDocType)

Settings för WMS-systemet.

```bash
# I bench
bench --site [sitename] console
```

```python
# Skapa WMS Settings doctype
doc = frappe.get_doc({
    "doctype": "DocType",
    "name": "WMS Settings",
    "module": "WMS",
    "issingle": 1,
    "fields": [
        {
            "fieldname": "picking_section",
            "label": "Picking Settings",
            "fieldtype": "Section Break"
        },
        {
            "fieldname": "enable_barcode_scanning",
            "label": "Enable Barcode Scanning",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "enable_route_optimization",
            "label": "Enable Route Optimization",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "auto_create_pick_session",
            "label": "Auto Create Pick Session",
            "fieldtype": "Check",
            "default": "0"
        },
        {
            "fieldname": "column_break_1",
            "fieldtype": "Column Break"
        },
        {
            "fieldname": "enable_sound",
            "label": "Enable Sound Feedback",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "enable_vibration",
            "label": "Enable Vibration (Mobile)",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "packing_section",
            "label": "Packing Settings",
            "fieldtype": "Section Break"
        },
        {
            "fieldname": "auto_create_packing_slip",
            "label": "Auto Create Packing Slip",
            "fieldtype": "Check",
            "default": "0"
        },
        {
            "fieldname": "default_packing_location",
            "label": "Default Packing Location",
            "fieldtype": "Link",
            "options": "Warehouse"
        },
        {
            "fieldname": "column_break_2",
            "fieldtype": "Column Break"
        },
        {
            "fieldname": "max_package_weight",
            "label": "Max Package Weight (kg)",
            "fieldtype": "Float",
            "default": "25"
        },
        {
            "fieldname": "max_package_volume",
            "label": "Max Package Volume (m³)",
            "fieldtype": "Float",
            "default": "0.1"
        }
    ],
    "permissions": [
        {
            "role": "System Manager",
            "read": 1,
            "write": 1
        },
        {
            "role": "Stock Manager",
            "read": 1,
            "write": 1
        }
    ]
})
doc.insert()
```

Eller enklare via UI:
1. Gå till **Doctype List**
2. Klicka **New**
3. Fyll i fälten enligt ovan
4. Save

### 2. WMS Pick Session

Tracker picking sessions för användare.

```python
doc = frappe.get_doc({
    "doctype": "DocType",
    "name": "WMS Pick Session",
    "module": "WMS",
    "autoname": "format:PICK-{pick_list}-{####}",
    "fields": [
        {
            "fieldname": "pick_list",
            "label": "Pick List",
            "fieldtype": "Link",
            "options": "Pick List",
            "reqd": 1
        },
        {
            "fieldname": "picker",
            "label": "Picker",
            "fieldtype": "Link",
            "options": "User",
            "reqd": 1
        },
        {
            "fieldname": "status",
            "label": "Status",
            "fieldtype": "Select",
            "options": "Open\\nIn Progress\\nCompleted\\nCancelled",
            "default": "Open"
        },
        {
            "fieldname": "column_break_1",
            "fieldtype": "Column Break"
        },
        {
            "fieldname": "start_time",
            "label": "Start Time",
            "fieldtype": "Datetime"
        },
        {
            "fieldname": "end_time",
            "label": "End Time",
            "fieldtype": "Datetime"
        },
        {
            "fieldname": "scan_mode",
            "label": "Scan Mode",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "items_section",
            "label": "Items",
            "fieldtype": "Section Break"
        },
        {
            "fieldname": "total_items",
            "label": "Total Items",
            "fieldtype": "Int",
            "read_only": 1
        },
        {
            "fieldname": "picked_items",
            "label": "Picked Items",
            "fieldtype": "Int",
            "read_only": 1
        },
        {
            "fieldname": "column_break_2",
            "fieldtype": "Column Break"
        },
        {
            "fieldname": "progress_percent",
            "label": "Progress %",
            "fieldtype": "Percent",
            "read_only": 1
        }
    ],
    "permissions": [
        {
            "role": "Stock User",
            "read": 1,
            "write": 1,
            "create": 1
        }
    ]
})
doc.insert()
```

### 3. Warehouse Location (Optional)

För detaljerad platshantering inom lager.

```python
doc = frappe.get_doc({
    "doctype": "DocType",
    "name": "Warehouse Location",
    "module": "WMS",
    "autoname": "field:location_name",
    "fields": [
        {
            "fieldname": "location_name",
            "label": "Location Name",
            "fieldtype": "Data",
            "reqd": 1,
            "unique": 1
        },
        {
            "fieldname": "warehouse",
            "label": "Warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "reqd": 1
        },
        {
            "fieldname": "aisle",
            "label": "Aisle",
            "fieldtype": "Data"
        },
        {
            "fieldname": "rack",
            "label": "Rack",
            "fieldtype": "Data"
        },
        {
            "fieldname": "shelf",
            "label": "Shelf",
            "fieldtype": "Data"
        },
        {
            "fieldname": "bin",
            "label": "Bin",
            "fieldtype": "Data"
        },
        {
            "fieldname": "column_break_1",
            "fieldtype": "Column Break"
        },
        {
            "fieldname": "location_type",
            "label": "Location Type",
            "fieldtype": "Select",
            "options": "Storage\\nPicking\\nPacking\\nStaging"
        },
        {
            "fieldname": "is_active",
            "label": "Is Active",
            "fieldtype": "Check",
            "default": "1"
        },
        {
            "fieldname": "capacity",
            "label": "Capacity",
            "fieldtype": "Float"
        },
        {
            "fieldname": "coordinates_section",
            "label": "Coordinates",
            "fieldtype": "Section Break"
        },
        {
            "fieldname": "x_coordinate",
            "label": "X Coordinate",
            "fieldtype": "Float"
        },
        {
            "fieldname": "y_coordinate",
            "label": "Y Coordinate",
            "fieldtype": "Float"
        },
        {
            "fieldname": "z_coordinate",
            "label": "Z Coordinate (Height)",
            "fieldtype": "Float"
        }
    ],
    "permissions": [
        {
            "role": "Stock Manager",
            "read": 1,
            "write": 1,
            "create": 1,
            "delete": 1
        },
        {
            "role": "Stock User",
            "read": 1
        }
    ]
})
doc.insert()
```

## Skapa Custom Pages

### 1. Pick Optimization Page

```bash
cd ~/frappe-bench/apps/wms
bench new-page pick-optimization
```

Redigera `wms/www/pick-optimization/index.html`:

```html
{% extends "templates/web.html" %}

{% block title %}{{ _("Optimerad Plockvy") }}{% endblock %}

{% block page_content %}
<div id="pick-optimization-app">
    <div class="container mt-4">
        <h2>Optimerad Plockvy</h2>
        <div id="pick-list-details"></div>
        <div id="pick-items"></div>
    </div>
</div>

<script src="/assets/wms/js/pick_optimization_page.js"></script>
{% endblock %}
```

Skapa `wms/public/js/pick_optimization_page.js`:

```javascript
frappe.ready(function() {
    const pick_list = frappe.utils.get_url_arg('name');

    if (!pick_list) {
        frappe.msgprint('No pick list specified');
        return;
    }

    load_pick_list(pick_list);
});

function load_pick_list(pick_list) {
    frappe.call({
        method: 'wms.api.get_pick_list_details',
        args: { pick_list: pick_list },
        callback: function(r) {
            if (r.message) {
                render_pick_list(r.message);
            }
        }
    });
}

function render_pick_list(data) {
    // Render pick list UI
    let html = `
        <div class="wms-progress-container">
            <h4>Progress: 0 / ${data.total_items}</h4>
            <div class="wms-progress-bar">
                <div class="wms-progress-fill" style="width: 0%">0%</div>
            </div>
        </div>
        <div class="wms-pick-container">
    `;

    data.items.forEach((item, idx) => {
        html += `
            <div class="wms-pick-item" data-item-code="${item.item_code}">
                <div class="wms-item-header">
                    <div>
                        <div class="wms-item-code">${item.item_code}</div>
                        <div class="wms-location">
                            <span class="wms-location-badge">${item.warehouse}</span>
                            ${item.location || ''}
                        </div>
                    </div>
                    <div class="wms-quantity">${item.qty} ${item.uom}</div>
                </div>
                <button class="wms-scan-btn" onclick="scan_item('${item.item_code}', '${item.warehouse}', ${item.qty})">
                    Scanna Artikel
                </button>
            </div>
        `;
    });

    html += '</div>';

    $('#pick-list-details').html(html);
}

function scan_item(item_code, warehouse, qty) {
    wms.utils.show_scanner_dialog(function(barcode) {
        // Verify barcode matches item
        frappe.call({
            method: 'wms.api.process_barcode_scan',
            args: { barcode: barcode },
            callback: function(r) {
                if (r.message && r.message.item_code === item_code) {
                    mark_item_picked(item_code, warehouse, qty);
                } else {
                    frappe.msgprint('Fel artikel scannad!');
                    wms.utils.play_error_sound();
                }
            }
        });
    });
}

function mark_item_picked(item_code, warehouse, qty) {
    // Mark item as picked
    $(`.wms-pick-item[data-item-code="${item_code}"]`).addClass('completed');

    wms.utils.play_success_sound();
    wms.utils.vibrate();

    // Update progress
    update_progress();
}

function update_progress() {
    let total = $('.wms-pick-item').length;
    let completed = $('.wms-pick-item.completed').length;
    let percent = Math.round((completed / total) * 100);

    $('.wms-progress-fill').css('width', percent + '%').text(percent + '%');
}
```

## Lägg Till Custom Fields

Istället för att skapa manuellt kan du använda fixtures:

Skapa `wms/fixtures/custom_field.json`:

```json
[
    {
        "dt": "Pick List Item",
        "fieldname": "wms_picked_qty",
        "label": "Picked Qty",
        "fieldtype": "Float",
        "insert_after": "qty",
        "read_only": 1
    },
    {
        "dt": "Pick List Item",
        "fieldname": "wms_picked",
        "label": "Picked",
        "fieldtype": "Check",
        "insert_after": "wms_picked_qty"
    }
]
```

Uppdatera `hooks.py`:

```python
fixtures = [
    {"dt": "Custom Field", "filters": [["name", "in", [
        "Pick List Item-wms_picked_qty",
        "Pick List Item-wms_picked"
    ]]]}
]
```

Exportera:
```bash
bench --site [sitename] export-fixtures
```

## Testa Appen

```bash
# Kör tests
bench --site [sitename] run-tests --app wms

# Bygg assets
bench build --app wms

# Starta om
bench restart
```

## Deploy till Production

```bash
# Uppdatera apps.json
# Bygg ny Docker image
# Deploy enligt QUICK_START.md
```

## Tips

1. **Använd bench console** för snabb utveckling
2. **Aktivera Developer Mode** för att se ändringar direkt
3. **Använd frappe.log_error()** för debugging
4. **Testa i dev först** innan production deploy
5. **Backup innan migration** med `bench backup`

## Nästa Funktioner att Bygga

- [ ] Wave picking (plocka flera orders samtidigt)
- [ ] Put-away optimization (inlastning)
- [ ] Cycle counting interface
- [ ] Heat maps för lager-aktivitet
- [ ] Mobile app med React Native
- [ ] Integration med handdatorer/PDA
- [ ] Voice picking
- [ ] RF gun support
