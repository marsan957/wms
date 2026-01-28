frappe.pages['pick-optimization'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Pick Optimization',
		single_column: true
	});

	page.wms = new WMSPickOptimization(page);
};

// Scanning states
const SCAN_STATE = {
	LOCATION: 'location',
	BATCH: 'batch',
	ITEM: 'item',
	BOX: 'box',
	QUANTITY: 'quantity',
	COMPLETE: 'complete'
};

class WMSPickOptimization {
	constructor(page) {
		this.page = page;
		this.pick_list = frappe.get_route()[1];

		if (!this.pick_list) {
			frappe.msgprint('No Pick List specified');
			return;
		}

		this.completed_count = 0;
		this.pick_items = [];
		this.current_item_idx = 0;

		// Current scan state
		this.scan_state = SCAN_STATE.LOCATION;
		this.scan_data = {};
		this.scanned_qty = 0;

		// Scan order configuration (default)
		this.scan_order = ['location', 'batch', 'item', 'box'];

		this.setup_page();
		this.load_settings();
		this.load_data();
	}

	load_settings() {
		frappe.call({
			method: 'frappe.client.get_single',
			args: { doctype: 'WMS Settings' },
			callback: (r) => {
				if (r.message && r.message.scan_steps && r.message.scan_steps.length > 0) {
					// Use custom scan order from settings
					this.scan_order = r.message.scan_steps
						.sort((a, b) => a.sequence - b.sequence)
						.map(step => step.step_type.toLowerCase());
				}
			}
		});
	}

	setup_page() {
		// Setup responsive layout with custom tabs
		this.page.main.html(`
			<div class="wms-pick-container">
				<!-- Mobile Tab Navigation -->
				<div class="wms-mobile-tabs-wrapper">
					<div class="wms-tabs">
						<button class="wms-tab-button" data-tab="items">
							<span class="octicon octicon-checklist"></span>
							Items
						</button>
						<button class="wms-tab-button active" data-tab="detail">
							<span class="octicon octicon-package"></span>
							Detail
						</button>
					</div>
				</div>

				<div class="wms-content-wrapper">
					<!-- Left: Items List -->
					<div class="wms-items-panel wms-tab-content" data-tab="items">
						<div class="wms-progress-header"></div>
						<div class="wms-items-list"></div>
					</div>

					<!-- Right: Item Detail & Scanning -->
					<div class="wms-detail-panel wms-tab-content active" data-tab="detail">
						<div class="wms-item-detail"></div>
					</div>
				</div>
			</div>
		`);

		this.$progress = this.page.main.find('.wms-progress-header');
		this.$items_list = this.page.main.find('.wms-items-list');
		this.$detail = this.page.main.find('.wms-item-detail');

		// Setup tab button handlers
		this.page.main.find('.wms-tab-button').on('click', (e) => {
			const tab = $(e.currentTarget).data('tab');
			this.switch_tab(tab);
		});

		// Make instance accessible globally
		window.wms = this;
	}

	switch_tab(tab) {
		// Update button states
		this.page.main.find('.wms-tab-button').removeClass('active');
		this.page.main.find(`.wms-tab-button[data-tab="${tab}"]`).addClass('active');

		// Update content visibility
		this.page.main.find('.wms-tab-content').removeClass('active');
		this.page.main.find(`.wms-tab-content[data-tab="${tab}"]`).addClass('active');
	}

	load_data() {
		frappe.call({
			method: 'wms.api.get_pick_list_details',
			args: { pick_list: this.pick_list },
			callback: (r) => {
				if (r.message) {
					this.pick_items = r.message.items;
					this.total_items = r.message.total_items;
					this.render();
				}
			}
		});
	}

	render() {
		this.render_progress();
		this.render_items_list();
		if (this.pick_items.length > 0) {
			this.show_item_detail(0);
		}
	}

	render_progress() {
		const percent = this.total_items > 0 ?
			Math.round((this.completed_count / this.total_items) * 100) : 0;

		this.$progress.html(`
			<div class="wms-progress-bar-wrapper">
				<div class="wms-progress-text">
					Picked: ${this.completed_count} / ${this.total_items}
				</div>
				<div class="wms-progress-bar">
					<div class="wms-progress-fill" style="width: ${percent}%"></div>
				</div>
			</div>
		`);
	}

