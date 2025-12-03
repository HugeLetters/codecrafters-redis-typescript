# Agent Guidelines for CodeCrafters Redis TypeScript

## Build/Lint/Test Commands
- **Build**: `bun run dev` (server) or `bun run dev:client` (client)
- **Lint**: `biome check .` (check) or `biome check --write .` (fix)
- **Typecheck**: `tsc`
- **Test**: `bun test` (run all tests) or `bun test <file>` (single test file)

## Code Style Guidelines

### Formatting
- Tabs for indentation
- Double quotes for strings
- JSON trailing commas allowed

### TypeScript Configuration
- Strict TS: all checks enabled, ESNext target/modules, React JSX, path mapping `$*` → `./app*`
- Effect plugin with aliases, strict options: noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride

### Imports
- `$` prefix for app imports (e.g., `$/command`)
- Effect aliases: `Array` → `Arr`, `String` → `Str`, `Function` → `Fn`, `Number` → `Num`, `BigInt` → `BigInteger`
- Trailing underscores for schema exports (e.g., `Array_`, `Set_`)
- Group: Effect modules, app modules, utilities

### Naming Conventions
- Functions: camelCase
- Types/Interfaces: PascalCase
- Constants: camelCase or UPPER_SNAKE_CASE
- Schema types: PascalCase descriptive
- Services: PascalCase ending with "Service"

### Error Handling
- `Effect.catchTag/catchTags` for typed errors
- `ParseResult` for schema validation with custom formatting
- `Logger.withSpan` for tracing
- `Effect.flip` in tests for failures
- Log socket/parsing errors

### Function Patterns
- `Effect.fn` for tracing/error handling
- `Effect.gen` for generators with yield*
- `flow`/`pipe` for composition
- `Match` for pattern matching
- Prefer functional over imperative

### Networking/Socket Handling
- Socket resources: Use `Effect.acquireRelease` for managing socket lifecycles, with async opening and synchronous closing
- Connection states: For "opening" readyState, listen to 'connect' (success), 'error' (failure), and 'close' (failure/cleanup) events
- Event cleanup: Always remove all event listeners in cleanup functions to prevent memory leaks
- Timeout handling: 'timeout' event only emitted if `socket.setTimeout()` is called; connection failures are covered by 'error' event
- Write operations: Check `socket.writable` before writing, handle errors in async callbacks

### Testing
- `test.effect` for Effect tests
- `expect` assertions
- `Effect.flip` for failures
- `describe` organization
- Custom utils in `effect-buntest.ts`
- Property-based with FastCheck
- CommandArg: `CommandArg.parse` for combinators, test positive/negative cases, `pipe` chaining, error formatting, filter predicates, verify InvalidArgument causes

### Code Organization
- Effect patterns: `Effect.Service` DI, Schema validation, Layer composition
- Functional patterns preferred
- RESP parsing with schemas, job queues, KV with TTL/cleanup
- Socket handling: Separate concerns with dedicated functions for resource creation, writing, and data handling

### Reference Libraries
In `.agents/reference/`, LLMs may find used libraries for reference.