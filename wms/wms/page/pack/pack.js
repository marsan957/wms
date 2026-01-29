frappe.pages['pack'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Pack',
		single_column: true
	});

	page.wms = new WMSPack(page);
};

// Packing states
const PACK_STATE = {
	ITEM: 'item',
	PACKAGE: 'package',
	WEIGHT: 'weight',
	COMPLETE: 'complete'
};

class WMSPack {
	constructor(page) {
		this.page = page;
		this.delivery_note = frappe.get_route()[1];

		if (!this.delivery_note) {
			// No delivery note specified, show list
			this.setup_list_view();
		} else {
			// Specific delivery note, load for packing
			this.completed_count = 0;
			this.pack_items = [];
			this.current_item_idx = 0;
			this.packages = {};

			// Current scan state
			this.pack_state = PACK_STATE.ITEM;
			this.pack_data = {};
			this.packed_qty = 0;

			// Generate unique session ID for this tab
			this.session_id = this.generate_session_id();

			this.setup_page();
			this.try_lock_delivery_note();

			// Unlock on page unload
			$(window).on('beforeunload', () => {
				this.unlock_delivery_note();
			});

			// Unlock when navigating away
			frappe.router.on('change', () => {
				this.unlock_delivery_note();
			});
		}
	}

	generate_session_id() {
		// Generate unique session ID for this browser tab
		return `${frappe.session.user}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	setup_list_view() {
		// Show list of unpacked delivery notes
		this.page.set_title('Pack Orders');

		this.page.main.html(`
			<div class="wms-pack-list-container">
				<div class="wms-pack-list-header">
					<h3>Delivery Notes Ready for Packing</h3>
				</div>
				<div class="wms-pack-list" id="wms-pack-list">
					<div class="text-center text-muted" style="padding: 40px;">
						Loading...
					</div>
				</div>
			</div>
		`);

		this.load_delivery_notes_list();
	}

	load_delivery_notes_list() {
		frappe.call({
			method: 'wms.api.get_unpacked_delivery_notes',
			callback: (r) => {
				if (r.message && r.message.length > 0) {
					this.render_delivery_notes_list(r.message);
				} else {
					$('#wms-pack-list').html(`
						<div class="text-center text-muted" style="padding: 40px;">
							<p>No delivery notes ready for packing.</p>
						</div>
					`);
				}
			}
		});
	}

	render_delivery_notes_list(delivery_notes) {
		let html = '';
		delivery_notes.forEach(dn => {
			html += `
				<div class="wms-dn-card" onclick="frappe.set_route('pack', '${dn.name}')">
					<div class="wms-dn-card-header">
						<h4>${dn.name}</h4>
						<span class="badge badge-warning">Unpacked</span>
					</div>
					<div class="wms-dn-card-body">
						<div class="wms-dn-info">
							<span class="text-muted">Customer:</span>
							<strong>${dn.customer}</strong>
						</div>
						<div class="wms-dn-info">
							<span class="text-muted">Items:</span>
							<strong>${dn.total_items} items (${dn.total_qty} qty)</strong>
						</div>
						${dn.pick_list ? `
							<div class="wms-dn-info">
								<span class="text-muted">Pick List:</span>
								<strong>${dn.pick_list}</strong>
							</div>
						` : ''}
					</div>
				</div>
			`;
		});

		$('#wms-pack-list').html(html);
	}

	setup_page() {
		this.page.set_title(`Pack: ${this.delivery_note}`);

		// Mobile tabs wrapper
		const mobile_tabs_html = `
			<div class="wms-mobile-tabs-wrapper">
				<div class="wms-tabs">
					<button class="wms-tab-button active" data-tab="items">
						<span class="octicon octicon-checklist"></span>
						<span>Items</span>
					</button>
					<button class="wms-tab-button" data-tab="detail">
						<span class="octicon octicon-package"></span>
						<span>Pack</span>
					</button>
				</div>
			</div>
		`;

		// Main content structure
		const content_html = `
			<div class="wms-pack-container">
				${mobile_tabs_html}
				<div class="wms-progress-header" id="wms-progress"></div>
				<div class="wms-content-wrapper">
					<div class="wms-items-list-wrapper" id="wms-items-wrapper">
						<div class="wms-items-list" id="wms-items-list"></div>
					</div>
					<div class="wms-detail-panel" id="wms-detail-panel"></div>
				</div>
			</div>
		`;

		this.page.main.html(content_html);

		// Cache DOM elements
		this.$progress = this.page.main.find('#wms-progress');
		this.$items_list = this.page.main.find('#wms-items-list');
		this.$detail = this.page.main.find('#wms-detail-panel');

		// Mobile tab switching
		this.page.main.find('.wms-tab-button').on('click', (e) => {
			const tab = $(e.currentTarget).data('tab');
			this.switch_tab(tab);
		});
	}

	switch_tab(tab) {
		// Update active tab button
		this.page.main.find('.wms-tab-button').removeClass('active');
		this.page.main.find(`.wms-tab-button[data-tab="${tab}"]`).addClass('active');

		// Show/hide panels
		if (tab === 'items') {
			this.page.main.find('#wms-items-wrapper').show();
			this.page.main.find('#wms-detail-panel').hide();
		} else {
			this.page.main.find('#wms-items-wrapper').hide();
			this.page.main.find('#wms-detail-panel').show();
		}
	}

	try_lock_delivery_note() {
		frappe.call({
			method: 'wms.api.lock_delivery_note',
			args: {
				delivery_note: this.delivery_note,
				session_id: this.session_id
			},
			callback: (r) => {
				if (r.message && !r.message.success) {
					// Locked by someone else
					const msg = r.message;

					frappe.msgprint({
						title: 'Delivery Note Locked',
						indicator: 'orange',
						message: msg.message
					});

					this.show_locked_message(msg.locked_by, msg.is_same_user);
				} else {
					// Successfully locked, load data
					this.load_data();
				}
			}
		});
	}

	unlock_delivery_note() {
		// Silent unlock
		if (!this.delivery_note) return;

		frappe.call({
			method: 'wms.api.unlock_delivery_note',
			args: {
				delivery_note: this.delivery_note
			},
			freeze: false,
			async: false
		});
	}

	show_locked_message(locked_by, is_same_user) {
		let message = is_same_user ?
			'This delivery note is already being packed in another tab.' :
			`This delivery note is currently being packed by ${locked_by}.`;

		this.$detail.html(`
			<div class="wms-locked-message">
				<div class="wms-locked-icon">
					<span class="octicon octicon-lock"></span>
				</div>
				<h3>Delivery Note Locked</h3>
				<p>${message}</p>
				<button class="wms-confirm-btn" onclick="frappe.set_route('pack')">
					Back to Pack List
				</button>
			</div>
		`);
	}

	load_data() {
		frappe.call({
			method: 'wms.api.get_delivery_note_details',
			args: {
				delivery_note: this.delivery_note
			},
			callback: (r) => {
				if (r.message) {
					this.process_delivery_note_data(r.message);
					this.render();
				}
			}
		});
	}

	process_delivery_note_data(data) {
		this.delivery_note_doc = data;
		this.pack_items = data.items || [];
		this.total_items = this.pack_items.length;

		// Count already packed items
		this.completed_count = 0;
		this.pack_items.forEach(item => {
			if (item.wms_packed_qty && item.wms_packed_qty >= item.qty) {
				item.packed = true;
				this.completed_count++;
			} else {
				item.packed = false;
			}

			// Initialize package from box assignment
			if (item.wms_box && !item.wms_package_no) {
				item.wms_package_no = item.wms_box;
			}

			// Track packages
			const pkg = item.wms_package_no || item.wms_box || 'PKG-001';
			if (!this.packages[pkg]) {
				this.packages[pkg] = {
					package_no: pkg,
					items: [],
					weight: 0,
					items_count: 0
				};
			}
			this.packages[pkg].items.push(item);
			this.packages[pkg].items_count++;
		});
	}

	render() {
		this.render_progress();
		this.render_items_list();

		if (this.pack_items.length > 0) {
			// Find first non-packed item
			let first_unpacked = this.pack_items.findIndex(item => !item.packed);

			if (first_unpacked === -1) {
				// All items are already packed
				this.show_completion();
			} else {
				this.show_item_detail(first_unpacked);
			}
		}
	}

	render_progress() {
		const percent = this.total_items > 0 ?
			Math.round((this.completed_count / this.total_items) * 100) : 0;

		this.$progress.html(`
			<div class="wms-progress-bar-wrapper">
				<div class="wms-progress-text">
					Packed: ${this.completed_count} / ${this.total_items}
				</div>
				<div class="wms-progress-bar">
					<div class="wms-progress-fill" style="width: ${percent}%"></div>
				</div>
			</div>
		`);
	}

	render_items_list() {
		let html = '';

		this.pack_items.forEach((item, idx) => {
			const is_active = idx === this.current_item_idx;
			const is_packed = item.packed;
			const status_class = is_packed ? 'packed' : (is_active ? 'active' : '');

			html += `
				<div class="wms-item-card ${status_class}" onclick="wms_pack_instance.select_item(${idx})">
					<div class="wms-item-status">
						${is_packed ? '<span class="octicon octicon-check"></span>' : `<span class="wms-item-number">${idx + 1}</span>`}
					</div>
					<div class="wms-item-info">
						<div class="wms-item-code">${item.item_code}</div>
						<div class="wms-item-name">${item.item_name || item.item_code}</div>
						<div class="wms-item-details">
							<span>Qty: ${item.qty} ${item.stock_uom}</span>
							${item.wms_box ? `<span>Box: ${item.wms_box}</span>` : ''}
						</div>
					</div>
					${is_active ? '<div class="wms-item-indicator"></div>' : ''}
				</div>
			`;
		});

		this.$items_list.html(html);

		// Store global reference for onclick handlers
		window.wms_pack_instance = this;
	}

	select_item(idx) {
		this.show_item_detail(idx);
		// Auto-switch to detail tab on mobile
		this.switch_tab('detail');
	}

	show_item_detail(idx) {
		this.current_item_idx = idx;
		const item = this.pack_items[idx];

		// If item is already fully packed, move to next
		if (item.wms_packed_qty >= item.qty) {
			let next_idx = this.pack_items.findIndex((itm, i) => i > idx && !itm.packed);
			if (next_idx !== -1) {
				this.show_item_detail(next_idx);
				return;
			} else {
				this.show_completion();
				return;
			}
		}

		// Start from already packed quantity
		this.packed_qty = item.wms_packed_qty || 0;
		const current_package = item.wms_package_no || item.wms_box || 'PKG-001';

		this.$detail.html(`
			<div class="wms-item-detail">
				<div class="wms-item-detail-header">
					<h3>Pack Item ${idx + 1} of ${this.total_items}</h3>
				</div>

				<div class="wms-item-detail-body">
					${item.image ? `<img src="${item.image}" class="wms-item-image" alt="${item.item_name}">` : ''}

					<div class="wms-item-detail-code">${item.item_code}</div>
					<div class="wms-item-detail-name">${item.item_name || item.item_code}</div>

					<div class="wms-pack-info-cards">
						<div class="wms-pack-info-card">
							<div class="wms-pack-info-label">Required Qty</div>
							<div class="wms-pack-info-value">${item.qty} ${item.stock_uom}</div>
						</div>
						<div class="wms-pack-info-card">
							<div class="wms-pack-info-label">Already Packed</div>
							<div class="wms-pack-info-value">${this.packed_qty}</div>
						</div>
						<div class="wms-pack-info-card">
							<div class="wms-pack-info-label">Package</div>
							<div class="wms-pack-info-value">${current_package}</div>
						</div>
					</div>

					<div class="wms-quantity-section">
						<div class="wms-quantity-label">Pack Quantity</div>
						<div class="wms-quantity-controls">
							<button class="wms-qty-btn" onclick="wms_pack_instance.adjust_qty(-1)">
								<span class="octicon octicon-dash"></span>
							</button>
							<input type="number" id="pack-qty-input" class="wms-qty-input"
								value="${item.qty}" min="0" max="${item.qty}" step="1">
							<button class="wms-qty-btn" onclick="wms_pack_instance.adjust_qty(1)">
								<span class="octicon octicon-plus"></span>
							</button>
						</div>
						<div class="wms-quantity-progress">
							<div class="wms-quantity-bar">
								<div class="wms-quantity-fill" style="width: ${(item.qty / item.qty) * 100}%"></div>
							</div>
						</div>
					</div>

					<button class="wms-confirm-btn" id="confirm-pack-btn" onclick="wms_pack_instance.confirm_pack()">
						<span class="octicon octicon-check"></span>
						Confirm Pack
					</button>
				</div>
			</div>
		`);

		// Auto-focus on quantity input
		$('#pack-qty-input').focus().select();
	}

	adjust_qty(delta) {
		const $input = $('#pack-qty-input');
		const current = parseFloat($input.val()) || 0;
		const item = this.pack_items[this.current_item_idx];
		const new_val = Math.max(0, Math.min(item.qty, current + delta));
		$input.val(new_val);
	}

	confirm_pack() {
		const item = this.pack_items[this.current_item_idx];
		const pack_qty = parseFloat($('#pack-qty-input').val()) || 0;

		if (pack_qty <= 0) {
			frappe.show_alert({
				message: 'Please enter a valid quantity',
				indicator: 'orange'
			}, 3);
			return;
		}

		// Update packing progress
		frappe.call({
			method: 'wms.api.update_packing_progress',
			args: {
				delivery_note: this.delivery_note,
				item_idx: item.idx,
				packed_qty: pack_qty,
				package_no: item.wms_package_no || item.wms_box || 'PKG-001'
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Mark item as packed
					item.packed = true;
					item.wms_packed_qty = pack_qty;
					this.completed_count++;

					// Show success
					frappe.show_alert({
						message: `Item ${item.item_code} packed!`,
						indicator: 'green'
					}, 2);

					// Update progress
					this.render_progress();
					this.render_items_list();

					// Move to next or show completion
					if (this.current_item_idx < this.pack_items.length - 1) {
						setTimeout(() => {
							this.show_item_detail(this.current_item_idx + 1);
						}, 300);
					} else {
						this.show_completion();
					}
				} else {
					frappe.show_alert({
						message: 'Failed to update packing progress',
						indicator: 'red'
					}, 3);
				}
			},
			error: (err) => {
				frappe.show_alert({
					message: 'Error updating packing progress',
					indicator: 'red'
				}, 3);
				console.error('Packing update error:', err);
			}
		});
	}

	show_completion() {
		this.$detail.html(`
			<div class="wms-completion">
				<div class="wms-completion-icon">
					<span class="octicon octicon-check"></span>
				</div>
				<h2>Packing Complete!</h2>
				<p>All ${this.total_items} items have been packed.</p>
				<button class="wms-confirm-btn" onclick="wms_pack_instance.show_shipment_dialog()">
					<span class="octicon octicon-rocket"></span>
					Create Shipment
				</button>
				<button class="wms-confirm-btn" style="margin-top: 12px; background: var(--gray-500);"
					onclick="frappe.set_route('Form', 'Delivery Note', '${this.delivery_note}')">
					View Delivery Note
				</button>
			</div>
		`);

		this.unlock_delivery_note();
	}

	show_shipment_dialog() {
		const d = new frappe.ui.Dialog({
			title: 'Create Shipment',
			fields: [
				{
					fieldtype: 'Data',
					fieldname: 'carrier',
					label: 'Carrier',
					reqd: 0
				},
				{
					fieldtype: 'Data',
					fieldname: 'tracking_number',
					label: 'Tracking Number',
					reqd: 0
				},
				{
					fieldtype: 'Date',
					fieldname: 'shipment_date',
					label: 'Shipment Date',
					default: frappe.datetime.get_today(),
					reqd: 1
				},
				{
					fieldtype: 'Small Text',
					fieldname: 'notes',
					label: 'Notes'
				}
			],
			primary_action_label: 'Create Shipment',
			primary_action: (values) => {
				this.create_shipment(values);
				d.hide();
			}
		});

		d.show();
	}

	create_shipment(values) {
		frappe.call({
			method: 'wms.api.create_shipment',
			args: {
				delivery_note: this.delivery_note,
				packages: Object.values(this.packages),
				carrier: values.carrier,
				tracking_no: values.tracking_number,
				shipment_date: values.shipment_date,
				notes: values.notes
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					frappe.show_alert({
						message: `Shipment ${r.message.shipment} created successfully!`,
						indicator: 'green'
					}, 5);

					// Navigate to shipment
					setTimeout(() => {
						frappe.set_route('Form', 'WMS Shipment', r.message.shipment);
					}, 1000);
				} else {
					frappe.msgprint({
						title: 'Error',
						indicator: 'red',
						message: r.message.message || 'Failed to create shipment'
					});
				}
			},
			error: (err) => {
				frappe.msgprint({
					title: 'Error',
					indicator: 'red',
					message: 'Failed to create shipment'
				});
				console.error('Shipment creation error:', err);
			}
		});
	}
}
