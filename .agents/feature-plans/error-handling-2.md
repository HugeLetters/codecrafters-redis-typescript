# More Granular Error Types Plan

## Overview
Improve error handling by defining more granular error types.

## Details
- **Current Issue**: Generic errors for parsing, commands.
- **Solution**:
  - Define specific error tags: ParseError, CommandError, ConnectionError.
  - Use Effect.catchTag for targeted handling.
- **Files**: `app/schema/resp/error.ts`, `app/command/index.ts`
- **Impact**: Better debugging and handling.

## Implementation Steps
1. Define new error tags.
2. Update error throwing sites.
3. Adjust catch handlers.
4. Test error specificity.

## Testing
- Test different error scenarios and handling.