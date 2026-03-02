# MyGeotab Add-In API Documentation Feedback

**Date:** February 28, 2026  
**From:** Steve Hansen (stevehansen@geotab.com)  
**Context:** Developing FleetClaim, a React-based MyGeotab Add-In for incident evidence packaging

---

## Executive Summary

During development of a production Add-In, we encountered several documentation gaps that caused significant debugging time. This document outlines specific areas where the MyGeotab API documentation could be improved to help developers avoid common pitfalls.

---

## 1. `api.getSession()` Callback Signature

### The Problem
The `getSession()` method has a different callback signature than other API methods, but this isn't documented. We assumed it followed the standard `(successCallback, errorCallback)` pattern.

### Current Behavior
```javascript
// This is the ACTUAL signature (undocumented)
api.getSession((session) => {
    console.log(session.database, session.userName, session.sessionId);
});

// This does NOT work - second parameter is ignored
api.getSession(
    (session) => { /* success */ },
    (error) => { /* never called */ }
);
```

### Recommended Documentation Addition
Add a clear note in the Add-In API reference:

> **Note:** Unlike `api.call()`, the `getSession()` method takes a single callback function. There is no error callback parameter. If session retrieval fails, the callback may receive incomplete data (e.g., empty `sessionId`).

### Impact
- 4+ hours debugging "why isn't my error handler being called?"
- Incorrect error handling in production code

---

## 2. Session Warmup Timing in Add-Ins

### The Problem
When `getSession()` is called during Add-In initialization, it may return incomplete session data (empty `sessionId`, empty `userName`). The session needs to "warm up" before credentials are fully available.

### Current Behavior
```javascript
// In initialize() - may return empty sessionId
geotab.addin.myAddin = (api, state) => {
    api.getSession((session) => {
        console.log(session.sessionId); // Often empty string!
    });
};
```

### Workaround We Discovered
```javascript
// Make any API call first to ensure session is established
await api.call('GetSystemTime', {});

// NOW getSession returns valid data
api.getSession((session) => {
    console.log(session.sessionId); // Now populated
});
```

### Recommended Documentation Addition
Add to the Add-In Lifecycle section:

> **Session Initialization Timing**
> 
> The session may not be fully authenticated when your Add-In's `initialize()` function is called. For reliable session credentials:
> 
> 1. Wait for the `focus()` lifecycle event, OR
> 2. Make any API call (e.g., `GetSystemTime`) before calling `getSession()`
> 
> This ensures the authentication handshake has completed.

### Impact
- Intermittent failures in production
- Photos/MediaFiles failing to load due to missing sessionId
- Difficult to reproduce (timing-dependent)

---

## 3. MediaFile Authentication for Add-Ins

### The Problem
There's no documentation on how to construct authenticated URLs for MediaFile thumbnails or downloads from within an Add-In context.

### What Developers Need
```javascript
// How to build an authenticated MediaFile URL
const getMediaFileUrl = (mediaFileId, credentials) => {
    const params = new URLSearchParams({
        database: credentials.database,
        userName: credentials.userName,
        sessionId: credentials.sessionId
    });
    return `https://${credentials.server}/apiv1/MediaFile/${mediaFileId}?${params}`;
};
```

### Recommended Documentation Addition
Add a section on "Working with MediaFiles in Add-Ins":

> **Accessing MediaFile Content**
> 
> MediaFile URLs require authentication. In an Add-In context, append your session credentials as query parameters:
> 
> ```
> https://{server}/apiv1/MediaFile/{mediaFileId}?database={db}&userName={user}&sessionId={sessionId}
> ```
> 
> For thumbnails, the response will be the binary image data. Ensure your `sessionId` is valid (see Session Initialization Timing above).

### Impact
- Camera/photo features broken until we figured this out
- No examples in SDK or documentation

---

## 4. User Object vs Session Credentials

### The Problem
The relationship between `User.name` and `session.userName` is unclear. They contain different values.

### Current Behavior
```javascript
// From api.call('Get', { typeName: 'User', search: { isCurrentUser: true } })
user.name = "claimuser822"  // Short username/ID

// From api.getSession()
session.userName = "stevehansen@geotab.com"  // Login email
```

### Recommended Documentation Addition
Add clarification to the User object documentation:

> **User Identification Fields**
> 
> | Field | Description | Example |
> |-------|-------------|---------|
> | `User.name` | Internal username/identifier | `"jsmith"` |
> | `User.firstName` | Display first name | `"John"` |
> | `User.lastName` | Display last name | `"Smith"` |
> | `session.userName` | Login credential (usually email) | `"john.smith@company.com"` |
> 
> **Note:** `User.name` and `session.userName` are often different values. Use `session.userName` when you need the user's login email address.

### Impact
- Displayed wrong user identity in UI
- Confusing for audit trails ("who requested this?")

---

## 5. Official TypeScript Definitions

### The Problem
There are no official TypeScript definitions for the Add-In API, forcing developers to create their own (often incorrectly).

### Recommended Addition
Publish official types, either in the SDK or as `@types/mygeotab`:

```typescript
declare namespace Geotab {
    interface Api {
        call<T = unknown>(
            method: string, 
            params: object,
            successCallback?: (result: T) => void,
            errorCallback?: (error: GeotabError) => void
        ): Promise<T>;
        
