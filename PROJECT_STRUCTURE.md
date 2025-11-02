# remix-cache Project Structure

## Complete File Tree

```
remix-cache/
├── src/
│   ├── index.ts                    # Server-side exports
│   ├── react.ts                    # Client-side React exports
│   │
│   ├── server/                     # Server-side implementation
│   │   ├── cache.ts                # Main Cache class (placeholder)
│   │   ├── definition.ts           # CacheDefinition class
│   │   ├── redis-client.ts         # Redis connection management
│   │   ├── pubsub.ts               # Pub/Sub handler for multi-instance sync
│   │   ├── serializer.ts           # Superjson/JSON serialization
│   │   ├── deduplicator.ts         # Cache stampede protection
│   │   ├── circuit-breaker.ts      # Redis failure circuit breaker
│   │   ├── local-cache.ts          # In-memory LRU cache (server mode)
│   │   ├── versioned-cache.ts      # Versioned keys (serverless mode)
│   │   ├── tag-manager.ts          # Tag-based invalidation
│   │   ├── pattern-matcher.ts      # Pattern-based invalidation
│   │   └── sse-handler.ts          # SSE endpoint generator (placeholder)
│   │
│   ├── react/                      # Client-side React hooks
│   │   ├── provider.tsx            # CacheProvider component (placeholder)
│   │   ├── use-cache.ts            # useCache hook (placeholder)
│   │   └── context.tsx             # React context
│   │
│   ├── types/                      # TypeScript type definitions
│   │   ├── cache.ts                # Cache interfaces
│   │   ├── config.ts               # Configuration types
│   │   ├── events.ts               # Event types for observability
│   │   └── react.ts                # React component types
│   │
│   └── utils/                      # Utility functions
│       ├── env-detect.ts           # Environment detection
│       ├── key-builder.ts          # Cache key utilities
│       └── pattern-match.ts        # Pattern matching helpers
│
├── dist/                           # Build output (generated)
│   ├── index.js                    # ESM server bundle
│   ├── index.cjs                   # CJS server bundle
│   ├── index.d.ts                  # TypeScript declarations
│   ├── react.js                    # ESM React bundle
│   ├── react.cjs                   # CJS React bundle
│   └── react.d.ts                  # React TypeScript declarations
│
├── package.json                    # Package configuration
├── tsconfig.json                   # TypeScript configuration
├── tsup.config.ts                  # Build configuration
├── vitest.config.ts                # Test configuration
├── .eslintrc.json                  # ESLint configuration
├── .prettierrc                     # Prettier configuration
├── .prettierignore                 # Prettier ignore patterns
├── .gitignore                      # Git ignore patterns
├── LICENSE                         # MIT License
├── README.md                       # Package documentation
├── masterplan.md                   # Complete architecture specification
└── PROJECT_STRUCTURE.md            # This file
```

## File Counts

- **Total source files**: 24
- **Server files**: 12
- **React files**: 3
- **Type files**: 4
- **Utility files**: 3
- **Entry points**: 2

## Implementation Status

### ✅ Complete (Ready for Implementation)
- Project structure
- Build pipeline (tsup)
- TypeScript configuration
- Testing setup (vitest)
- Linting (ESLint + Prettier)
- Type definitions
- Utility scaffolding
- All component/class scaffolds

### 🚧 Placeholder (Phase 1+)
- `src/server/cache.ts` - Main Cache implementation
- `src/server/sse-handler.ts` - SSE endpoint
- `src/react/provider.tsx` - CacheProvider
- `src/react/use-cache.ts` - useCache hook

### ✅ Implemented
- `src/server/redis-client.ts` - Full implementation
- `src/server/pubsub.ts` - Full implementation
- `src/server/serializer.ts` - Full implementation
- `src/server/deduplicator.ts` - Full implementation
- `src/server/circuit-breaker.ts` - Full implementation
- `src/server/local-cache.ts` - Full implementation
- `src/server/versioned-cache.ts` - Full implementation
- `src/server/tag-manager.ts` - Full implementation
- `src/server/pattern-matcher.ts` - Full implementation
- `src/server/definition.ts` - Scaffold with method signatures
- `src/react/context.tsx` - Full implementation
- `src/types/*` - All type definitions
- `src/utils/*` - All utility functions

## Package Exports

### Server-side (`remix-cache`)
```typescript
import { createCache } from 'remix-cache'
import type { Cache, CacheConfig } from 'remix-cache'
```

### Client-side (`remix-cache/react`)
```typescript
import { CacheProvider, useCache } from 'remix-cache/react'
import type { CacheProviderProps, UseCacheOptions } from 'remix-cache/react'
```

## Dependencies

### Production
- `ioredis` ^5.8.2 - Redis client
- `superjson` ^2.2.5 - Serialization
- `lru-cache` ^11.2.2 - Local in-memory cache

### Peer Dependencies (Optional)
- `@remix-run/node` ^2.0.0
- `@remix-run/react` ^2.0.0
- `react` ^18.0.0 || ^19.0.0
- `remix-utils` ^7.0.0

### Dev Dependencies
- `typescript` ^5.9.3
- `tsup` ^8.5.0
- `vitest` ^4.0.6
- `eslint` + TypeScript plugins
- `prettier`

## Build Output

### Size
- **Tarball**: 4.2 KB
- **Unpacked**: 14.0 KB
- **Total files**: 15

### Formats
- ESM (`.js`)
- CommonJS (`.cjs`)
- TypeScript declarations (`.d.ts`, `.d.cts`)
- Source maps (`.map`)

## Scripts

```bash
npm run build         # Build for production
npm run dev          # Build in watch mode
npm test             # Run tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint source code
npm run format       # Format code with Prettier
npm run typecheck    # Type check without emitting
npm publish          # Publish to npm (runs build automatically)
```

## Next Steps (Phase 1)

1. Implement `src/server/cache.ts` - Main Cache class
2. Wire up all the pieces (Redis, serializer, deduplicator, etc.)
3. Implement CacheDefinition get/set/invalidate
4. Write unit tests
5. Create basic example app

See `masterplan.md` for complete implementation plan.
