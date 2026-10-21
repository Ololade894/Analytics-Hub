const ROLES = {
  operator: {
    label: "Operator",
    blurb:
      "Queue depth, service health, and paging noise for the on-shift desk.",
    kpis: ["throughput", "errorRate", "openIncidents", "ackLag"],
    widgets: [
      { id: "health", type: "health", size: "md" },
      { id: "queues", type: "queues", size: "md" },
      { id: "traffic", type: "series", metric: "rps", size: "lg" },
      { id: "feed", type: "feed", size: "md" },
      { id: "endpoints", type: "endpoints", size: "md" },
    ],
    catalog: ["health", "queues", "series", "feed", "endpoints", "oncall"],
  },
  commander: {
    label: "Incident commander",
    blurb:
      "Severity, comms, error budget burn, and who is on call during an event.",
    kpis: ["openIncidents", "sev1", "errorBudget", "mttr"],
    widgets: [
      { id: "feed", type: "feed", size: "lg" },
      { id: "oncall", type: "oncall", size: "md" },
      { id: "budget", type: "budget", size: "md" },
      { id: "errors", type: "series", metric: "errors", size: "xl" },
    ],
    catalog: ["feed", "oncall", "budget", "series", "health", "regions"],
  },
  sre: {
    label: "SRE",
    blurb:
      "Latency, saturation, deploy markers, and SLO burn for platform owners.",
    kpis: ["p99", "cpu", "errorBudget", "deployFail"],
    widgets: [
      { id: "latency", type: "series", metric: "p99", size: "lg" },
      { id: "sat", type: "saturation", size: "md" },
      { id: "budget", type: "budget", size: "md" },
      { id: "deploys", type: "deploys", size: "md" },
      { id: "regions", type: "regions", size: "md" },
    ],
    catalog: [
      "series",
      "saturation",
      "budget",
      "deploys",
      "regions",
      "health",
      "endpoints",
    ],
  },
  exec: {
    label: "Executive viewer",
    blurb:
      "Availability and customer-facing impact only. No raw queues or logs.",
    kpis: ["availability", "affectedUsers", "openIncidents", "npsProxy"],
    widgets: [
      { id: "regions", type: "regions", size: "lg" },
      { id: "budget", type: "budget", size: "md" },
      { id: "health", type: "health", size: "md" },
      { id: "series", type: "series", metric: "availability", size: "xl" },
    ],
    catalog: ["regions", "budget", "health", "series"],
  },
};

const WIDGET_META = {
  health: { title: "Service health", hint: "Core dependencies" },
  queues: { title: "Queue depth", hint: "Workers behind" },
  series: { title: "Live timeseries", hint: "1s sampled" },
  feed: { title: "Incident stream", hint: "Newest first" },
  endpoints: { title: "Hottest endpoints", hint: "By error share" },
  oncall: { title: "On-call", hint: "Primary / secondary" },
  budget: { title: "Error budget", hint: "30-day window" },
  saturation: { title: "Saturation", hint: "CPU · mem · IO" },
  deploys: { title: "Deploy activity", hint: "Last 12 hours" },
  regions: { title: "Regional availability", hint: "Customer path" },
};

const SERVICES = [
  ["checkout-api", "ok"],
  ["payments", "ok"],
  ["identity", "degraded"],
  ["search", "ok"],
  ["notify", "ok"],
  ["inventory", "ok"],
];

const REGIONS = ["us-east", "us-west", "eu-west", "ap-south"];
const ENVS = ["prod", "staging", "canary"];
const STORAGE_KEY = "analytics-hub.v1";

const KPI_LABELS = {
  throughput: "Throughput",
  errorRate: "Error rate",
  openIncidents: "Open incidents",
  ackLag: "Ack lag",
  sev1: "SEV-1",
  errorBudget: "Error budget",
  mttr: "MTTR",
  p99: "Latency p99",
  cpu: "CPU",
  deployFail: "Failed deploys",
  availability: "Availability",
  affectedUsers: "Affected users",
  npsProxy: "NPS proxy",
};

const state = {
  role: "operator",
  env: "prod",
  view: "dashboard",
  editing: false,
  theme: "dark",
  layouts: {},
  series: { rps: [], errors: [], p99: [], availability: [] },
  snapshot: null,
};

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pushPoint(key, value) {
  const arr = state.series[key];
  arr.push(value);
  if (arr.length > 48) arr.shift();
}

