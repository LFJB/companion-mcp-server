import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CompanionClient } from '../trpc-client.js'
import { getInitialData } from '../trpc-client.js'

export function registerVariableTools(server: McpServer, client: CompanionClient, companionUrl: string): void {
	server.registerTool(
		'list_variables',
		{
			description: 'List all variable definitions grouped by connection label',
		},
		async () => {
			const data = await getInitialData((observer) => client.variables.definitions.watch.subscribe(undefined, observer))
			if (data.type !== 'init') throw new Error('Expected init message')
			return { content: [{ type: 'text', text: JSON.stringify(data.variables, null, 2) }] }
		}
	)

	server.registerTool(
		'search_variables',
		{
			description:
				'Search variable definitions by name or label pattern. Returns matching variables across all or a specific connection. Useful for finding variables without browsing the full list.',
			inputSchema: {
				query: z
					.string()
					.describe('Search pattern (case-insensitive). Matches against variable name and label.'),
				connectionLabel: z
					.string()
					.optional()
					.describe('Optional: filter to a specific connection label (case-insensitive substring match)'),
			},
		},
		async ({ query, connectionLabel }) => {
			const data = await getInitialData((observer) =>
				client.variables.definitions.watch.subscribe(undefined, observer)
			)
			if (data.type !== 'init') throw new Error('Expected init message')

			const queryLower = query.toLowerCase()
			const connFilterLower = connectionLabel?.toLowerCase()

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const variables = data.variables as Record<string, Array<{ name: string; label: string }>>
			const results: Array<{ connectionLabel: string; name: string; label: string }> = []

			for (const [connLabel, vars] of Object.entries(variables)) {
				if (connFilterLower && !connLabel.toLowerCase().includes(connFilterLower)) continue

				for (const v of vars) {
					if (
						v.name.toLowerCase().includes(queryLower) ||
						v.label.toLowerCase().includes(queryLower)
					) {
						results.push({
							connectionLabel: connLabel,
							name: v.name,
							label: v.label,
						})
					}
				}
			}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ query, matchCount: results.length, results }, null, 2),
					},
				],
			}
		}
	)

	server.registerTool(
		'get_variable_value',
		{
			description: 'Get the current value of a variable by its connection label and variable name',
			inputSchema: {
				connectionLabel: z
					.string()
					.describe('The connection label (e.g., "internal", "custom", or a connection label)'),
				variableName: z.string().describe('The variable name'),
			},
		},
		async ({ connectionLabel, variableName }) => {
			const url = `${companionUrl}/api/variable/${encodeURIComponent(connectionLabel)}/${encodeURIComponent(variableName)}/value`
			const response = await fetch(url)
			if (!response.ok) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ error: `HTTP ${response.status}: ${response.statusText}` }),
						},
					],
				}
			}
			const value = await response.text()
			return { content: [{ type: 'text', text: JSON.stringify({ connectionLabel, variableName, value }) }] }
		}
	)

	server.registerTool(
		'create_custom_variable',
		{
			description: 'Create a new custom variable with a name and default value',
			inputSchema: {
				name: z.string().describe('The custom variable name (no spaces or special characters)'),
				defaultValue: z.string().optional().describe('The default value (defaults to empty string)'),
			},
		},
		async ({ name, defaultValue }) => {
			await client.customVariables.create.mutate({ name, defaultVal: defaultValue ?? '' })
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, name }) }] }
		}
	)

	server.registerTool(
		'set_custom_variable',
		{
			description: 'Set the value of a custom variable',
			inputSchema: {
				name: z.string().describe('The custom variable name'),
				value: z.string().describe('The value to set'),
			},
		},
		async ({ name, value }) => {
			await client.customVariables.setCurrent.mutate({ name, value })
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, name, value }) }] }
		}
	)
}
