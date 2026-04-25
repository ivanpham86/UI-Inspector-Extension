# Vibe UI Inspector

**Eliminate slow copy-paste loops in vibe coding.**

Instead of: take screenshot → describe in text → paste to AI → repeat  
Do this: click element or screenshot → annotate → sync to IDE → AI fixes directly.

---

## Features

### Inspect Mode
- Hover highlight elements on page
- Click to select up to 3 elements at once
- Auto-read: component name, file path, line number, Tailwind classes, computed styles
- Add custom edit requests → Sync to IDE

### Capture & Annotate Mode
- Screenshot entire viewport (no scroll needed)
- Draw **Box** (mark area to fix) and **Arrow** (indicate direction)
- Add notes to each annotation
- Send screenshot + annotations to IDE — AI sees exactly what needs fixing

---

## Repository Structure

```
UI-Inspector-Extension/
├── ui-inspector-extension/     # Chrome Extension MV3
│   ├── manifest.json
│   ├── background.js
│   ├── inject.js
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── vibe-mcp-server/            # Node.js MCP Server
│   ├── index.js
│   └── package.json
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
3. Click **Load unpacked** → select `ui-inspector-extension/` folder
4. Pin extension to toolbar (click puzzle piece 🧩 → pin)

### Step 3 — Connect to IDE

#### Antigravity

Go: Agent session → `...` → MCP Servers → Manage MCP Servers → View raw config

```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add vibe-inspector --scope user -- /usr/local/bin/node /absolute/path/to/vibe-mcp-server/index.js
```

Restart IDE after saving config.

---

## Daily Workflow

### Inspect Element

1. Open localhost dev server
2. Click **UI Inspector** icon on toolbar
3. **Inspect** tab → press `I` → hover to highlight, click to select element
4. Type edit request in textarea
5. Click **Sync to IDE**
6. In IDE: use vibe-inspector MCP tool to get element context

### Capture & Annotate

1. Scroll page to area that needs fixing
2. **Capture** tab → click **Capture**
3. Use **Box** `B` to mark region, **Arrow** `A` to indicate direction
4. Add notes to each annotation
5. Click **Sync to IDE**
6. In IDE: use vibe-inspector MCP tool to get annotations + screenshot

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_last_clicked_element` | Returns file path, Tailwind classes, text, size, color, edit request from Inspect mode |
| `get_last_annotation` | Returns list of Box/Arrow annotations + screenshot from Capture mode |

### Context AI Receives (Inspect)

```
Project Root: /Users/you/project
Page: http://localhost:3000/

<HeroSection> src/components/HeroSection.tsx:142
Classes: flex items-center gap-4 px-8 py-4 bg-violet-600
Text: "Try for free"
Size: 160×48px | Color: #fff | Bg: #7c3aed
Req: Increase padding, change hover to violet-700
```

### Context AI Receives (Capture)

```
Project Root: /Users/you/project
Page: http://localhost:3000/

Annotations (2):
1. [BOX] font size too small
2. [ARROW] move button to the right
```

+ JPEG image attached — AI sees exactly which area needs fixing

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PROJECT_ROOT` | Absolute path to project — helps AI find files instantly, no grep needed | `/Users/you/lyrai-app` |

If `PROJECT_ROOT` is not set, extension still works but AI may need to search for files.

---

## Keyboard Shortcuts

| Key | Mode | Action |
|-----|------|--------|
| `I` | Inspect | Toggle inspect mode |
| `B` | Capture | Select Box tool |
| `A` | Capture | Select Arrow tool |
| `Esc` | Both | Exit tool / close sidebar |

---

## Troubleshooting

### MCP won't connect (EOF)

```bash
# Kill old process before restarting IDE
pkill -f "vibe-mcp-server/index"
```

### Port already in use

```bash
lsof -ti:49210 | xargs kill -9 2>/dev/null
```

### Extension not receiving events

Reload tab (F5) after first installing extension.

### Node path error in Antigravity

Antigravity has restricted PATH. Always use absolute path:

```json
"command": "/usr/local/bin/node"
```

Not:

```json
"command": "node"
```

---

## Source Detection Chain

inject.js automatically detects source file in order:

1. `data-vibe-loc` attribute — any framework (PHP, Vue, Laravel)
2. React Fiber `_debugSource` — Next.js / React
3. Vite `__vite_source` — vanilla Vite
4. `data-file` attribute — legacy fallback

---

## Architecture

```
Chrome Extension (inject.js)
  → POST http://127.0.0.1:49210/api/vibe-context
    → vibe-mcp-server (Express HTTP)
      → store context in memory

AI IDE (Antigravity / Claude Code)
  → call get_last_clicked_element or get_last_annotation via MCP stdio
    → vibe-mcp-server returns context + image
