// Custom List View for Pick List

frappe.listview_settings['Pick List'] = {
    onload: function(listview) {
        // Add custom button to open pick view
        listview.page.add_inner_button(__('Start Picking'), function() {
            let selected = listview.get_checked_items();
            if (selected.length === 0) {
                frappe.msgprint(__('Please select a Pick List'));
                return;
            }
            if (selected.length > 1) {
                frappe.msgprint(__('Please select only one Pick List'));
                return;
            }

            frappe.set_route('pick', selected[0].name);
        });
    },

    get_indicator: function(doc) {
        const status_colors = {
            'Draft': 'red',
            'Open': 'orange',
            'Completed': 'green',
            'Cancelled': 'red'
        };

        return [__(doc.status), status_colors[doc.status] || 'gray', 'status,=,' + doc.status];
    },

    formatters: {
        name: function(value, field, doc) {
            let html = value;

            // Add lock indicator if currently being picked
            if (doc.wms_locked_by) {
                const lock_icon = '<span class="octicon octicon-lock" style="color: var(--orange-500); margin-left: 6px;" title="Currently being picked by ' + doc.wms_locked_by + '"></span>';
                html += lock_icon;
            }

            return html;
        }
    },

    // Add custom fields to list view
    add_fields: ['status', 'wms_locked_by', 'wms_locked_at'],

    // Hide locked pick lists from other users
    hide_name_column: false
};
