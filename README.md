<img width="4044" height="2243" alt="beautyshot_20260419_192456" src="https://github.com/user-attachments/assets/f54bf532-1542-40d5-9565-8b5230526624" />

# Vibe Inspector

**Eliminate the slow copy-paste loop in vibe coding.**

Instead of: screenshot → describe in words → paste into AI → repeat  
Do this: click any element → sync to IDE → AI fixes it directly.

---

## What It Does

Vibe Inspector is a Chrome Extension + MCP Server combo that lets you click any UI element in your localhost dev server and send its full context (Tailwind classes, file path, component name, computed styles) directly to your AI IDE in one click.

**Supported IDEs:** Antigravity · Claude Code

---

## Repo Structure

```
vibe-inspector/
├── vibe-mcp-server/        # Node.js MCP server
│   ├── index.js
│   └── package.json
├── ui-inspector-extension/ # Chrome Extension MV3
│   ├── manifest.json
│   ├── background.js
│   ├── inject.js
│   ├── popup.html / popup.js
│   └── panel/
│       ├── panel.html
│       ├── panel.js
│       └── panel.css
├── config-examples/
│   ├── antigravity-mcp-config.json
│   └── .mcp.json
└── README.md
```

---

## Installation

### Step 1 — MCP Server

```bash
cd vibe-mcp-server
npm install
```

### Step 2 — Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `ui-inspector-extension/` folder
4. The UI Inspector icon appears in your toolbar

### Step 3 — Connect to your IDE

#### Antigravity

Go to: Agent session → `...` → MCP Servers → Manage MCP Servers → View raw config

Add the following (replace path with your absolute path):

```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"]
    }
  }
}
```

Restart Antigravity after saving.

#### Claude Code

Run this command (replace path with your absolute path):

```bash
claude mcp add vibe-inspector --scope user -- /usr/local/bin/node /absolute/path/to/vibe-mcp-server/index.js
```

Then verify:
```bash
claude mcp list
```

---

## Daily Workflow

1. Start your dev server (`npm run dev` → `localhost:3000`)
2. Click the **UI Inspector** icon → **Open Inspector Panel**
3. Press **I** → click any element
4. Describe your requirement in the textarea
5. Click **Đồng bộ IDE** (Sync to IDE)
6. In your IDE, ask: `use vibe-inspector to get the element I just selected`
7. AI reads the full context and fixes the right file directly

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_last_clicked_element` | Returns element info: tag, Tailwind classes, text, size, color, file path, line number |
| `get_last_annotation` | Returns annotation list with images (if used) |

**Calling from Claude Code chat:**
```
use vibe-inspector to check the UI element I just selected
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `I` | Activate inspect mode |
| `Esc` | Exit inspect mode |
| Click element | Select and capture context |

---

## Gotchas & Troubleshooting

### `context deadline exceeded` in Antigravity
Zombie processes are holding the port. Run:
```bash
pkill -f "vibe-mcp-server/index"
```
Then refresh MCP in Antigravity.

### `EADDRINUSE` port error
Same fix — kill old processes:
```bash
lsof -ti:49210 | xargs kill -9 2>/dev/null
```

### MCP not showing in Claude Code after install
Two extra steps needed:

1. Add to `~/.claude/settings.json`:
```json
{
  "enabledMcpjsonServers": ["vibe-inspector"]
}
```

2. Create `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"]
    }
  }
}
```

### `/mcp` in Claude Code opens Marketplace, not local list
That's expected — `/mcp` = public marketplace UI. Your local MCP tools are available directly in chat. Just mention the tool name and Claude will use it.

### Node path must be absolute
Antigravity has a restricted PATH. Always use `/usr/local/bin/node` not just `node`.

### WebSocket errors in console (`ws://localhost:3131`)
These are Next.js HMR errors — not from this tool. Safe to ignore.

---

## How It Works

```
Chrome Extension (panel.js)
  → POST http://127.0.0.1:49210/api/vibe-context
    → vibe-mcp-server (Express HTTP)
      → stores context in memory

AI IDE (Antigravity / Claude Code)
  → calls get_last_clicked_element via MCP stdio
    → vibe-mcp-server returns stored context
```

The extension auto-scans ports 49210–49220 to find the running server — no hard-coded ports.

---

## Architecture

**Lock file mechanism** — only one server instance runs at a time. On startup, if a previous instance is detected via `/tmp/vibe-inspector.lock`, it is terminated before the new one starts.

**MCP first** — the MCP stdio transport connects before the HTTP server starts (500ms delay). This prevents Antigravity's `context deadline exceeded` timeout.

**Source detection chain** (in inject.js):
1. `data-vibe-loc` attribute — works on any framework (PHP, Vue, Laravel)
2. React Fiber `_debugSource` — Next.js / React
3. Vite `__vite_source` — vanilla Vite projects
4. `data-file` attribute — legacy fallback

---

## License

MIT

---

# Vibe Inspector (Tiếng Việt)

**Loại bỏ vòng lặp copy-paste chậm chạp trong vibe coding.**

Thay vì: chụp màn hình → mô tả bằng chữ → paste vào AI → lặp lại  
Làm thế này: click element → sync sang IDE → AI fix trực tiếp.

---

## Cài Đặt

### Bước 1 — MCP Server

```bash
cd vibe-mcp-server
npm install
```

### Bước 2 — Chrome Extension

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode**
3. Click **Load unpacked** → chọn folder `ui-inspector-extension/`
4. Icon UI Inspector xuất hiện trên toolbar

### Bước 3 — Kết nối IDE

#### Antigravity

Vào: Agent session → `...` → MCP Servers → Manage MCP Servers → View raw config

Thêm vào (thay path bằng đường dẫn tuyệt đối trên máy bạn):

```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"]
    }
  }
}
```

Restart Antigravity sau khi lưu.

#### Claude Code

```bash
claude mcp add vibe-inspector --scope user -- /usr/local/bin/node /absolute/path/to/vibe-mcp-server/index.js
```

Kiểm tra:
```bash
claude mcp list
```

**Nếu vẫn không thấy sau khi restart**, thêm vào `~/.claude/settings.json`:
```json
{
  "enabledMcpjsonServers": ["vibe-inspector"]
}
```

Và tạo `.mcp.json` ở root project:
```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"]
    }
  }
}
```

---

## Workflow Hàng Ngày

1. Chạy dev server (`npm run dev`)
2. Click icon **UI Inspector** → **Open Inspector Panel**
3. Nhấn **I** → click element bất kỳ
4. Nhập yêu cầu chỉnh sửa
5. Click **Đồng bộ IDE**
6. Trong IDE gõ: `dùng vibe-inspector lấy element tôi vừa chọn`
7. AI đọc context và fix đúng file

---

## Xử Lý Lỗi Thường Gặp

**`context deadline exceeded`** → Kill zombie processes:
```bash
pkill -f "vibe-mcp-server/index"
```

**MCP không hiện trong Claude Code** → Xem mục Gotchas ở phần English phía trên.

**`/mcp` mở Marketplace** → Đúng rồi, đó là behavior bình thường. Gọi tool trực tiếp trong chat.
