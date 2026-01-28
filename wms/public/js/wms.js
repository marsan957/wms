// WMS - Warehouse Management System
// Main JavaScript file

frappe.provide('wms');

// Global WMS configuration
wms.config = {
    enable_sound: true,
    enable_vibration: true,
    auto_print_labels: false
};

// Utility functions
wms.utils = {
    // Play success sound
    play_success_sound: function() {
        if (wms.config.enable_sound) {
            let audio = new Audio('/assets/wms/sounds/beep-success.mp3');
            audio.play().catch(e => console.log('Sound play failed:', e));
        }
    },

    // Play error sound
    play_error_sound: function() {
        if (wms.config.enable_sound) {
            let audio = new Audio('/assets/wms/sounds/beep-error.mp3');
            audio.play().catch(e => console.log('Sound play failed:', e));
        }
    },

    // Vibrate device (for mobile)
    vibrate: function(pattern = [200]) {
        if (wms.config.enable_vibration && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    },

    // Show scanner dialog
    show_scanner_dialog: function(callback) {
        let d = new frappe.ui.Dialog({
            title: __('Scan Barcode'),
            fields: [
                {
                    fieldname: 'barcode',
                    fieldtype: 'Data',
                    label: __('Barcode'),
                    reqd: 1
                }
            ],
            primary_action_label: __('Submit'),
            primary_action: function(values) {
                d.hide();
                if (callback) {
                    callback(values.barcode);
                }
            }
        });

        d.show();

        // Auto-focus on barcode field
        setTimeout(() => {
            d.fields_dict.barcode.$input.focus();
        }, 500);

        // Listen for scanner input (typically ends with Enter)
        d.fields_dict.barcode.$input.on('keypress', function(e) {
            if (e.which === 13) { // Enter key
                e.preventDefault();
                d.get_primary_btn().click();
            }
        });

        return d;
    },

    // Format location for display
    format_location: function(warehouse, location) {
        if (location) {
            return `${warehouse} - ${location}`;
        }
        return warehouse;
    }
};

// Initialize when page loads
frappe.ready(function() {
    console.log('WMS Module Loaded');
});
