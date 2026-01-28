frappe.pages['pick-optimization'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Pick Optimization',
		single_column: true
	});

	const route = frappe.get_route();
	const pick_list = route[1];

	if (!pick_list) {
		frappe.msgprint(__('No Pick List specified'));
		return;
	}

	page.pick_list = pick_list;
	page.completed_count = 0;
	page.pick_items = [];
	page.current_item_idx = 0;

	page.set_title(__('Pick Order: {0}', [pick_list]));

	// Add action buttons
	page.add_inner_button(__('Previous'), function() {
		if (page.current_item_idx > 0) {
			show_item_detail(page, page.current_item_idx - 1);
		}
	});

	page.add_inner_button(__('Next'), function() {
		if (page.current_item_idx < page.pick_items.length - 1) {
			show_item_detail(page, page.current_item_idx + 1);
		}
	});

	load_pick_list(page);
};

function load_pick_list(page) {
	frappe.call({
		method: 'wms.api.get_pick_list_details',
		args: { pick_list: page.pick_list },
		callback: function(r) {
			if (r.message) {
				render_pick_ui(page, r.message);
			}
		}
	});
}

function render_pick_ui(page, data) {
	page.pick_items = data.items;

	let html = `
		<div class="row">
			<div class="col-md-4">
				<div class="frappe-card" style="margin-bottom: 15px;">
					<div class="frappe-card-head">
						<strong>${__('Progress')}</strong>
					</div>
					<div class="frappe-card-body">
						<div class="progress" style="height: 30px;">
							<div class="progress-bar progress-bar-success" role="progressbar"
							     id="wms-progress-bar" style="width: 0%; font-weight: 600; line-height: 30px;">
								0 / ${data.total_items}
							</div>
						</div>
					</div>
				</div>

				<div class="frappe-card">
					<div class="frappe-card-head">
						<strong>${__('Items to Pick')}</strong>
					</div>
					<div class="frappe-card-body" style="max-height: 600px; overflow-y: auto; padding: 0;">
						<div id="wms-item-list"></div>
					</div>
				</div>
			</div>

			<div class="col-md-8">
				<div class="frappe-card">
					<div class="frappe-card-body" id="wms-detail-area">
						<div class="text-center text-muted" style="padding: 60px 20px;">
							<p>${__('Select an item from the list to start picking')}</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	`;

	$(page.body).html(html);
	render_item_list(page);

	if (page.pick_items.length > 0) {
		show_item_detail(page, 0);
	}
}

function render_item_list(page) {
	let html = '<div class="list-group">';

	page.pick_items.forEach((item, idx) => {
		const is_active = idx === page.current_item_idx;
		const is_completed = item.picked || false;

		let badge_class = 'badge-primary';
		let status_icon = '';

		if (is_completed) {
			badge_class = 'badge-success';
			status_icon = '<i class="fa fa-check"></i> ';
		}

		html += `
			<a href="#" class="list-group-item ${is_active ? 'active' : ''} ${is_completed ? 'list-group-item-success' : ''}"
			   onclick="window.wms_select_item(${idx}); return false;">
				<div class="row">
					<div class="col-xs-8">
						<div style="font-weight: 600;">${status_icon}${item.item_name}</div>
						<small class="text-muted">${item.item_code}</small>
						<div><small class="text-muted">📍 ${item.warehouse}</small></div>
					</div>
					<div class="col-xs-4 text-right">
						<span class="badge ${badge_class}" style="font-size: 14px;">
							${item.qty} ${item.uom}
						</span>
						${item.picked_qty ? `<br><small>${__('Picked')}: ${item.picked_qty}</small>` : ''}
					</div>
				</div>
			</a>
		`;
	});

	html += '</div>';
	$('#wms-item-list').html(html);

	window.wms_select_item = function(idx) {
		show_item_detail(page, idx);
	};
}

