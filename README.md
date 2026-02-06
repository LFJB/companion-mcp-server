# Companion MCP Server

An MCP (Model Context Protocol) server for [Bitfocus Companion](https://bitfocus.io/companion), enabling AI assistants to control buttons, triggers, variables, and connections.

## Features

- **Connections**: List connections and their action/feedback definitions
- **Variables**: List, search, get values, create and set custom variables
- **Pages & Buttons**: Create, configure, and press buttons with actions and feedbacks
- **Triggers**: Create, clone, update, and batch-update triggers with full support for events, conditions, actions, and collections

## Installation

No installation required - run directly with npx:

```bash
npx companion-mcp-server [companion-url]
```

Or install globally:

```bash
npm install -g companion-mcp-server
```

## Configuration

### Claude Desktop

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["-y", "companion-mcp-server", "http://localhost:8889"]
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["-y", "companion-mcp-server", "http://localhost:8889"]
    }
  }
}
```

Or add to a project-specific `.claude/settings.json` in your project root.

### Cursor

Add to Cursor's MCP configuration (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["-y", "companion-mcp-server", "http://localhost:8889"]
    }
  }
}
```

### Windsurf

Add to Windsurf's MCP configuration (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["-y", "companion-mcp-server", "http://localhost:8889"]
    }
  }
}
```

### Custom Companion URL

Replace `http://localhost:8889` with your Companion instance URL if it's running on a different host or port:

```json
"args": ["-y", "companion-mcp-server", "http://192.168.1.100:8889"]
```

### Environment Variable

You can also set the URL via environment variable:

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["-y", "companion-mcp-server"],
      "env": {
        "COMPANION_URL": "http://localhost:8889"
      }
    }
  }
}
```

## Available Tools

### Variables
| Tool | Description |
|------|-------------|
| `list_variables` | List all variable definitions grouped by connection |
| `search_variables` | Search variables by name/label pattern |
| `get_variable_value` | Get a variable's current value |
| `create_custom_variable` | Create a new custom variable |
| `set_custom_variable` | Set a custom variable's value |

### Connections
| Tool | Description |
|------|-------------|
| `list_connections` | List all configured connections with IDs and status |
| `list_connection_definitions` | Get action/feedback definitions for a connection |

### Pages & Buttons
| Tool | Description |
|------|-------------|
| `list_pages` | List all pages with their button grids |
| `create_page` | Create new page(s) at a position |
| `remove_page` | Delete a page and all its controls |
| `set_page_name` | Rename a page |
| `move_page` | Move a page to a different position |
| `clear_page` | Reset a page to defaults |
| `get_button` | Get a button's full configuration |
| `create_button` | Create a new button at a location |
| `delete_button` | Delete a button |
| `update_button` | Update button style, actions, and feedbacks |
| `press_button` | Simulate button press/release |

### Triggers
| Tool | Description |
|------|-------------|
| `list_triggers` | List all triggers with collection info |
| `list_trigger_collections` | List all trigger collections |
| `get_trigger` | Get a trigger's full configuration |
| `create_trigger` | Create a trigger with optional inline config |
| `clone_trigger` | Clone an existing trigger with option overrides |
| `update_trigger` | Update a trigger with multiple operations |
| `batch_update_triggers` | Bulk update multiple triggers |
| `create_trigger_collection` | Create a trigger collection |
| `delete_trigger` | Delete a trigger |

## Resources

The server exposes MCP resources for quick context:

| Resource | Description |
|----------|-------------|
| `companion://guide` | Usage guide for the MCP tools |
| `companion://connections` | Summary of configured connections |
| `companion://presets` | Available button presets by connection |

## Examples

### Create a button that switches to camera 1

```
1. Use list_connections to find your ATEM connection ID
2. Use list_connection_definitions with that ID to find the "program" action
3. Use create_button to create a button at page 1, row 0, column 0
4. Use update_button with set_style (text: "CAM 1") and add_action (the program action with input: 1)
```

### Clone triggers for multiple cameras

```
1. Use get_trigger to inspect an existing camera trigger
2. Use clone_trigger with the source trigger ID, new name, and optionOverrides to change the camera number
3. Repeat for each camera, or use batch_update_triggers for bulk operations
```

### Search for tally variables

```
Use search_variables with query "tally" to find all tally-related variables across connections
```

## Development

```bash
# Clone the repo
git clone https://github.com/yannisgu/companion-mcp-server.git
cd companion-mcp-server

# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build for production
yarn build:ts
```

## Requirements

- Node.js 18+
- A running [Bitfocus Companion](https://bitfocus.io/companion) instance

## License

MIT
