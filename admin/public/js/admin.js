// SimCo Intel Admin Dashboard
class AdminDashboard {
    constructor() {
        this.currentTab = 'dashboard';
        this.theme = localStorage.getItem('theme') || 'dark';
        this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        this.charts = {};
        this.init();
    }

    init() {
        this.applyTheme();
        this.applySidebarState();
        this.bindEvents();
        this.loadInitialData();
        this.setupTabs();
        this.loadConfigSections();
        this.loadRealms();
        this.startAutoRefresh();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('theme', this.theme);
    }

    toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        this.applyTheme();
    }

    applySidebarState() {
        const sidebar = document.getElementById('sidebar');
        if (this.sidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        this.sidebarCollapsed = !sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed);
        sidebar.classList.toggle('collapsed');
    }

    bindEvents() {
        // Theme toggle
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

        // Sidebar toggle
        document.getElementById('menuToggle')?.addEventListener('click', () => this.toggleSidebar());

        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Close sidebar on mobile when clicking outside
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const menuToggle = document.getElementById('menuToggle');
            if (window.innerWidth <= 1024 && 
                !sidebar.contains(e.target) && 
                !menuToggle.contains(e.target) &&
                sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        });

        // Mobile sidebar toggle
        document.getElementById('menuToggle')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Scheduler controls
        document.getElementById('startBtn')?.addEventListener('click', () => this.controlScheduler('start'));
        document.getElementById('stopBtn')?.addEventListener('click', () => this.controlScheduler('stop'));
        document.querySelector('[onclick*="controlScheduler"]')?.addEventListener('click', () => this.controlScheduler('status'));

        // Snapshots toolbar
        document.getElementById('snapshotRealm')?.addEventListener('change', () => this.loadSnapshots());
        document.getElementById('snapshotType')?.addEventListener('change', () => this.loadSnapshots());
        document.querySelector('[onclick="loadSnapshots()"]')?.addEventListener('click', () => this.loadSnapshots());

        // Logs toolbar
        document.getElementById('logLevel')?.addEventListener('change', () => this.loadLogs());
        document.getElementById('logFilter')?.addEventListener('input', (e) => this.filterLogs(e.target.value));
        document.querySelector('[onclick="loadLogs()"]')?.addEventListener('click', () => this.loadLogs());
        document.querySelector('[onclick="clearLogs()"]')?.addEventListener('click', () => this.clearLogs());

        // Config form submission
        document.querySelectorAll('.config-section').forEach(section => {
            const form = section.querySelector('form');
            if (form) {
                form.addEventListener('submit', (e) => this.saveConfigSection(e, section.dataset.section));
            }
        });

        // Scheduler config form
        document.getElementById('schedulerConfigForm')?.addEventListener('submit', (e) => this.saveSchedulerConfig(e));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.metaKey || e.ctrlKey) {
                switch(e.key) {
                    case 'k': e.preventDefault(); document.getElementById('searchInput')?.focus(); break;
                    case '/': e.preventDefault(); document.getElementById('searchInput')?.focus(); break;
                }
            }
            if (e.key === 'Escape') {
                document.getElementById('sidebar')?.classList.remove('open');
            }
        });
    }

    setupTabs() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = item.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-tab`);
        });

        this.currentTab = tabName;
        
        // Load tab-specific data
        switch(tabName) {
            case 'dashboard': this.loadDashboardData(); break;
            case 'actions': this.loadActions(); break;
            case 'config': this.loadConfigSections(); break;
            case 'scheduler': this.loadSchedulerStatus(); this.loadSchedulerConfig(); break;
            case 'health': this.loadHealth(); break;
            case 'snapshots': this.loadSnapshots(); break;
            case 'logs': this.loadLogs(); break;
        }

        // Close mobile sidebar
        document.getElementById('sidebar')?.classList.remove('open');
    }

    async api(endpoint, options = {}) {
            // Auto-detect Vercel URL or use relative path
            const baseUrl = this.getApiBaseUrl();
            // Ensure /api prefix — all server routes live under /api/
            const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
            const url = `${baseUrl}${apiEndpoint}`;
            const opts = {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };
            if (options.body && typeof options.body === 'object') {
                opts.body = JSON.stringify(options.body);
            }
            const res = await fetch(url, opts);
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Request failed' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            return res.json();
        }

        getApiBaseUrl() {
                    // Check for Vercel URL in meta tag
                    const metaUrl = document.querySelector('meta[name="api-base-url"]')?.content;
            
                    // On Vercel (same domain for admin + API), ALWAYS use relative paths
                    // The meta tag may contain a different Vercel deployment URL than the current alias
                    if (window.location.hostname.includes('vercel.app') || 
                        window.location.hostname.includes('vercel') ||
                        window.location.hostname.includes('.dev')) {
                        return '';
                    }
            
                    // For non-Vercel: only use meta URL if it matches current origin
                    if (metaUrl && metaUrl.length > 0) {
                        try {
                            const metaOrigin = new URL(metaUrl).origin;
                            const currentOrigin = window.location.origin;
                            if (metaOrigin === currentOrigin) {
                                return metaUrl;
                            }
                        } catch {
                            // Invalid URL, ignore
                        }
                    }
            
                    // Default to relative path (same origin)
                    return '';
                }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadDashboardData(),
                this.loadActions(),
                this.loadSchedulerStatus(),
                this.loadHealth(),
                this.loadRealms()
            ]);
        } catch (err) {
            console.error('Initial load failed:', err);
        }
    }

    async loadRealms() {
        try {
            const cfg = await this.api('/config');
            const realms = cfg.realms || [0, 1];
            this.populateRealmSelects(realms);
        } catch (err) {
            console.error('Failed to load realms:', err);
        }
    }

    populateRealmSelects(realms) {
        const selects = document.querySelectorAll('#aggregateRealm, #compressRealm, #snapshotRealm');
        selects.forEach(select => {
            const current = select.value;
            select.innerHTML = '<option value="">All Realms</option>' + 
                realms.map(r => `<option value="${r}">Realm ${r}</option>`).join('');
            select.value = current;
        });
    }

    async loadDashboardData() {
        try {
            const [status, health] = await Promise.all([
                this.api('/status'),
                this.api('/health')
            ]);

            // Update metrics
            document.getElementById('totalRealms').textContent = (status.realms || []).length;
            document.getElementById('totalResources').textContent = health.resources || '-';
            document.getElementById('lastFetch').textContent = status.lastFetch ? this.formatTime(status.lastFetch) : 'Never';
            document.getElementById('schedulerStatus').textContent = status.schedulerRunning ? 'Running' : 'Stopped';
            document.getElementById('schedulerStatus').className = 'metric-value ' + (status.schedulerRunning ? 'running' : 'stopped');

            // Load charts
            this.renderCharts(status, health);
            this.loadRecentActivity();
        } catch (err) {
            console.error('Dashboard load failed:', err);
        }
    }

    renderCharts(status, health) {
        // Simple chart rendering using canvas
        const fetchCtx = document.getElementById('fetchChart')?.getContext('2d');
        const realmCtx = document.getElementById('realmChart')?.getContext('2d');

        if (fetchCtx) this.drawLineChart(fetchCtx, status.fetchHistory || []);
        if (realmCtx) this.drawDoughnutChart(realmCtx, status.realms || []);
    }

    drawLineChart(ctx, data) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (!data.length) return;

        const padding = 40;
        const w = ctx.canvas.width - padding * 2;
        const h = ctx.canvas.height - padding * 2;
        const maxVal = Math.max(...data.map(d => d.duration || 0), 1);

        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        ctx.lineWidth = 2;
        ctx.beginPath();

        data.forEach((d, i) => {
            const x = padding + (i / (data.length - 1 || 1)) * w;
            const y = padding + h - ((d.duration || 0) / maxVal) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw points
        data.forEach((d, i) => {
            const x = padding + (i / (data.length - 1 || 1)) * w;
            const y = padding + h - ((d.duration || 0) / maxVal) * h;
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    drawDoughnutChart(ctx, realms) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // Simple placeholder
        ctx.font = '14px Inter';
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
        ctx.textAlign = 'center';
        ctx.fillText('Resources by Realm', ctx.canvas.width / 2, ctx.canvas.height / 2);
    }

    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    loadRecentActivity() {
        // Mock activity for now
        const activities = [
            { type: 'success', title: 'Market fetch completed', time: '2 min ago', details: '142 resources, 1,234 VWAPs' },
            { type: 'info', title: 'Aggregation completed', time: '15 min ago', details: '2 realms processed' },
            { type: 'success', title: 'Profit margins computed', time: '1 hour ago', details: '89 resources analyzed' },
            { type: 'warning', title: 'Fetch retry', time: '3 hours ago', details: 'Realm 1 timeout, retry succeeded' },
        ];

        const container = document.getElementById('activityList');
        if (container) {
            container.innerHTML = activities.map(a => `
                <div class="activity-item">
                    <div class="activity-icon ${a.type}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></div>
                    <div class="activity-content">
                        <div class="activity-title">${a.title}</div>
                        <div class="activity-meta">${a.time} • ${a.details}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    async loadActions() {
        // Populate realm selects
        await this.loadRealms();
    }

    async runAction(action) {
        const container = document.getElementById('actionResults');
        if (!container) return;

        // Show loading
        const loadingHtml = `
            <div class="result-item">
                <div class="result-icon loading"><div class="spinner"></div></div>
                <div class="result-content">
                    <div class="result-title">Running ${action}...</div>
                    <div class="result-detail">Please wait...</div>
                </div>
            </div>
        `;
        container.innerHTML = loadingHtml;

        // Get parameters
        let params = {};
        switch(action) {
            case 'aggregate':
                params.realm = document.getElementById('aggregateRealm')?.value || '';
                break;
            case 'cleanup':
                params.dryRun = document.getElementById('cleanupDryRun')?.checked;
                break;
            case 'compress':
                params.realm = document.getElementById('compressRealm')?.value || '';
                params.dryRun = document.getElementById('compressDryRun')?.checked;
                break;
            case 'government-orders':
                break;
        }

        try {
            const result = await this.api(`/actions/${action}`, {
                method: 'POST',
                body: params
            });

            const iconClass = result.ok ? 'success' : 'error';
            const iconSvg = result.ok 
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

            document.getElementById('actionResults').innerHTML = `
                <div class="result-item">
                    <div class="result-icon ${result.ok ? 'success' : 'error'}">${iconSvg}</div>
                    <div class="result-content">
                        <div class="result-title">${action} ${result.ok ? 'completed' : 'failed'}</div>
                        <div class="result-detail">${JSON.stringify(result.data || result.error, null, 2)}</div>
                    </div>
                </div>
            `;
        } catch (err) {
            document.getElementById('actionResults').innerHTML = `
                <div class="result-item">
                    <div class="result-icon error"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
                    <div class="result-content">
                        <div class="result-title">${action} failed</div>
                        <div class="result-detail">${err.message}</div>
                    </div>
                </div>
            `;
        }
    }

    async loadConfigSections() {
        try {
            const config = await this.api('/config');
            const sections = ['formulas', 'schedules', 'featureFlags', 'macroIndexes', 'macroSettings', 'macroHistory', 'governmentOrders'];
            
            const container = document.getElementById('configSections');
            if (!container) return;

            container.innerHTML = sections.map(section => {
                const values = config[section] || {};
                const fields = Object.entries(values).map(([key, value]) => {
                    const isBool = typeof value === 'boolean';
                    const isNumber = typeof value === 'number';
                    const isString = typeof value === 'string';
                    
                    if (isBool) {
                        return `<div class="config-field">
                            <label>${key}</label>
                            <label class="checkbox-label">
                                <input type="checkbox" name="${key}" ${value ? 'checked' : ''} data-section="${section}" data-key="${key}" onchange="admin.saveConfigField(this)">
                                <span>Enabled</span>
                            </label>
                        </div>`;
                    }
                    return `<div class="config-field">
                        <label>${key}</label>
                        <input type="${isNumber ? 'number' : 'text'}" name="${key}" value="${value}" data-section="${section}" data-key="${key}" onchange="admin.saveConfigField(this)">
                    </div>`;
                }).join('');

                return `
                    <div class="config-section" data-section="${section}">
                        <div class="config-section-header">
                            <h3>${section}</h3>
                            <button class="btn btn-secondary btn-sm" onclick="admin.saveConfigSection('${section}')">Save</button>
                        </div>
                        <div class="config-section-content">
                            ${fields}
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            console.error('Failed to load config:', err);
        }
    }

    saveConfigField(input) {
        const section = input.dataset.section;
        const key = input.dataset.key;
        const value = input.type === 'checkbox' ? input.checked : input.value;
        
        // Store pending change
        if (!this.pendingConfigChanges) this.pendingConfigChanges = {};
        if (!this.pendingConfigChanges[section]) this.pendingConfigChanges[section] = {};
        this.pendingConfigChanges[section][key] = input.type === 'checkbox' ? input.checked : input.value;
    }

    async saveConfigSection(e, section) {
        if (e) e.preventDefault();
        
        const changes = this.pendingConfigChanges?.[section] || {};
        if (Object.keys(changes).length === 0) {
            // Collect all fields
            document.querySelectorAll(`[data-section="${section}"][data-key]`).forEach(input => {
                changes[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
            });
        }

        if (Object.keys(changes).length === 0) return;

        try {
            await this.api(`/config/${section}`, {
                method: 'PUT',
                body: changes
            });
            this.showToast('Configuration saved');
            delete this.pendingConfigChanges?.[section];
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async loadSchedulerStatus() {
        try {
            const status = await this.api('/status');
            const running = status.schedulerRunning;
            
            document.getElementById('schedulerState').textContent = running ? 'Running' : 'Stopped';
            document.getElementById('schedulerState').className = 'status-value ' + (running ? 'running' : 'stopped');
            document.getElementById('currentCycle').textContent = status.cycle || 0;
            document.getElementById('uptime').textContent = this.formatUptime(status.uptime || 0);
            document.getElementById('nextRun').textContent = status.nextFetch || '-';

            document.getElementById('startBtn').disabled = running;
            document.getElementById('stopBtn').disabled = !running;
        } catch (err) {
            console.error('Scheduler status failed:', err);
        }
    }

    async loadSchedulerConfig() {
        try {
            const cfg = await this.api('/config');
            const schedules = cfg.schedules || {};
            
            const form = document.getElementById('schedulerConfigForm');
            if (!form) return;

            const fields = [
                { key: 'fetchIntervalMinutes', label: 'Fetch Interval (min)', type: 'number', min: 1 },
                { key: 'snapshotRetentionDays', label: 'Retention (days)', type: 'number', min: 1 },
                { key: 'fetchTimeoutSeconds', label: 'Timeout (sec)', type: 'number', min: 5 },
                { key: 'fetchRetryCount', label: 'Retry Count', type: 'number', min: 0 },
                { key: 'fetchRetryDelayMs', label: 'Retry Delay (ms)', type: 'number', min: 100 },
                { key: 'compressionIntervalDays', label: 'Compression Interval (days)', type: 'number', min: 1 },
            ];

            form.innerHTML = fields.map(f => `
                <div class="config-field">
                    <label>${f.label}</label>
                    <input type="${f.type}" name="${f.key}" value="${schedules[f.key] || ''}" ${f.min ? `min="${f.min}"` : ''} data-section="schedules" data-key="${f.key}" onchange="admin.saveConfigField(this)">
                </div>
            `).join('') + '<button type="submit" class="btn btn-primary">Save Schedule Config</button>';
        } catch (err) {
            console.error('Scheduler config load failed:', err);
        }
    }

    async saveSchedulerConfig(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const changes = {};
        for (const [key, value] of formData.entries()) {
            changes[key] = isNaN(value) ? value : Number(value);
        }

        try {
            await this.api('/config/schedules', { method: 'PUT', body: changes });
            this.showToast('Scheduler config saved');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async controlScheduler(cmd) {
        try {
            const result = await this.api(`/actions/scheduler/${cmd}`, { method: 'POST' });
            this.showToast(`Scheduler ${cmd}: ${result.status}`);
            this.loadSchedulerStatus();
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    }

    async loadHealth() {
        try {
            const health = await this.api('/health');
            const container = document.getElementById('healthGrid');
            if (!container) return;

            const metrics = [
                { label: 'API Status', value: health.api?.ok ? 'OK' : 'Failed', class: health.api?.ok ? 'ok' : 'error' },
                { label: 'Database', value: health.database?.ok ? 'OK' : 'Failed', class: health.database?.ok ? 'ok' : 'error' },
                { label: 'Cache', value: health.cache?.ok ? 'OK' : 'Failed', class: health.cache?.ok ? 'ok' : 'error' },
                { label: 'Scheduler', value: health.scheduler?.ok ? 'OK' : 'Failed', class: health.scheduler?.ok ? 'ok' : 'error' },
                { label: 'Memory Usage', value: health.memory ? `${(health.memory.heapUsed / 1024 / 1024).toFixed(1)} MB` : '-', class: 'ok' },
                { label: 'Uptime', value: this.formatUptime(health.uptime || 0), class: 'ok' },
            ];

            container.innerHTML = metrics.map(m => `
                <div class="health-card">
                    <h3>${m.label}</h3>
                    <div class="health-metric">
                        <span></span>
                        <span class="value ${m.class}">${m.value}</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            console.error('Health load failed:', err);
        }
    }

    async loadSnapshots() {
        const realm = document.getElementById('snapshotRealm')?.value;
        const type = document.getElementById('snapshotType')?.value || 'market';
        
        const container = document.getElementById('snapshotsList');
        if (!container) return;

        container.innerHTML = '<div class="loading">Loading snapshots...</div>';

        try {
            let endpoint = `/snapshots`;
            if (realm) endpoint += `/${realm}`;
            endpoint += `?type=${type}`;

            const snapshots = await this.api(endpoint);
            
            container.innerHTML = (snapshots.files || []).map(f => `
                <div class="snapshot-item">
                    <div class="snapshot-info">
                        <div class="snapshot-name">${f.name}</div>
                        <div class="snapshot-meta">${f.size} • ${f.modified}</div>
                    </div>
                    <div class="snapshot-actions">
                        <button class="btn-icon" title="Download" onclick="admin.downloadSnapshot('${realm || ''}', '${f.name}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/></svg>
                        </button>
                        <button class="btn-icon" title="View" onclick="admin.viewSnapshot('${realm || ''}', '${f.name}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                    </div>
                </div>
            `).join('') || '<div class="no-data">No snapshots found</div>';
        } catch (err) {
            console.error('Snapshots load failed:', err);
            container.innerHTML = '<div class="error">Failed to load snapshots</div>';
        }
    }

    async loadLogs() {
        const container = document.getElementById('logsContainer');
        if (!container) return;

        container.innerHTML = '<div class="loading">Loading logs...</div>';

        try {
            const health = await this.api('/health');
            const logs = health.recentLogs || [];
            
            container.innerHTML = logs.map(l => `
                <div class="log-entry">
                    <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
                    <span class="log-level ${l.level}">${l.level}</span>
                    <span class="log-message">${l.message}</span>
                </div>
            `).join('') || '<div class="no-logs">No logs available</div>';
        } catch (err) {
            console.error('Logs load failed:', err);
            container.innerHTML = '<div class="error">Failed to load logs</div>';
        }
    }

    filterLogs(query) {
        const entries = document.querySelectorAll('.log-entry');
        entries.forEach(entry => {
            const message = entry.querySelector('.log-message')?.textContent || '';
            entry.style.display = message.toLowerCase().includes(query.toLowerCase()) ? 'flex' : 'none';
        });
    }

    clearLogs() {
        const container = document.getElementById('logsContainer');
        if (container) container.innerHTML = '<div class="no-logs">Logs cleared</div>';
    }

    async downloadSnapshot(realm, filename) {
        try {
            const url = `/api/snapshots${realm ? `/${realm}` : ''}/${filename}`;
            window.open(url, '_blank');
        } catch (err) {
            this.showToast('Download failed', 'error');
        }
    }

    viewSnapshot(realm, filename) {
        // Open in new tab
        const url = `/api/snapshots${realm ? `/${realm}` : ''}/${filename}`;
        window.open(url, '_blank');
    }

    startAutoRefresh() {
        // Refresh dashboard every 30 seconds
        setInterval(() => {
            if (this.currentTab === 'dashboard') this.loadDashboardData();
            if (this.currentTab === 'scheduler') this.loadSchedulerStatus();
            if (this.currentTab === 'health') this.loadHealth();
        }, 30000);
    }

    formatUptime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);
        if (d) return `${d}d ${h % 24}h`;
        if (h) return `${h}h ${m % 60}m`;
        if (m) return `${m}m ${s % 60}s`;
        return `${s}s`;
    }

    showToast(message, type = 'info') {
        // Simple toast implementation
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 1000;
            padding: 12px 20px; border-radius: 8px;
            background: var(--bg-card); border: 1px solid var(--border-color);
            box-shadow: var(--shadow-lg); animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new AdminDashboard();
});

// Global functions for onclick handlers - MUST attach to window explicitly for module scripts
window.runAction = function(action) { window.admin?.runAction(action); };
window.controlScheduler = function(cmd) { window.admin?.controlScheduler(cmd); };
window.loadSnapshots = function() { window.admin?.loadSnapshots(); };
window.loadLogs = function() { window.admin?.loadLogs(); };
window.clearLogs = function() { window.admin?.clearLogs(); };
window.filterLogs = function(q) { window.admin?.filterLogs(q); };
window.saveConfigSection = function(section) { window.admin?.saveConfigSection(null, section); };
window.saveConfigField = function(input) { window.admin?.saveConfigField(input); };
window.saveSchedulerConfig = function(e) { window.admin?.saveSchedulerConfig(e); };
