# Improve KV Cleanup Plan

## Overview
Improve performance by batching KV expirations.

## Details
- **Current Issue**: Cleanup checks one key per second, inefficient for many keys.
- **Solution**:
  - Change cleanup to batch: check multiple keys per run, or use a priority queue for soon-to-expire keys.
  - Run cleanup more frequently but in batches.
  - Use a separate fiber for cleanup to not block main operations.
- **Files**: `app/kv/index.ts`
- **Impact**: Better scalability for high key counts.

## Implementation Steps
1. Modify cleanup logic to batch.
2. Implement priority queue if needed.
3. Run in separate fiber.
4. Test with many keys.

## Testing
- Test KV with many expiring keys.