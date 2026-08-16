# JCSafeScan — Demo Runbook

Everything below works right now against the local server. The demo deliberately
stops at **placing a real call** (Twilio isn't enabled yet).

## Start

```bash
cd backend
npm run dev          # http://localhost:4000
```

Postgres must be running (Windows service `postgresql-x64-17`).
Database `jcscantoconnect` is already migrated and seeded.

If the DB is ever reset:

```bash
npx prisma migrate deploy
npm run seed
```

## Demo login

| Field  | Value           |
| ------ | --------------- |
| Mobile | `+14155550123`  |
| OTP    | `1234`          |
| Name   | Raj Gaikwad     |

The OTP is hardcoded (`HARDCODED_OTP`, default `1234`) — no SMS is sent.

## Seeded QR codes (all ACTIVE)

| Type    | Label                    | Ext.  | Scan URL                  |
| ------- | ------------------------ | ----- | ------------------------- |
| CAR     | MH56GT564                | 01011 | `/scan/demo-car-qr`       |
| DOG     | Bruno                    | 01012 | see `GET /api/qr`         |
| LUGGAGE | Blue Samsonite Cabin Bag | 01013 | see `GET /api/qr`         |
| OTHER   | MacBook Pro 16           | 01014 | see `GET /api/qr`         |

## Demo script

### 1. Login
```bash
curl -X POST http://localhost:4000/api/auth/send-otp \
  -H "Content-Type: application/json" -d '{"mobile":"+14155550123"}'

curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"mobile":"+14155550123","otp":"1234"}'
```
Save the returned `token` as `$TOKEN`.

### 2. Create a QR
`skipPayment: true` makes it go straight to **ACTIVE** and skips Stripe entirely
(Stripe is still on placeholder keys, so leave this flag on for the demo).

```bash
curl -X POST http://localhost:4000/api/qr/draft \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"DOG","ownerName":"Raj Gaikwad","ownerMobile":"+14155550123",
       "ownerEmail":"raj@example.com","addressLine1":"221B Baker Street",
       "city":"San Francisco","state":"CA","zipCode":"94105",
       "name":"Bruno","breed":"Golden Retriever","skipPayment":true,
       "emergencyContacts":[{"name":"Jane Doe","relationship":"Spouse","mobile":"+14155550456"}]}'
```

### 3. Show the printable QR
```bash
curl -o card.pdf http://localhost:4000/api/qr/<QR_ID>/download/pdf -H "Authorization: Bearer $TOKEN"
curl -o code.png http://localhost:4000/api/qr/<QR_ID>/download/png -H "Authorization: Bearer $TOKEN"
```
The PDF is an A6 black/yellow emergency sticker: framed QR, item label,
emergency-contact count, and the extension-number pill.

### 4. Scan it
Open the scan page in a browser:

    http://localhost:4000/scan/demo-car-qr

**To scan with a real phone**, put the phone on the same Wi-Fi and use the LAN URL —
the generated QR images already encode it:

    http://192.168.29.12:4000/scan/demo-car-qr

The page shows the item, and the owner + emergency contacts with **masked**
name and number (`R*j G*****d`, `*******0123`). Nothing sensitive is exposed
before a call connects.

> If the LAN IP changes, update `APP_BASE_URL` and `SCAN_PUBLIC_URL` in `.env`,
> restart the server, and re-download the QR images.

### 5. Show what the owner sees
Every scan is logged with device, browser, IP and (if allowed) GPS coordinates,
and fires a notification.

```bash
curl http://localhost:4000/api/qr/<QR_ID>/scan-logs   -H "Authorization: Bearer $TOKEN"
curl http://localhost:4000/api/notifications          -H "Authorization: Bearer $TOKEN"
```

Also demoable: enable/disable a QR, edit its details, emergency contacts,
blocked callers, and `GET /api/users/me`.

### 6. Where the demo stops
Pressing **Call Owner** on the scan page returns:

```
503  Calling is not enabled yet. Add real Twilio credentials to .env
     to turn on masked calls and SMS alerts.
```

That's the intended stopping point. Everything up to it — QR creation, the
printable sticker, scanning, masking, scan logging, notifications — is live.

## Interactive API docs

    http://localhost:4000/api/docs

## Not enabled (placeholder credentials)

| Feature                  | Status                                              |
| ------------------------ | --------------------------------------------------- |
| Masked calling (Twilio)  | Off — returns a clean 503                            |
| SMS alerts (Twilio)      | Off — sent as part of the call flow                  |
| Payments (Stripe)        | Off — bypass with `skipPayment: true`                |
| Image upload to S3       | Falls back to local disk at `public/uploads`         |
| OTP delivery             | Hardcoded `1234`, no SMS sent                        |
