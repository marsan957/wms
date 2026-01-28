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
	QUANTITY: 'quantity',
	COMPLETE: 'complete'
};

class WMSPickOptimization {
	constructor(page) {
		this.page = page;
		this.pick_list = frappe.get_route()[1];

		if (!this.pick_list) {
			frappe.msgprint(__('No Pick List specified'));
			return;
		}

		this.completed_count = 0;
		this.pick_items = [];
		this.current_item_idx = 0;

		// Current scan state
		this.scan_state = SCAN_STATE.LOCATION;
		this.scan_data = {};
		this.scanned_qty = 0;

		this.setup_page();
		this.load_data();
	}

	setup_page() {
		// Setup responsive layout with tabs for mobile
		this.page.main.html(`
			<div class="wms-pick-container">
				<!-- Mobile Tab Navigation -->
				<div class="wms-mobile-tabs">
					<button class="wms-tab-btn active" data-tab="items">
						<span class="octicon octicon-checklist"></span>
						${__('Items')}
					</button>
					<button class="wms-tab-btn" data-tab="detail">
						<span class="octicon octicon-package"></span>
						${__('Detail')}
					</button>
				</div>

				<div class="wms-content-wrapper">
					<!-- Left: Items List -->
					<div class="wms-items-panel wms-tab-content active" data-tab="items">
						<div class="wms-progress-header"></div>
						<div class="wms-items-list"></div>
					</div>

					<!-- Right: Item Detail & Scanning -->
					<div class="wms-detail-panel wms-tab-content" data-tab="detail">
						<div class="wms-item-detail"></div>
					</div>
				</div>
			</div>
		`);

		this.$progress = this.page.main.find('.wms-progress-header');
		this.$items_list = this.page.main.find('.wms-items-list');
		this.$detail = this.page.main.find('.wms-item-detail');

		// Setup mobile tab switching
		this.page.main.find('.wms-tab-btn').on('click', (e) => {
			const tab = $(e.currentTarget).data('tab');
			this.switch_tab(tab);
		});

		// Make instance accessible globally
		window.wms = this;
	}

