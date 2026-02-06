# Companion MCP Server

An MCP (Model Context Protocol) server for [Bitfocus Companion](https://bitfocus.io/companion), enabling AI assistants to control buttons, triggers, variables, and connections.

## Features

- **Connections**: List connections and their action/feedback definitions
- **Variables**: List, search, get values, create and set custom variables
- **Pages & Buttons**: Create, configure, and press buttons with actions and feedbacks
- **Triggers**: Create, clone, update, and batch-update triggers with full support for events, conditions, actions, and collections

## Installation

```bash
npm install -g companion-mcp-server
```

Or run directly with npx:

```bash
npx companion-mcp-server [companion-url]
```

## Usage

### As a CLI

```bash
# Connect to local Companion instance (default: http://localhost:8889)
companion-mcp-server

# Connect to a specific URL
companion-mcp-server http://192.168.1.100:8889
```

### With Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "companion": {
      "command": "npx",
      "args": ["companion-mcp-server", "http://localhost:8889"]
    }
  }
}
```

## Available Tools

### Variables
- `list_variables` - List all variable definitions grouped by connection
- `search_variables` - Search variables by name/label pattern
- `get_variable_value` - Get a variable's current value
- `create_custom_variable` - Create a new custom variable
- `set_custom_variable` - Set a custom variable's value

### Connections
- `list_connections` - List all configured connections
- `list_connection_definitions` - Get action/feedback definitions for a connection

### Pages & Buttons
- `list_pages` - List all pages with their button grids
- `create_page` / `remove_page` / `set_page_name` / `move_page` / `clear_page` - Manage pages
- `get_button` - Get a button's full configuration
- `create_button` / `delete_button` - Create or delete buttons
- `update_button` - Update button style, actions, and feedbacks
- `press_button` - Simulate button press/release

### Triggers
- `list_triggers` - List all triggers with collection info
- `list_trigger_collections` - List all trigger collections
- `get_trigger` - Get a trigger's full configuration
- `create_trigger` - Create a trigger with optional inline configuration
- `clone_trigger` - Clone an existing trigger with option overrides
- `update_trigger` - Update a trigger with multiple operations
- `batch_update_triggers` - Bulk update multiple triggers
- `create_trigger_collection` - Create a trigger collection
- `delete_trigger` - Delete a trigger

## Resources

The server also exposes MCP resources:
- `companion://guide` - Usage guide for the MCP tools
- `companion://connections` - Summary of configured connections
- `companion://presets` - Available button presets by connection

## Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn dev

# Build for production
yarn build:ts
```

## License

MIT