	render_items_list() {
		let html = '';

		this.pick_items.forEach((item, idx) => {
			const is_active = idx === this.current_item_idx;
			const is_completed = item.picked || false;
			const picked_qty = item.picked_qty || 0;

			html += `
				<div class="wms-item-card ${is_active ? 'active' : ''} ${is_completed ? 'completed' : ''}"
				     data-idx="${idx}"
				     onclick="wms.select_item(${idx})">
					${item.image ?
						`<img src="${item.image}" class="wms-item-image" alt="${item.item_code}">` :
						`<div class="wms-item-image wms-no-image">
							<span class="octicon octicon-package"></span>
						</div>`
					}
					<div class="wms-item-info">
						<div class="wms-item-name">${item.item_name}</div>
						<div class="wms-item-code">${item.item_code}</div>
						<div class="wms-item-meta">
							<span class="octicon octicon-location"></span>
							${item.warehouse}
						</div>
					</div>
					<div class="wms-item-qty">
						<div class="wms-qty-label">Pick</div>
						<div class="wms-qty-value">${picked_qty} / ${item.qty}</div>
					</div>
					${is_completed ? '<div class="wms-item-check"><span class="octicon octicon-check"></span></div>' : ''}
				</div>
			`;
		});

		this.$items_list.html(html);
	}

	select_item(idx) {
		this.show_item_detail(idx);
		// Auto-switch to detail tab on mobile
		this.switch_tab('detail');
	}

	show_item_detail(idx) {
		this.current_item_idx = idx;
		const item = this.pick_items[idx];

		// Reset scan state to first step in scan order
		this.scan_state = this.scan_order[0];
		this.scan_data = {
			location_verified: false,
			batch_verified: false,
			item_verified: false,
			box_verified: false
		};
		this.scanned_qty = item.picked_qty || 0;
		this.current_box = '#1';

		this.$detail.html(`
			<div class="wms-detail-container">
				<!-- Large Product Image -->
				<div class="wms-product-image">
					${item.image ?
						`<img src="${item.image}" alt="${item.item_code}">` :
						`<div class="wms-no-product-image">
							<span class="octicon octicon-package"></span>
						</div>`
					}
				</div>

				<!-- Pick Info Card -->
				<div class="wms-info-card">
					<div class="wms-info-row">
						<span class="octicon octicon-package"></span>
						<span>Pick SKU: <strong>${item.item_code}</strong></span>
					</div>
					<div class="wms-info-row">
						<span class="octicon octicon-inbox"></span>
						<span>Add to box: <strong id="current-box">${this.current_box}</strong></span>
					</div>
				</div>

				<!-- Item Name & Code -->
				<div class="wms-item-header">
					<h3>${item.item_name}</h3>
					<div class="wms-item-sku">${item.item_code}</div>
				</div>

				<!-- Scanning Section -->
				<div class="wms-scan-section">
					<div class="wms-scan-indicator">
						${this.render_scan_steps(item)}
					</div>

					<!-- Universal Scan Input -->
					<div class="wms-scan-input-wrapper">
						<input type="text"
						       class="wms-scan-input"
						       id="universal-scan-input"
						       placeholder="${this.get_scan_placeholder()}"
						       autocomplete="off">
						<div class="wms-scan-hint">${this.get_scan_hint()}</div>
					</div>
				</div>

				<!-- Quantity Control -->
				<div class="wms-quantity-section">
					<div class="wms-qty-control">
						<button class="wms-qty-btn wms-qty-minus" ${this.scanned_qty <= 0 ? 'disabled' : ''}>
							<span class="octicon octicon-dash"></span>
						</button>
						<div class="wms-qty-display">
							<span class="wms-qty-current">${this.scanned_qty}</span>
							<span class="wms-qty-separator">/</span>
							<span class="wms-qty-target">${item.qty}</span>
						</div>
						<button class="wms-qty-btn wms-qty-plus" ${this.scanned_qty >= item.qty ? 'disabled' : ''}>
							<span class="octicon octicon-plus"></span>
						</button>
					</div>
					<div class="wms-progress-bar-mini">
						<div class="wms-progress-fill" style="width: ${(this.scanned_qty / item.qty) * 100}%"></div>
					</div>
				</div>

				<!-- Confirm Button -->
				<button class="wms-confirm-btn" ${this.can_confirm() ? '' : 'disabled'}>
					Confirm Pick
				</button>
			</div>
		`);

		// Setup event handlers
		this.setup_scan_input();
		this.setup_quantity_controls();
		this.render_items_list();
	}

