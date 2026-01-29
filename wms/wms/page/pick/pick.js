frappe.pages['pick'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Pick',
		single_column: true
	});

	page.wms = new WMSPick(page);
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

class WMSPick {
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

		// Generate unique session ID for this tab
		this.session_id = this.generate_session_id();

		// Box tracking - automatic per order
		this.current_box = null;
		this.box_counter = 1;
		this.order_boxes = {}; // Map order_ref -> box_name

		// Scan order configuration (default) - removed 'box' since it's automatic
		this.scan_order = ['location', 'batch', 'item'];

		this.setup_page();
		this.load_settings();
		this.try_lock_pick_list();

		// Unlock on page unload
		$(window).on('beforeunload', () => {
			this.unlock_pick_list();
		});

		// Unlock when navigating away
		frappe.router.on('change', () => {
			this.unlock_pick_list();
		});
	}

	generate_session_id() {
		// Generate unique session ID for this browser tab
		return `${frappe.session.user}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	try_lock_pick_list() {
		frappe.call({
			method: 'wms.api.lock_pick_list',
			args: {
				pick_list: this.pick_list,
				session_id: this.session_id
			},
			callback: (r) => {
				if (r.message && !r.message.success) {
					// Locked by someone else or another tab
					const msg = r.message;

					frappe.msgprint({
						title: 'Pick List Locked',
						indicator: 'orange',
						message: msg.message
					});

					// Show locked message in UI
					this.show_locked_message(msg.locked_by, msg.is_same_user);
				} else {
					// Successfully locked, load data
					this.load_data();
				}
			}
		});
	}

	unlock_pick_list() {
		// Silent unlock - don't show messages
		if (this.pick_list) {
			frappe.call({
				method: 'wms.api.unlock_pick_list',
				args: { pick_list: this.pick_list },
				async: false  // Ensure it completes before page unload
			});
		}
	}

	show_locked_message(locked_by, is_same_user) {
		const message_text = is_same_user
			? `You have this pick list open in another tab.`
			: `This pick list is currently being picked by <strong>${locked_by}</strong>.`;

		const detail_text = is_same_user
			? `Please close the other tab or use that tab to continue picking.`
			: `Please wait until they complete or the lock expires (30 minutes).`;

		this.$detail.html(`
			<div class="wms-detail-container">
				<div class="wms-completion">
					<div class="wms-completion-icon" style="background: var(--orange-500);">
						<span class="octicon octicon-lock"></span>
					</div>
					<h2>Pick List Locked</h2>
					<p>${message_text}</p>
					<p style="color: var(--text-muted); font-size: 14px; margin-top: 10px;">
						${detail_text}
					</p>
					<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
						Back to Pick List
					</button>
				</div>
			</div>
		`);
	}

	load_settings() {
		frappe.call({
			method: 'frappe.desk.form.load.getdoc',
			args: {
				doctype: 'WMS Settings',
				name: 'WMS Settings'
			},
			callback: (r) => {
				if (r.docs && r.docs[0]) {
					const settings = r.docs[0];
					if (settings.scan_steps && settings.scan_steps.length > 0) {
						// Use custom scan order from settings
						this.scan_order = settings.scan_steps
							.sort((a, b) => a.sequence - b.sequence)
							.map(step => step.step_type.toLowerCase());
					}
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

					// Count already completed items and assign boxes per order
					this.completed_count = 0;
					this.order_boxes = {}; // Map order_ref -> box_name
					let box_num = 1;

					this.pick_items.forEach(item => {
						// Mark as completed if picked_qty matches qty
						if (item.picked_qty && item.picked_qty >= item.qty) {
							item.picked = true;
							this.completed_count++;
						}

						// Assign box per order automatically
						if (item.order_ref) {
							if (!this.order_boxes[item.order_ref]) {
								this.order_boxes[item.order_ref] = `BOX-${String(box_num).padStart(3, '0')}`;
								box_num++;
							}
							item.auto_box = this.order_boxes[item.order_ref];
						} else {
							// No order ref, use generic box
							if (!this.order_boxes['_no_order']) {
								this.order_boxes['_no_order'] = `BOX-${String(box_num).padStart(3, '0')}`;
								box_num++;
							}
							item.auto_box = this.order_boxes['_no_order'];
						}
					});

					this.render();
				}
			}
		});
	}

	render() {
		this.render_progress();
		this.render_items_list();

		if (this.pick_items.length > 0) {
			// Find first non-completed item
			let first_unpicked = this.pick_items.findIndex(item => !item.picked);

			if (first_unpicked === -1) {
				// All items are already picked
				this.show_completion();
			} else {
				this.show_item_detail(first_unpicked);
			}
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
			const is_partial = picked_qty > 0 && picked_qty < item.qty;
			const pick_percent = (picked_qty / item.qty) * 100;

			html += `
				<div class="wms-item-card ${is_active ? 'active' : ''} ${is_completed ? 'completed' : ''} ${is_partial ? 'partial' : ''}"
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
						${is_partial ? `<div class="wms-qty-progress" style="width: ${pick_percent}%"></div>` : ''}
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

		// If item is already fully picked, move to next
		if (item.picked_qty >= item.qty) {
			let next_idx = this.pick_items.findIndex((itm, i) => i > idx && !itm.picked);
			if (next_idx !== -1) {
				this.show_item_detail(next_idx);
				return;
			} else {
				this.show_completion();
				return;
			}
		}

		// Reset scan state to first step in scan order
		this.scan_state = this.scan_order[0];
		this.scan_data = {
			location_verified: false,
			batch_verified: false,
			item_verified: false,
			box_verified: false
		};

		// Start from already picked quantity
		this.scanned_qty = item.picked_qty || 0;

		// Automatically use box assigned to this order
		this.current_box = item.auto_box || `BOX-${String(this.box_counter).padStart(3, '0')}`;

		// Auto-verify box since it's automatic
		this.scan_data.box_verified = true;

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
					${item.order_ref ? `
						<div class="wms-info-row" style="background: var(--primary-100); padding: 8px; border-radius: 4px; margin-bottom: 8px;">
							<span class="octicon octicon-file-text"></span>
							<span>Order: <strong>${item.order_ref}</strong></span>
						</div>
					` : ''}
					<div class="wms-info-row">
						<span class="octicon octicon-location"></span>
						<span>Location: <strong>${item.warehouse}${item.location ? ' - ' + item.location : ''}</strong></span>
					</div>
					${item.has_batch_no && item.batch_no ? `
						<div class="wms-info-row">
							<span class="octicon octicon-versions"></span>
							<span>Batch: <strong>${item.batch_no}</strong></span>
						</div>
					` : ''}
					<div class="wms-info-row">
						<span class="octicon octicon-package"></span>
						<span>Pick SKU: <strong>${item.item_code}</strong></span>
					</div>
					<div class="wms-info-row">
						<span class="octicon octicon-inbox"></span>
						<span>Add to box: <strong id="current-box" style="color: var(--primary);">${this.current_box}</strong></span>
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
			quantity: 'Scan to add quantity...',
			complete: 'All steps verified - Click Confirm'
		};

		return placeholders[this.scan_state] || 'Scan...';
	}

	get_scan_hint() {
		const item = this.pick_items[this.current_item_idx];

		const hints = {
			location: `Expected: ${item.warehouse}`,
			batch: 'Scan batch number or enter manually',
			item: `Expected: ${item.item_code}`,
			quantity: 'Scan item again to increment, or use +/- buttons',
			complete: 'Ready to confirm pick'
		};

		return hints[this.scan_state] || '';
	}

	setup_scan_input() {
		const $input = this.$detail.find('#universal-scan-input');

		// Auto-focus only on initial load
		setTimeout(() => $input.focus(), 100);

		// Handle scan/input
		$input.on('keypress', (e) => {
			if (e.which === 13) { // Enter key
				e.preventDefault();
				const value = $input.val().trim();
				if (value) {
					this.process_scan(value);
					$input.val('');
					// Re-focus after processing scan
					setTimeout(() => $input.focus(), 100);
				}
			}
		});

		// Optional: Click to re-focus (instead of auto blur-focus)
		$input.on('click', () => {
			$input.focus();
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

			// Always move to next step - it will handle box or quantity correctly
			this.move_to_next_step(item);
		} else {
			frappe.show_alert({
				message: `Wrong item! Expected: ${item.item_code}`,
				indicator: 'red'
			}, 3);
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
					// Reached end of scan_order after skipping batch
					// Only move to quantity if qty > 1
					if (item.qty > 1) {
						this.scan_state = 'quantity';
					} else {
						this.scan_state = 'complete';
					}
					this.update_scan_ui();
					return;
				}
			}

			this.scan_state = next_step;
		} else {
			// Reached end of scan_order
			// Only move to quantity state if qty > 1
			if (item.qty > 1) {
				this.scan_state = 'quantity';
			} else {
				this.scan_state = 'complete';
			}
		}

		// Only update scan UI, don't re-render entire page
		this.update_scan_ui();
	}

	update_scan_ui() {
		const item = this.pick_items[this.current_item_idx];

		// Update scan step indicators
		this.$detail.find('.wms-scan-indicator').html(this.render_scan_steps(item));

		// Update input placeholder and hint
		this.$detail.find('#universal-scan-input')
			.attr('placeholder', this.get_scan_placeholder())
			.val('')
			.focus();

		this.$detail.find('.wms-scan-hint').text(this.get_scan_hint());

		// Update confirm button state
		this.$detail.find('.wms-confirm-btn').prop('disabled', !this.can_confirm());
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

		// Update Pick List in database
		frappe.call({
			method: 'wms.api.update_pick_progress',
			args: {
				pick_list: this.pick_list,
				item_idx: item.idx,
				picked_qty: this.scanned_qty,
				location: this.scan_data.scanned_location || item.warehouse,
				batch_no: this.scan_data.scanned_batch || item.batch_no || '',
				box: this.current_box
			},
			callback: (r) => {
				if (r.message && r.message.success) {
					// Mark as picked locally
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
				} else {
					frappe.show_alert({
						message: 'Failed to update pick list',
						indicator: 'red'
					}, 3);
				}
			},
			error: (err) => {
				frappe.show_alert({
					message: 'Error updating pick list',
					indicator: 'red'
				}, 3);
				console.error('Pick update error:', err);
			}
		});
	}

	show_completion() {
		// Show loading message
		this.$detail.html(`
			<div class="wms-completion">
				<div class="wms-completion-icon">
					<span class="octicon octicon-sync"></span>
				</div>
				<h2>Picking Complete!</h2>
				<p>Creating delivery notes...</p>
			</div>
		`);

		// Call API to create delivery notes
		frappe.call({
			method: 'wms.api.create_delivery_notes_from_pick_list',
			args: {
				pick_list: this.pick_list
			},
			callback: (r) => {
				// Unlock the pick list
				this.unlock_pick_list();

				if (r.message && r.message.success) {
					const count = r.message.count;
					const dns = r.message.delivery_notes;

					// Show completion with delivery note links
					this.show_delivery_note_links(dns);

					frappe.show_alert({
						message: `Picking complete! Created ${count} delivery note(s)`,
						indicator: 'green'
					}, 5);
				} else {
					// Still show completion but without delivery notes
					this.$detail.html(`
						<div class="wms-completion">
							<div class="wms-completion-icon">
								<span class="octicon octicon-check"></span>
							</div>
							<h2>Picking Complete!</h2>
							<p>All ${this.total_items} items have been picked.</p>
							<p class="text-muted">No delivery notes created (no sales orders found).</p>
							<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
								Back to Pick List
							</button>
						</div>
					`);
				}
			},
			error: (err) => {
				// Unlock on error
				this.unlock_pick_list();

				console.error('Error creating delivery notes:', err);
				this.$detail.html(`
					<div class="wms-completion">
						<div class="wms-completion-icon">
							<span class="octicon octicon-alert"></span>
						</div>
						<h2>Picking Complete!</h2>
						<p>All ${this.total_items} items picked, but failed to create delivery notes.</p>
						<p class="text-muted">${err.message || 'Unknown error'}</p>
						<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
							Back to Pick List
						</button>
					</div>
				`);
			}
		});
	}

	show_delivery_note_links(delivery_notes) {
		let links_html = '';
		delivery_notes.forEach(dn => {
			links_html += `
				<div class="wms-dn-link">
					<a href="/app/delivery-note/${dn}" target="_blank">
						<span class="octicon octicon-package"></span>
						${dn}
					</a>
				</div>
			`;
		});

		this.$detail.html(`
			<div class="wms-completion">
				<div class="wms-completion-icon">
					<span class="octicon octicon-check"></span>
				</div>
				<h2>Picking Complete!</h2>
				<p>All ${this.total_items} items have been picked.</p>
				<p>Created ${delivery_notes.length} delivery note(s):</p>
				<div class="wms-dn-links">
					${links_html}
				</div>
				<button class="wms-confirm-btn" onclick="frappe.set_route('Form', 'Pick List', '${this.pick_list}')">
					Back to Pick List
				</button>
			</div>
		`);
	}
}