function tickMetrics() {
  const envFactor =
    state.env === "prod" ? 1 : state.env === "canary" ? 0.35 : 0.18;
  const rps = Math.round(420 * envFactor + rand(-40, 80));
  const errors = Math.max(
    0,
    Math.round(rps * (state.env === "prod" ? 0.012 : 0.03) + rand(-3, 6)),
  );
  const p99 = +(180 + rand(-20, 90)).toFixed(0);
  const availability = +(99.9 - errors / 80).toFixed(3);
  pushPoint("rps", rps);
  pushPoint("errors", errors);
  pushPoint("p99", p99);
  pushPoint("availability", availability);

  const incidents = buildIncidents(errors);
  state.snapshot = {
    rps,
    errors,
    errorRate: +((errors / Math.max(rps, 1)) * 100).toFixed(2),
    p99,
    availability,
    cpu: +(48 + rand(-8, 22)).toFixed(0),
    mem: +(61 + rand(-10, 14)).toFixed(0),
    io: +(33 + rand(-12, 18)).toFixed(0),
    openIncidents: incidents.filter((i) => i.status !== "resolved").length,
    sev1: incidents.filter((i) => i.sev === "SEV-1").length,
    ackLag: Math.round(rand(12, 95)),
    mttr: Math.round(rand(18, 54)),
    errorBudget: Math.max(4, +(28 - errors / 3).toFixed(1)),
    deployFail: Math.round(rand(0, 2)),
    affectedUsers: Math.round(errors * rand(40, 90)),
    npsProxy: +(62 + rand(-3, 4)).toFixed(1),
    queues: [
      ["checkout.jobs", Math.round(rand(20, 240))],
      ["mail.outbound", Math.round(rand(4, 90))],
      ["search.reindex", Math.round(rand(0, 40))],
      ["webhooks.retry", Math.round(rand(8, 160))],
    ],
    endpoints: [
      ["/v1/checkout", rand(0.2, 4.1)],
      ["/v1/search", rand(0.1, 2.2)],
      ["/v1/session", rand(0.05, 1.4)],
      ["/internal/sync", rand(0.4, 5.5)],
    ],
    incidents,
    deploys: [
      ["payments 2.14.3", "ok", "08:12"],
      ["identity 9.2.1", "warn", "07:40"],
      ["edge 1.8.0", "ok", "06:02"],
    ],
    oncall: [
      ["Primary", "A. Okonkwo", "SRE"],
      ["Secondary", "M. Chen", "Platform"],
      ["Exec sponsor", "R. Adeyemi", "Ops"],
    ],
    regions: REGIONS.map((r) => ({
      name: r,
      up: +(99.2 + rand(0, 0.79)).toFixed(2),
    })),
  };

  document.getElementById("tickStamp").textContent =
    "Last tick " + new Date().toLocaleTimeString();
  render({ live: true });
}

function buildIncidents(errors) {
  const base = [
    {
      id: "INC-1042",
      sev: "SEV-2",
      title: "Identity token latency elevated",
      status: "mitigating",
    },
    {
      id: "INC-1041",
      sev: "SEV-3",
      title: "Webhook retries backing up",
      status: "investigating",
    },
    {
      id: "INC-1038",
      sev: "SEV-4",
      title: "Canary log volume spike",
      status: "watching",
    },
  ];
  if (errors > 12) {
    base.unshift({
      id: "INC-1049",
      sev: "SEV-1",
      title: "Checkout error budget burning",
      status: "active",
    });
  }
  return base;
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.role = raw.role || "operator";
    state.env = raw.env || "prod";
    state.theme = raw.theme || "dark";
    state.layouts = raw.layouts || {};
  } catch {
    state.layouts = {};
  }
  document.documentElement.dataset.theme = state.theme;
}

function savePrefs() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      role: state.role,
      env: state.env,
      theme: state.theme,
      layouts: state.layouts,
    }),
  );
}

function layoutForRole() {
  if (!state.layouts[state.role]) {
    state.layouts[state.role] = ROLES[state.role].widgets.map((w) => ({
      ...w,
    }));
  }
  return state.layouts[state.role];
}

