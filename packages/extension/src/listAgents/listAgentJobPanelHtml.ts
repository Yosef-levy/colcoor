/** HTML for the hideable/resumable list-agent job progress panel. */
export function getListAgentJobPanelHtml(cspSource: string, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce};" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Colcoor list agent job</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 12px 16px 24px; }
    h1 { font-size: 1.1rem; margin: 0 0 8px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 12px; }
    .row { margin: 6px 0; }
    .log { white-space: pre-wrap; font-family: var(--vscode-editor-font-family); font-size: 0.85em; max-height: 240px; overflow: auto; border: 1px solid var(--vscode-widget-border); padding: 8px; margin: 8px 0 12px; }
    .proposals { list-style: none; padding: 0; margin: 0 0 12px; }
    .proposals li { border: 1px solid var(--vscode-widget-border); padding: 8px; margin: 0 0 8px; }
    .proposals label { display: flex; gap: 8px; align-items: flex-start; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 12px; cursor: pointer; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .err { color: var(--vscode-errorForeground); }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 0.85em; }
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
    let reviewRows = [];

    function appendLog(line) {
      logEl.textContent += line + "\\n";
      logEl.scrollTop = logEl.scrollHeight;
    }

    function renderReview(rows) {
      reviewRows = Array.isArray(rows) ? rows : [];
      proposalsEl.replaceChildren();
      const canReview = reviewRows.some((r) => r.status === "verified" || r.status === "invalid");
      document.getElementById("btnCommit").disabled = !reviewRows.some((r) => r.status === "verified");
      for (const row of reviewRows) {
        const li = document.createElement("li");
        const st = String(row.status || "");
        const p = row.proposal || {};
        if (st === "verified") {
          li.innerHTML = "<label><input type=\\"checkbox\\" data-pid=\\"" + esc(p.proposal_id) + "\\" checked />" +
            "<span><strong>" + esc(p.proposal_id) + "</strong> [" + esc(st) + "] " + esc(p.selected_text || "") +
            "<br/><span style=\\"opacity:0.8\\">" + esc(p.reason || "") + " · event " + esc(p.event_id || "") + "</span></span></label>";
        } else {
          li.innerHTML = "<div><strong>" + esc(p.proposal_id || "") + "</strong> [" + esc(st) + "] " +
            esc(p.selected_text || "") + (row.failure_reason ? " · " + esc(row.failure_reason) : "") + "</div>";
        }
        proposalsEl.appendChild(li);
      }
      void canReview;
    }

    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    window.addEventListener("message", (ev) => {
      const m = ev.data || {};
      if (m.type === "jobSnapshot") {
        document.getElementById("meta").textContent =
          (m.kind || "") + " · " + (m.jobId || "") + " · " + (m.conversationId || "");
        document.getElementById("status").textContent = m.status || "—";
        document.getElementById("phase").textContent = m.phase || "—";
        if (m.scan) {
          document.getElementById("scan").textContent =
            m.scan.covered + " / " + m.scan.total + (m.scan.complete ? " (complete)" : "");
        }
        if (m.error) {
          const e = document.getElementById("error");
          e.hidden = false;
          e.textContent = m.error;
        }
        if (m.runLog) {
          logEl.textContent = m.runLog;
        }
        if (m.rows) renderReview(m.rows);
      } else if (m.type === "progressEvent") {
        const e = m.event || {};
        if (e.type === "status") {
          document.getElementById("status").textContent = e.status || "—";
          document.getElementById("phase").textContent = e.phase || "—";
          appendLog("[status] " + e.status + " / " + e.phase);
        } else if (e.type === "progress" || e.type === "display_part" || e.type === "tool_activity") {
          appendLog(String(e.message || e.text || "").slice(0, 2000));
        } else if (e.type === "scan") {
          document.getElementById("scan").textContent =
            e.covered + " / " + e.total + (e.complete ? " (complete)" : "");
          appendLog("[scan] " + e.covered + "/" + e.total);
        } else if (e.type === "verification") {
          appendLog("[verify] " + e.summary);
        } else if (e.type === "repair") {
          appendLog("[repair] round " + e.round);
        } else if (e.type === "ready_for_review") {
          renderReview(e.rows || []);
          appendLog("[review] ready");
        } else if (e.type === "completed") {
          appendLog("[done] " + (e.message || ""));
          document.getElementById("status").textContent = "completed";
        } else if (e.type === "error") {
          const err = document.getElementById("error");
          err.hidden = false;
          err.textContent = e.message || "error";
          appendLog("[error] " + e.message);
        }
      }
    });

    document.getElementById("btnCancel").addEventListener("click", () => {
      vscode.postMessage({ type: "cancelJob" });
    });
    document.getElementById("btnRefresh").addEventListener("click", () => {
      vscode.postMessage({ type: "reloadJob" });
    });
    document.getElementById("btnCommit").addEventListener("click", () => {
      const accepted = [];
      const rejected = [];
      const boxes = proposalsEl.querySelectorAll("input[type=checkbox][data-pid]");
      boxes.forEach((box) => {
        const pid = box.getAttribute("data-pid");
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
