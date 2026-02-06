import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CompanionClient } from '../trpc-client.js'
import { getInitialData } from '../trpc-client.js'
// Inlined from @companion-app/shared to allow standalone npm publishing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EntityModelType = { Action: 'action' as any, Feedback: 'feedback' as any }

async function resolveControlId(
	client: CompanionClient,
	pageNumber: number,
	row: number,
	column: number
): Promise<string | null> {
	const pagesData = await getInitialData((observer) => client.pages.watch.subscribe(undefined, observer))
	if (pagesData.type !== 'init') throw new Error('Expected init message')

	const pageId = pagesData.order[pageNumber - 1]
	if (!pageId) return null

	const page = pagesData.pages[pageId]
	if (!page) return null

	return page.controls[row]?.[column] ?? null
}

async function resolveEntityLocation(
	client: CompanionClient,
	controlId: string,
	entityId: string
): Promise<'feedbacks' | { stepId: string; setId: string }> {
	const data = await getInitialData((observer) => client.controls.watchControl.subscribe({ controlId }, observer))
	if (data.type !== 'init' || data.config.type !== 'button') {
		return { stepId: '0', setId: 'down' }
	}

	// Check if the entity is a feedback
	for (const fb of data.config.feedbacks ?? []) {
		if (fb.id === entityId) return 'feedbacks'
	}

	// Check action steps to find the correct stepId and setId
	for (const [stepId, step] of Object.entries(data.config.steps ?? {})) {
		const actionSets = (step as { action_sets?: Record<string, Array<{ id: string }>> }).action_sets
		if (actionSets) {
			for (const [setId, actions] of Object.entries(actionSets)) {
				for (const action of actions ?? []) {
					if (action.id === entityId) return { stepId, setId }
				}
			}
		}
	}

	// Default to action location
	return { stepId: '0', setId: 'down' }
}

