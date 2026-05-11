/* ==========================================================
   FBA Inventory Intelligence Dashboard — frontend logic
   Handles: upload, calls /api/analyze, renders KPIs,
            charts, table, filters, sorting, paging.
   ========================================================== */

// ----------------------------------------------------------
// Global state
// ----------------------------------------------------------
const state = {
    rows: [],          // full result rows from server
    filtered: [],      // after filters
    sortKey: "Excess Qty",
    sortDir: "desc",
    page: 1,
    pageSize: 25,
    sessionId: null,
    shipmentDetails: [], // shipment breakdown by SKU
    charts: { status: null, topExcess: null, health: null },
};

// ----------------------------------------------------------
// DOM helpers
// ----------------------------------------------------------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ----------------------------------------------------------
// Toast notifications
// ----------------------------------------------------------
function showToast(message, type = "info") {
    const toast = $("#toast");
    toast.innerHTML = `
        <div class="toast-card ${type}">
            <span>${message}</span>
        </div>`;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ----------------------------------------------------------
// File input UI feedback
// ----------------------------------------------------------
$$('.file-input').forEach(input => {
    input.addEventListener("change", (e) => {
        const drop  = e.target.closest(".file-drop");
        const label = drop.querySelector(".file-label");
        if (e.target.files.length > 0) {
            label.textContent = e.target.files[0].name;
            drop.classList.add("has-file");
        } else {
            label.textContent = label.dataset.default;
            drop.classList.remove("has-file");
        }
    });
});

// ----------------------------------------------------------
// Settings: live update lead-time display
// ----------------------------------------------------------
function updateLeadTime() {
    const t = parseInt($('input[name="transit_days"]').value || 0, 10);
    const g = parseInt($('input[name="grn_days"]').value || 0, 10);
    $("#lead-time-display").value = `${t + g} days`;
}
$('input[name="transit_days"]').addEventListener("input", updateLeadTime);
$('input[name="grn_days"]').addEventListener("input", updateLeadTime);

// ----------------------------------------------------------
// Reset form
// ----------------------------------------------------------
$("#reset-btn").addEventListener("click", () => {
    setTimeout(() => {
        $$('.file-drop').forEach(d => {
            d.classList.remove("has-file");
            d.querySelector(".file-label").textContent =
                d.querySelector(".file-label").dataset.default;
        });
        updateLeadTime();
    }, 50);
});

// ----------------------------------------------------------
// Loading overlay
// ----------------------------------------------------------
function showLoading(on) {
    const el = $("#loading-overlay");
    if (on) {
        el.classList.remove("hidden");
        el.classList.add("flex");
    } else {
        el.classList.add("hidden");
        el.classList.remove("flex");
    }
}

async function fetchWithTimeout(url, options = {}, timeout = 300000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;

    try {
        return await fetch(url, options);
    } finally {
        clearTimeout(timeoutId);
    }
}

// ----------------------------------------------------------
// Submit handler
// ----------------------------------------------------------
$("#upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    $("#analyze-btn").disabled = true;
    $("#analyze-btn-label").textContent = "Analyzing…";
    $("#status-msg").innerHTML = "<span class=\"text-slate-600\">Analysis started. Large files can take up to 5 minutes.</span>";
    showLoading(true);

    try {
        const apiUrl =
            (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port === "5000"
                ? "/api/analyze"
                : "http://127.0.0.1:5000/api/analyze";
        const res  = await fetchWithTimeout(apiUrl, { method: "POST", body: formData }, 300000);
        const data = await res.json();

        if (!data.ok) {
            showToast(data.error || "Analysis failed.", "error");
            $("#status-msg").innerHTML =
                `<span class="text-rose-600 font-medium">${data.error}</span>`;
            return;
        }

        // Store result
        state.rows       = data.rows;
        state.filtered   = [...data.rows];
        state.sessionId  = data.session_id;
        state.page       = 1;
        state.shipmentDetails = data.shipment_details || [];

        // Show results section
        $("#results-wrap").classList.remove("hidden");
        $("#empty-state").classList.add("hidden");

        // Render everything
        renderKPIs(data.kpis);
        renderCharts(data.charts);
        renderShipmentDetails(state.shipmentDetails);
        applyFiltersAndRender();

        showToast(`Analysis complete · ${data.rows.length} SKUs processed`, "success");

        // Smooth-scroll to results
        $("#kpis").scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
        console.error(err);
        if (err.name === "AbortError") {
            showToast("Request timed out. Large files can take up to 5 minutes to analyze.", "error");
            $("#status-msg").innerHTML =
                `<span class="text-rose-600 font-medium">Request timed out. Large files can take up to 5 minutes to analyze.</span>`;
        } else {
            showToast("Network error. Make sure the Flask server is running.", "error");
        }
    } finally {
        $("#analyze-btn").disabled = false;
        $("#analyze-btn-label").textContent = "Run Analysis";
        showLoading(false);
    }
});

// ----------------------------------------------------------
// Render KPI cards
// ----------------------------------------------------------
function renderKPIs(k) {
    $("#kpi-total").textContent     = k.total_skus.toLocaleString();
    $("#kpi-healthy").textContent   = k.healthy.toLocaleString();
    $("#kpi-critical").textContent  = k.critical.toLocaleString();
    $("#kpi-overstock").textContent = k.overstock.toLocaleString();
    $("#kpi-dead").textContent      = k.dead_stock.toLocaleString();
    $("#kpi-excess-qty").textContent = k.total_excess_qty.toLocaleString();
}

// ----------------------------------------------------------
// Render charts using Chart.js
// ----------------------------------------------------------
function destroyChart(c) { if (c) c.destroy(); }

function renderCharts(c) {
    destroyChart(state.charts.status);
    destroyChart(state.charts.topExcess);
    destroyChart(state.charts.health);

    // Status colors mapped to label
    const statusColors = {
        "Healthy":         "#10b981",
        "Low Stock":       "#f59e0b",
        "Critical":        "#ef4444",
        "Overstock":       "#f97316",
        "Excess Inventory":"#a855f7",
        "Dead Stock":      "#64748b",
    };

    // --- 1. Status pie ---
    state.charts.status = new Chart($("#chart-status"), {
        type: "doughnut",
        data: {
            labels: c.status.labels,
            datasets: [{
                data: c.status.values,
                backgroundColor: c.status.labels.map(l => statusColors[l] || "#94a3b8"),
                borderColor: "#fff",
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { boxWidth: 12, font: { size: 11 } },
                },
            },
        },
    });

    // --- 2. Top excess bar ---
    state.charts.topExcess = new Chart($("#chart-top-excess"), {
        type: "bar",
        data: {
            labels: c.top_excess.labels,
            datasets: [{
                label: "Excess Qty",
                data: c.top_excess.values,
                backgroundColor: "#a855f7",
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y",
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: "#f1f5f9" }, beginAtZero: true },
                y: { grid: { display: false } },
            },
        },
    });

    // --- 3. Stock health overview ---
    state.charts.health = new Chart($("#chart-health"), {
        type: "bar",
        data: {
            labels: c.stock_health.labels,
            datasets: [{
                label: "Units",
                data: c.stock_health.values,
                backgroundColor: ["#4f46e5", "#10b981", "#a855f7"],
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: "#f1f5f9" }, beginAtZero: true },
                x: { grid: { display: false } },
            },
        },
    });
}

