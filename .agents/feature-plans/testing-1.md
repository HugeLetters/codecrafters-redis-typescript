# Add Integration Tests for Full Flows Plan

## Overview
Enhance testing by adding integration tests.

## Details
- **Current Issue**: Unit tests only, no end-to-end.
- **Solution**:
  - Test client-server interaction: send command, receive response.
  - Use test server setup with Effect.TestServices.
- **Files**: New test files in `app/test/`
- **Impact**: Catch integration bugs.

## Implementation Steps
1. Set up test server.
2. Write integration test cases.
3. Run and verify.
4. Add to test suite.

## Testing
- Run integration tests.