function kpiValue(key) {
  const s = state.snapshot;
  if (!s) return "—";
  const map = {
    throughput: s.rps + " rps",
    errorRate: s.errorRate + "%",
    openIncidents: s.openIncidents,
    ackLag: s.ackLag + "s",
    sev1: s.sev1,
    errorBudget: s.errorBudget + "%",
    mttr: s.mttr + "m",
    p99: s.p99 + "ms",
    cpu: s.cpu + "%",
    deployFail: s.deployFail,
    availability: s.availability + "%",
    affectedUsers: s.affectedUsers.toLocaleString(),
    npsProxy: s.npsProxy,
  };
  return map[key];
}

function kpiDelta(key) {
  if (["errorRate", "openIncidents", "sev1", "ackLag"].includes(key))
    return "down";
  return "up";
}

function renderKpis() {
  const keys = ROLES[state.role].kpis;
  document.getElementById("kpiStrip").innerHTML = keys
    .map((key) => {
      const dir = kpiDelta(key);
      return `<article class="kpi">
        <div class="label">${KPI_LABELS[key] || key}</div>
        <div class="value">${kpiValue(key)}</div>
        <div class="delta ${dir}">live · ${state.env}</div>
      </article>`;
    })
    .join("");
}

function drawSeries(canvas, points, color) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const wrap = canvas.parentElement;
  const w = Math.max(wrap ? wrap.clientWidth : 0, canvas.clientWidth, 240);
  const h = 140;
  canvas.style.width = "100%";
  canvas.style.height = h + "px";
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (points.length < 2) return;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 8) - 4;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function widgetBody(widget) {
  const s = state.snapshot;
  if (!s) return "<p class='hint'>Connecting…</p>";
  if (widget.type === "health") {
    return `<div class="health-grid">${SERVICES.map(([name, status]) => {
      const st = name === "identity" && s.errors > 8 ? "degraded" : status;
      return `<div class="health-card"><span class="dot ${st}"></span>${name}<div class="hint">${st}</div></div>`;
    }).join("")}</div>`;
  }
  if (widget.type === "queues") {
    const max = Math.max(...s.queues.map((q) => q[1]), 1);
    return `<div class="bars">${s.queues
      .map(
        ([n, v]) =>
          `<div class="bar-row"><span>${n}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><span>${v}</span></div>`,
      )
      .join("")}</div>`;
  }
  if (widget.type === "series") {
    return `<canvas data-metric="${widget.metric || "rps"}"></canvas>`;
  }
  if (widget.type === "feed") {
    return `<div class="feed">${s.incidents
      .map(
        (i) =>
          `<div class="feed-item"><span class="sev sev-${i.sev === "SEV-1" ? "sew" : i.sev === "SEV-2" ? "high" : "med"}">${i.sev}</span><span>${i.title}</span><span class="hint">${i.status}</span></div>`,
      )
      .join("")}</div>`;
  }
  if (widget.type === "endpoints") {
    return `<div class="bars">${s.endpoints
      .map(
        ([n, v]) =>
          `<div class="bar-row"><span>${n}</span><div class="track"><div class="fill" style="width:${Math.min(v * 16, 100)}%"></div></div><span>${v.toFixed(1)}%</span></div>`,
      )
      .join("")}</div>`;
  }
  if (widget.type === "oncall") {
    return s.oncall
      .map(
        ([role, name, team]) =>
          `<div class="feed-item"><span class="hint">${role}</span><strong>${name}</strong><span>${team}</span></div>`,
      )
      .join("");
  }
  if (widget.type === "budget") {
    const left = s.errorBudget;
    return `<div class="value" style="font-size:32px;font-weight:700">${left}%</div>
      <div class="burn"><div class="fill" style="width:${left}%;background:${left < 15 ? "var(--danger)" : "var(--accent)"}"></div></div>
      <p class="hint">Remaining this period. ${ROLES[state.role].label} sees ${state.role === "exec" ? "customer SLOs only" : "service-level burn"}.</p>`;
  }
  if (widget.type === "saturation") {
    return `<div class="bars">${[
      ["CPU", s.cpu],
      ["Memory", s.mem],
      ["Disk IO", s.io],
    ]
      .map(
        ([n, v]) =>
          `<div class="bar-row"><span>${n}</span><div class="track"><div class="fill" style="width:${v}%"></div></div><span>${v}%</span></div>`,
      )
      .join("")}</div>`;
  }
  if (widget.type === "deploys") {
    return s.deploys
      .map(
        ([n, st, t]) =>
          `<div class="feed-item"><span class="dot ${st === "ok" ? "ok" : "degraded"}"></span><span>${n}</span><span class="hint">${t}</span></div>`,
      )
      .join("");
  }
  if (widget.type === "regions") {
    return `<div class="bars">${s.regions
      .map(
        (r) =>
          `<div class="bar-row"><span>${r.name}</span><div class="track"><div class="fill" style="width:${(r.up - 99) * 80}%"></div></div><span>${r.up}%</span></div>`,
      )
      .join("")}</div>`;
  }
  return "";
}