```

Extension auto-scans ports 49210–49220 to find server — no manual port config needed.

---

## License

MIT

---

# Vibe UI Inspector — Vietnamese

**Loại bỏ vòng lặp copy-paste chậm chạp trong vibe coding.**

Thay vì: chụp màn hình → mô tả bằng chữ → paste vào AI → lặp lại  
Làm thế này: click element hoặc chụp màn hình → annotate → sync sang IDE → AI fix trực tiếp.

---

## Tính năng

### Chế độ Inspect
- Hover highlight element trên trang
- Click để chọn tối đa 3 elements cùng lúc
- Tự động đọc: component name, file path, line number, Tailwind classes, computed styles
- Nhập yêu cầu chỉnh sửa → Đồng bộ IDE

### Chế độ Capture & Annotate
- Chụp toàn bộ màn hình hiện tại (không cần scroll)
- Vẽ **Box** (khoanh vùng cần sửa) và **Arrow** (chỉ hướng di chuyển)
- Ghi chú cho từng annotation
- Gửi ảnh + annotations sang IDE — AI nhìn thấy vùng cần sửa

---

## Cấu trúc Repo

```
UI-Inspector-Extension/
├── ui-inspector-extension/     # Chrome Extension MV3
│   ├── manifest.json
│   ├── background.js
│   ├── inject.js
│   └── icons/
│       ├── icon16.png
│       ├── icon32.png
│       ├── icon48.png
│       └── icon128.png
├── vibe-mcp-server/            # Node.js MCP Server
│   ├── index.js
│   └── package.json
├── config-examples/
│   ├── antigravity-mcp-config.json
│   └── .mcp.json
└── README.md
```

---

## Cài đặt

### Bước 1 — MCP Server

```bash
cd vibe-mcp-server
npm install
```

### Bước 2 — Chrome Extension

1. Mở Chrome → `chrome://extensions`
2. Bật **Developer mode** (góc trên phải)
3. Click **Load unpacked** → chọn folder `ui-inspector-extension/`
4. Pin extension lên toolbar (click icon puzzle piece 🧩 → pin)

### Bước 3 — Kết nối IDE

#### Antigravity

Vào: Agent session → `...` → MCP Servers → Manage MCP Servers → View raw config

```json
{
  "mcpServers": {
    "vibe-inspector": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/vibe-mcp-server/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add vibe-inspector --scope user -- /usr/local/bin/node /absolute/path/to/vibe-mcp-server/index.js
```

Restart IDE sau khi lưu config.

---

## Workflow hàng ngày

### Inspect Element

1. Mở localhost dev server
2. Click icon **UI Inspector** trên toolbar
3. Tab **Inspect** → nhấn `I` → hover để highlight, click để chọn element
4. Nhập yêu cầu chỉnh sửa vào textarea
5. Click **Đồng bộ IDE**
6. Trong IDE: dùng MCP tool vibe-inspector để lấy context element

### Capture & Annotate

1. Scroll trang đến vùng cần sửa
2. Tab **Capture** → click **Capture**
3. Dùng **Box** `B` để khoanh vùng, **Arrow** `A` để chỉ hướng
4. Ghi chú cho từng annotation
5. Click **Đồng bộ IDE**
6. Trong IDE: dùng MCP tool vibe-inspector để lấy annotations + ảnh

---

## MCP Tools

| Tool | Mô tả |
|------|-------|
| `get_last_clicked_element` | Trả về file path, Tailwind classes, text, size, color, yêu cầu chỉnh sửa từ chế độ Inspect |
| `get_last_annotation` | Trả về danh sách Box/Arrow annotations + ảnh chụp màn hình từ chế độ Capture |

### Context AI nhận được (Inspect)

```
Project Root: /Users/you/project
Page: http://localhost:3000/

<HeroSection> src/components/HeroSection.tsx:142
Classes: flex items-center gap-4 px-8 py-4 bg-violet-600
Text: "Dùng thử miễn phí"
Size: 160×48px | Color: #fff | Bg: #7c3aed
Req: Tăng padding, đổi hover sang violet-700
```

### Context AI nhận được (Capture)

```
Project Root: /Users/you/project
Page: http://localhost:3000/

Annotations (2):
1. [BOX] font size quá nhỏ
2. [ARROW] di chuyển button sang phải
```

+ ảnh JPEG đính kèm — AI nhìn thấy đúng vùng cần sửa

---

## Biến môi trường

| Biến | Mô tả | Ví dụ |
|------|-------|-------|
| `PROJECT_ROOT` | Đường dẫn tuyệt đối đến project — giúp AI tìm file ngay lập tức, không cần grep | `/Users/you/lyrai-app` |

Nếu không set `PROJECT_ROOT`, extension vẫn hoạt động nhưng AI có thể cần tìm kiếm file thủ công.

---

## Keyboard Shortcuts

| Phím | Chế độ | Hành động |
|------|--------|-----------|
| `I` | Inspect | Bật/tắt chế độ inspect |
| `B` | Capture | Chọn tool Box |
| `A` | Capture | Chọn tool Arrow |
| `Esc` | Cả hai | Thoát tool / đóng sidebar |

---

## Xử lý lỗi thường gặp

### MCP không kết nối được (EOF)

```bash
# Kill process cũ trước khi restart IDE
pkill -f "vibe-mcp-server/index"
```

### Port bị chiếm

```bash
lsof -ti:49210 | xargs kill -9 2>/dev/null
```

### Extension không nhận được event

Reload tab (F5) sau khi install extension lần đầu.

### Node path lỗi trong Antigravity

Antigravity có PATH hạn chế. Luôn dùng đường dẫn tuyệt đối:

```json
"command": "/usr/local/bin/node"
```

Không phải:

```json
"command": "node"
```

---

## Source Detection Chain

inject.js tự động phát hiện source file theo thứ tự:

1. `data-vibe-loc` attribute — mọi framework (PHP, Vue, Laravel)
2. React Fiber `_debugSource` — Next.js / React
3. Vite `__vite_source` — vanilla Vite
4. `data-file` attribute — legacy fallback

---

## Architecture

```
Chrome Extension (inject.js)
  → POST http://127.0.0.1:49210/api/vibe-context
    → vibe-mcp-server (Express HTTP)
      → lưu context trong memory

AI IDE (Antigravity / Claude Code)
  → gọi get_last_clicked_element hoặc get_last_annotation qua MCP stdio
    → vibe-mcp-server trả về context + ảnh
```

Extension tự scan ports 49210–49220 để tìm server — không cần config port thủ công.

---

## License

MIT
