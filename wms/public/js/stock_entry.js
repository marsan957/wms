// WMS - Stock Entry Customizations

frappe.ui.form.on('Stock Entry', {
    refresh: function(frm) {
        // Add batch scanning for material transfer
        if (frm.doc.stock_entry_type === 'Material Transfer' && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Batch Scanning'), function() {
                wms.open_batch_scanner(frm);
            }, __('WMS'));
        }

        // Add location verification
        if (frm.doc.items && frm.doc.items.length > 0) {
            frm.add_custom_button(__('Verifiera Platser'), function() {
                wms.verify_locations(frm);
            }, __('WMS'));
        }
    },

    before_submit: function(frm) {
        // Validate warehouse locations if WMS is enabled
        if (frm.doc.wms_verify_locations) {
            return wms.validate_stock_entry_locations(frm);
        }
    }
});

frappe.ui.form.on('Stock Entry Detail', {
    item_code: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // Auto-suggest warehouse location
        if (row.item_code && row.s_warehouse) {
            frappe.call({
                method: 'wms.api.get_item_location',
                args: {
                    item_code: row.item_code,
                    warehouse: row.s_warehouse
                },
                callback: function(r) {
                    if (r.message) {
                        frappe.model.set_value(cdt, cdn, 'wms_source_location', r.message);
                    }
                }
            });
        }
    }
});

// WMS Stock Entry Functions
wms.open_batch_scanner = function(frm) {
    let d = new frappe.ui.Dialog({
        title: __('Batch Scanning'),
        fields: [
            {
                fieldname: 'scan_input',
                fieldtype: 'Data',
                label: __('Scanna Artikel eller Plats'),
                reqd: 1
            },
            {
                fieldname: 'scanned_items',
                fieldtype: 'HTML'
            }
        ],
        primary_action_label: __('Slutför'),
        primary_action: function() {
            d.hide();
            frm.reload_doc();
        }
    });

    let scanned = [];
    let html_area = d.fields_dict.scanned_items.$wrapper;

    function update_display() {
        let html = '<div style="max-height: 300px; overflow-y: auto;">';
        scanned.forEach((item, idx) => {
            html += `
                <div style="padding: 8px; margin: 5px 0; background: #f0fdf4; border-left: 3px solid #22c55e;">
                    ${idx + 1}. ${item.item_code} - ${item.qty} ${item.uom}
                </div>
            `;
        });
        html += '</div>';
        html_area.html(html);
    }

    d.fields_dict.scan_input.$input.on('change', function() {
        let barcode = d.get_value('scan_input');

        if (barcode) {
            frappe.call({
                method: 'wms.api.process_barcode_scan',
                args: {
                    barcode: barcode,
                    stock_entry: frm.doc.name
                },
                callback: function(r) {
                    if (r.message) {
                        scanned.push(r.message);
                        update_display();
                        wms.utils.play_success_sound();
                        wms.utils.vibrate();

                        // Clear input for next scan
                        d.set_value('scan_input', '');
                        d.fields_dict.scan_input.$input.focus();
                    }
                }
            });
        }
    });

    d.show();
    d.fields_dict.scan_input.$input.focus();
};

wms.verify_locations = function(frm) {
    frappe.call({
        method: 'wms.api.verify_stock_entry_locations',
        args: {
            stock_entry: frm.doc.name
        },
        callback: function(r) {
            if (r.message) {
                let result = r.message;

                if (result.valid) {
                    frappe.msgprint({
                        title: __('Verifiering OK'),
                        indicator: 'green',
                        message: __('Alla platser är verifierade')
                    });
                } else {
                    frappe.msgprint({
                        title: __('Verifieringsfel'),
                        indicator: 'red',
                        message: __('Problem: {0}', [result.errors.join(', ')])
                    });
                }
            }
        }
    });
};

wms.validate_stock_entry_locations = function(frm) {
    return new Promise((resolve, reject) => {
        frappe.call({
            method: 'wms.api.verify_stock_entry_locations',
            args: {
                stock_entry: frm.doc.name
            },
            callback: function(r) {
                if (r.message && r.message.valid) {
                    resolve();
                } else {
                    frappe.throw(__('Location validation failed'));
                    reject();
                }
            }
        });
    });
};
