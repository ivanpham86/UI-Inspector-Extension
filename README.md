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
- Screenshot entire viewport
- Draw **Box** (mark area to fix) and **Arrow** (indicate direction)
- Add notes to each annotation
- Send screenshot + annotations to IDE — AI sees exactly what needs fixing

---

## Installation

### Step 1 — MCP Server

```bash
cd vibe-mcp-server
npm install
```

### Step 2 — Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `ui-inspector-extension/` folder
4. Pin extension to toolbar

### Step 3 — Connect to IDE

#### Antigravity / Claude Code

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

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_last_clicked_element` | Returns file path, Tailwind classes, text, size, color from Inspect mode |
| `get_last_annotation` | Returns Box/Arrow annotations + screenshot from Capture mode |

---

## Keyboard Shortcuts

| Key | Mode | Action |
|-----|------|--------|
| `I` | Inspect | Toggle inspect mode |
| `B` | Capture | Box tool |
| `A` | Capture | Arrow tool |
| `Esc` | Both | Exit / close |

---

## Troubleshooting

```bash
# MCP EOF — kill old process
pkill -f "vibe-mcp-server/index"

# Port in use
lsof -ti:49210 | xargs kill -9 2>/dev/null
```

---

## License

MIT
