#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCompanionClient } from './trpc-client.js'
import { registerVariableTools } from './tools/variables.js'
import { registerConnectionTools } from './tools/connections.js'
import { registerButtonTools } from './tools/buttons.js'
import { registerTriggerTools } from './tools/triggers.js'
import { registerResources } from './resources.js'

// Parse URL from CLI args or env var
const urlArg = process.argv[2]
const url = urlArg || process.env.COMPANION_URL || 'http://localhost:8889'

const { client } = createCompanionClient(url)

const mcpServer = new McpServer({
	name: 'Bitfocus Companion',
	version: '1.0.0',
})

registerVariableTools(mcpServer, client, url)
registerConnectionTools(mcpServer, client)
registerButtonTools(mcpServer, client)
registerTriggerTools(mcpServer, client)
registerResources(mcpServer, client)

const transport = new StdioServerTransport()
await mcpServer.connect(transport)
