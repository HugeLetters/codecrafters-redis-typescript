# Custom Command Input Plan

## Overview
Improve existing CLI client by adding custom command input.

## Details
- **Current Issue**: Only preset keys.
- **Solution**:
  - Add text input field for typing commands.
  - Parse and send custom RESP commands.
- **Files**: `app/client/index.tsx`
- **Impact**: More flexible testing.

## Implementation Steps
1. Modify client UI for input.
2. Parse input into RESP.
3. Send to server.
4. Test functionality.

## Testing
- Manual testing of custom input.