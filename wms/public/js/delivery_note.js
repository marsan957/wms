// WMS - Delivery Note Customizations

frappe.ui.form.on('Delivery Note', {
    refresh: function(frm) {
        // Add Quick Pack button
        if (frm.doc.docstatus === 0 && frm.doc.items && frm.doc.items.length > 0) {
            frm.add_custom_button(__('Snabbpackning'), function() {
                wms.open_quick_pack(frm);
            }, __('WMS'));

            frm.add_custom_button(__('Optimera Paket'), function() {
                wms.optimize_packing(frm);
            }, __('WMS'));
        }

        // Show packing suggestions
        if (frm.doc.docstatus === 0) {
            wms.show_packing_suggestions(frm);
        }
    },

    onload: function(frm) {
        // Set default warehouse location if configured
        frappe.call({
            method: 'wms.api.get_default_packing_location',
            callback: function(r) {
                if (r.message) {
                    frm.default_packing_location = r.message;
                }
            }
        });
    },

    before_save: function(frm) {
        // Validate all items have been packed
        if (frm.doc.wms_require_packing) {
            wms.validate_packing(frm);
        }
    }
});

// WMS Delivery Note Functions
wms.open_quick_pack = function(frm) {
    frappe.set_route('quick-pack', frm.doc.name);
};

wms.optimize_packing = function(frm) {
    frappe.call({
        method: 'wms.api.optimize_packing',
        args: {
            delivery_note: frm.doc.name
        },
        freeze: true,
        freeze_message: __('Optimerar packning...'),
        callback: function(r) {
            if (r.message) {
                let result = r.message;

                let msg = __('Förslag på {0} paket:', [result.packages.length]) + '<br><br>';

                result.packages.forEach((pkg, idx) => {
                    msg += `<strong>Paket ${idx + 1}:</strong> ${pkg.items.length} artiklar, ${pkg.weight} kg<br>`;
                });

                frappe.msgprint({
                    title: __('Packningsförslag'),
                    indicator: 'blue',
                    message: msg
                });
            }
        }
    });
};

wms.show_packing_suggestions = function(frm) {
    if (!frm.doc.items || frm.doc.items.length === 0) return;

    // Calculate total weight and volume
    let total_weight = 0;
    let total_volume = 0;
    let fragile_items = 0;

    frm.doc.items.forEach(item => {
        // These would come from Item master
        total_weight += (item.weight_per_unit || 0) * item.qty;
        total_volume += (item.volume_per_unit || 0) * item.qty;
        if (item.is_fragile) fragile_items++;
    });

    if (total_weight > 0 || fragile_items > 0) {
        let html = `
            <div style="padding: 10px; background: #eff6ff; border-left: 4px solid #3b82f6; margin: 10px 0;">
                <strong>Packningsinfo:</strong><br>
                Total vikt: ${total_weight.toFixed(2)} kg<br>
                ${fragile_items > 0 ? `<span style="color: #dc2626;">⚠️ ${fragile_items} ömtåliga artiklar</span>` : ''}
            </div>
        `;

        frm.dashboard.add_comment(html, true);
    }
};

wms.validate_packing = function(frm) {
    // Check if all items have packing information
    let unpacked_items = [];

    frm.doc.items.forEach(item => {
        if (!item.packed_qty || item.packed_qty < item.qty) {
            unpacked_items.push(item.item_code);
        }
    });

    if (unpacked_items.length > 0) {
        frappe.throw(__('Följande artiklar är inte packade: {0}', [unpacked_items.join(', ')]));
    }
};
