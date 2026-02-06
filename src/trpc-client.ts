import { createTRPCClient, createWSClient, wsLink } from '@trpc/client'
import type { AppRouter } from '../../companion/lib/UI/TRPC.js'
import WebSocket from 'ws'

export type CompanionClient = ReturnType<typeof createTRPCClient<AppRouter>>

export function createCompanionClient(url: string): {
	client: CompanionClient
	wsClient: ReturnType<typeof createWSClient>
} {
	const wsUrl = url.replace(/^http/, 'ws') + '/trpc'
	const wsClient = createWSClient({ url: wsUrl, WebSocket: WebSocket as never })
	const client = createTRPCClient<AppRouter>({ links: [wsLink({ client: wsClient })] })
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
