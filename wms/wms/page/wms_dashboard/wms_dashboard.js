frappe.pages['wms-dashboard'].on_page_load = function(wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'WMS Dashboard',
		single_column: true
	});

	new WMSDashboard(page);
};

class WMSDashboard {
	constructor(page) {
		this.page = page;
		this.setup_page();
		this.load_data();

		// Refresh every 30 seconds
		setInterval(() => this.load_data(), 30000);
	}

	setup_page() {
		this.page.main.html(`
			<div class="wms-dashboard">
				<div class="wms-stats"></div>
				<div class="wms-open-picks"></div>
			</div>
		`);

		this.$stats = this.page.main.find('.wms-stats');
		this.$picks = this.page.main.find('.wms-open-picks');
	}

	load_data() {
		frappe.call({
			method: 'wms.api.get_wms_dashboard_data',
			callback: (r) => {
				if (r.message) {
					this.render_stats(r.message.stats);
					this.render_pick_lists(r.message.pick_lists);
				}
			}
		});
	}

	render_stats(stats) {
		this.$stats.html(`
			<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
				<div class="wms-stat-card">
					<div class="wms-stat-value">${stats.open_picks || 0}</div>
					<div class="wms-stat-label">Open Pick Lists</div>
				</div>
				<div class="wms-stat-card">
					<div class="wms-stat-value">${stats.in_progress || 0}</div>
					<div class="wms-stat-label">Currently Picking</div>
				</div>
				<div class="wms-stat-card">
					<div class="wms-stat-value">${stats.completed_today || 0}</div>
					<div class="wms-stat-label">Completed Today</div>
				</div>
			</div>
		`);
	}

	render_pick_lists(pick_lists) {
		let html = `
			<h3 style="margin-bottom: 15px;">Open Pick Lists</h3>
			<div class="wms-picks-list">
		`;

		pick_lists.forEach(pick => {
			const is_locked = pick.wms_locked_by;
			const locked_by_me = is_locked && pick.wms_locked_by === frappe.session.user;

			html += `
				<div class="wms-pick-item ${is_locked ? 'locked' : ''}"
				     onclick="frappe.set_route('pick', '${pick.name}')">
					<div class="wms-pick-header">
						<div>
							<strong>${pick.name}</strong>
							${is_locked ? `<span class="octicon octicon-lock" style="color: var(--orange-500); margin-left: 8px;"></span>` : ''}
						</div>
						<span class="badge" style="background: var(--orange-500);">${pick.status}</span>
					</div>
					<div class="wms-pick-meta">
						<span>${pick.total_items} items</span>
						${is_locked ? `<span style="color: var(--orange-600); font-size: 12px;">
							${locked_by_me ? 'Picked by you' : 'Picked by ' + pick.locked_by_name}
						</span>` : ''}
					</div>
				</div>
			`;
		});

		html += `</div>`;
		this.$picks.html(html);
	}
}