	render_scan_steps(item) {
		let steps_html = '';

		this.scan_order.forEach(step_type => {
			// Skip batch if item doesn't have batch tracking
			if (step_type === 'batch' && !item.has_batch_no) {
				return;
			}

			const is_verified = this.scan_data[`${step_type}_verified`];
			const is_active = this.scan_state === step_type;

			const icons = {
				location: 'location',
				batch: 'versions',
				item: 'package',
				box: 'inbox'
			};

			const labels = {
				location: 'LOCATION',
				batch: 'BATCH',
				item: 'ITEM',
				box: 'BOX'
			};

			steps_html += `
				<div class="wms-scan-step ${is_active ? 'active' : ''} ${is_verified ? 'verified' : ''}">
					<span class="octicon octicon-${is_verified ? 'check' : icons[step_type]}"></span>
					${labels[step_type]}
				</div>
			`;
		});

		return steps_html;
	}

	get_scan_placeholder() {
		const placeholders = {
			location: 'Scan location...',
			batch: 'Scan batch number...',
			item: 'Scan item code or barcode...',
			box: 'Scan box barcode...',
			quantity: 'Scan to add quantity...'
		};

		return placeholders[this.scan_state] || 'Scan...';
	}

	get_scan_hint() {
		const item = this.pick_items[this.current_item_idx];

		const hints = {
			location: `Expected: ${item.warehouse}`,
			batch: 'Scan batch number or enter manually',
			item: `Expected: ${item.item_code}`,
			box: 'Scan box barcode or enter box number',
			quantity: 'Scan item again to increment, or use +/- buttons'
		};

		return hints[this.scan_state] || '';
	}

	setup_scan_input() {
		const $input = this.$detail.find('#universal-scan-input');

		// Auto-focus
		setTimeout(() => $input.focus(), 100);

		// Handle scan/input
		$input.on('keypress', (e) => {
			if (e.which === 13) { // Enter key
				e.preventDefault();
				const value = $input.val().trim();
				if (value) {
					this.process_scan(value);
					$input.val('').focus();
				}
			}
		});

		// Keep input focused
		$input.on('blur', () => {
			setTimeout(() => $input.focus(), 100);
		});
	}

	process_scan(scanned_value) {
		const item = this.pick_items[this.current_item_idx];

		switch (this.scan_state) {
			case 'location':
				this.verify_location(scanned_value, item);
				break;

			case 'batch':
				this.verify_batch(scanned_value, item);
				break;

			case 'item':
				this.verify_item(scanned_value, item);
				break;

			case 'box':
				this.verify_box(scanned_value, item);
				break;

			case 'quantity':
				// If scanning item again, increment quantity
				if (scanned_value === item.item_code || scanned_value === item.barcode) {
					this.increment_quantity();
				}
				break;
		}
	}

	verify_location(scanned, item) {
		// Accept any location scan for now
		if (scanned) {
			this.scan_data.location_verified = true;
			this.scan_data.scanned_location = scanned;

			frappe.show_alert({
				message: 'Location verified',
				indicator: 'green'
			}, 1);

			this.move_to_next_step(item);
		}
	}

	verify_batch(scanned, item) {
		// Accept batch scan
		if (scanned) {
			this.scan_data.batch_verified = true;
			this.scan_data.scanned_batch = scanned;

			frappe.show_alert({
				message: 'Batch verified',
				indicator: 'green'
			}, 1);

			this.move_to_next_step(item);
		}
	}

	verify_item(scanned, item) {
		if (scanned === item.item_code || scanned === item.barcode) {
			this.scan_data.item_verified = true;

			frappe.show_alert({
				message: 'Item verified!',
				indicator: 'green'
			}, 1);

			// Auto-increment quantity on first scan
			this.increment_quantity();

			this.move_to_next_step(item);
		} else {
			frappe.show_alert({
				message: `Wrong item! Expected: ${item.item_code}`,
				indicator: 'red'
			}, 3);
		}
	}

