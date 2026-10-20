# Slotiva

Accessible appointment booking, built with **React, TypeScript and Vite**.

> Portfolio project · First frontend increment · Not a production booking service.

## Run locally

Requires Node.js 22.12+ (or 24+) and npm.

```bash
npm ci
npm run dev
```

```bash
npm run lint
npm test
npm run build
npm run preview
```

## Current features

- Portuguese booking flow: service → business day → time → contact information.
- Confirmation and cancellation.
- Demo administration view with chronologically sorted appointments.
- Local persistence; reload the page to retain demo bookings.
- Responsive layout, native form controls, keyboard focus, skip link and error announcements.
- Unit tests for availability, validation and local booking conflicts; GitHub Actions CI.

Use fictional contact details. Data stays in browser localStorage; no confirmation email is sent. Clear browser site data to reset the demo. The professional and services are fictional.

## Architecture and boundaries

`src/booking.ts` contains pure booking rules. `src/App.tsx` orchestrates the demo UI and storage. Dates use local calendar keys, and the interface presents the professional's timezone as America/Sao_Paulo. The slot schedule is fixed and durations fit within its 90-minute spacing. Availability is weekdays over the next fourteen days; holidays are not modeled.

This version **does not** provide authentication, shared storage, a backend, cross-browser synchronization, or atomic conflict prevention. Reading localStorage before saving catches sequential local conflicts but is not a concurrency guarantee. The demo administration screen is public by design. Accessibility has not yet undergone a full audit, and UI end-to-end testing is pending.

## Next increments

1. Extract screens/components, introduce routing, API query state and validated forms.
2. FastAPI + PostgreSQL: services, weekly availability, bookings and cancellation tokens.
3. Enforce overlapping interval prevention in PostgreSQL, with a concurrency integration test and HTTP 409 on conflicts.
4. Add authenticated professional administration, rescheduling and availability editing.
5. English locale, end-to-end tests, accessibility audit and deployment.

The intended final product is a small, complete booking application. Payments, messaging and multi-professional organizations remain outside the initial MVP.
