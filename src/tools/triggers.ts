import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CompanionClient } from '../trpc-client.js'
import { getInitialData, toExpressionValue } from '../trpc-client.js'
// Inlined from @companion-app/shared to allow standalone npm publishing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EntityModelType = { Action: 'action' as any, Feedback: 'feedback' as any }

const operationSchema = z.union([
	z.object({
		op: z.literal('set_options'),
		name: z.string().optional().describe('Trigger name'),
		enabled: z.boolean().optional().describe('Whether the trigger is enabled'),
		collectionId: z
			.string()
			.nullable()
			.optional()
			.describe('Collection ID to group the trigger (null to remove from collection)'),
		sortOrder: z.number().optional().describe('Sort order within collection (lower = earlier). Use with collectionId.'),
	}),
	z.object({
		op: z.literal('add_event'),
		eventType: z.string().describe('Event type (e.g., "interval", "startup", "variable_changed", "condition_true")'),
	}),
	z.object({
		op: z.literal('update_event_options'),
		eventId: z.string().describe('The event ID'),
		key: z.string().describe('The option key'),
		value: z.unknown().describe('The option value'),
	}),
	z.object({
		op: z.literal('remove_event'),
		eventId: z.string().describe('The event ID'),
	}),
	z.object({
		op: z.literal('add_action'),
		connectionId: z.string().describe('The connection ID'),
		actionId: z.string().describe('The action definition ID'),
		parentId: z.string().optional().describe('Parent entity ID for child actions (e.g., logic_if entity ID)'),
		childGroup: z.string().optional().describe('Child group name (e.g., "actions", "else_actions")'),
		options: z.record(z.string(), z.unknown()).optional().describe('Key-value pairs of options to set on the new action'),
	}),
	z.object({
		op: z.literal('add_condition'),
		connectionId: z.string().describe('The connection ID'),
		feedbackId: z.string().describe('The feedback definition ID'),
		parentId: z.string().optional().describe('Parent entity ID for child conditions (e.g., logic_if entity ID)'),
		childGroup: z.string().optional().describe('Child group name (e.g., "condition")'),
		options: z.record(z.string(), z.unknown()).optional().describe('Key-value pairs of options to set on the new condition'),
	}),
	z.object({
		op: z.literal('set_entity_inverted'),
		entityId: z.string().describe('The condition entity ID'),
		isInverted: z.boolean().describe('Whether the condition is inverted'),
		entityLocation: z.enum(['trigger_actions', 'feedbacks']).optional().describe('Entity location (default: "feedbacks")'),
	}),
	z.object({
		op: z.literal('update_entity_options'),
		entityId: z.string().describe('The entity ID'),
		options: z.record(z.string(), z.unknown()).describe('Key-value pairs of options to set'),
		entityLocation: z.enum(['trigger_actions', 'feedbacks']).optional().describe('Entity location (default: "trigger_actions")'),
	}),
	z.object({
		op: z.literal('remove_entity'),
		entityId: z.string().describe('The entity ID'),
		entityLocation: z.enum(['trigger_actions', 'feedbacks']).optional().describe('Entity location (default: "trigger_actions")'),
	}),
])

type Operation = z.infer<typeof operationSchema>
type OperationResult = { op: string; success: boolean; entityId?: string; eventId?: string; error?: string }