	verify_box(scanned, item) {
		if (scanned) {
			this.scan_data.box_verified = true;
			this.scan_data.scanned_box = scanned;
			this.current_box = scanned;

			// Update box display
			this.$detail.find('#current-box').text(this.current_box);

			frappe.show_alert({
				message: `Box ${scanned} verified`,
				indicator: 'green'
			}, 1);

			this.move_to_next_step(item);
		}
	}

	move_to_next_step(item) {
		// Find next step in scan order
		const current_idx = this.scan_order.indexOf(this.scan_state);

		if (current_idx < this.scan_order.length - 1) {
			let next_idx = current_idx + 1;
			let next_step = this.scan_order[next_idx];

			// Skip batch if item doesn't have batch tracking
			if (next_step === 'batch' && !item.has_batch_no) {
				next_idx++;
				if (next_idx < this.scan_order.length) {
					next_step = this.scan_order[next_idx];
				} else {
					this.scan_state = 'quantity';
					this.show_item_detail(this.current_item_idx);
					return;
				}
			}

			this.scan_state = next_step;
		} else {
			this.scan_state = 'quantity';
		}

		this.show_item_detail(this.current_item_idx);
	}

	setup_quantity_controls() {
		// Plus button
		this.$detail.find('.wms-qty-plus').on('click', () => {
			this.increment_quantity();
		});

		// Minus button
		this.$detail.find('.wms-qty-minus').on('click', () => {
			this.decrement_quantity();
		});

		// Confirm button
		this.$detail.find('.wms-confirm-btn').on('click', () => {
			this.confirm_pick();
		});
	}

	increment_quantity() {
		const item = this.pick_items[this.current_item_idx];

		if (this.scanned_qty < item.qty) {
			this.scanned_qty++;
			this.update_quantity_display();
		} else {
			frappe.show_alert({
				message: 'Maximum quantity reached',
				indicator: 'orange'
			}, 1);
		}
	}

	decrement_quantity() {
		if (this.scanned_qty > 0) {
			this.scanned_qty--;
			this.update_quantity_display();
		}
	}

	update_quantity_display() {
		const item = this.pick_items[this.current_item_idx];
		const percent = (this.scanned_qty / item.qty) * 100;

		this.$detail.find('.wms-qty-current').text(this.scanned_qty);
		this.$detail.find('.wms-progress-fill').css('width', `${percent}%`);

		// Update button states
		this.$detail.find('.wms-qty-minus').prop('disabled', this.scanned_qty <= 0);
		this.$detail.find('.wms-qty-plus').prop('disabled', this.scanned_qty >= item.qty);
		this.$detail.find('.wms-confirm-btn').prop('disabled', !this.can_confirm());
	}

	can_confirm() {
		// Check that all required steps are verified
		const required_steps = this.scan_order.filter(step => {
			// Batch is not required if item doesn't have it
			if (step === 'batch') {
				const item = this.pick_items[this.current_item_idx];
				return item.has_batch_no;
			}
			return true;
		});

		const all_verified = required_steps.every(step =>
			this.scan_data[`${step}_verified`]
		);

		return all_verified && this.scanned_qty > 0;
	}

	confirm_pick() {
		if (!this.can_confirm()) return;

		const item = this.pick_items[this.current_item_idx];

		// Mark as picked
		item.picked = true;
		item.picked_qty = this.scanned_qty;
		item.box = this.current_box;
		this.completed_count++;

		// Show success
		frappe.show_alert({
			message: `Item ${item.item_code} picked!`,
			indicator: 'green'
		}, 2);

		// Update progress
		this.render_progress();

		// Move to next or show completion
		if (this.current_item_idx < this.pick_items.length - 1) {
			setTimeout(() => {
				this.show_item_detail(this.current_item_idx + 1);
			}, 300);
		} else {
			this.show_completion();
		}
	}

	show_completion() {
		this.$detail.html(`
			<div class="wms-completion">
				<div class="wms-completion-icon">
					<span class="octicon octicon-check"></span>
				</div>
				<h2>Picking Complete!</h2>
				<p>All ${this.total_items} items have been picked.</p>
				<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
					Back to Pick List
				</button>
			</div>
		`);

		frappe.msgprint({
			title: 'Success!',
			indicator: 'green',
			message: 'All items picked successfully!'
		});
	}
}
