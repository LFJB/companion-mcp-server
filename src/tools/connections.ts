import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CompanionClient } from '../trpc-client.js'
import { getInitialData } from '../trpc-client.js'

export function registerConnectionTools(server: McpServer, client: CompanionClient): void {
	server.registerTool(
		'list_connections',
		{
			description: 'List all configured connections with their status, labels, and module types',
		},
		async () => {
			const raw = await getInitialData((observer) => client.instances.connections.watch.subscribe(undefined, observer))
			// connections.watch yields an array of updates; the first element is the init message
			const data = Array.isArray(raw) ? raw[0] : raw
			if (data.type !== 'init') throw new Error('Expected init message')

			const connections = Object.entries(data.info as Record<string, any>).map(([id, config]) => ({
				id,
				label: config.label,
				moduleId: config.moduleId,
				enabled: config.enabled,
			}))
			return { content: [{ type: 'text', text: JSON.stringify(connections, null, 2) }] }
		}
	)

	server.registerTool(
		'list_connection_definitions',
		{
			description:
				'List available action and feedback definitions for a specific connection. Use this to find actionId/feedbackId values needed when adding actions or feedbacks to buttons/triggers.',
			inputSchema: {
				connectionId: z.string().describe('The connection ID to get definitions for'),
			},
		},
		async ({ connectionId }) => {
			const [actionsData, feedbacksData] = await Promise.all([
				getInitialData((observer) => client.instances.definitions.actions.subscribe(undefined, observer)),
				getInitialData((observer) => client.instances.definitions.feedbacks.subscribe(undefined, observer)),
			])

			if (actionsData.type !== 'init' || feedbacksData.type !== 'init') {
				throw new Error('Expected init messages')
			}

			const actions = actionsData.definitions[connectionId] ?? {}
			const feedbacks = feedbacksData.definitions[connectionId] ?? {}

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ connectionId, actions, feedbacks }, null, 2),
					},
				],
			}
		}
	)
}
