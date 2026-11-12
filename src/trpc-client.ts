import { createTRPCClient, createWSClient, wsLink } from '@trpc/client'
import WebSocket from 'ws'

// Companion's AppRouter type lives in the Companion source tree (companion/lib/UI/TRPC.ts) and
// cannot be imported in a standalone build, so the client is untyped. Procedures used here were
// checked against Companion 5.1.2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CompanionClient = any

/**
 * Companion stores entity options (and layered style properties) as { value, isExpression }.
 * Wrap a plain value; pass through values that are already in that shape.
 */
export function toExpressionValue(value: unknown): { value: unknown; isExpression: boolean } {
	if (value && typeof value === 'object' && 'isExpression' in value && 'value' in value) {
		return value as { value: unknown; isExpression: boolean }
	}
	return { value, isExpression: false }
}

export function createCompanionClient(url: string): {
	client: CompanionClient
	wsClient: ReturnType<typeof createWSClient>
} {
	const wsUrl = url.replace(/^http/, 'ws') + '/trpc'
	const wsClient = createWSClient({ url: wsUrl, WebSocket: WebSocket as never })
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const client: CompanionClient = createTRPCClient<any>({ links: [wsLink({ client: wsClient })] })
	return { client, wsClient }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubscriptionObserver = { onData: (data: any) => void; onError: (err: unknown) => void }

/**
 * Subscribe to a tRPC subscription and return the first data value.
 * Automatically unsubscribes after receiving the first value.
 *
 * Usage:
 *   const data = await getInitialData((obs) => client.foo.watch.subscribe(undefined, obs))
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getInitialData(
	subscribeFn: (observer: SubscriptionObserver) => { unsubscribe: () => void }
): Promise<any> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Promise<any>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			sub.unsubscribe()
			reject(new Error('Subscription timed out after 10s'))
		}, 10000)

		const sub = subscribeFn({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			onData: (data: any) => {
				clearTimeout(timeoutId)
				sub.unsubscribe()
				resolve(data)
			},
			onError: (err: unknown) => {
				clearTimeout(timeoutId)
				sub.unsubscribe()
				reject(err)
			},
		})
	})
}
