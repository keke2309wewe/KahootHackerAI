// ── KahootHackerAI Results Dashboard — Frontend App ──────────────────────────
(() => {
    'use strict';

    // The dashboard URL is same-origin when served from Docker
    const API_BASE = '';

    // Token is stored in localStorage for the dashboard session
    let authToken = localStorage.getItem('dashboardToken') || '';

    // ── Auth ─────────────────────────────────────────────────────────────────
    function getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        };
    }

    async function apiGet(path) {
        const resp = await fetch(`${API_BASE}${path}`, { headers: getHeaders() });
        if (resp.status === 401 || resp.status === 403) {
            promptForToken();
            throw new Error('Unauthorized');
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    async function apiDelete(path) {
        const resp = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: getHeaders() });
        if (resp.status === 401 || resp.status === 403) {
            promptForToken();
            throw new Error('Unauthorized');
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    function promptForToken() {
        const token = prompt('Enter your Dashboard Token:');
        if (token && token.trim()) {
            authToken = token.trim();
            localStorage.setItem('dashboardToken', authToken);
            loadAll();
        }
    }

    // ── State ────────────────────────────────────────────────────────────────
    let allResults = [];
    let currentFilter = 'all';
    let sortField = 'timestamp';
    let sortDir = -1; // -1 = desc

    // ── Init ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        if (!authToken) {
            promptForToken();
            return;
        }
        loadAll();
        setupListeners();
    });

    function setupListeners() {
        // Refresh
        document.getElementById('refreshBtn').addEventListener('click', loadAll);

        // Clear all
        document.getElementById('clearAllBtn').addEventListener('click', async () => {
            if (!confirm('Delete ALL results? This cannot be undone.')) return;
            try {
                await apiDelete('/api/results');
                loadAll();
            } catch (e) { console.error(e); }
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.platform;
                renderTable();
            });
        });

        // Sort headers
        document.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (sortField === field) {
                    sortDir *= -1;
                } else {
                    sortField = field;
                    sortDir = -1;
                }
                renderTable();
            });
        });
    }

    // ── Load Data ────────────────────────────────────────────────────────────
    async function loadAll() {
        const badge = document.getElementById('connectionBadge');
        const text = document.getElementById('connectionText');

        try {
            const [statsData, resultsData] = await Promise.all([
                apiGet('/api/results/stats'),
                apiGet('/api/results?limit=500')
            ]);

            badge.className = 'connection-badge online';
            text.textContent = 'Connected';

            allResults = resultsData.results || [];
            renderStats(statsData);
            renderPlatformStrip(statsData.platformBreakdown || []);
            renderTable();
        } catch (err) {
            badge.className = 'connection-badge offline';
            text.textContent = 'Disconnected';
            console.error('Load error:', err);
        }
    }

    // ── Render Stats ─────────────────────────────────────────────────────────
    function renderStats(s) {
        document.getElementById('statGames').textContent = s.totalGames || 0;
        document.getElementById('statAccuracy').textContent = `${s.accuracy || 0}%`;
        document.getElementById('statCost').textContent = `$${(s.totalCost || 0).toFixed(4)}`;
        document.getElementById('statModel').textContent = s.topModel || 'N/A';
        document.getElementById('statCorrectWrong').textContent = `${s.totalCorrect || 0}✓  ${s.totalWrong || 0}✗`;
        document.getElementById('statTokens').textContent = `${formatNumber(s.totalInputTokens || 0)} in · ${formatNumber(s.totalOutputTokens || 0)} out`;
    }

    // ── Platform Strip ───────────────────────────────────────────────────────
    function renderPlatformStrip(breakdown) {
        const strip = document.getElementById('platformStrip');
        if (!breakdown || breakdown.length === 0) {
            strip.innerHTML = '';
            return;
        }

        const platformEmojis = { kahoot: '🟣', naurok: '🟠', classtime: '🔵', universal: '⚪' };

        strip.innerHTML = breakdown.map(p => {
            const acc = p.questions > 0 ? ((p.correct / p.questions) * 100).toFixed(0) : 0;
            const emoji = platformEmojis[p.platform] || '⚪';
            return `<div class="platform-chip">
                <span>${emoji} ${capitalize(p.platform)}</span>
                <span class="chip-count">${p.games} games</span>
                <span class="chip-acc">${acc}% acc</span>
            </div>`;
        }).join('');
    }

    // ── Render Table ─────────────────────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('resultsBody');
        const emptyHero = document.getElementById('emptyHero');
        const tableWrapper = document.querySelector('.table-wrapper');

        let filtered = currentFilter === 'all'
            ? allResults
            : allResults.filter(r => r.platform === currentFilter);

        // Sort
        filtered.sort((a, b) => {
            let va = a[sortField], vb = b[sortField];
            if (sortField === 'timestamp') {
                va = new Date(va).getTime() || 0;
                vb = new Date(vb).getTime() || 0;
            }
            if (typeof va === 'string') va = va.toLowerCase();
            if (typeof vb === 'string') vb = vb.toLowerCase();
            return va < vb ? -sortDir : va > vb ? sortDir : 0;
        });

        if (filtered.length === 0) {
            tableWrapper.style.display = 'none';
            emptyHero.style.display = 'block';
            return;
        }

        tableWrapper.style.display = 'block';
        emptyHero.style.display = 'none';

        tbody.innerHTML = filtered.map(r => {
            const total = r.totalQuestions || 0;
            const acc = total > 0 ? ((r.correctAnswers / total) * 100).toFixed(0) : '—';
            const accClass = acc === '—' ? '' : (parseFloat(acc) >= 80 ? 'good' : parseFloat(acc) >= 50 ? 'ok' : 'bad');
            const timeStr = formatTime(r.timestamp);
            const modelShort = (r.model || '').split('/').pop() || r.model || '—';

            return `<tr data-id="${r.id}">
                <td class="time-cell">${esc(timeStr)}</td>
                <td><span class="platform-badge ${r.platform}">${capitalize(r.platform)}</span></td>
                <td title="${esc(r.quizTitle)}">${esc(truncate(r.quizTitle || '—', 30))}</td>
                <td class="correct-cell">${r.correctAnswers}</td>
                <td class="wrong-cell">${r.wrongAnswers}</td>
                <td class="accuracy-cell ${accClass}">${acc}${acc !== '—' ? '%' : ''}</td>
                <td class="model-cell" title="${esc(r.model)}">${esc(modelShort)}</td>
                <td class="cost-cell">$${(r.estimatedCost || 0).toFixed(4)}</td>
                <td><button class="details-btn" onclick="toggleDetails(${r.id})">▼</button></td>
                <td><button class="delete-btn" onclick="deleteResult(${r.id})" title="Delete">×</button></td>
            </tr>
            <tr class="details-row" id="details-${r.id}" style="display:none">
                <td colspan="10">
                    <div class="details-content">
                        <div class="detail-item"><div class="detail-label">Total Questions</div><div class="detail-value">${total}</div></div>
                        <div class="detail-item"><div class="detail-label">Correct</div><div class="detail-value" style="color:var(--green)">${r.correctAnswers}</div></div>
                        <div class="detail-item"><div class="detail-label">Wrong</div><div class="detail-value" style="color:var(--red)">${r.wrongAnswers}</div></div>
                        <div class="detail-item"><div class="detail-label">Skipped</div><div class="detail-value">${r.skipped || 0}</div></div>
                        <div class="detail-item"><div class="detail-label">Solve Mode</div><div class="detail-value">${r.solveMode || 'ai'}</div></div>
                        <div class="detail-item"><div class="detail-label">Provider</div><div class="detail-value">${r.provider}</div></div>
                        <div class="detail-item"><div class="detail-label">Model</div><div class="detail-value" style="font-size:11px;word-break:break-all;">${esc(r.model || '—')}</div></div>
                        <div class="detail-item"><div class="detail-label">Input Tokens</div><div class="detail-value">${formatNumber(r.inputTokens)}</div></div>
                        <div class="detail-item"><div class="detail-label">Output Tokens</div><div class="detail-value">${formatNumber(r.outputTokens)}</div></div>
                        <div class="detail-item"><div class="detail-label">Estimated Cost</div><div class="detail-value" style="color:var(--purple)">$${(r.estimatedCost || 0).toFixed(6)}</div></div>
                        <div class="detail-item"><div class="detail-label">Reasoning</div><div class="detail-value">${r.reasoningEnabled ? `✅ ${r.reasoningEffort}` : '❌ Off'}</div></div>
                        <div class="detail-item"><div class="detail-label">Timestamp</div><div class="detail-value" style="font-size:11px;">${r.timestamp}</div></div>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // ── Actions ──────────────────────────────────────────────────────────────
    window.toggleDetails = function(id) {
        const row = document.getElementById(`details-${id}`);
        if (row) {
            const visible = row.style.display !== 'none';
            row.style.display = visible ? 'none' : 'table-row';
            // Update button text
            const btn = row.previousElementSibling?.querySelector('.details-btn');
            if (btn) btn.textContent = visible ? '▼' : '▲';
        }
    };

    window.deleteResult = async function(id) {
        if (!confirm('Delete this result?')) return;
        try {
            await apiDelete(`/api/results/${id}`);
            allResults = allResults.filter(r => r.id !== id);
            renderTable();
            // Reload stats
            const stats = await apiGet('/api/results/stats');
            renderStats(stats);
            renderPlatformStrip(stats.platformBreakdown || []);
        } catch (e) { console.error(e); }
    };

    // ── Helpers ──────────────────────────────────────────────────────────────
    function formatTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        const now = new Date();
        const diff = now - d;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function formatNumber(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return String(n);
    }

    function capitalize(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function truncate(s, max) {
        return s.length > max ? s.slice(0, max) + '…' : s;
    }

    function esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Auto-refresh every 30s
    setInterval(loadAll, 30000);
})();
