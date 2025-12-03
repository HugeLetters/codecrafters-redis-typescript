# Optimize RESP Parsing for Large Payloads Plan

## Overview
Improve performance by optimizing RESP parsing for large payloads.

## Details
- **Current Issue**: Parsing uses leftover approach but may create unnecessary copies for large strings.
- **Solution**: 
  - Use streaming parsing where possible, avoid full buffer copies.
  - Optimize string decoding: use Buffer.slice instead of toString for large bulks.
  - Cache frequently used schemas or parsers.
- **Files**: `app/schema/resp/main.ts`, `bulk.ts`, etc.
- **Impact**: Reduce memory usage and parsing time for large data.

## Implementation Steps
1. Analyze current parsing logic.
2. Implement streaming/buffer optimizations.
3. Add caching.
4. Benchmark improvements.

## Testing
- Add benchmarks for parsing large payloads.