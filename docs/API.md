# FleetClaim API Documentation

The FleetClaim API provides endpoints for PDF generation, email delivery, and report management.

## Base URL

- **Production**: `https://fleetclaim-api-589116575765.us-central1.run.app`
- **Local Development**: `http://localhost:5000`

## Authentication

Most endpoints require Geotab session credentials passed via HTTP headers:

| Header | Description |
|--------|-------------|
| `X-Geotab-Database` | Geotab database name |
| `X-Geotab-UserName` | User email address |
| `X-Geotab-SessionId` | Session ID from `api.getSession()` |
| `X-Geotab-Server` | Geotab server (default: `my.geotab.com`) |

The API validates credentials by calling Geotab's `GetSystemTime` API.

---

## Endpoints

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-28T12:00:00Z"
}
```

---

### Generate PDF (Authenticated)

Generate and download a PDF report using the user's Geotab session.

```
POST /api/pdf
```

**Headers:**
```
Content-Type: application/json
X-Geotab-Database: your_database
X-Geotab-UserName: user@example.com
X-Geotab-SessionId: abc123...
X-Geotab-Server: my.geotab.com
```

**Request Body:**
```json
{
  "reportId": "rpt_abc123"
}
```

**Response:**
- `200 OK` - PDF file download
  - Content-Type: `application/pdf`
  - Content-Disposition: `attachment; filename="incident-report-rpt_abc123.pdf"`
- `401 Unauthorized` - Invalid or expired session
- `404 Not Found` - Report not found
- `429 Too Many Requests` - Rate limit exceeded (10/min)

---

### Generate PDF (Service Account)

Download a PDF using service account credentials. Requires the user to exist in the target database.

```
GET /api/pdf/{database}/{reportId}?userName={userName}
```

**Parameters:**
- `database` (path) - Geotab database name
- `reportId` (path) - Report ID
- `userName` (query) - User's email for authorization verification

**Response:**
- `200 OK` - PDF file download
- `401 Unauthorized` - User not found in database
- `404 Not Found` - Report not found or database not configured
- `429 Too Many Requests` - Rate limit exceeded

**Example:**
```
GET /api/pdf/demo_fleetclaim/rpt_abc123?userName=steve@example.com
```

---

### Send Report via Email

Send a report to an email address with PDF attachment.

```
POST /api/email
```

**Headers:**
```
Content-Type: application/json
X-Geotab-Database: your_database
X-Geotab-UserName: user@example.com
X-Geotab-SessionId: abc123...
```

**Request Body:**
```json
{
  "reportId": "rpt_abc123",
  "email": "recipient@example.com",
  "message": "Optional custom message"
}
```

**Response:**
- `200 OK`:
  ```json
  {
    "success": true,
    "message": "Email sent to recipient@example.com"
  }
  ```
- `400 Bad Request` - Invalid email address or missing reportId
- `401 Unauthorized` - Invalid or expired session
- `404 Not Found` - Report not found
- `429 Too Many Requests` - Rate limit exceeded (5/min)
- `503 Service Unavailable` - Email service not configured

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/pdf` | 10 requests | 1 minute |
| `GET /api/pdf/{db}/{id}` | 10 requests | 1 minute |
| `POST /api/email` | 5 requests | 1 minute |

When rate limited, the API returns `429 Too Many Requests`:
```json
{
  "error": "Too many requests. Please try again later."
}
```

---

## CORS

The API allows requests from:
- `*.geotab.com`
- `*.geotab.ca`
- `localhost`
- `*.run.app` (GCP Cloud Run)

---

## Error Responses

### 401 Unauthorized

Returned when credentials are missing, invalid, or expired.

```json
{
  "type": "https://tools.ietf.org/html/rfc7235#section-3.1",
  "title": "Unauthorized",
  "status": 401
}
```

### 404 Not Found

```json
{
  "error": "Report not found"
}
```

### 500 Internal Server Error

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.6.1",
  "title": "Error",
  "status": 500,
  "detail": "Error generating PDF: ..."
}
```

---

## Add-In Integration

The FleetClaim Add-In uses these endpoints via the `reportService`:

```typescript
import { downloadPdf, sendReportEmail } from '@/services';

// Download PDF (uses X-headers)
await downloadPdf(reportId, credentials);

// Send email
await sendReportEmail(reportId, 'recipient@example.com', credentials, 'Custom message');
```

The credentials are captured from `api.getSession()` in the Add-In.

---

## Webhook Payload (Worker)

When the worker generates a report and notifications are configured:

```json
{
  "eventType": "incident.report.generated",
  "timestamp": "2026-02-28T14:35:00Z",
  "report": {
    "id": "rpt_abc123",
    "vehicleName": "Truck 42",
    "driverName": "John Smith",
    "occurredAt": "2026-02-28T14:32:00Z",
    "severity": "high",
    "summary": "Hard braking event at 85 km/h"
  }
}
```