function widgetHtml(widget) {
  const meta = WIDGET_META[widget.type];
  const title =
    widget.type === "series" ? `Live ${widget.metric || "rps"}` : meta.title;
  return `<article class="widget size-${widget.size}" draggable="${state.editing}" data-id="${widget.id}">
    <div class="widget-head">
      <div>
        <h3>${title}</h3>
        <div class="hint">${meta.hint}</div>
      </div>
      <div class="widget-tools">
        <button class="size-btn" data-act="size" data-id="${widget.id}">Size</button>
        <button class="remove-btn" data-act="remove" data-id="${widget.id}">Remove</button>
      </div>
    </div>
    <div class="widget-body">${widgetBody(widget)}</div>
  </article>`;
}

function paintCharts(board) {
  board.querySelectorAll("canvas[data-metric]").forEach((c) => {
    const metric = c.dataset.metric;
    const color =
      metric === "errors"
        ? "#ff6b7a"
        : getComputedStyle(document.documentElement)
            .getPropertyValue("--accent")
            .trim();
    drawSeries(c, state.series[metric] || state.series.rps, color || "#3ee0c5");
  });
}

function boardSignature() {
  return (
    state.role +
    ":" +
    layoutForRole()
      .map((w) => w.id + w.size)
      .join(",")
  );
}

function renderBoard(force) {
  const board = document.getElementById("board");
  const signature = boardSignature();
  if (force || board.dataset.sig !== signature) {
    board.innerHTML = layoutForRole().map(widgetHtml).join("");
    board.dataset.sig = signature;
    bindBoardEvents();
  } else {
    layoutForRole().forEach((w) => {
      const body = board.querySelector(`[data-id="${w.id}"] .widget-body`);
      if (body) body.innerHTML = widgetBody(w);
    });
  }
  board.querySelectorAll(".widget").forEach((el) => {
    el.draggable = state.editing;
  });
  requestAnimationFrame(() => paintCharts(board));
}

function bindBoardEvents() {
  const board = document.getElementById("board");
  board.querySelectorAll("[data-act='remove']").forEach((btn) => {
    btn.onclick = () => {
      state.layouts[state.role] = layoutForRole().filter(
        (w) => w.id !== btn.dataset.id,
      );
      savePrefs();
      renderBoard(true);
    };
  });
  board.querySelectorAll("[data-act='size']").forEach((btn) => {
    btn.onclick = () => {
      const order = ["sm", "md", "lg", "xl"];
      const w = layoutForRole().find((x) => x.id === btn.dataset.id);
      w.size = order[(order.indexOf(w.size) + 1) % order.length];
      savePrefs();
      renderBoard(true);
    };
  });
  let dragId = null;
  board.querySelectorAll(".widget").forEach((el) => {
    el.ondragstart = () => {
      if (!state.editing) return;
      dragId = el.dataset.id;
      el.classList.add("is-dragging");
    };
    el.ondragend = () => el.classList.remove("is-dragging");
    el.ondragover = (e) => e.preventDefault();
    el.ondrop = (e) => {
      e.preventDefault();
      if (!dragId || dragId === el.dataset.id) return;
      const layout = layoutForRole();
      const from = layout.findIndex((w) => w.id === dragId);
      const to = layout.findIndex((w) => w.id === el.dataset.id);
      const [moved] = layout.splice(from, 1);
      layout.splice(to, 0, moved);
      savePrefs();
      renderBoard(true);
    };
  });
}

function renderIncidents() {
  const s = state.snapshot;
  if (!s) return;
  document.getElementById("incidentCount").textContent = String(
    s.incidents.length,
  );
  document.getElementById("incidentTable").innerHTML = s.incidents
    .map(
      (i) =>
        `<div class="table-row"><span class="sev">${i.id}</span><span>${i.title}</span><span>${i.sev} · ${i.status}</span></div>`,
    )
    .join("");
}

