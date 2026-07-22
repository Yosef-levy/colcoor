/** HTML for the hideable/resumable list-agent job progress panel. */
export function getListAgentJobPanelHtml(cspSource: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Colcoor list agent job</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px 16px 24px; }
    h1 { font-size: 1.1rem; margin: 0 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 12px; }
    .row { margin: 6px 0; }
    .log { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 0.85em; max-height: 280px; overflow: auto; border: 1px solid var(--vscode-widget-border); padding: 8px; margin: 8px 0 12px; }
    .proposals { list-style: none; padding: 0; margin: 0 0 12px; }
    .proposals li { border: 1px solid var(--vscode-widget-border); padding: 8px; margin: 0 0 8px; }
    .proposals label { display: flex; gap: 8px; align-items: flex-start; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button:disabled { opacity: 0.5; cursor: default; }
    .err { color: var(--vscode-errorForeground); white-space: pre-wrap; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 0.85em; }
    .hint { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin: 4px 0 8px; }
  </style>
</head>
<body>
  <h1>List agent job</h1>
  <div class="meta" id="meta">Loading…</div>
  <div class="row">Status: <span class="badge" id="status">—</span> · Phase: <span id="phase">—</span></div>
  <div class="row" id="scanRow">Scan: <span id="scan">—</span></div>
  <div class="row err" id="error" hidden></div>
  <h2 style="font-size:1rem">Progress</h2>
  <div class="log" id="log"></div>
  <h2 style="font-size:1rem">Semantic review</h2>
  <p class="hint" id="reviewHint">Waiting for verified proposals…</p>
  <ul class="proposals" id="proposals"></ul>
  <div class="actions">
    <button type="button" id="btnCommit" disabled>Commit accepted</button>
    <button type="button" class="secondary" id="btnCancel">Cancel run</button>
    <button type="button" class="secondary" id="btnRefresh">Reload from disk</button>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const logEl = document.getElementById("log");
    const proposalsEl = document.getElementById("proposals");
    const reviewHint = document.getElementById("reviewHint");
    let reviewRows = [];

    function appendLog(line) {
      if (!line) return;
      logEl.textContent += line + "\\n";
      logEl.scrollTop = logEl.scrollHeight;
    }

    function scanText(scan) {
      if (!scan || typeof scan !== "object") return "—";
      var covered = scan.covered != null ? scan.covered : scan.covered_lines;
      var total = scan.total != null ? scan.total : scan.total_lines;
      var complete = scan.complete === true;
      if (covered == null && total == null) return "—";
      return String(covered ?? 0) + " / " + String(total ?? 0) + (complete ? " (complete)" : "");
    }

    function renderReview(rows) {
      reviewRows = Array.isArray(rows) ? rows : [];
      proposalsEl.replaceChildren();
      var verifiedCount = reviewRows.filter(function (r) { return r.status === "verified"; }).length;
      var invalidCount = reviewRows.filter(function (r) { return r.status === "invalid"; }).length;
      document.getElementById("btnCommit").disabled = verifiedCount === 0;
      if (reviewRows.length === 0) {
        reviewHint.textContent = "No proposals loaded yet. If the job is ready_for_review, click Reload from disk.";
        return;
      }
      reviewHint.textContent =
        reviewRows.length + " proposal(s): " + verifiedCount + " verified, " + invalidCount +
        " invalid. Uncheck items to reject before commit.";
      for (var i = 0; i < reviewRows.length; i++) {
        var row = reviewRows[i];
        var li = document.createElement("li");
        var st = String(row.status || "");
        var p = row.proposal || {};
        if (st === "verified" || st === "accepted") {
          var checked = st !== "rejected" ? " checked" : "";
          li.innerHTML = "<label><input type=\\"checkbox\\" data-pid=\\"" + esc(p.proposal_id) + "\\"" + checked + " />" +
            "<span><strong>" + esc(p.proposal_id) + "</strong> [" + esc(st) + "] " + esc(p.selected_text || "") +
            "<br/><span style=\\"opacity:0.8\\">" + esc(p.reason || "") + " · event " + esc(p.event_id || "") + "</span></span></label>";
        } else {
          li.innerHTML = "<div><strong>" + esc(p.proposal_id || "") + "</strong> [" + esc(st) + "] " +
            esc(p.selected_text || "") + (row.failure_reason ? " · " + esc(row.failure_reason) : "") +
            (p.reason ? "<br/><span style=\\"opacity:0.8\\">" + esc(p.reason) + "</span>" : "") + "</div>";
        }
        proposalsEl.appendChild(li);
      }
    }

    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function applySnapshot(m) {
      document.getElementById("meta").textContent =
        (m.kind || "") + " · " + (m.jobId || "") + " · " + (m.conversationId || "");
      document.getElementById("status").textContent = m.status || "—";
      document.getElementById("phase").textContent = m.phase || "—";
      document.getElementById("scan").textContent = scanText(m.scan);
      var errEl = document.getElementById("error");
      if (m.error) {
        errEl.hidden = false;
        errEl.textContent = m.error;
      } else {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (typeof m.runLog === "string" && m.runLog.length) {
        logEl.textContent = m.runLog;
        logEl.scrollTop = logEl.scrollHeight;
      }
      if (Array.isArray(m.rows)) {
        renderReview(m.rows);
      } else if (m.status === "ready_for_review" || m.status === "needs_user_decision") {
        reviewHint.textContent = "Job is " + m.status + " but verification rows were not found. Try Reload from disk.";
      }
    }

    window.addEventListener("message", function (ev) {
      var m = ev.data || {};
      if (m.type === "jobSnapshot") {
        applySnapshot(m);
      } else if (m.type === "progressEvent") {
        var e = m.event || {};
        if (e.type === "status") {
          document.getElementById("status").textContent = e.status || "—";
          document.getElementById("phase").textContent = e.phase || "—";
          appendLog("[status] " + e.status + " / " + e.phase);
        } else if (e.type === "progress") {
          appendLog("[progress] " + String(e.message || ""));
        } else if (e.type === "display_part") {
          appendLog(String(e.text || "").slice(0, 2000));
        } else if (e.type === "tool_activity") {
          appendLog("[tool] " + String(e.text || "").slice(0, 2000));
        } else if (e.type === "scan") {
          document.getElementById("scan").textContent = scanText(e);
          appendLog("[scan] " + (e.covered ?? 0) + "/" + (e.total ?? 0));
        } else if (e.type === "verification") {
          appendLog("[verify] " + e.summary);
        } else if (e.type === "repair") {
          appendLog("[repair] round " + e.round);
        } else if (e.type === "ready_for_review") {
          document.getElementById("status").textContent = "ready_for_review";
          document.getElementById("phase").textContent = "ready_for_review";
          renderReview(e.rows || []);
          appendLog("[review] ready (" + ((e.rows && e.rows.length) || 0) + " rows)");
        } else if (e.type === "completed") {
          appendLog("[done] " + (e.message || ""));
          document.getElementById("status").textContent = "completed";
          document.getElementById("phase").textContent = "completed";
        } else if (e.type === "error") {
          var err = document.getElementById("error");
          err.hidden = false;
          err.textContent = e.message || "error";
          appendLog("[error] " + e.message);
        }
      }
    });

    document.getElementById("btnCancel").addEventListener("click", function () {
      vscode.postMessage({ type: "cancelJob" });
    });
    document.getElementById("btnRefresh").addEventListener("click", function () {
      vscode.postMessage({ type: "reloadJob" });
    });
    document.getElementById("btnCommit").addEventListener("click", function () {
      var accepted = [];
      var rejected = [];
      var boxes = proposalsEl.querySelectorAll("input[type=checkbox][data-pid]");
      boxes.forEach(function (box) {
        var pid = box.getAttribute("data-pid");
        if (box.checked) accepted.push(pid);
        else rejected.push(pid);
      });
      vscode.postMessage({ type: "commitReview", acceptedIds: accepted, rejectedIds: rejected });
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
