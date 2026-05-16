/**
 * Vanilla JS MCP App bootstrap (runs inside Claude Desktop's sandboxed iframe).
 * Implements the JSON-RPC-over-postMessage subset from the MCP Apps spec:
 * ui/initialize, ui/notifications/initialized, tools/call, ui/update-model-context,
 * ui/notifications/size-changed, ui/resource-teardown response.
 *
 * Kept as an ES5-style IIFE for maximum compatibility with strict CSP (no modules).
 *
 * Tool-result parsing must stay aligned with `explorerStructuredFromToolResult.ts`
 * (some hosts omit structuredContent and only send ok() text: summary + "\\n\\n" + JSON).
 */
export function buildExplorerBootScript(): string {
  return `(function () {
  "use strict";

  var ready = false;
  var pending = Object.create(null);
  var rpcId = 1;
  var state = null;
  var toolResultQueue = [];

  function post(data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(data, "*");
    }
  }

  function notify(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params || {} });
  }

  function rpc(method, params) {
    var id = rpcId++;
    return new Promise(function (resolve, reject) {
      pending[String(id)] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    });
  }

  function showError(msg) {
    var el = document.getElementById("err");
    if (!el) return;
    el.textContent = String(msg || "Error");
    el.hidden = false;
  }

  function clearError() {
    var el = document.getElementById("err");
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function extractText(content) {
    if (!Array.isArray(content)) return "Error";
    var out = [];
    for (var i = 0; i < content.length; i++) {
      if (content[i] && content[i].text) out.push(String(content[i].text));
    }
    return out.join("\\n") || "Error";
  }

  function parseJsonFromToolText(text) {
    if (text == null) return null;
    var t = String(text).trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch (e0) {
      var gap = t.indexOf("\n\n");
      if (gap >= 0) {
        try {
          return JSON.parse(t.slice(gap + 2).trim());
        } catch (e1) {}
      }
      var brace = t.indexOf("{");
      if (brace >= 0) {
        try {
          return JSON.parse(t.slice(brace));
        } catch (e2) {
          return null;
        }
      }
      return null;
    }
  }

  function structuredFromToolResult(params) {
    if (!params) return null;
    if (params.structuredContent) return params.structuredContent;
    var c = params.content;
    if (!Array.isArray(c)) return null;
    for (var j = 0; j < c.length; j++) {
      if (c[j] && c[j].type === "text" && c[j].text) {
        var parsed = parseJsonFromToolText(c[j].text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      }
    }
    return null;
  }

  function sortEvents(a, b) {
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  }

  function buildRows(events) {
    var byParent = Object.create(null);
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      var pk = e.parent_event_id ? String(e.parent_event_id) : "__root__";
      if (!byParent[pk]) byParent[pk] = [];
      byParent[pk].push(e);
    }
    for (var k in byParent) {
      if (Object.prototype.hasOwnProperty.call(byParent, k)) {
        byParent[k].sort(sortEvents);
      }
    }
    var rows = [];
    function walk(pk, depth) {
      var kids = byParent[pk] || [];
      for (var x = 0; x < kids.length; x++) {
        rows.push({ ev: kids[x], depth: depth });
        walk(String(kids[x].id), depth + 1);
      }
    }
    walk("__root__", 0);
    return rows;
  }

  function reportSize() {
    try {
      var el = document.getElementById("wrap") || document.body;
      var rect = el.getBoundingClientRect();
      var h = Math.ceil(Math.max(rect.height, el.scrollHeight || 0, 120));
      var w = Math.ceil(Math.max(rect.width, el.scrollWidth || 0, 320));
      notify("ui/notifications/size-changed", {
        width: Math.min(w, 960),
        height: Math.min(h, 900),
      });
    } catch (e) {}
  }

  function renderSide() {
    var host = document.getElementById("side");
    if (!host) return;
    var sc = state && state.side_chat;
    if (!sc || !Array.isArray(sc.messages) || sc.messages.length === 0) {
      host.innerHTML = "<p class=\\"muted\\">No side-chat messages in this slice (or side-chat disabled).</p>";
      return;
    }
    var html = [];
    for (var i = 0; i < sc.messages.length; i++) {
      var m = sc.messages[i];
      var who = m.author_display_name || m.author_user_id || m.kind || "?";
      var body = (m.body || "").slice(0, 240);
      html.push(
        '<div class=\\"srow\\"><span class=\\"mono\\">seq ' +
          esc(m.seq) +
          "</span> · " +
          esc(who) +
          '<div class=\\"snippet\\">' +
          esc(body) +
          "</div></div>",
      );
    }
    host.innerHTML = html.join("");
  }

  function renderAll() {
    clearError();
    var app = document.getElementById("app");
    if (!app || !state) return;

    var events = (state.tree && state.tree.events) || [];
    var activeId = state.caller_state && state.caller_state.active_event_id;
    var pathIds = Object.create(null);
    if (Array.isArray(state.active_path)) {
      for (var p = 0; p < state.active_path.length; p++) {
        pathIds[state.active_path[p].id] = true;
      }
    }
    var rows = buildRows(events);

    var parts = [];
    parts.push('<div class=\\"hdr\\">');
    parts.push('<div class=\\"title\\">Colcoor conversation explorer</div>');
    parts.push(
      '<div class=\\"mono sub\\">' + esc(state.conversation_id) + "</div>",
    );
    parts.push(
      '<p class=\\"hint\\">Click a main-thread event to pin your <strong>active branch</strong> via <span class=\\"mono\\">colcoor_set_active_event</span>. The host forwards <span class=\\"mono\\">ui/update-model-context</span> so Claude keeps the selection in context.</p>',
    );
    parts.push(
      '<div class=\\"actions\\"><button type=\\"button\\" id=\\"btnRefresh\\">Refresh tree + path</button></div>',
    );
    parts.push("</div>");

    parts.push('<h2>Main thread</h2>');
    parts.push('<div id=\\"tree\\" class=\\"tree\\"></div>');

    parts.push("<h2>Side chat</h2>");
    parts.push('<div id=\\"side\\" class=\\"side\\"></div>');
    parts.push(
      '<div class=\\"actions\\"><button type=\\"button\\" id=\\"btnMoreSide\\">Fetch newer side-chat (after max seq)</button></div>',
    );

    app.innerHTML = '<div id=\\"wrap\\">' + parts.join("") + "</div>";

    var treeEl = document.getElementById("tree");
    for (var r = 0; r < rows.length; r++) {
      (function (row) {
        var ev = row.ev;
        var line = document.createElement("div");
        line.className = "row";
        if (ev.id === activeId) line.classList.add("active");
        else if (pathIds[ev.id]) line.classList.add("onpath");
        line.style.paddingLeft = 8 + row.depth * 14 + "px";
        var kind = String(ev.kind || "").replace(/_/g, " ");
        line.innerHTML =
          '<span class=\\"pill\\">' +
          esc(kind) +
          '</span> <span class=\\"mono idtag\\">' +
          esc(ev.id) +
          "</span>" +
          (ev.starred ? " ★" : "") +
          '<div class=\\"snippet\\">' +
          esc((ev.content_text || "").slice(0, 200)) +
          "</div>";
        line.addEventListener("click", function () {
          onPick(String(ev.id));
        });
        treeEl.appendChild(line);
      })(rows[r]);
    }

    renderSide();

    document.getElementById("btnRefresh").addEventListener("click", refreshGraph);
    document.getElementById("btnMoreSide").addEventListener("click", loadMoreSide);

    setTimeout(reportSize, 0);
  }

  function applyToolResult(params) {
    if (!ready) {
      toolResultQueue.push(params);
      return;
    }
    if (params && params.isError) {
      showError(extractText(params.content));
      return;
    }
    var sc = structuredFromToolResult(params);
    if (!sc || !sc.tree) {
      showError("Unexpected tool result (missing structured graph payload).");
      return;
    }
    state = sc;
    renderAll();
  }

  function drainQueue() {
    while (toolResultQueue.length) {
      applyToolResult(toolResultQueue.shift());
    }
  }

  async function onPick(eventId) {
    var conv = state && state.conversation_id;
    if (!conv) return;
    try {
      clearError();
      var res = await rpc("tools/call", {
        name: "colcoor_set_active_event",
        arguments: {
          conversation_id: conv,
          active_event_id: eventId,
          needs_context_rebuild: false,
        },
      });
      if (res && res.isError) throw new Error(extractText(res.content));
      await afterActiveChanged();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }

  async function afterActiveChanged() {
    var conv = state.conversation_id;
    var resPath = await rpc("tools/call", {
      name: "colcoor_get_active_path",
      arguments: { conversation_id: conv },
    });
    if (resPath && resPath.isError) throw new Error(extractText(resPath.content));
    var sc = structuredFromToolResult(resPath);
    if (sc) {
      state.caller_state = sc.caller_state;
      state.active_path = sc.path || [];
    }
    var eventId = state.caller_state && state.caller_state.active_event_id;
    await rpc("ui/update-model-context", {
      content: [
        {
          type: "text",
          text:
            "Colcoor explorer: user pinned active branch at event " +
            String(eventId) +
            " in conversation " +
            String(conv) +
            ".",
        },
      ],
      structuredContent: {
        colcoor_conversation_id: conv,
        colcoor_active_event_id: eventId,
      },
    });
    renderAll();
  }

  async function refreshGraph() {
    var conv = state && state.conversation_id;
    if (!conv) return;
    try {
      clearError();
      var resT = await rpc("tools/call", {
        name: "colcoor_get_conversation_tree",
        arguments: { conversation_id: conv },
      });
      if (resT && resT.isError) throw new Error(extractText(resT.content));
      var resP = await rpc("tools/call", {
        name: "colcoor_get_active_path",
        arguments: { conversation_id: conv },
      });
      if (resP && resP.isError) throw new Error(extractText(resP.content));
      var st = structuredFromToolResult(resT);
      if (st) state.tree = st;
      var scp = structuredFromToolResult(resP);
      if (scp) {
        state.caller_state = scp.caller_state;
        state.active_path = scp.path || [];
      }
      renderAll();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }

  function maxSideSeq() {
    var sc = state && state.side_chat;
    if (!sc || !Array.isArray(sc.messages) || !sc.messages.length) {
      return sc ? sc.after_seq || 0 : 0;
    }
    var m = 0;
    for (var i = 0; i < sc.messages.length; i++) {
      if (sc.messages[i].seq > m) m = sc.messages[i].seq;
    }
    return m;
  }

  async function loadMoreSide() {
    var conv = state && state.conversation_id;
    if (!conv) return;
    try {
      clearError();
      var after = maxSideSeq();
      var res = await rpc("tools/call", {
        name: "colcoor_list_side_chat_messages",
        arguments: { conversation_id: conv, after_seq: after },
      });
      if (res && res.isError) throw new Error(extractText(res.content));
      var sc = structuredFromToolResult(res);
      var msgs = (sc && sc.messages) || [];
      if (!state.side_chat) state.side_chat = { messages: [], after_seq: after, limit: 50 };
      state.side_chat.after_seq = after;
      var merged = (state.side_chat.messages || []).concat(msgs);
      var lim = state.side_chat.limit || 50;
      if (merged.length > lim) merged.splice(0, merged.length - lim);
      state.side_chat.messages = merged;
      renderSide();
      reportSize();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.jsonrpc !== "2.0") return;

    if (d.method === "ui/resource-teardown" && typeof d.id !== "undefined") {
      post({ jsonrpc: "2.0", id: d.id, result: {} });
      return;
    }

    if (typeof d.id !== "undefined" && d.id !== null && pending[String(d.id)]) {
      var pr = pending[String(d.id)];
      delete pending[String(d.id)];
      if (d.error) pr.reject(new Error(d.error.message || "RPC error"));
      else pr.resolve(d.result);
      return;
    }

    if (d.method === "ui/notifications/tool-input") {
      return;
    }
    if (d.method === "ui/notifications/tool-input-partial") {
      return;
    }
    if (d.method === "ui/notifications/tool-result") {
      applyToolResult(d.params || {});
      return;
    }
    if (d.method === "ui/notifications/tool-cancelled") {
      showError("Tool cancelled: " + ((d.params && d.params.reason) || "unknown"));
      return;
    }
  });

  async function boot() {
    try {
      await rpc("ui/initialize", {
        appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
      });
      ready = true;
      notify("ui/notifications/initialized", {});
      drainQueue();
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    var ro = new ResizeObserver(function () {
      reportSize();
    });
    ro.observe(document.documentElement);
  } catch (e) {}
})();`;
}
