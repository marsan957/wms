// WMS - Pick List Customizations

frappe.ui.form.on('Pick List', {
    refresh: function(frm) {
        // Add Optimized Pick View button
        if (frm.doc.docstatus === 0 && frm.doc.locations && frm.doc.locations.length > 0) {
            frm.add_custom_button(__('Optimerad Plockvy'), function() {
                wms.open_optimized_pick_view(frm);
            }, __('WMS'));

            frm.add_custom_button(__('Optimera Rutt'), function() {
                wms.optimize_pick_route(frm);
            }, __('WMS'));
        }

        // Add barcode scanning for submitted pick lists
        if (frm.doc.docstatus === 1 && frm.doc.locations) {
            frm.add_custom_button(__('Starta Plockning'), function() {
                wms.start_picking(frm);
            }, __('WMS'));
        }

        // Show pick list statistics
        if (frm.doc.locations && frm.doc.locations.length > 0) {
            wms.show_pick_stats(frm);
        }
    },

    onload: function(frm) {
        // Load WMS settings
        frappe.call({
            method: 'wms.api.get_wms_settings',
            callback: function(r) {
                if (r.message) {
                    frm.wms_settings = r.message;
                }
            }
        });
    }
});

// WMS Pick List Functions
frappe.provide('wms');

wms.open_optimized_pick_view = function(frm) {
    frappe.set_route('pick-optimization', frm.doc.name);
};

wms.optimize_pick_route = function(frm) {
    frappe.call({
        method: 'wms.api.optimize_pick_route',
        args: {
            pick_list: frm.doc.name
        },
        freeze: true,
        freeze_message: __('Optimerar plockrutt...'),
        callback: function(r) {
            if (r.message) {
                frappe.msgprint({
                    title: __('Rutt Optimerad'),
                    indicator: 'green',
                    message: __('Plockrutten har optimerats. {0} steg, beräknad tid: {1} minuter',
                        [r.message.steps, r.message.estimated_time])
                });

                frm.reload_doc();
            }
        }
    });
};

wms.start_picking = function(frm) {
    let d = new frappe.ui.Dialog({
        title: __('Starta Plockning'),
        fields: [
            {
                fieldname: 'picker',
                fieldtype: 'Link',
                label: __('Plockare'),
                options: 'User',
                default: frappe.session.user,
                reqd: 1
            },
            {
                fieldname: 'scan_mode',
                fieldtype: 'Check',
                label: __('Använd Streckkodsläsare'),
                default: 1
            }
        ],
        primary_action_label: __('Börja Plocka'),
        primary_action: function(values) {
            d.hide();

            // Create picking session
            frappe.call({
                method: 'wms.api.create_picking_session',
                args: {
                    pick_list: frm.doc.name,
                    picker: values.picker,
                    scan_mode: values.scan_mode
                },
                callback: function(r) {
                    if (r.message) {
                        frappe.set_route('pick-session', r.message.name);
                    }
                }
            });
        }
    });

    d.show();
};

wms.show_pick_stats = function(frm) {
    if (!frm.doc.locations) return;

    let total_items = frm.doc.locations.length;
    let total_qty = 0;
    let unique_warehouses = new Set();
    let unique_items = new Set();

    frm.doc.locations.forEach(loc => {
        total_qty += loc.qty || 0;
        unique_warehouses.add(loc.warehouse);
        unique_items.add(loc.item_code);
    });

    let html = `
        <div style="padding: 10px; background: #f9fafb; border-radius: 6px; margin: 10px 0;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 600; color: #3b82f6;">${total_items}</div>
                    <div style="font-size: 12px; color: #6b7280;">Plockrader</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 600; color: #3b82f6;">${total_qty.toFixed(2)}</div>
                    <div style="font-size: 12px; color: #6b7280;">Total Kvantitet</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 600; color: #3b82f6;">${unique_items.size}</div>
                    <div style="font-size: 12px; color: #6b7280;">Unika Artiklar</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 24px; font-weight: 600; color: #3b82f6;">${unique_warehouses.size}</div>
                    <div style="font-size: 12px; color: #6b7280;">Lager</div>
                </div>
            </div>
        </div>
    `;

    frm.dashboard.add_comment(html, true);
};