        multiCall<T = unknown[]>(
            calls: Array<[string, object]>
        ): Promise<T>;
        
        getSession(callback: (session: SessionInfo) => void): void;
    }
    
    interface SessionInfo {
        database: string;
        userName: string;
        sessionId: string;
        server?: string;
    }
    
    interface PageState {
        getState(): Record<string, unknown>;
        setState(state: Record<string, unknown>): void;
        gotoPage(page: string, options?: object): boolean;
        hasAccessToPage(page: string): boolean;
        getGroupFilter(): Array<{ id: string }>;
    }
    
    interface GeotabError {
        name: string;
        message: string;
    }
}
```

### Impact
- Every TypeScript Add-In developer creates their own types
- Inconsistencies and bugs from incorrect type assumptions
- Poor IDE autocomplete experience

---

## 6. AddInData Size Limits and Best Practices

### The Problem
No documentation on maximum size for `AddInData.details` field or performance implications.

### Questions Developers Have
- What's the maximum size for the `details` JSON field?
- Should we store PDFs as base64 in AddInData or use external storage?
- What are the performance implications of large AddInData objects?
- Is there a limit on number of AddInData records per Add-In?

### Recommended Documentation Addition
> **AddInData Storage Limits**
> 
> | Constraint | Limit |
> |------------|-------|
> | `details` field size | X MB |
> | Records per Add-In per database | No hard limit (but affects query performance) |
> 
> **Best Practices:**
> - For binary data >100KB, consider external storage (GCS, S3) with reference IDs
> - Use pagination when querying large numbers of records
> - Consider archiving old records to maintain query performance

---

## 7. Mobile MyGeotab App Differences

### The Problem
The mobile MyGeotab app (iOS/Android) behaves differently than the desktop browser experience, but these differences aren't documented.

### Issues Encountered
- Some Zenith components render differently on mobile
- `blur()`/`focus()` lifecycle timing differs
- LocalStorage behavior may differ
- Some browser APIs unavailable

### Recommended Documentation Addition
Add a "Mobile Considerations" section:

> **Mobile App Compatibility**
> 
> When your Add-In runs in the MyGeotab mobile app:
> 
> - **Viewport:** Design for smaller screens; test on actual devices
> - **Lifecycle:** `focus()` and `blur()` timing may differ from desktop
> - **Storage:** LocalStorage is available but may be cleared more frequently
> - **Browser APIs:** Some APIs (e.g., certain clipboard operations) may be restricted
> - **Touch:** Ensure touch targets are at least 44x44px

---

## 8. Error Response Standardization

### The Problem
Error formats vary across different API methods, making consistent error handling difficult.

### Examples of Inconsistency
```javascript
// Some errors have this shape:
{ name: "InvalidUserException", message: "..." }

// Others have:
{ error: { code: "...", message: "..." } }

// Some just throw strings
"Authentication failed"
```

### Recommended Documentation Addition
Document the standard error format and any exceptions:

> **Error Handling**
> 
> API errors follow this structure:
> ```javascript
> {
>     name: string,      // Error type (e.g., "InvalidUserException")
>     message: string,   // Human-readable description
>     // Additional properties may vary by error type
> }
> ```
> 
> Always wrap API calls in try/catch and check for both thrown errors and callback errors.

---

## Summary of Recommendations

| Priority | Issue | Documentation Change |
|----------|-------|---------------------|
| 🔴 High | `getSession()` signature | Add callback signature note |
| 🔴 High | Session warmup timing | Add lifecycle timing section |
| 🔴 High | MediaFile authentication | Add authenticated URL examples |
| 🟡 Medium | User.name vs userName | Clarify field differences |
| 🟡 Medium | TypeScript definitions | Publish official .d.ts |
| 🟡 Medium | AddInData limits | Document size constraints |
| 🟢 Low | Mobile differences | Add mobile considerations |
| 🟢 Low | Error standardization | Document error formats |

---

## Appendix: FleetClaim Add-In

For context, these issues were discovered while building FleetClaim, an Add-In for automated incident evidence packaging. The Add-In:

- Uses React + TypeScript with Zenith components
- Integrates with MediaFile API for photo evidence
- Stores reports in AddInData
- Generates PDFs via external API
- Runs on both desktop and mobile MyGeotab

Repository: https://github.com/beefo/fleetclaim

---

*This feedback is intended to help improve the developer experience for the MyGeotab ecosystem. Happy to discuss any of these points in more detail.*
