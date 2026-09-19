import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const showMessage = vi.hoisted(() => vi.fn());
vi.mock("vscode", () => ({
  window: { showInformationMessage: showMessage },
}));

import { runGeminiAcpTurn } from "./geminiAcpClient";

const roots: string[] = [];

async function fakeAgent(
  availableModes = ["default", "plan", "autoEdit", "yolo"],
  disconnectAfterPermission = false,
): Promise<{
  root: string;
  executable: string;
  marker: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "colcoor-acp-"));
  roots.push(root);
  const executable = path.join(root, "fake-gemini");
  const marker = path.join(root, "executed");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const modes = ${JSON.stringify(availableModes)};
let promptId;
const send = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.method === "initialize") send({jsonrpc:"2.0",id:m.id,result:{protocolVersion:m.params.protocolVersion,agentCapabilities:{loadSession:true}}});
  else if (m.method === "session/new") send({jsonrpc:"2.0",id:m.id,result:{sessionId:"sess-1",modes:{currentModeId:modes[0],availableModes:modes.map(id=>({id,name:id}))}}});
  else if (m.method === "session/set_mode") send({jsonrpc:"2.0",id:m.id,result:{}});
  else if (m.method === "session/prompt") {
    promptId = m.id;
    send({jsonrpc:"2.0",id:99,method:"session/request_permission",params:{sessionId:"sess-1",toolCall:{toolCallId:"tool-1",status:"pending",title:"Write marker",kind:"edit",content:[{type:"diff",path:"marker",oldText:"",newText:"written"}]},options:[{optionId:"allow-id",name:"Allow",kind:"allow_once"},{optionId:"reject-id",name:"Reject",kind:"reject_once"}]}});
    ${disconnectAfterPermission ? "setTimeout(() => process.exit(0), 10);" : ""}
  } else if (m.id === 99) {
    const outcome = m.result.outcome;
    if (outcome.outcome === "selected" && outcome.optionId === "allow-id") fs.writeFileSync(process.env.ACP_TEST_MARKER, "executed");
    const text = outcome.outcome === "selected" ? outcome.optionId : "cancelled";
    send({jsonrpc:"2.0",method:"session/update",params:{sessionId:"sess-1",update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text}}}});
    send({jsonrpc:"2.0",id:promptId,result:{stopReason:outcome.outcome === "cancelled" ? "cancelled" : "end_turn",usage:{totalTokens:3,inputTokens:2,outputTokens:1}}});
  }
});`;
  await fs.writeFile(executable, script, { mode: 0o755 });
  return { root, executable, marker };
}

afterEach(async () => {
  showMessage.mockReset();
  delete process.env.ACP_TEST_MARKER;
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("runGeminiAcpTurn", () => {
  it("returns the exact selected rejection option and does not execute", async () => {
    const fake = await fakeAgent();
    process.env.ACP_TEST_MARKER = fake.marker;
    showMessage.mockResolvedValue("Reject");
    const result = await runGeminiAcpTurn({
      executable: fake.executable,
      cwd: fake.root,
      prompt: "edit",
      approvalMode: "default",
      allowPersistentOptions: false,
    });
    expect(result.text).toBe("reject-id");
    await expect(fs.stat(fake.marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("executes only after the exact allow option is selected", async () => {
    const fake = await fakeAgent();
    process.env.ACP_TEST_MARKER = fake.marker;
    showMessage.mockResolvedValue("Allow");
    const result = await runGeminiAcpTurn({
      executable: fake.executable,
      cwd: fake.root,
      prompt: "edit",
      approvalMode: "default",
      allowPersistentOptions: false,
    });
    expect(result.text).toBe("allow-id");
    await expect(fs.readFile(fake.marker, "utf8")).resolves.toBe("executed");
  });

  it("answers a pending permission with cancelled on abort", async () => {
    const fake = await fakeAgent();
    process.env.ACP_TEST_MARKER = fake.marker;
    showMessage.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const run = runGeminiAcpTurn({
      executable: fake.executable,
      cwd: fake.root,
      prompt: "edit",
      approvalMode: "default",
      allowPersistentOptions: false,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 25);
    const result = await run;
    expect(result.cancelled).toBe(true);
    await expect(fs.stat(fake.marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails instead of widening permissions when plan mode is unavailable", async () => {
    const fake = await fakeAgent(["default"]);
    await expect(
      runGeminiAcpTurn({
        executable: fake.executable,
        cwd: fake.root,
        prompt: "plan",
        approvalMode: "plan",
        allowPersistentOptions: false,
      }),
    ).rejects.toThrow('mode "plan" is unavailable');
  });

  it("fails closed when the ACP peer disconnects with permission pending", async () => {
    const fake = await fakeAgent(["default"], true);
    process.env.ACP_TEST_MARKER = fake.marker;
    showMessage.mockImplementation(() => new Promise(() => undefined));
    await expect(
      runGeminiAcpTurn({
        executable: fake.executable,
        cwd: fake.root,
        prompt: "edit",
        approvalMode: "default",
        allowPersistentOptions: false,
      }),
    ).rejects.toThrow();
    await expect(fs.stat(fake.marker)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