	switch_tab(tab) {
		this.page.main.find('.wms-tab-btn').removeClass('active');
		this.page.main.find(`.wms-tab-btn[data-tab="${tab}"]`).addClass('active');

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
					${__('Picked')}: ${this.completed_count} / ${this.total_items}
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
						<div class="wms-qty-label">${__('Pick')}</div>
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

		// Reset scan state
		this.scan_state = SCAN_STATE.LOCATION;
		this.scan_data = {
			location_verified: false,
			batch_verified: false,
			item_verified: false
		};
		this.scanned_qty = item.picked_qty || 0;

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
						<span>${__('Pick SKU')}: <strong>${item.item_code}</strong></span>
					</div>
					<div class="wms-info-row">
						<span class="octicon octicon-inbox"></span>
						<span>${__('Add to box')}: <strong>#1</strong></span>
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
						<div class="wms-scan-step ${this.scan_data.location_verified ? 'verified' : (this.scan_state === SCAN_STATE.LOCATION ? 'active' : '')}">
							<span class="octicon ${this.scan_data.location_verified ? 'octicon-check' : 'octicon-location'}"></span>
							${__('Location')}
						</div>
						${item.has_batch_no ? `
							<div class="wms-scan-step ${this.scan_data.batch_verified ? 'verified' : (this.scan_state === SCAN_STATE.BATCH ? 'active' : '')}">
								<span class="octicon ${this.scan_data.batch_verified ? 'octicon-check' : 'octicon-versions'}"></span>
								${__('Batch')}
							</div>
						` : ''}
						<div class="wms-scan-step ${this.scan_data.item_verified ? 'verified' : (this.scan_state === SCAN_STATE.ITEM ? 'active' : '')}">
							<span class="octicon ${this.scan_data.item_verified ? 'octicon-check' : 'octicon-package'}"></span>
							${__('Item')}
						</div>
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
					${__('Confirm pick')}
				</button>
			</div>
		`);

		// Setup event handlers
		this.setup_scan_input();
		this.setup_quantity_controls();
		this.render_items_list();
	}

	get_scan_placeholder() {
		switch (this.scan_state) {
			case SCAN_STATE.LOCATION:
				return __('Scan location...');
			case SCAN_STATE.BATCH:
				return __('Scan batch number...');
			case SCAN_STATE.ITEM:
				return __('Scan item code or barcode...');
			case SCAN_STATE.QUANTITY:
				return __('Scan to add quantity...');
			default:
				return __('Scan...');
		}
	}

	get_scan_hint() {
		const item = this.pick_items[this.current_item_idx];

		switch (this.scan_state) {
			case SCAN_STATE.LOCATION:
				return `${__('Expected')}: ${item.warehouse}`;
			case SCAN_STATE.BATCH:
				return __('Scan batch number or enter manually');
			case SCAN_STATE.ITEM:
				return `${__('Expected')}: ${item.item_code}`;
			case SCAN_STATE.QUANTITY:
				return __('Scan item again to increment, or use +/- buttons');
			default:
				return '';
		}
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
			case SCAN_STATE.LOCATION:
				this.verify_location(scanned_value, item);
				break;

			case SCAN_STATE.BATCH:
				this.verify_batch(scanned_value, item);
				break;

			case SCAN_STATE.ITEM:
				this.verify_item(scanned_value, item);
				break;

			case SCAN_STATE.QUANTITY:
				// If scanning item again, increment quantity
				if (scanned_value === item.item_code || scanned_value === item.barcode) {
					this.increment_quantity();
				}
				break;
		}
	}

	verify_location(scanned, item) {
		// Accept any location scan for now (could be validated against bin locations)
		if (scanned) {
			this.scan_data.location_verified = true;
			this.scan_data.scanned_location = scanned;

			frappe.show_alert({
				message: __('Location verified'),
				indicator: 'green'
			}, 1);

			// Move to next state
			if (item.has_batch_no) {
				this.scan_state = SCAN_STATE.BATCH;
			} else {
				this.scan_state = SCAN_STATE.ITEM;
			}

			this.show_item_detail(this.current_item_idx);
		}
	}

	verify_batch(scanned, item) {
		// Accept batch scan (could be validated against available batches)
		if (scanned) {
			this.scan_data.batch_verified = true;
			this.scan_data.scanned_batch = scanned;

			frappe.show_alert({
				message: __('Batch verified'),
				indicator: 'green'
			}, 1);

			this.scan_state = SCAN_STATE.ITEM;
			this.show_item_detail(this.current_item_idx);
		}
	}

	verify_item(scanned, item) {
		if (scanned === item.item_code || scanned === item.barcode) {
			this.scan_data.item_verified = true;

			frappe.show_alert({
				message: __('Item verified!'),
				indicator: 'green'
			}, 1);

			// Auto-increment quantity on first scan
			this.increment_quantity();

			this.scan_state = SCAN_STATE.QUANTITY;
			this.show_item_detail(this.current_item_idx);
		} else {
			frappe.show_alert({
				message: __('Wrong item! Expected: {0}', [item.item_code]),
				indicator: 'red'
			}, 3);
		}
	}

	setup_quantity_controls() {
		const item = this.pick_items[this.current_item_idx];

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
				message: __('Maximum quantity reached'),
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
		return this.scan_data.location_verified &&
		       this.scan_data.item_verified &&
		       this.scanned_qty > 0;
	}

	confirm_pick() {
		if (!this.can_confirm()) return;

		const item = this.pick_items[this.current_item_idx];

		// Mark as picked
		item.picked = true;
		item.picked_qty = this.scanned_qty;
		this.completed_count++;

		// Show success
		frappe.show_alert({
			message: __('Item {0} picked!', [item.item_code]),
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
				<h2>${__('Picking Complete!')}</h2>
				<p>${__('All {0} items have been picked.', [this.total_items])}</p>
				<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
					${__('Back to Pick List')}
				</button>
			</div>
		`);

		frappe.msgprint({
			title: __('Success!'),
			indicator: 'green',
			message: __('All items picked successfully!')
		});
	}
}
