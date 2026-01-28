frappe.pages['pick-optimization'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Optimerad Plockvy',
		single_column: true
	});

	// Get pick list from URL
	const route = frappe.get_route();
	const pick_list = route[1]; // pick-optimization/PICK-LIST-NAME

	if (!pick_list) {
		frappe.msgprint(__('No Pick List specified'));
		return;
	}

	page.pick_list = pick_list;
	page.completed_count = 0;
	page.pick_items = [];

	// Add title
	page.set_title('Pick List: ' + pick_list);

	// Load pick list data
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

	// Build HTML
	let html = `
		<style>
			.pick-container { padding: 20px; }
			.pick-progress { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
			.progress-bar { height: 40px; background: #e9ecef; border-radius: 20px; overflow: hidden; margin-top: 10px; }
			.progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.5s; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; }
			.pick-item { background: white; border: 3px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 15px; }
			.pick-item.completed { background: #f0fdf4; border-color: #4CAF50; }
			.item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
			.item-code { font-size: 20px; font-weight: 600; }
			.item-qty { font-size: 32px; font-weight: 700; color: #2196F3; }
			.item-location { background: #2196F3; color: white; padding: 6px 16px; border-radius: 16px; display: inline-block; font-weight: 600; margin-right: 10px; }
			.step-number { display: inline-block; width: 40px; height: 40px; background: #2196F3; color: white; border-radius: 50%; text-align: center; line-height: 40px; font-weight: 700; margin-right: 15px; }
			.btn-pick { width: 100%; padding: 16px; background: #4CAF50; color: white; border: none; border-radius: 6px; font-size: 18px; font-weight: 600; cursor: pointer; margin-top: 10px; }
			.btn-pick:hover { background: #45a049; }
			.btn-pick:disabled { background: #9e9e9e; cursor: not-allowed; }
			.completed-check { color: #4CAF50; font-size: 32px; margin-left: 10px; }
		</style>
		<div class="pick-container">
			<div class="pick-progress">
				<h4>Framsteg</h4>
				<div id="progress-text">0 av ${data.total_items} plockade</div>
				<div class="progress-bar">
					<div class="progress-fill" id="progress-fill" style="width: 0%">0%</div>
				</div>
			</div>
			<div id="pick-items">`;

	data.items.forEach((item, idx) => {
		html += `
			<div class="pick-item" id="item-${idx}">
				<div class="item-header">
					<div>
						<span class="step-number">${idx + 1}</span>
						<span class="item-code">${item.item_code}</span>
						<span class="completed-check" id="check-${idx}" style="display:none;">✓</span>
					</div>
					<div class="item-qty">${item.qty} ${item.uom}</div>
				</div>
				<div style="margin-left: 55px;">
					<span class="item-location">${item.warehouse}</span>
					<span style="color: #6c757d;">${item.location || ''}</span>
					<div style="margin-top: 10px; color: #6c757d;">${item.item_name}</div>
				</div>
				<button class="btn-pick" onclick="window.pick_item(${idx}, '${item.item_code}', ${item.qty})">
					Plocka
				</button>
			</div>`;
	});

	html += '</div></div>';

	$(page.body).html(html);

	// Add global pick function
	window.pick_item = function(idx, item_code, qty) {
		pick_item_handler(page, idx, item_code, qty);
	};
}

function pick_item_handler(page, idx, item_code, qty) {
	frappe.prompt([
		{
			fieldname: 'confirm',
			fieldtype: 'Check',
			label: 'Bekräfta att du har plockat ' + qty + ' st av ' + item_code,
			default: 1
		}
	], function(values) {
		if (values.confirm) {
			// Mark as completed
			$('#item-' + idx).addClass('completed');
			$('#check-' + idx).show();
			$('#item-' + idx + ' .btn-pick').prop('disabled', true).text('Plockad ✓');

			page.completed_count++;
			update_progress(page);

			// Success feedback
			frappe.show_alert({
				message: item_code + ' plockad!',
				indicator: 'green'
			}, 2);

			// Check if all done
			if (page.completed_count === page.pick_items.length) {
				setTimeout(function() {
					frappe.msgprint({
						title: __('Plockning Klar!'),
						indicator: 'green',
						message: __('Alla {0} artiklar har plockats. Bra jobbat!', [page.pick_items.length])
					});
				}, 500);
			}
		}
	}, 'Bekräfta Plockning');
}

function update_progress(page) {
	const total = page.pick_items.length;
	const percent = total > 0 ? Math.round((page.completed_count / total) * 100) : 0;

	$('#progress-text').text(page.completed_count + ' av ' + total + ' plockade');
	$('#progress-fill').css('width', percent + '%').text(percent + '%');
}
