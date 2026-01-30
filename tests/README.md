# Tests Directory

This directory contains test files for debugging and testing project logic.

## Purpose
- Bug hunting and troubleshooting
- Testing specific functionality 
- Isolated logic testing
- Development utilities

## Guidelines
- Keep test files organized
- Use descriptive filenames
- Clean up temporary test files
- Document test purposes in comments

## File Naming Convention
- `test-[feature].js/ts` - Feature-specific tests
- `debug-[issue].js/ts` - Bug hunting scripts
- `util-[purpose].js/ts` - Testing utilities
## Video Healer Tests

### test-mongodb-connection.ts
Tests MongoDB connectivity to both databases:
- spk-encoder-gateway (jobs database)
- threespeak (videos database)

Run with:
```bash
cd backend
npx ts-node ../tests/test-mongodb-connection.ts
```

### test-video-healer.ts
Comprehensive test of the Video Healer Service:
- Retrieves recently completed jobs
- Checks video entries in threespeak database
- Detects videos that need healing
- Tests healing logic (dry run)

Run with:
```bash
cd backend
npx ts-node ../tests/test-video-healer.ts
```
