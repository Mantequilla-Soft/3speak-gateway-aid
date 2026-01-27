# Direct Encoding Feature

**Date Implemented**: January 27, 2026  
**Status**: Production Ready  
**Purpose**: Monitor and track embed video encoding jobs from the 3Speak parallel video system

---

## Overview

The Direct Encoding feature provides monitoring and analytics for the embed video system, which runs parallel to the legacy Gateway-based encoding system. These videos are processed through a dispatch service that directly assigns jobs to encoders without using the AID/DID gateway system.

### Key Differences from Legacy System

| Aspect | Legacy Jobs | Direct Encoding (Embed) |
|--------|------------|------------------------|
| Database | `spk-encoder-gateway` | `threespeak` |
| Collections | `jobs` | `embed-jobs`, `embed-video` |
| Encoder Identification | DID keys | Simple names (Eddie, Snapie) |
| Progress Tracking | Percentage-based | Status-based only |
| Gateway System | Uses Gateway Aid fallback | Independent dispatch system |
| Video Types | Standard 3Speak videos | Embed videos (including shorts) |

---

## Data Model

### embed-jobs Collection

Primary source for job lifecycle tracking.

**Key Fields:**
- `owner` - Video owner username
- `permlink` - Unique video identifier
- `status` - Job status: `completed`, `failed`, `processing`
- `assignedWorker` - Encoder name (e.g., "Eddie", "Snapie")
- `encoderJobId` - Unique job ID for the encoder
- `assignedAt` - When job was assigned to encoder
- `webhookReceivedAt` - When encoder reported completion
- `lastError` - Error message if any occurred
- `attemptCount` - Number of retry attempts
- `createdAt` / `updatedAt` - Timestamps

### embed-video Collection

Video metadata and publishing information.

**Key Fields:**
- `owner` - Video owner (matches job)
- `permlink` - Video ID (matches job)
- `frontend_app` - Source application (e.g., "snapie-mobile")
- `status` - Video status: `published`, `failed`, `processing`
- `input_cid` - IPFS CID for source video
- `manifest_cid` - IPFS CID for encoded manifest
- `thumbnail_url` - Thumbnail image URL
- `short` - Boolean flag for short-form video (≤60 seconds)
- `duration` - Video duration in seconds
- `size` - File size in bytes
- `embed_url` - Published video URL (available when `processed: true`)
- `processed` - Boolean indicating enrichment completion
- `views` - View count (available after enrichment)

**Note**: The `embed-video` collection gets enriched by a service that runs hourly. Before enrichment, entries may lack `embed_url`, `views`, and other metadata.

---

## System Architecture

### Backend Implementation

**Location**: `backend/src/`

1. **MongoDB Service Methods** (`services/mongodb.ts`)
   - `getEmbedJobs(limit: number)` - Fetches recent jobs and joins with video metadata
   - `getEmbedJobStats()` - Calculates daily statistics and encoder distribution

2. **API Routes** (`routes/direct-encoding.ts`)
   - `GET /api/direct-encoding/jobs` - Returns enriched job list (default: 30 jobs)
   - `GET /api/direct-encoding/stats` - Returns statistics dashboard data

3. **Server Registration** (`server.ts`)
   - Route mounted at `/api/direct-encoding`

### Frontend Implementation

**Location**: `frontend/src/`

1. **Page Component** (`pages/DirectEncoding.tsx`)
   - Statistics cards (jobs today, completed, failed, avg time)
   - Encoder workload distribution display
   - Job table with enriched data
   - Auto-refresh every 10 seconds

2. **Navigation** (`components/Layout.tsx`)
   - Menu item: "Direct Encoding" with VideoLibrary icon
   - Route: `/direct-encoding`

---

## Features

### Statistics Dashboard

**Cards Display:**
- Total jobs today
- Completed jobs today
- Failed jobs today
- Average encoding time

**Encoder Workload:**
- Color-coded chips showing job count per encoder
- Visual distribution of work across encoders

### Job Table

