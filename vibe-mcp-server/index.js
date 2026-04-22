import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import cors from 'cors';
import http from 'http';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendFileSync } from 'fs';

const LOG_FILE = join(tmpdir(), 'vibe-inspector.log');
function log(msg) {
  const timestamp = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
}
log("Server starting...");

// ── Lock file: chỉ 1 instance chạy tại 1 thời điểm ──────────────────────────
const LOCK_FILE = join(tmpdir(), 'vibe-inspector.lock');

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const oldPid = parseInt(readFileSync(LOCK_FILE, 'utf8'));
      // Kiểm tra process cũ còn sống không
      process.kill(oldPid, 0);
      // Nếu còn sống → kill nó đi
      process.kill(oldPid, 'SIGTERM');
      // Chờ 200ms để nó chết
      const start = Date.now();
      while (Date.now() - start < 200) {}
    } catch (e) {
      // Process đã chết → xóa lock cũ
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
}

function releaseLock() {
  try {
    if (existsSync(LOCK_FILE)) {
      const pid = parseInt(readFileSync(LOCK_FILE, 'utf8'));
      if (pid === process.pid) unlinkSync(LOCK_FILE);
    }
  } catch (e) {}
}

acquireLock();

// ── State ─────────────────────────────────────────────────────────────────────
let lastClickedContext = "Chưa có phần tử nào được chọn.";
let annotationsList = [];
const START_PORT = 49210;

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.post('/api/vibe-context', (req, res) => {
  const d = req.body;
  lastClickedContext =
    `[Element Context]\n- Tag: <${d.tag}>\n- Classes: ${d.fullClasses}\n` +
    `- Text: "${d.textContent}"\n- Size: ${d.size}\n` +
    `- Source: ${d.file || 'unknown'}:${d.line || ''}`;
  if (d.requirement) lastClickedContext += `\n- YÊU CẦU: ${d.requirement}`;
  res.json({ success: true });
});

app.get('/api/vibe-context', (req, res) => {
  res.json({ context: lastClickedContext });
});

app.post('/api/vibe-annotation', (req, res) => {
  annotationsList = req.body.annotations || [];
  res.json({ success: true });
});

app.get('/api/vibe-annotation', (req, res) => {
  res.json({ annotations: annotationsList });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

function startExpressServer(startPort) {
  let port = startPort;
  const server = http.createServer(app);
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < startPort + 10) {
      port++;
      server.listen(port, '127.0.0.1');
    }
  });
  server.listen(port, '127.0.0.1');

  // Graceful shutdown
  const shutdown = () => {
    releaseLock();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

// ── MCP ───────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const mcpServer = new Server(
      { name: "vibe-inspector", version: "3.3.0" },
      { capabilities: { tools: {} } }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_last_clicked_element",
          description: "Lấy context code và yêu cầu UI từ tab Inspector.",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "get_last_annotation",
          description: "Lấy danh sách vùng lỗi từ tab Annotated.",
          inputSchema: { type: "object", properties: {} }
        }
      ]
    }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === "get_last_clicked_element") {
        return { content: [{ type: "text", text: lastClickedContext }] };
      }
      if (request.params.name === "get_last_annotation") {
        if (!annotationsList.length) {
          return { content: [{ type: "text", text: "Trống." }] };
        }
        const payload = [{ type: "text", text: `Có ${annotationsList.length} điểm cần sửa:` }];
        annotationsList.forEach((ann, i) => {
          payload.push({ type: "text", text: `\n[LỖI SỐ ${i+1}] ${ann.text}` });
          payload.push({ type: "image", data: ann.image.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" });
        });
        return { content: payload };
      }
    });

    // MCP connect TRƯỚC
    const transport = new StdioServerTransport();
    transport.onclose = () => { releaseLock(); process.exit(0); };
    await mcpServer.connect(transport);

    // Express SAU, delay 500ms
    setTimeout(() => startExpressServer(START_PORT), 500);

  } catch (e) {
    releaseLock();
    process.exit(1);
  }
}

main();