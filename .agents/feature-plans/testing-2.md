# Expand Property-Based Testing Plan

## Overview
Enhance testing with more property-based tests.

## Details
- **Current Issue**: Limited FastCheck usage.
- **Solution**:
  - Add properties for RESP parsing: arbitrary inputs, ensure parse/encode roundtrip.
  - Test KV operations with random keys/values.
- **Files**: `app/schema/resp/main.test.ts`, `app/kv/index.test.ts`
- **Impact**: Find edge cases.

## Implementation Steps
1. Define properties.
2. Implement with FastCheck.
3. Run property tests.
4. Fix any failures.

## Testing
- Run property tests.