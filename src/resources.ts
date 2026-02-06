import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CompanionClient } from './trpc-client.js'
import { getInitialData } from './trpc-client.js'

const USAGE_GUIDE = `# Bitfocus Companion MCP Server - Usage Guide

## Overview
This MCP server connects to a running Bitfocus Companion instance and exposes tools
to manage buttons, triggers, connections, and variables.

## Key Concepts

### Connections
Connections are integrations with external devices/software (video switchers, audio mixers,
lighting controllers, streaming software, etc.). Each connection has a unique ID and label.
Use \`list_connections\` to see all configured connections and their IDs.

### Pages
Pages organize buttons into groups. Each page has a name and a grid of buttons.
Use \`list_pages\` to see all pages. Manage pages with:
- \`create_page\` - create new page(s) at a position
- \`remove_page\` - delete a page and all its controls
- \`set_page_name\` - rename a page
- \`move_page\` - reorder a page
- \`clear_page\` - reset a page to defaults

### Buttons
Buttons are arranged on pages in a grid (rows and columns). Each button can have:
- **Style**: Text, text color, background color, font size. Supports variable references like \`$(connectionLabel:variableName)\` for dynamic text.
- **Actions**: What happens when pressed (e.g., switch camera, change scene)
- **Feedbacks**: Dynamic styling based on device state (e.g., highlight when a source is live)

Buttons are addressed by page number (1-based), row, and column.

### Triggers
Triggers are automated workflows that execute actions based on events:
- Time intervals
- Variable changes
- Startup events

Each trigger has a controlId used to reference it.

### Variables
Variables hold dynamic values from connections or user-defined custom values.
Referenced as \`$(connectionLabel:variableName)\`.

## Common Workflows

### Create a page with buttons:
1. \`create_page\` with a name and position
2. \`list_connections\` - find the connection ID
3. \`list_connection_definitions\` with the connection ID - find action/feedback IDs and their options
4. \`create_button\` at the desired location on the new page
5. \`update_button\` with operations:
   - \`set_style\` to set text and colors (use \`$(label:var)\` for dynamic text)
   - \`add_action\` to add the action
   - \`add_feedback\` to add visual feedback
   - \`update_entity_options\` to configure action and feedback options (works for both)

### Modify an existing button:
1. \`get_button\` - read the current button state to understand existing actions, feedbacks, style, and entity IDs
2. \`update_button\` with the needed operations based on the current state

### Modify an existing trigger:
1. \`get_trigger\` - read the current trigger state to understand existing events, actions, conditions, and entity IDs
2. \`update_trigger\` with the needed operations based on the current state

### Create a button that performs an action:
1. \`list_connections\` - find the connection ID
2. \`list_connection_definitions\` with the connection ID - find the action ID and its options
3. \`create_button\` at the desired location
4. \`update_button\` with operations:
   - \`set_style\` to set text and colors
   - \`add_action\` to add the action
   - \`update_entity_options\` to configure the action's options

### Create a trigger:
1. \`create_trigger\` - get the new controlId
2. \`update_trigger\` with operations:
   - \`set_options\` to set name and enable it
   - \`add_event\` to define when it fires
   - \`update_event_options\` to configure the event
   - \`add_action\` to define what happens
   - \`update_entity_options\` to configure the action

### Read current state:
- \`list_pages\` - see all pages and their button grid
- \`get_button\` - inspect a specific button's full config
- \`list_triggers\` - see all triggers
- \`list_variables\` - see all available variables
- \`get_variable_value\` - read a specific variable's current value

## Entity Locations
- Button actions use location \`{ stepId: '0', setId: 'down' }\` (press-down actions in the default step)
- Button feedbacks use location \`'feedbacks'\`
- Trigger actions use location \`'trigger_actions'\`
- Trigger conditions use location \`'feedbacks'\`
`

export function registerResources(server: McpServer, client: CompanionClient): void {
	server.registerResource(
		'usage_guide',
		'companion://guide',
		{ description: 'How to use the Companion MCP server tools effectively' },
		() => ({
			contents: [
				{
					uri: 'companion://guide',
					mimeType: 'text/markdown',
					text: USAGE_GUIDE,
				},
			],
		})
	)

	server.registerResource(
		'connections_summary',
		'companion://connections',
		{ description: 'Summary of all configured connections with their IDs, labels, module types, and enabled state' },
		async () => {
			const raw = await getInitialData((observer) => client.instances.connections.watch.subscribe(undefined, observer))
			// connections.watch yields an array of updates; the first element is the init message
			const data = Array.isArray(raw) ? raw[0] : raw
			if (data.type !== 'init') throw new Error('Expected init message')

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const connections = Object.entries(data.info as Record<string, any>).map(([id, config]) => ({
				id,
				label: config.label,
				moduleId: config.moduleId,
				enabled: config.enabled,
			}))

			let text = '# Companion Connections\n\n'
			if (connections.length === 0) {
				text += 'No connections configured.\n'
			} else {
				text += `${connections.length} connection(s) configured:\n\n`
				for (const conn of connections) {
					const status = conn.enabled ? 'enabled' : 'disabled'
					text += `- **${conn.label}** (ID: \`${conn.id}\`, module: \`${conn.moduleId}\`, ${status})\n`
				}
			}

			return {
				contents: [
					{
						uri: 'companion://connections',
						mimeType: 'text/markdown',
						text,
					},
				],
			}
		}
	)

	server.registerResource(
		'presets_summary',
		'companion://presets',
		{
			description:
				'Summary of all available presets grouped by connection, showing categories and preset names. Presets are pre-configured button templates provided by connection modules.',
		},
		async () => {
			const data = await getInitialData((observer) =>
				client.instances.definitions.presets.subscribe(undefined, observer)
			)
			if (data.type !== 'init') throw new Error('Expected init message')

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const definitions = data.definitions as Record<string, Record<string, any>>

			let text = '# Companion Presets\n\n'
			const connectionIds = Object.keys(definitions)

			if (connectionIds.length === 0) {
				text += 'No presets available.\n'
			} else {
				for (const connectionId of connectionIds) {
					const presets = definitions[connectionId]
					const presetList = Object.values(presets)
					if (presetList.length === 0) continue

					// Group by category
					const categories: Record<string, Array<{ id: string; label: string; type: string }>> = {}
					for (const preset of presetList) {
						const cat = preset.category || 'Uncategorized'
						if (!categories[cat]) categories[cat] = []
						categories[cat].push({ id: preset.id, label: preset.label, type: preset.type })
					}

					text += `## Connection: \`${connectionId}\` (${presetList.length} presets)\n\n`
					for (const [category, items] of Object.entries(categories)) {
						text += `### ${category}\n`
						for (const item of items) {
							text += `- **${item.label}** (ID: \`${item.id}\`, type: ${item.type})\n`
						}
						text += '\n'
					}
				}
			}

			return {
				contents: [
					{
						uri: 'companion://presets',
						mimeType: 'text/markdown',
						text,
					},
				],
			}
		}
	)
}
