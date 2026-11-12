import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CompanionClient } from '../trpc-client.js'
import { getInitialData } from '../trpc-client.js'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Call Companion's public REST API (/api/v2, Companion 5.1+). It must be enabled in
 * Settings > Protocols, with an API key that has the 'connections' scope.
 * Key: COMPANION_API_KEY env var, else the file ~/.companion-api-key (kept out of git).
 */
async function restRequest(url: string, method: string, path: string, body?: unknown): Promise<any> {
	let key = process.env.COMPANION_API_KEY?.trim()
	if (!key) {
		try {
			key = readFileSync(join(homedir(), '.companion-api-key'), 'utf-8').trim()
		} catch {
			throw new Error(
				'No Companion API key: enable the REST API in Companion (Settings > Protocols), create a key with the connections scope, and put it in COMPANION_API_KEY or ~/.companion-api-key'
			)
		}
	}
	const res = await fetch(`${url.replace(/\/$/, '')}/api/v2${path}`, {
		method,
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await res.text()
	if (!res.ok) throw new Error(`Companion REST ${method} ${path} -> HTTP ${res.status}: ${text}`)
	return text ? JSON.parse(text) : null
}

export function registerConnectionTools(server: McpServer, client: CompanionClient, url: string): void {
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

	// --- Connection management through the REST API (Companion 5.1+, needs an API key) ---

	server.registerTool(
		'create_connection',
		{
			description: `Create a connection (module instance) in Companion, e.g. a Generic OSC sender, an ATEM, OBS.
If the module is not installed, Companion queues its installation. After creating it, call get_connection_config_fields to see which config fields the module needs (host, port...), then update_connection to set them.`,
			inputSchema: {
				moduleId: z.string().describe('Module id, e.g. "generic-osc", "bmd-atem", "obs-websocket"'),
				label: z.string().describe('Display name for the connection (letters, numbers, - and _ only)'),
				config: z
					.record(z.string(), z.unknown())
					.optional()
					.describe('Config values to set right after creation, e.g. { "host": "10.0.0.5", "port": 8000 }'),
				disabled: z.boolean().optional().describe('Create the connection disabled (default: false)'),
			},
		},
		async ({ moduleId, label, config, disabled }) => {
			const created = await restRequest(url, 'POST', '/connections/v1', { moduleId, label, disabled: disabled ?? false })
			const connectionId = created?.data?.id
			let configApplied: boolean | undefined
			if (connectionId && config) {
				// A new connection answers 409 "Connection is not running" until its module has started
				// (longer when Companion has to install the module first): retry for up to 20 s.
				configApplied = false
				for (let attempt = 0; attempt < 20 && !configApplied; attempt++) {
					try {
						await restRequest(url, 'PATCH', `/connections/v1/${connectionId}`, { config })
						configApplied = true
					} catch (e) {
						if (!String(e).includes('HTTP 409')) throw e
						await new Promise((resolve) => setTimeout(resolve, 1000))
					}
				}
			}
			const result: Record<string, unknown> = { success: true, connectionId }
			if (configApplied === false) {
				result['warning'] = 'Connection created but its module did not start within 20 s: config not applied, retry with update_connection'
			}
			return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
		}
	)

	server.registerTool(
		'get_connection_config_fields',
		{
			description:
				'Get the config fields a connection needs (id, type, label, default, choices) together with its current config values',
			inputSchema: {
				connectionId: z.string().describe('The connection ID'),
			},
		},
		async ({ connectionId }) => {
			const [fields, connection] = await Promise.all([
				restRequest(url, 'GET', `/connections/v1/${connectionId}/config-fields`),
				restRequest(url, 'GET', `/connections/v1/${connectionId}`),
			])
			return {
				content: [{ type: 'text', text: JSON.stringify({ connection: connection?.data, fields: fields?.data }, null, 2) }],
			}
		}
	)

	server.registerTool(
		'update_connection',
		{
			description: 'Update a connection: label, enabled/disabled, and config values (merged into the existing config)',
			inputSchema: {
				connectionId: z.string().describe('The connection ID'),
				label: z.string().optional().describe('New display name'),
				disabled: z.boolean().optional().describe('true to disable the connection, false to enable it'),
				config: z.record(z.string(), z.unknown()).optional().describe('Config values to merge, e.g. { "host": "10.0.0.5" }'),
			},
		},
		async ({ connectionId, label, disabled, config }) => {
			const body: Record<string, unknown> = {}
			if (label !== undefined) body['label'] = label
			if (disabled !== undefined) body['disabled'] = disabled
			if (config !== undefined) body['config'] = config
			await restRequest(url, 'PATCH', `/connections/v1/${connectionId}`, body)
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)

	server.registerTool(
		'delete_connection',
		{
			description:
				'Delete a connection. Buttons and triggers that use its actions or feedbacks stop working. Cannot be undone.',
			inputSchema: {
				connectionId: z.string().describe('The connection ID'),
			},
		},
		async ({ connectionId }) => {
			await restRequest(url, 'DELETE', `/connections/v1/${connectionId}`)
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)
}
