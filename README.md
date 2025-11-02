# remix-cache

A comprehensive, type-safe caching library built specifically for Remix applications.

## Features

- 🚀 **TypeScript-first** - Perfect type inference, zero manual type annotations
- 🔄 **Distributed caching** - Redis-based with multi-instance synchronization
- 🏷️ **Smart invalidation** - Tag-based and pattern-based cache invalidation
- ⚡ **Optimized for Remix** - Deep integration with loaders and actions
- 🌐 **Works everywhere** - Serverless and long-running server support
- 🎯 **Client revalidation** - Automatic UI updates via SSE
- 🛡️ **Production-ready** - Circuit breakers, stampede protection, observability

## Installation

```bash
npm install remix-cache ioredis
```

## Quick Start

```typescript
// app/cache.server.ts
import { createCache } from 'remix-cache'

export const cache = createCache({
  redis: process.env.REDIS_URL,
})

export const userCache = cache.define({
  name: 'user',
  key: (userId: string) => userId,
  ttl: 3600,
  fetch: async (userId: string) => {
    return db.user.findUnique({ where: { id: userId } })
  },
})
```

```typescript
// app/routes/users.$userId.tsx
import { userCache } from '~/cache.server'

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const user = await userCache.get(params.userId)
  return json({ user })
}

export const action = async ({ params }: ActionFunctionArgs) => {
  await db.user.update({ where: { id: params.userId }, data: { ... } })
  await userCache.invalidate(params.userId)
  return json({ success: true })
}
```

## Documentation

Coming soon.

## License

MIT © Chase W. Norton
