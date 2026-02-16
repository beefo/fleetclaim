# FleetClaim API Documentation

The FleetClaim API provides public endpoints for viewing and downloading incident reports via shareable links.

## Base URL

- **Production**: `https://fleetclaim-api-xxxxx-uc.a.run.app`
- **Local Development**: `http://localhost:5001`

## Endpoints

### Health Check

Check if the API is running.

```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-02-15T14:30:00Z"
}
```

---

### View Report (HTML)

Render an incident report as an interactive HTML page.

```
GET /r/{token}
```

**Parameters:**
- `token` (path) - Signed share link token

**Response:**
- `200 OK` - HTML page with report details
- `404 Not Found` - Invalid token or report not found

**Example:**
```
GET /r/cnB0X2FiYzEyM3xteWRifGFiY2RlZmc
```

**Features of the HTML page:**
- Severity badge and summary
- Incident details (vehicle, driver, time, weather)
- Speed metrics (speed at event, max speed, deceleration)
- Interactive speed profile chart
- GPS trail map (using Leaflet + OpenStreetMap)
- Diagnostic codes table
- PDF download link

---

### Download Report (PDF)

Download the incident report as a PDF file.

```
GET /r/{token}/pdf
```

**Parameters:**
- `token` (path) - Signed share link token

**Response:**
- `200 OK` - PDF file download
  - Content-Type: `application/pdf`
  - Content-Disposition: `attachment; filename="incident-report-{id}.pdf"`
- `404 Not Found` - Invalid token or report not found

**Example:**
```
GET /r/cnB0X2FiYzEyM3xteWRifGFiY2RlZmc/pdf
```

---

## Share Link Tokens

Share link tokens are signed to prevent tampering:

1. Token format: `base64url(reportId|database|signature)`
2. Signature is HMAC-SHA256 (truncated to 8 bytes)
3. Tokens are stateless - the API fetches fresh data from Geotab on each request
4. 5-minute cache to reduce API load

**Security:**
- Tokens cannot be forged without the signing key
- Tokens cannot be modified to access different reports
- Each deployment must use a secret signing key

---

## Error Responses

### 404 Not Found

Returned when the share link is invalid or the report doesn't exist.

```html
<!DOCTYPE html>
<html>
  <body>
    <h1>Oops!</h1>
    <p>Invalid or expired link</p>
  </body>
</html>
```

### 500 Internal Server Error

Returned when unable to fetch the report from Geotab.

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.6.1",
  "title": "Error",
  "status": 500,
  "detail": "Unable to retrieve report"
}
```

---

## Webhook Payload

When notifications are configured, the worker sends this payload to the webhook URL:

```json
{
  "eventType": "incident.report.generated",
  "timestamp": "2024-02-15T14:35:00Z",
  "report": {
    "id": "rpt_abc123",
    "incidentId": "ExceptionEvent-xyz",
    "vehicleId": "b123",
    "vehicleName": "Truck 42",
    "driverId": "d456",
    "driverName": "John Smith",
    "occurredAt": "2024-02-15T14:32:00Z",
    "generatedAt": "2024-02-15T14:35:00Z",
    "severity": "High",
    "summary": "Hard braking event involving Truck 42 at 85 km/h (Clear conditions)",
    "shareUrl": "https://fleetclaim.app/r/abc123",
    "evidence": {
      "gpsPointCount": 120,
      "maxSpeedKmh": 105,
      "speedAtEventKmh": 45,
      "decelerationMps2": -8.2,
      "weatherCondition": "Clear",
      "diagnosticCount": 3
    }
  }
}
```

**Webhook behavior:**
- POST request with JSON body
- Expects 2xx response for success
- No retries on failure (logged but not blocking)