function show_item_detail(page, idx) {
	page.current_item_idx = idx;
	const item = page.pick_items[idx];

	let html = `
		<div class="row">
			<div class="col-md-6">
				<div class="well" style="background: #f8f9fa; min-height: 300px; display: flex; align-items: center; justify-content: center;">
					${item.image ?
						`<img src="${item.image}" alt="${item.item_code}" style="max-width: 100%; max-height: 300px;">` :
						`<div class="text-center text-muted">
							<i class="fa fa-cube" style="font-size: 80px;"></i>
							<p>${__('No product image')}</p>
						</div>`
					}
				</div>
			</div>

			<div class="col-md-6">
				<h3>${item.item_name}</h3>
				<p class="text-muted">${item.item_code}</p>

				<div class="alert alert-info">
					<strong>📍 ${__('Location')}: </strong>${item.warehouse}${item.location ? ' - ' + item.location : ''}
				</div>

				<div class="form-group" id="wms-location-group">
					<!-- Location input will be inserted here -->
				</div>

				<div class="form-group" id="wms-item-group">
					<!-- Item scan input will be inserted here -->
				</div>

				<div class="form-group" id="wms-qty-group">
					<!-- Quantity input will be inserted here -->
				</div>

				<button class="btn btn-primary btn-lg btn-block" id="wms-confirm-btn" disabled>
					<i class="fa fa-check"></i> ${__('Confirm Pick')}
				</button>
			</div>
		</div>
	`;

	$('#wms-detail-area').html(html);

	// Create Frappe controls
	const location_field = frappe.ui.form.make_control({
		parent: $('#wms-location-group'),
		df: {
			fieldtype: 'Data',
			label: __('Scan or Enter Location'),
			placeholder: __('Scan barcode or type location...'),
			default: item.warehouse,
			onchange: function() {
				check_can_confirm(page, item);
			}
		},
		render_input: true
	});

	const item_field = frappe.ui.form.make_control({
		parent: $('#wms-item-group'),
		df: {
			fieldtype: 'Data',
			label: __('Scan or Enter Item Code'),
			placeholder: __('Scan barcode or type item code...'),
			onchange: function() {
				verify_item(page, item, this.get_value());
			}
		},
		render_input: true
	});

	const qty_field = frappe.ui.form.make_control({
		parent: $('#wms-qty-group'),
		df: {
			fieldtype: 'Int',
			label: __('Quantity to Pick (Required: {0})', [item.qty]),
			default: 0,
			onchange: function() {
				check_can_confirm(page, item);
			}
		},
		render_input: true
	});

	// Store field references
	page.location_field = location_field;
	page.item_field = item_field;
	page.qty_field = qty_field;

	// Auto-focus on item field
	setTimeout(() => item_field.$input.focus(), 100);

	// Handle confirm button
	$('#wms-confirm-btn').on('click', function() {
		confirm_pick(page, idx);
	});

	render_item_list(page);
}

function verify_item(page, expected_item, scanned_value) {
	const item_code = expected_item.item_code;
	const barcode = expected_item.barcode;

	if (scanned_value === item_code || scanned_value === barcode) {
		frappe.show_alert({
			message: __('Item verified!'),
			indicator: 'green'
		}, 2);
		page.item_field.$wrapper.find('.control-label').html(`
			<i class="fa fa-check text-success"></i> ${__('Scan or Enter Item Code')}
		`);
		page.item_verified = true;
	} else if (scanned_value) {
		frappe.show_alert({
			message: __('Wrong item!'),
			indicator: 'red'
		}, 3);
		page.item_field.$wrapper.find('.control-label').html(`
			<i class="fa fa-times text-danger"></i> ${__('Scan or Enter Item Code')}
		`);
		page.item_verified = false;
	}

	check_can_confirm(page, expected_item);
}

function check_can_confirm(page, item) {
	const location = page.location_field.get_value();
	const scanned_item = page.item_field.get_value();
	const qty = page.qty_field.get_value();

	const can_confirm = location &&
	                   (scanned_item === item.item_code || scanned_item === item.barcode) &&
	                   qty > 0 &&
	                   qty <= item.qty;

	$('#wms-confirm-btn').prop('disabled', !can_confirm);
}

function confirm_pick(page, idx) {
	const qty = page.qty_field.get_value();
	const item = page.pick_items[idx];

	if (!qty || qty <= 0) {
		frappe.msgprint(__('Please enter quantity to pick'));
		return;
	}

	if (qty > item.qty) {
		frappe.msgprint(__('Quantity cannot exceed {0}', [item.qty]));
		return;
	}

	// Mark as picked
	page.pick_items[idx].picked = true;
	page.pick_items[idx].picked_qty = qty;
	page.completed_count++;

	// Update progress bar
	const total = page.pick_items.length;
	const percent = Math.round((page.completed_count / total) * 100);
	$('#wms-progress-bar')
		.css('width', percent + '%')
		.text(page.completed_count + ' / ' + total);

	// Show success
	frappe.show_alert({
		message: __('Item {0} picked!', [item.item_code]),
		indicator: 'green'
	}, 3);

	// Move to next item
	if (page.current_item_idx < page.pick_items.length - 1) {
		setTimeout(() => {
			show_item_detail(page, page.current_item_idx + 1);
		}, 500);
	} else {
		// All done
		$('#wms-detail-area').html(`
			<div class="text-center" style="padding: 60px 20px;">
				<i class="fa fa-check-circle text-success" style="font-size: 80px;"></i>
				<h2>${__('Picking Complete!')}</h2>
				<p class="text-muted">${__('All {0} items have been picked.', [total])}</p>
			</div>
		`);

		frappe.msgprint({
			title: __('Success!'),
			indicator: 'green',
			message: __('All items have been picked successfully!')
		});
	}
}
