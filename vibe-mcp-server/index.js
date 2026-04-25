import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from 'express';
import cors from 'cors';
import http from 'http';
import { appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const LOG_FILE = join(tmpdir(), 'vibe-inspector.log');
function log(msg) {
  try { appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch(e) {}
}
log("Server starting pid=" + process.pid);

// PROJECT_ROOT — đường dẫn tuyệt đối đến project
// Giúp AI ghép full path ngay lập tức, không cần grep_search
// Set qua env: PROJECT_ROOT=/Users/you/project node index.js
// Hoặc trong MCP config: "env": { "PROJECT_ROOT": "/absolute/path" }
const PROJECT_ROOT = process.env.PROJECT_ROOT || '';
if (PROJECT_ROOT) log(`PROJECT_ROOT: ${PROJECT_ROOT}`);

// ── State ─────────────────────────────────────────────────────────────────────
let lastContext     = "Chưa có context nào được gửi.";
let lastAnnotations = [];
let lastScreenshot  = null;   // base64 dataUrl ảnh chụp gần nhất
const START_PORT    = 49210;

// ── Express HTTP ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// v7 inject.js gửi { context, selections } hoặc { context, annotations }
// Old format fallback cũng được hỗ trợ
app.post('/api/vibe-context', (req, res) => {
  const d = req.body;
  if (d.context) {
    lastContext = d.context;
    if (Array.isArray(d.annotations) && d.annotations.length > 0) {
      lastAnnotations = d.annotations;
    }
    // Lưu screenshot nếu gửi kèm (inject.js gửi từ capture mode)
    if (d.screenshot) {
      lastScreenshot = d.screenshot;
    }
  } else {
    // old format
    lastContext =
      `Tag: <${d.tag || '?'}>\nClasses: ${d.fullClasses || ''}\n` +
      `Text: "${d.textContent || ''}"\nSize: ${d.size || ''}\n` +
      `Source: ${d.file || 'unknown'}:${d.line || ''}`;
    if (d.requirement) lastContext += `\nYêu cầu: ${d.requirement}`;
  }
  log(`Context updated: ${lastContext.slice(0, 60)}...`);
  res.json({ success: true });
});

app.get('/api/vibe-context', (req, res) => res.json({ context: lastContext }));

app.post('/api/vibe-annotation', (req, res) => {
  lastAnnotations = req.body.annotations || [];
  res.json({ success: true });
});

app.get('/api/vibe-annotation', (req, res) => res.json({ annotations: lastAnnotations }));

app.get('/health', (req, res) => res.json({ status: 'ok', pid: process.pid }));

function startExpressServer() {
  let port = START_PORT;
  const server = http.createServer(app);

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < START_PORT + 10) {
      port++;
      server.listen(port, '127.0.0.1');
    } else {
      log(`HTTP error: ${e.message}`);
    }
  });

  server.on('listening', () => log(`HTTP listening on :${port}`));
  server.listen(port, '127.0.0.1');
}

// ── MCP ───────────────────────────────────────────────────────────────────────
async function main() {
  const mcpServer = new Server(
    { name: "vibe-inspector", version: "3.0.0" },
    { capabilities: { tools: {} } }
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_last_clicked_element",
        description: "Lấy context element hoặc annotations mà developer vừa sync từ UI Inspector. Trả về file path, Tailwind classes, text content, size, color và yêu cầu chỉnh sửa.",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "get_last_annotation",
        description: "Lấy danh sách annotations (Box/Arrow) từ chế độ Capture của UI Inspector.",
        inputSchema: { type: "object", properties: {} }
      }
    ]
  }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "get_last_clicked_element") {
      const ctx = PROJECT_ROOT
        ? `Project Root: ${PROJECT_ROOT}\n${lastContext}`
        : lastContext;
      return { content: [{ type: "text", text: ctx }] };
    }
    if (request.params.name === "get_last_annotation") {
      if (!lastAnnotations.length && !lastScreenshot) {
        return { content: [{ type: "text", text: "Không có annotation nào." }] };
      }
      const lines = lastAnnotations
        .map((a, i) => `${i+1}. [${(a.type||'box').toUpperCase()}] ${a.note||'(no note)'}`)
        .join('\n');
      const rootPrefix = PROJECT_ROOT ? `Project Root: ${PROJECT_ROOT}\n` : '';
      const textContent = lastAnnotations.length
        ? `${rootPrefix}${lastAnnotations.length} annotation(s):\n${lines}`
        : `${rootPrefix}Ảnh chụp màn hình (không có annotation text)`;

      const result = [{ type: "text", text: textContent }];

      // Đính kèm ảnh nếu có — AI thấy ảnh + đọc annotations = hiểu đúng vùng cần sửa
      if (lastScreenshot) {
        const base64 = lastScreenshot.replace(/^data:image\/jpeg;base64,/, '')
                                      .replace(/^data:image\/png;base64,/, '');
        const mimeType = lastScreenshot.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
        result.push({ type: "image", data: base64, mimeType });
      }

      return { content: result };
    }
    return { content: [{ type: "text", text: "Unknown tool." }] };
  });

  // Kết nối MCP stdio TRƯỚC
  const transport = new StdioServerTransport();

  transport.onclose = () => {
    log("MCP transport closed, exiting");
    process.exit(0);
  };

  await mcpServer.connect(transport);
  log("MCP transport connected");

  // Khởi động Express SAU 500ms — tránh Antigravity "context deadline exceeded"
  setTimeout(startExpressServer, 500);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});