async function executeOperations(
	client: CompanionClient,
	controlId: string,
	operations: Operation[]
): Promise<OperationResult[]> {
	const results: OperationResult[] = []

	for (const operation of operations) {
		try {
			switch (operation.op) {
				case 'set_options': {
					if (operation.name !== undefined) {
						await client.controls.setOptionsField.mutate({
							controlId,
							key: 'name',
							value: operation.name,
						})
					}
					if (operation.enabled !== undefined) {
						await client.controls.setOptionsField.mutate({
							controlId,
							key: 'enabled',
							value: operation.enabled,
						})
					}
					if (operation.collectionId !== undefined) {
						const dropIndex = operation.sortOrder ?? 0
						await client.controls.triggers.reorder.mutate({
							collectionId: operation.collectionId,
							controlId,
							dropIndex,
						})
					}
					results.push({ op: 'set_options', success: true })
					break
				}
				case 'add_event': {
					const eventId = await client.controls.events.add.mutate({
						controlId,
						eventType: operation.eventType,
					})
					results.push({
						op: 'add_event',
						success: true,
						eventId: eventId ? String(eventId) : undefined,
					})
					break
				}
				case 'update_event_options': {
					await client.controls.events.setOption.mutate({
						controlId,
						eventId: operation.eventId,
						key: operation.key,
						value: operation.value,
					})
					results.push({ op: 'update_event_options', success: true })
					break
				}
				case 'remove_event': {
					await client.controls.events.remove.mutate({
						controlId,
						eventId: operation.eventId,
					})
					results.push({ op: 'remove_event', success: true })
					break
				}
				case 'add_action': {
					const ownerId =
						operation.parentId && operation.childGroup
							? { parentId: operation.parentId, childGroup: operation.childGroup }
							: null
					const entityId = await client.controls.entities.add.mutate({
						controlId,
						entityLocation: 'trigger_actions',
						ownerId,
						connectionId: operation.connectionId,
						entityType: EntityModelType.Action,
						entityDefinition: operation.actionId,
					})
					if (entityId && operation.options) {
						for (const [key, value] of Object.entries(operation.options)) {
							await client.controls.entities.setOption.mutate({
								controlId,
								entityLocation: 'trigger_actions',
								entityId,
								key,
								value: toExpressionValue(value),
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
				case 'add_condition': {
					const ownerId =
						operation.parentId && operation.childGroup
							? { parentId: operation.parentId, childGroup: operation.childGroup }
							: null
					const conditionLocation = ownerId ? 'trigger_actions' : 'feedbacks'
					const entityId = await client.controls.entities.add.mutate({
						controlId,
						entityLocation: conditionLocation,
						ownerId,
						connectionId: operation.connectionId,
						entityType: EntityModelType.Feedback,
						entityDefinition: operation.feedbackId,
					})
					if (entityId && operation.options) {
						for (const [key, value] of Object.entries(operation.options)) {
							await client.controls.entities.setOption.mutate({
								controlId,
								entityLocation: conditionLocation,
								entityId,
								key,
								value: toExpressionValue(value),
							})
						}
					}
					results.push({
						op: 'add_condition',
						success: true,
						entityId: entityId ?? undefined,
					})
					break
				}
				case 'set_entity_inverted': {
					await client.controls.entities.setInverted.mutate({
						controlId,
						entityLocation: operation.entityLocation ?? 'feedbacks',
						entityId: operation.entityId,
						isInverted: operation.isInverted,
					})
					results.push({ op: 'set_entity_inverted', success: true })
					break
				}
				case 'update_entity_options': {
					const location = operation.entityLocation ?? 'trigger_actions'
					for (const [key, value] of Object.entries(operation.options)) {
						await client.controls.entities.setOption.mutate({
							controlId,
							entityLocation: location,
							entityId: operation.entityId,
							key,
							value: toExpressionValue(value),
						})
					}
					results.push({ op: 'update_entity_options', success: true })
					break
				}
				case 'remove_entity': {
					await client.controls.entities.remove.mutate({
						controlId,
						entityLocation: operation.entityLocation ?? 'trigger_actions',
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

	return results
}

const operationsDescription = `Available operations:
- set_options: Set trigger name, enabled state, and/or collection. Use sortOrder with collectionId for explicit positioning.
- add_event: Add an event to the trigger (e.g., "interval", "startup", "variable_changed", "condition_true")
- update_event_options: Update an event's options
- remove_event: Remove an event from the trigger
- add_action: Add an action to the trigger (optionally as child of a parent entity using parentId/childGroup). Optionally pass options to configure it immediately.
- add_condition: Add a condition (feedback) to the trigger (optionally as child of a parent entity). Optionally pass options to configure it immediately.
- set_entity_inverted: Set isInverted on a condition entity
- update_entity_options: Update options on an entity (action or condition). Use entityLocation "feedbacks" for conditions, "trigger_actions" for actions (default).
- remove_entity: Remove an entity (action or condition)`

export function registerTriggerTools(server: McpServer, client: CompanionClient): void {
	server.registerTool(
		'list_triggers',
		{
			description:
				'List all triggers with their names, enabled state, descriptions, and collection IDs',
		},
		async () => {
			const data = await getInitialData((observer) =>
				client.controls.triggers.watch.subscribe(undefined, observer)
			)
			if (data.type !== 'init') throw new Error('Expected init message')

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const triggers = Object.entries(data.triggers as Record<string, any>).map(
				([controlId, info]) => ({
					controlId,
					name: info.name,
					enabled: info.enabled,
					description: info.description,
					collectionId: info.collectionId ?? null,
					sortOrder: info.sortOrder,
					lastExecuted: info.lastExecuted,
				})
			)
			return { content: [{ type: 'text', text: JSON.stringify(triggers, null, 2) }] }
		}
	)

	server.registerTool(
		'list_trigger_collections',
		{
			description: 'List all trigger collections (groups) with their IDs and names',
		},
		async () => {
			const data = await getInitialData((observer) =>
				client.controls.triggers.watch.subscribe(undefined, observer)
			)
			if (data.type !== 'init') throw new Error('Expected init message')

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const collections = data.collections as Record<string, { name: string }> | undefined
			const result = collections
				? Object.entries(collections).map(([id, info]) => ({
						collectionId: id,
						name: info.name,
					}))
				: []

			return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
		}
	)

	server.registerTool(
		'get_trigger',
		{
			description:
				'Get the full configuration of a trigger including its events, actions, and conditions',
			inputSchema: {
				controlId: z.string().describe('The trigger controlId (e.g., "trigger:abc123")'),
			},
		},
		async ({ controlId }) => {
			const data = await getInitialData((observer) =>
				client.controls.watchControl.subscribe({ controlId }, observer)
			)
			return {
				content: [{ type: 'text', text: JSON.stringify({ controlId, ...data }, null, 2) }],
			}
		}
	)

	server.registerTool(
		'create_trigger',
		{
			description:
				'Create a new trigger, optionally with full configuration in one call. Returns the controlId of the new trigger.',
			inputSchema: {
				name: z.string().optional().describe('Trigger name'),
				enabled: z.boolean().optional().describe('Whether the trigger is enabled (default: false)'),
				collectionId: z.string().optional().describe('Collection ID to add trigger to'),
				operations: z
					.array(operationSchema)
					.optional()
					.describe('Optional operations to configure the trigger after creation'),
			},
		},
		async ({ name, enabled, collectionId, operations }) => {
			const controlId = await client.controls.triggers.create.mutate()

			// Apply basic options
			const initOps: Operation[] = []
			if (name !== undefined || enabled !== undefined || collectionId !== undefined) {
				initOps.push({
					op: 'set_options',
					name,
					enabled,
					collectionId,
				})
			}

			// Combine with user-provided operations
			const allOps = [...initOps, ...(operations ?? [])]
			let results: OperationResult[] = []
			if (allOps.length > 0) {
				results = await executeOperations(client, controlId, allOps)
			}

			return {
				content: [
					{ type: 'text', text: JSON.stringify({ success: true, controlId, results }, null, 2) },
				],
			}
		}
	)

	server.registerTool(
		'clone_trigger',
		{
			description:
				'Clone an existing trigger. Creates a copy with a new name, optionally with modified options. Returns the new controlId.',
			inputSchema: {
				sourceControlId: z.string().describe('The trigger controlId to clone'),
				name: z.string().describe('Name for the cloned trigger'),
				enabled: z
					.boolean()
					.optional()
					.describe('Whether the clone is enabled (defaults to source state)'),
				collectionId: z
					.string()
					.nullable()
					.optional()
					.describe('Collection to add clone to (defaults to source collection)'),
				optionOverrides: z
					.array(
						z.object({
							entityId: z.string().describe('Entity ID from the source trigger'),
							entityLocation: z
								.enum(['trigger_actions', 'feedbacks'])
								.describe('Location of the entity'),
							options: z.record(z.string(), z.unknown()).describe('Options to override'),
						})
					)
					.optional()
					.describe('Override specific entity options in the cloned trigger'),
			},
		},
		async ({ sourceControlId, name, enabled, collectionId, optionOverrides }) => {
			// Get source trigger config
			const sourceData = await getInitialData((observer) =>
				client.controls.watchControl.subscribe({ controlId: sourceControlId }, observer)
			)
			if (sourceData.type !== 'init') throw new Error('Expected init message')

			const sourceConfig = sourceData.config
			if (!sourceConfig || sourceConfig.type !== 'trigger') {
				throw new Error('Source is not a trigger')
			}

			// Create new trigger
			const newControlId = await client.controls.triggers.create.mutate()

			// Build operations to replicate the source
			const ops: Operation[] = []

			// Set options
			ops.push({
				op: 'set_options',
				name,
				enabled: enabled ?? sourceConfig.options?.enabled ?? false,
				collectionId: collectionId !== undefined ? collectionId : sourceConfig.options?.collectionId,
			})

			// Clone events
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const events = (sourceConfig.events ?? []) as Array<{ id: string; type: string; options: Record<string, any> }>
			const eventIdMap: Record<string, string> = {}
			for (const event of events) {
				ops.push({ op: 'add_event', eventType: event.type })
			}

			// Execute initial ops to create events
			const initialResults = await executeOperations(client, newControlId, ops)

			// Map old event IDs to new event IDs
			let eventIndex = 0
			for (const result of initialResults) {
				if (result.op === 'add_event' && result.eventId && events[eventIndex]) {
					eventIdMap[events[eventIndex].id] = result.eventId
					eventIndex++
				}
			}

			// Set event options
			const eventOps: Operation[] = []
			for (const event of events) {
				const newEventId = eventIdMap[event.id]
				if (newEventId && event.options) {
					for (const [key, value] of Object.entries(event.options)) {
						eventOps.push({ op: 'update_event_options', eventId: newEventId, key, value })
					}
				}
			}
			if (eventOps.length > 0) {
				await executeOperations(client, newControlId, eventOps)
			}

			// Clone conditions (feedbacks)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const feedbacks = (sourceConfig.feedbacks ?? []) as Array<{
				id: string
				connectionId: string
				definitionId: string
				options: Record<string, unknown>
				isInverted?: boolean
			}>
			const conditionOps: Operation[] = []
			const conditionIdMap: Record<string, number> = {} // old id -> index in conditionOps
			for (let i = 0; i < feedbacks.length; i++) {
				const fb = feedbacks[i]
				// Apply option overrides if any
				let options = { ...fb.options }
				const override = optionOverrides?.find(
					(o) => o.entityId === fb.id && o.entityLocation === 'feedbacks'
				)
				if (override) {
					options = { ...options, ...override.options }
				}
				conditionOps.push({
					op: 'add_condition',
					connectionId: fb.connectionId,
					feedbackId: fb.definitionId,
					options,
				})
				conditionIdMap[fb.id] = i
			}

			let conditionResults: OperationResult[] = []
			if (conditionOps.length > 0) {
				conditionResults = await executeOperations(client, newControlId, conditionOps)
			}

			// Set isInverted on conditions
			const invertOps: Operation[] = []
			for (let i = 0; i < feedbacks.length; i++) {
				const fb = feedbacks[i]
				if (fb.isInverted && conditionResults[i]?.entityId) {
					invertOps.push({
						op: 'set_entity_inverted',
						entityId: conditionResults[i].entityId!,
						isInverted: true,
						entityLocation: 'feedbacks',
					})
				}
			}
			if (invertOps.length > 0) {
				await executeOperations(client, newControlId, invertOps)
			}

			// Clone actions (trigger_actions) - recursively handles nested children
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const actions = (sourceConfig.trigger_actions ?? []) as Array<any>
			await cloneActions(client, newControlId, actions, null, optionOverrides)

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ success: true, controlId: newControlId, clonedFrom: sourceControlId }, null, 2),
					},
				],
			}
		}
	)

	server.registerTool(
		'create_trigger_collection',
		{
			description: 'Create a trigger collection (group). Returns the collectionId.',
			inputSchema: {
				name: z.string().describe('The collection name'),
			},
		},
		async ({ name }) => {
			const collectionId = await client.controls.triggers.collections.add.mutate({
				collectionName: name,
			})
			return { content: [{ type: 'text', text: JSON.stringify({ success: true, collectionId }) }] }
		}
	)

	server.registerTool(
		'delete_trigger',
		{
			description: 'Delete a trigger by its controlId',
			inputSchema: {
				controlId: z.string().describe('The trigger controlId'),
			},
		},
		async ({ controlId }) => {
			await client.controls.triggers.delete.mutate({ controlId })
			return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] }
		}
	)

	server.registerTool(
		'update_trigger',
		{
			description: `Update a trigger with multiple operations in a single call. Operations are executed in order.

IMPORTANT: Always call get_trigger first to read the current trigger state before making changes. This ensures you know the existing events, actions, conditions, and entity IDs, and avoids accidentally duplicating or misconfiguring entities.

${operationsDescription}`,
			inputSchema: {
				controlId: z.string().describe('The trigger controlId'),
				operations: z
					.array(operationSchema)
					.describe('Array of operations to perform on the trigger'),
			},
		},
		async ({ controlId, operations }) => {
			const results = await executeOperations(client, controlId, operations)
			return {
				content: [{ type: 'text', text: JSON.stringify({ controlId, results }, null, 2) }],
			}
		}
	)

	server.registerTool(
		'batch_update_triggers',
		{
			description: `Update multiple triggers in a single call. Each item specifies a controlId and an array of operations. Items are processed sequentially, and operations within each item are also executed in order.

Use this for bulk operations like configuring many triggers at once, reordering triggers in a collection, or applying the same changes across multiple triggers.

IMPORTANT: Always call get_trigger first to read the current trigger state before making changes.

${operationsDescription}`,
			inputSchema: {
				items: z
					.array(
						z.object({
							controlId: z.string().describe('The trigger controlId'),
							operations: z
								.array(operationSchema)
								.describe('Array of operations to perform on this trigger'),
						})
					)
					.describe('Array of trigger updates to perform'),
			},
		},
		async ({ items }) => {
			const triggerResults: Array<{
				controlId: string
				results: OperationResult[]
			}> = []

			for (const item of items) {
				const results = await executeOperations(client, item.controlId, item.operations)
				triggerResults.push({ controlId: item.controlId, results })
			}

			return {
				content: [{ type: 'text', text: JSON.stringify({ triggerResults }, null, 2) }],
			}
		}
	)
}

// Helper to recursively clone actions including nested children
async function cloneActions(
	client: CompanionClient,
	controlId: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	actions: Array<any>,
	parent: { parentId: string; childGroup: string } | null,
	optionOverrides?: Array<{
		entityId: string
		entityLocation: 'trigger_actions' | 'feedbacks'
		options: Record<string, unknown>
	}>
): Promise<void> {
	for (const action of actions) {
		// Apply option overrides if any
		let options = { ...action.options }
		const override = optionOverrides?.find(
			(o) => o.entityId === action.id && o.entityLocation === 'trigger_actions'
		)
		if (override) {
			options = { ...options, ...override.options }
		}

		// Add the action
		const addOp: Operation = {
			op: 'add_action',
			connectionId: action.connectionId,
			actionId: action.definitionId,
			options,
			...(parent ? { parentId: parent.parentId, childGroup: parent.childGroup } : {}),
		}
		const results = await executeOperations(client, controlId, [addOp])
		const newEntityId = results[0]?.entityId

		// Handle nested children (e.g., logic_if children)
		if (newEntityId && action.children) {
			for (const [childGroup, childActions] of Object.entries(action.children)) {
				if (Array.isArray(childActions) && childActions.length > 0) {
					await cloneActions(
						client,
						controlId,
						childActions,
						{ parentId: newEntityId, childGroup },
						optionOverrides
					)
				}
			}
		}
	}
}