**Columns:**
1. **Owner** - Username of video owner
2. **Video ID** - Permlink (clickable link if published to https://snapie.io/)
3. **Status** - Smart status badges:
   - ✅ Success: Job completed + video published
   - ⚠️ Encoded (Publish Failed): Job completed but video failed
   - ❌ Failed: Job failed
   - 🔄 Awaiting Enrichment: Job completed, video not yet enriched
4. **Encoder** - Color-coded chip with encoder name
5. **Source App** - Frontend application that created the video
6. **Size** - File size in MB
7. **Encoding Time** - Duration from assignment to webhook
8. **Views** - View count (if enriched)
9. **Errors** - Warning icon with tooltip if `lastError` exists

**Special Indicators:**
- "Short" badge for videos with `short: true`
- Self-healing system notice alert

### Real-time Updates

- Auto-refresh every 10 seconds
- Live data from MongoDB without caching
- Immediate reflection of new jobs and status changes

---

## Self-Healing System

The dispatch system includes automatic error recovery:

- Jobs may encounter temporary errors (e.g., IPFS timeouts)
- System automatically retries failed operations
- `lastError` field records issues even if ultimately resolved
- Jobs can show `status: "completed"` with `lastError` present (recovered from failure)

**Common Errors:**
- "Both 3Speak gateway and local IPFS failed. Gateway: timeout of 300000ms exceeded"
- Indicates fallback attempts were made before success/failure

---

## Status Resolution Matrix

| Job Status | Video Status | Displayed Status | Meaning |
|-----------|-------------|------------------|---------|
| completed | published | Success | Fully completed and published |
| completed | failed | Encoded (Publish Failed) | Encoding worked, publishing failed |
| completed | (none) | Awaiting Enrichment | Not yet enriched by hourly service |
| failed | (any) | Failed | Encoding failed |

---

## Video Links

Published videos link to **snapie.io**:
- Format: `https://snapie.io/{embed_url}`
- Only shown when `video.processed === true` and `embed_url` exists
- Will be updated to support 3speak.tv shorts in the future

---

## Technical Notes

### Database Connection

The feature connects to the `threespeak` database using the existing MongoDB connection. No additional configuration required.

### Performance

- Queries limited to last 30 jobs by default
- Aggregation pipelines used for statistics
- Parallel Promise.all() for efficient data enrichment
- No impact on existing legacy job monitoring

### Isolation

The Direct Encoding feature is completely isolated:
- Separate database and collections
- Separate API routes
- Separate frontend page
- No shared state or logic with legacy system
- Can be safely disabled or modified without affecting other features

---

## Future Enhancements

**Potential Improvements:**
1. Pagination for job history beyond 30 entries
2. Filter by encoder, source app, or date range
3. Detailed view modal for individual jobs
4. Real-time WebSocket updates instead of polling
5. Export functionality for reporting
6. Integration with 3speak.tv when shorts feature launches
7. Error analytics and failure pattern detection
8. Encoder performance metrics and comparison

---

## Maintenance

### Monitoring

Check the Direct Encoding page regularly for:
- Unusual error rates
- Encoder imbalances (one encoder handling most jobs)
- Extended encoding times
- Failed jobs that don't recover

### Troubleshooting

**No jobs displaying:**
- Verify MongoDB connection to `threespeak` database
- Check that `embed-jobs` collection exists and has data
- Inspect browser console for API errors

**Missing video metadata:**
- Normal if video was recently created (hourly enrichment service)
- Check `embed-video` collection directly in MongoDB

**Incorrect video links:**
- Verify `embed_url` field exists in video document
- Ensure `processed: true` is set
- Check that snapie.io is accessible

---

## API Reference

### GET /api/direct-encoding/jobs

Fetch recent embed encoding jobs with enriched video metadata.

**Query Parameters:**
- `limit` (optional): Number of jobs to return (default: 30)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "6978bc22c7b558c0fbbbc23f",
      "owner": "meno",
      "permlink": "3ru9bw09",
      "status": "completed",
      "assignedWorker": "Eddie",
      "encoderJobId": "direct-1769520173465-b81x73hfd",
      "assignedAt": "2026-01-27T13:22:53.498Z",
      "webhookReceivedAt": "2026-01-27T13:22:58.359Z",
      "lastError": null,
      "video": {
        "frontend_app": "snapie-mobile",
        "status": "published",
        "short": true,
        "size": 65648313,
        "embed_url": "@elsalvadorian/snap-1769535597325",
        "processed": true,
        "views": 5
      }
    }
  ]
}
```

### GET /api/direct-encoding/stats

Fetch statistics about embed encoding jobs.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalToday": 45,
    "completedToday": 42,
    "failedToday": 3,
    "encoderDistribution": [
      { "encoder": "Eddie", "count": 25 },
      { "encoder": "Snapie", "count": 20 }
    ],
    "avgEncodingTimeMs": 82000
  }
}
```

---

## Related Documentation

- [Gateway AID Encoder Implementation](../docs/GATEWAY_AID_ENCODER_IMPLEMENTATION.md)
- [Gateway AID Fallback System](../docs/GATEWAY_AID_FALLBACK_SYSTEM.md)
- [Project Setup](../docs/project-setup.md)
