from . import __version__ as app_version

app_name = "wms"
app_title = "WMS"
app_publisher = "Your Company"
app_description = "Warehouse Management System Optimization for ERPNext"
app_email = "your@email.com"
app_license = "MIT"

# Includes in <head>
# ------------------

# Include js, css files in header of desk.html
app_include_css = "/assets/wms/css/wms.css"
app_include_js = "/assets/wms/js/wms.js"

# Include js, css files in header of web template
# web_include_css = "/assets/wms/css/wms.css"
# web_include_js = "/assets/wms/js/wms.js"

# Include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "wms/public/scss/website"

# Include js in page
# page_js = {"page" : "public/js/file.js"}

# Include js in doctype views
doctype_js = {
    "Pick List": "public/js/pick_list.js",
    "Delivery Note": "public/js/delivery_note.js",
    "Stock Entry": "public/js/stock_entry.js"
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
    "Pick List": {
        "validate": "wms.events.pick_list.validate",
        "on_submit": "wms.events.pick_list.on_submit",
        "before_cancel": "wms.events.pick_list.before_cancel"
    },
    "Delivery Note": {
        "before_save": "wms.events.delivery_note.before_save",
        "on_submit": "wms.events.delivery_note.on_submit"
    },
    "Stock Entry": {
        "validate": "wms.events.stock_entry.validate"
    }
}

# Scheduled Tasks
# ---------------

scheduler_events = {
    # "all": [
    #     "wms.tasks.all"
    # ],
    # "daily": [
    #     "wms.tasks.daily"
    # ],
    # "hourly": [
    #     "wms.tasks.hourly"
    # ],
    # "weekly": [
    #     "wms.tasks.weekly"
    # ],
    # "monthly": [
    #     "wms.tasks.monthly"
    # ],
}

# Testing
# -------

# before_tests = "wms.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#     "frappe.desk.doctype.event.event.get_events": "wms.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
#     "Task": "wms.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["wms.utils.before_request"]
# after_request = ["wms.utils.after_request"]

# Job Events
# ----------
# before_job = ["wms.utils.before_job"]
# after_job = ["wms.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
#     {
#         "doctype": "{doctype_1}",
#         "filter_by": "{filter_by}",
#         "redact_fields": ["{field_1}", "{field_2}"],
#         "partial": 1,
#     },
#     {
#         "doctype": "{doctype_2}",
#         "filter_by": "{filter_by}",
#         "partial": 1,
#     },
#     {
#         "doctype": "{doctype_3}",
#         "strict": False,
#     },
#     {
#         "doctype": "{doctype_4}"
#     }
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
#     "wms.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
#     "Logging DocType Name": 30  # days to retain logs
# }
