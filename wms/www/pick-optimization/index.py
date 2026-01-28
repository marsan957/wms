import frappe

def get_context(context):
	context.no_cache = 1

	# Get pick list name from URL
	pick_list = frappe.form_dict.get('name') or frappe.local.request.path.split('/')[-1]

	if pick_list:
		context.pick_list = pick_list

	return context