export function registerButtonTools(server: McpServer, client: CompanionClient): void {
	server.registerTool(
		'list_pages',
		{
			description: 'List all pages with their names and button grid layout',
		},
		async () => {
			const pagesData = await getInitialData((observer) => client.pages.watch.subscribe(undefined, observer))
			if (pagesData.type !== 'init') throw new Error('Expected init message')

			const pages = pagesData.order.map((pageId: string, index: number) => {
				const page = pagesData.pages[pageId]
				return {
					pageNumber: index + 1,
					id: pageId,
					name: page?.name ?? '',
					controls: page?.controls ?? {},
				}
			})
			return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] }
		}
	)

	server.registerTool(
		'create_page',
		{
			description: 'Create one or more new pages at a specific position',
			inputSchema: {
				asPageNumber: z.number().describe('The page number position where the new page(s) should be inserted (1-based)'),
				pageNames: z.array(z.string()).describe('Array of names for the new pages to create'),
			},
		},
		async ({ asPageNumber, pageNames }) => {
			const result = await client.pages.insert.mutate({ asPageNumber, pageNames })
			return { content: [{ type: 'text', text: JSON.stringify({ success: result === 'ok' }) }] }
		}
	)

	server.registerTool(
		'remove_page',
		{
			description: 'Delete a page and all its controls. Cannot delete the last remaining page.',
			inputSchema: {
				pageNumber: z.number().describe('Page number to delete (1-based)'),
			},
		},
		async ({ pageNumber }) => {
			const result = await client.pages.remove.mutate({ pageNumber })
			return { content: [{ type: 'text', text: JSON.stringify({ success: result === 'ok' }) }] }
		}
	)

	server.registerTool(
		'set_page_name',
		{
			description: 'Rename a page',
			inputSchema: {
				pageNumber: z.number().describe('Page number to rename (1-based)'),
				name: z.string().describe('New name for the page'),
			},
		},
		async ({ pageNumber, name }) => {
			await client.pages.setName.mutate({ pageNumber, name })
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)

	server.registerTool(
		'move_page',
		{
			description: 'Move a page to a different position in the page order',
			inputSchema: {
				pageId: z.string().describe('The page ID to move (from list_pages)'),
				pageNumber: z.number().describe('The new page number position (1-based)'),
			},
		},
		async ({ pageId, pageNumber }) => {
			const result = await client.pages.move.mutate({ pageId, pageNumber })
			return { content: [{ type: 'text', text: JSON.stringify({ success: result === 'ok' }) }] }
		}
	)

	server.registerTool(
		'clear_page',
		{
			description: 'Clear all controls from a page and reset it to defaults with navigation buttons',
			inputSchema: {
				pageNumber: z.number().describe('Page number to clear (1-based)'),
			},
		},
		async ({ pageNumber }) => {
			const result = await client.pages.clearPage.mutate({ pageNumber })
			return { content: [{ type: 'text', text: JSON.stringify({ success: result === 'ok' }) }] }
		}
	)

	server.registerTool(
		'get_button',
		{
			description:
				'Get the full configuration of a button at a specific location including its actions, feedbacks, and style',
			inputSchema: {
				pageNumber: z.number().describe('Page number (1-based)'),
				row: z.number().describe('Row number'),
				column: z.number().describe('Column number'),
			},
		},
		async ({ pageNumber, row, column }) => {
			const controlId = await resolveControlId(client, pageNumber, row, column)
			if (!controlId) {
				return {
					content: [{ type: 'text', text: JSON.stringify({ error: 'No button at this location' }) }],
				}
			}

			const data = await getInitialData((observer) => client.controls.watchControl.subscribe({ controlId }, observer))

			return {
				content: [{ type: 'text', text: JSON.stringify({ controlId, ...data }, null, 2) }],
			}
		}
	)

	server.registerTool(
		'create_button',
		{
			description: 'Create a new button at a location. If a button already exists there, it will be replaced.',
			inputSchema: {
				pageNumber: z.number().describe('Page number (1-based)'),
				row: z.number().describe('Row number'),
				column: z.number().describe('Column number'),
			},
		},
		async ({ pageNumber, row, column }) => {
			await client.controls.resetControl.mutate({
				location: { pageNumber, row, column },
				newType: 'button',
			})
			const controlId = await resolveControlId(client, pageNumber, row, column)
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, controlId }) }] }
		}
	)

	server.registerTool(
		'delete_button',
		{
			description: 'Delete a button at a location',
			inputSchema: {
				pageNumber: z.number().describe('Page number (1-based)'),
				row: z.number().describe('Row number'),
				column: z.number().describe('Column number'),
			},
		},
		async ({ pageNumber, row, column }) => {
			await client.controls.resetControl.mutate({
				location: { pageNumber, row, column },
			})
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)

	server.registerTool(
		'press_button',
		{
			description: 'Simulate a button press (down then up) at a location',
			inputSchema: {
				pageNumber: z.number().describe('Page number (1-based)'),
				row: z.number().describe('Row number'),
				column: z.number().describe('Column number'),
				direction: z.boolean().describe('true for press down, false for release up'),
			},
		},
		async ({ pageNumber, row, column, direction }) => {
			await client.controls.hotPressControl.mutate({
				location: { pageNumber, row, column },
				direction,
				surfaceId: 'mcp',
			})
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)

	server.registerTool(
		'update_button',
		{
			description: `Update a button with multiple operations in a single call. Operations are executed in order.

IMPORTANT: Always call get_button first to read the current button state before making changes. This ensures you know the existing actions, feedbacks, style, and entity IDs, and avoids accidentally duplicating or misconfiguring entities.

Available operations:
- set_style: Set button style properties (text, color, bgcolor, size)
- add_action: Add an action to the button (use list_connection_definitions to find actionId values). Optionally pass options to configure it immediately.
- add_feedback: Add a feedback to the button (use list_connection_definitions to find feedbackId values). Optionally pass options to configure it immediately.
- update_entity_options: Update options on an existing entity (action or feedback) by its entityId
- remove_entity: Remove an entity (action or feedback) by its entityId`,
			inputSchema: {
				pageNumber: z.number().describe('Page number (1-based)'),
				row: z.number().describe('Row number'),
				column: z.number().describe('Column number'),
				operations: z
					.array(
						z.union([
							z.object({
								op: z.literal('set_style'),
								text: z.string().optional().describe('Button text'),
								color: z.number().optional().describe('Text color as decimal (e.g., 16777215 for white)'),
								bgcolor: z.number().optional().describe('Background color as decimal (e.g., 16711680 for red)'),
								size: z.union([z.string(), z.number()]).optional().describe('Font size'),
							}),
							z.object({
								op: z.literal('add_action'),
								connectionId: z.string().describe('The connection ID'),
								actionId: z.string().describe('The action definition ID'),
								options: z.record(z.string(), z.unknown()).optional().describe('Key-value pairs of options to set on the new action'),
							}),
							z.object({
								op: z.literal('add_feedback'),
								connectionId: z.string().describe('The connection ID'),
								feedbackId: z.string().describe('The feedback definition ID'),
								options: z.record(z.string(), z.unknown()).optional().describe('Key-value pairs of options to set on the new feedback'),
							}),
							z.object({
								op: z.literal('update_entity_options'),
								entityId: z.string().describe('The entity ID to update'),
								options: z.record(z.string(), z.unknown()).describe('Key-value pairs of options to set'),
							}),
							z.object({
								op: z.literal('remove_entity'),
								entityId: z.string().describe('The entity ID to remove'),
							}),
						])
					)
					.describe('Array of operations to perform on the button'),
			},
		},
		async ({ pageNumber, row, column, operations }) => {
			const controlId = await resolveControlId(client, pageNumber, row, column)
			if (!controlId) {
				return {
					content: [{ type: 'text', text: JSON.stringify({ error: 'No button at this location' }) }],
				}
			}

			const results: Array<{ op: string; success: boolean; entityId?: string; error?: string }> = []

			for (const operation of operations) {
				try {
					switch (operation.op) {
						case 'set_style': {
							const styleFields: Record<string, unknown> = {}
							if (operation.text !== undefined) styleFields['text'] = operation.text
							if (operation.color !== undefined) styleFields['color'] = operation.color
							if (operation.bgcolor !== undefined) styleFields['bgcolor'] = operation.bgcolor
							if (operation.size !== undefined) styleFields['size'] = operation.size
							await client.controls.setStyleFields.mutate({ controlId, styleFields })
							results.push({ op: 'set_style', success: true })
							break
						}
						case 'add_action': {
							const actionLocation = { stepId: '0', setId: 'down' } as const
							const entityId = await client.controls.entities.add.mutate({
								controlId,
								entityLocation: actionLocation,
								ownerId: null,
								connectionId: operation.connectionId,
								entityType: EntityModelType.Action,
								entityDefinition: operation.actionId,
							})
							if (entityId && operation.options) {
								for (const [key, value] of Object.entries(operation.options)) {
									await client.controls.entities.setOption.mutate({
										controlId,
										entityLocation: actionLocation,
										entityId,
										key,
										value,
									})
								}
							}
							results.push({
								op: 'add_action',
								success: true,
								entityId: entityId ?? undefined,
							})
							break
						}
						case 'add_feedback': {
							const entityId = await client.controls.entities.add.mutate({
								controlId,
								entityLocation: 'feedbacks',
								ownerId: null,
								connectionId: operation.connectionId,
								entityType: EntityModelType.Feedback,
								entityDefinition: operation.feedbackId,
							})
							if (entityId && operation.options) {
								for (const [key, value] of Object.entries(operation.options)) {
									await client.controls.entities.setOption.mutate({
										controlId,
										entityLocation: 'feedbacks',
										entityId,
										key,
										value,
									})
								}
							}
							results.push({
								op: 'add_feedback',
								success: true,
								entityId: entityId ?? undefined,
							})
							break
						}
						case 'update_entity_options': {
							const entityLocation = await resolveEntityLocation(
								client,
								controlId,
								operation.entityId
							)
							for (const [key, value] of Object.entries(operation.options)) {
								await client.controls.entities.setOption.mutate({
									controlId,
									entityLocation,
									entityId: operation.entityId,
									key,
									value,
								})
							}
							results.push({ op: 'update_entity_options', success: true })
							break
						}
						case 'remove_entity': {
							const entityLocation = await resolveEntityLocation(
								client,
								controlId,
								operation.entityId
							)
							await client.controls.entities.remove.mutate({
								controlId,
								entityLocation,
								entityId: operation.entityId,
							})
							results.push({ op: 'remove_entity', success: true })
							break
						}
					}
				} catch (e) {
					results.push({ op: operation.op, success: false, error: String(e) })
				}
			}

			return {
				content: [{ type: 'text', text: JSON.stringify({ controlId, results }, null, 2) }],
			}
		}
	)
}