// ----------------------------------------------------------
// Render shipment details
// ----------------------------------------------------------
function renderShipmentDetails(shipmentDetails) {
    const container = $("#shipment-details");

    if (!shipmentDetails || shipmentDetails.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-500">
                <i data-lucide="truck" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
                <p>No shipment details available</p>
            </div>`;
        return;
    }

    container.innerHTML = shipmentDetails.map(sku => `
        <div class="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-semibold text-slate-900">${escapeHtml(sku.sku)}</h4>
                <div class="text-sm text-slate-600">
                    <span class="font-medium">${sku.shipment_count}</span> shipment${sku.shipment_count !== 1 ? 's' : ''} · 
                    <span class="font-medium">${fmt(sku.total_qty)}</span> total units
                </div>
            </div>

            <div class="space-y-2">
                ${sku.shipments.map(shipment => `
                    <div class="bg-white rounded p-3 border border-slate-200">
                        <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                                <i data-lucide="package" class="w-4 h-4"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="font-medium text-slate-900 truncate">${escapeHtml(shipment.id)}</div>
                                <div class="text-xs text-slate-500">
                                    ${escapeHtml(shipment.loading_date)} · ${escapeHtml(shipment.appointment_id)}
                                </div>
                                <div class="text-xs text-slate-500 mt-1">
                                    Available ${escapeHtml(shipment.available_date)}
                                </div>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="font-semibold text-slate-900">${fmt(shipment.qty)}</div>
                            <div class="text-xs text-slate-500">units</div>
                            <div class="text-xs ${shipment.status === 'Excess' ? 'text-rose-600' : 'text-emerald-700'} font-semibold mt-1">
                                ${escapeHtml(shipment.status)}${shipment.shipment_excess_qty > 0 ? ` · ${fmt(shipment.shipment_excess_qty)} excess` : ''}
                            </div>
                        </div>
                        </div>

                        <div class="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 text-xs">
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Opening</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.opening_stock)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Days</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.depletion_days)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Sales Before</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.expected_sales_before_arrival)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Remaining</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.stock_before_arrival)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Incoming</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.qty)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Projected</div>
                                <div class="font-semibold text-slate-900">${fmt(shipment.projected_stock)}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">DOC</div>
                                <div class="font-semibold text-slate-900">${shipment.days_cover >= 999 ? "999+" : shipment.days_cover}</div>
                            </div>
                            <div class="rounded bg-slate-50 px-2.5 py-2">
                                <div class="text-slate-500">Excess</div>
                                <div class="font-semibold ${shipment.shipment_excess_qty > 0 ? 'text-rose-600' : 'text-emerald-700'}">
                                    ${fmt(shipment.shipment_excess_qty)}
                                </div>
                            </div>
                        </div>

                        <div class="mt-2 text-xs text-slate-500">
                            ${fmt(shipment.opening_stock)} - ${fmt(shipment.expected_sales_before_arrival)} + ${fmt(shipment.qty)} = ${fmt(shipment.projected_stock)} projected, target ${fmt(shipment.required_qty)}
                        </div>
                    </div>
                `).join('')}
            </div>

            ${sku.shipment_count > 1 ? `
                <div class="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
                    <span class="font-medium">Average per shipment:</span> ${sku.avg_qty} units
                </div>
            ` : ''}
        </div>
    `).join('');

    // Re-initialize Lucide icons for the new content
    lucide.createIcons();
}

// ----------------------------------------------------------
// Status badge HTML
// ----------------------------------------------------------
function statusBadge(status) {
    const map = {
        "Healthy":          "badge-healthy",
        "Low Stock":        "badge-low",
        "Critical":         "badge-critical",
        "Overstock":        "badge-overstock",
        "Excess Inventory": "badge-excess",
        "Dead Stock":       "badge-dead",
    };
    const cls = map[status] || "badge-dead";
    return `<span class="badge ${cls}">${status}</span>`;
}

// ----------------------------------------------------------
// Filters + sorting + rendering
// ----------------------------------------------------------
function applyFiltersAndRender() {
    const skuQ    = $("#search-sku").value.trim().toLowerCase();
    const asinQ   = $("#search-asin").value.trim().toLowerCase();
    const statusQ = $("#filter-status").value;

    state.filtered = state.rows.filter(r => {
        if (skuQ    && !String(r.SKU).toLowerCase().includes(skuQ))     return false;
        if (asinQ   && !String(r.ASIN).toLowerCase().includes(asinQ))    return false;
        if (statusQ && r.Status !== statusQ)                              return false;
        return true;
    });

    // Sort
    const key = state.sortKey, dir = state.sortDir === "asc" ? 1 : -1;
    state.filtered.sort((a, b) => {
        const va = a[key], vb = b[key];
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
    });

    // Reset page if filter shrank result
    const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page > maxPage) state.page = maxPage;

    renderTable();
}

function renderTable() {
    const body  = $("#data-table-body");
    const start = (state.page - 1) * state.pageSize;
    const end   = start + state.pageSize;
    const page  = state.filtered.slice(start, end);

    if (page.length === 0) {
        body.innerHTML = `
            <tr><td colspan="15" class="td text-center text-slate-400 py-8">
                No SKUs match the current filters.
            </td></tr>`;
    } else {
        body.innerHTML = page.map(r => `
            <tr>
                <td class="td font-semibold text-slate-900">${escapeHtml(r.SKU)}</td>
                <td class="td">${escapeHtml(r.ASIN)}</td>
                <td class="td">${escapeHtml(r.FNSKU)}</td>
                <td class="td text-right">${fmt(r["45 Days Sales"])}</td>
                <td class="td text-right">${r["Daily Sales"].toFixed(2)}</td>
                <td class="td text-right">${fmt(r["Current FBA Stock"])}</td>
                <td class="td text-right">${fmt(r["Incoming Shipment Qty"])}</td>
                <td class="td text-right">${fmt(r["Lead Time"])}</td>
                <td class="td text-right">${fmt(r["Stock Before Arrival"])}</td>
                <td class="td text-right font-semibold">${fmt(r["Projected Stock"])}</td>
                <td class="td text-right">${fmt(r["Required Qty"])}</td>
                <td class="td text-right ${r["Excess Qty"] > 0 ? "text-rose-600 font-semibold" : ""}">
                    ${fmt(r["Excess Qty"])}
                </td>
                <td class="td text-right">${r["Days Cover"] >= 999 ? "∞" : r["Days Cover"]}</td>
                <td class="td">${statusBadge(r.Status)}</td>
                <td class="td text-right font-semibold text-emerald-700">${fmt(r["Recommended Shipment Qty"])}</td>
            </tr>`).join("");
    }

    // Counts + paging
    $("#table-count").textContent = state.filtered.length.toLocaleString();
    const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    $("#page-info").textContent = `${state.page} / ${maxPage}`;
    $("#page-prev").disabled = state.page <= 1;
    $("#page-next").disabled = state.page >= maxPage;
    $("#table-info").textContent =
        state.filtered.length === 0
            ? "No matching SKUs"
            : `Showing ${start + 1}–${Math.min(end, state.filtered.length)} of ${state.filtered.length}`;

    // Sort indicators in header
    $$("#data-table th.sortable").forEach(th => {
        th.classList.toggle("sorted", th.dataset.key === state.sortKey);
        let arrow = th.querySelector(".sort-indicator");
        if (!arrow) {
            arrow = document.createElement("span");
            arrow.className = "sort-indicator";
            th.appendChild(arrow);
        }
        arrow.textContent =
            th.dataset.key === state.sortKey
                ? state.sortDir === "asc" ? "▲" : "▼"
                : "↕";
    });
}

// Numeric formatter with thousand separators
function fmt(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString();
}

// Basic HTML escaper to prevent injection from filename/SKU
function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ----------------------------------------------------------
// Filter / search listeners
// ----------------------------------------------------------
["#search-sku", "#search-asin", "#filter-status"].forEach(id => {
    $(id).addEventListener("input", () => {
        state.page = 1;
        applyFiltersAndRender();
    });
});

// ----------------------------------------------------------
// Sorting on headers
// ----------------------------------------------------------
$$("#data-table th.sortable").forEach(th => {
    th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) {
            state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
            state.sortKey = key;
            state.sortDir = "desc";
        }
        applyFiltersAndRender();
    });
});

// ----------------------------------------------------------
// Pagination
// ----------------------------------------------------------
$("#page-prev").addEventListener("click", () => {
    if (state.page > 1) { state.page--; renderTable(); }
});
$("#page-next").addEventListener("click", () => {
    const maxPage = Math.ceil(state.filtered.length / state.pageSize);
    if (state.page < maxPage) { state.page++; renderTable(); }
});

// ----------------------------------------------------------
// Downloads
// ----------------------------------------------------------
$$(".download-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (!state.sessionId) {
            showToast("Run an analysis first.", "error");
            return;
        }
        const kind = btn.dataset.kind;
        window.location.href = `/api/download/${kind}/${state.sessionId}`;
    });
});

// ----------------------------------------------------------
// Init
// ----------------------------------------------------------
updateLeadTime();
