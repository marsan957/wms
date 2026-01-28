from frappe import _

def get_data():
    return [
        {
            "module_name": "WMS",
            "color": "#FF5733",
            "icon": "octicon octicon-package",
            "type": "module",
            "label": _("WMS"),
            "description": _("Warehouse Management System - Optimerad plock och pack")
        }
    ]