function renderSlo() {
  const s = state.snapshot;
  if (!s) return;
  const items = [
    ["Checkout availability", s.availability, 99.9],
    ["Identity latency SLO", Math.max(90, 100 - s.p99 / 20), 99],
    ["Notifications success", 99.4, 99.5],
  ];
  document.getElementById("sloGrid").innerHTML = items
    .map(
      ([name, actual, target]) => `<article class="slo-card">
        <h3>${name}</h3>
        <p class="hint">Target ${target}%</p>
        <div class="value" style="font-size:28px;font-weight:700">${(+actual).toFixed(2)}%</div>
        <div class="burn"><div class="fill" style="width:${Math.min(100, actual)}%"></div></div>
      </article>`,
    )
    .join("");
}

function renderCatalog() {
  const allowed = ROLES[state.role].catalog;
  document.getElementById("catalog").innerHTML = allowed
    .map((type) => {
      const meta = WIDGET_META[type];
      return `<article class="catalog-card">
        <h3>${meta.title}</h3>
        <p class="hint">${meta.hint}</p>
        <button class="add-btn" data-add="${type}">Add to board</button>
      </article>`;
    })
    .join("");
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.onclick = () => {
      const type = btn.dataset.add;
      layoutForRole().push({
        id: type + "-" + Math.random().toString(36).slice(2, 7),
        type,
        size: "md",
        metric:
          type === "series"
            ? state.role === "sre"
              ? "p99"
              : "rps"
            : undefined,
      });
      savePrefs();
      state.view = "dashboard";
      render({ forceBoard: true });
    };
  });
}

function renderChrome(live) {
  const roleSelect = document.getElementById("roleSelect");
  if (!roleSelect.dataset.ready) {
    roleSelect.innerHTML = Object.entries(ROLES)
      .map(([id, r]) => `<option value="${id}">${r.label}</option>`)
      .join("");
    roleSelect.dataset.ready = "1";
    roleSelect.onchange = () => {
      state.role = roleSelect.value;
      savePrefs();
      render({ forceBoard: true });
    };
  }
  roleSelect.value = state.role;
  document.getElementById("roleBlurb").textContent = ROLES[state.role].blurb;

  const chips = document.getElementById("envChips");
  if (!chips.dataset.ready) {
    chips.innerHTML = ENVS.map(
      (env) => `<button class="chip" data-env="${env}">${env}</button>`,
    ).join("");
    chips.dataset.ready = "1";
    chips.querySelectorAll("[data-env]").forEach((btn) => {
      btn.onclick = () => {
        state.env = btn.dataset.env;
        savePrefs();
        tickMetrics();
      };
    });
  }
  chips.querySelectorAll("[data-env]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.env === state.env);
  });

  document
    .getElementById("editToggle")
    .classList.toggle("is-on", state.editing);
  document
    .getElementById("editBanner")
    .classList.toggle("hidden", !state.editing);
  document.querySelector(".app").classList.toggle("is-editing", state.editing);
  document.documentElement.dataset.theme = state.theme;
  if (!live) renderCatalog();
}

function syncNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === state.view);
  });
  document.querySelectorAll(".page").forEach((page) => {
    const on = page.id === "view-" + state.view;
    page.classList.toggle("is-active", on);
    page.hidden = !on;
  });
  const titles = {
    dashboard: [
      "Command board",
      "Realtime service health for the selected role.",
    ],
    incidents: ["Incidents", "Active operational events visible to this role."],
    slo: [
      "SLO & error budget",
      "Customer-facing objectives and remaining budget.",
    ],
    catalog: [
      "Widget catalog",
      "Add role-permitted widgets to the command board.",
    ],
  };
  document.getElementById("pageTitle").textContent = titles[state.view][0];
  document.getElementById("pageSubtitle").textContent = titles[state.view][1];
}

function render(opts = {}) {
  renderChrome(opts.live);
  syncNav();
  renderKpis();
  renderBoard(opts.forceBoard);
  renderIncidents();
  renderSlo();
}

function boot() {
  loadPrefs();
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      state.view = btn.dataset.view;
      render();
    };
  });
  document.getElementById("editToggle").onclick = () => {
    state.editing = !state.editing;
    render();
  };
  document.getElementById("resetLayout").onclick = () => {
    state.layouts[state.role] = ROLES[state.role].widgets.map((w) => ({
      ...w,
    }));
    savePrefs();
    render({ forceBoard: true });
  };
  document.getElementById("themeToggle").onclick = () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    savePrefs();
    render();
  };
  tickMetrics();
  setInterval(tickMetrics, 1600);
}

boot();
