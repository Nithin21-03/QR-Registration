# ZYNTRA ’26 · Standalone Pass & Food Scanner Website
**Official Production-Ready Scanner & Verification System for ZYNTRA '26 Fest**
*Sapthagiri NPS University (SNPSU), Bengaluru*

---

## ⚡ Overview

The **ZYNTRA PASS Scanner** is a standalone, mobile-first web application designed for campus entrance volunteers, security staff, and food distribution teams. It connects directly to your live **ZYNTRA PostgreSQL / Supabase** database without modifying or rebuilding your existing registration system.

### Key Capabilities:
1. **Main Entrance QR Scanner**:
   - Live camera scanner with automatic rear/front camera selection, cyber scanning laser, and flashlight torch toggle.
   - Fast fallback for image/screenshot upload and manual search (by Pass ID, USN/Student ID, email, or name).
   - High-contrast visual and audio feedback: Green glow + affirmative cyber chime for valid passes.

2. **Separate Food / Meal Collection Scanner**:
   - Dedicated meal checkpoint mode.
   - Immediate detection if meal was already claimed, preventing double food handouts with timestamp and counter stamp.

3. **Duplicate-Scan & Eligibility Protection**:
   - **VALID (Green)**: Records first-time entrance check-in with gate and volunteer stamp.
   - **DUPLICATE (Amber Warning)**: "ATTENTION: ALREADY CHECKED IN" with exact prior scan timestamp and station.
   - **DUPLICATE FOOD (Red/Amber)**: "MEAL ALREADY REDEEMED" with redemption timestamp.
   - **INVALID / NOT FOUND (Red)**: Directs attendee to festival Registration Desk.

4. **Real-time Admin Attendance & Meal Analytics**:
   - Live metrics: Total Registered, Checked-In %, Food Claimed %, Remaining.
   - Competition & event-by-event check-in breakdown.
   - College / University attendance distribution.
   - Audit stream of the last 30 scans.

5. **Searchable Attendee Directory & Management**:
   - Filter by Checked In, Pending, Food Claimed, or Food Pending.
   - Quick manual Check-In, Food Claim, and Undo controls.
   - One-click **Export to CSV** for official attendance records.
   - Printable / Digital Pass modal with dynamic scannable QR code.

6. **Web Audio API & Vibration Haptics**:
   - 100% offline synthesizer: Success chime, duplicate warning, meal chime, error buzzer.
   - Native mobile vibration feedback on supported devices.

---

## 🚀 Quick Start

### 1. Start Development Server (Frontend + Backend API):
```bash
npm run dev
```
- **Scanner Web App**: [http://localhost:5174](http://localhost:5174)
- **Backend API**: [http://localhost:5001](http://localhost:5001)

### 2. Run Production Server:
```bash
npm start
```
Starts the unified Node/Express server serving the optimized production build on port `5001`.

---

## 🛰️ Testing on Volunteer Mobile Phones over Wi-Fi

Vite is configured with `host: true`. When you run `npm run dev`, Vite will display your local network IP (e.g., `http://192.168.1.X:5174`).
Volunteers on the same Wi-Fi can open that link on their phones (iOS Safari or Android Chrome) to immediately scan passes using their phone's camera!

---

## 🗄️ Database & Schema Integration

Connected to your live **Supabase PostgreSQL** instance:
`postgresql://postgres:***@db.yjmkprrvjhvpsrnnlugn.supabase.co:5432/postgres`

### Extended Schema Fields:
- `registrations`:
  - `checked_in` (BOOLEAN DEFAULT FALSE)
  - `checked_in_at` (TIMESTAMP WITH TIME ZONE)
  - `checked_in_by` (VARCHAR)
  - `food_claimed` (BOOLEAN DEFAULT FALSE)
  - `food_claimed_at` (TIMESTAMP WITH TIME ZONE)
  - `food_claimed_by` (VARCHAR)
- `attendance_scans` (Audit Log Table):
  - `id` (SERIAL PRIMARY KEY)
  - `ticket_id` (VARCHAR)
  - `scan_type` ('MAIN_ENTRANCE' | 'FOOD_COLLECTION')
  - `scanner_station` (VARCHAR)
  - `volunteer_name` (VARCHAR)
  - `result` ('VALID' | 'DUPLICATE' | 'FOOD_CLAIMED' | 'DUPLICATE_FOOD' | 'INVALID')
  - `scanned_at` (TIMESTAMP WITH TIME ZONE)

---

## 🎫 Sample Test Passes Included

You can click any of the sample passes in the **One-Click Test Passes** drawer or scan their QR codes:

| Pass ID | Name | College | Event |
| :--- | :--- | :--- | :--- |
| `ZY-4821-B7E2` | Adarsh Rao | Sapthagiri NPS University | Project / Paper Presentation |
| `ZY-7734-C9A1` | Sneha Venkatesh | Ramaiah Institute of Technology | Prompt Detection + Pixel Art |
| `ZY-1092-D4F3` | Karthik Subramanian | BMS College of Engineering | Crime Scene: Forensic AI |
| `ZY-8820-F1E8` | Pooja Hegde | PES University | System Design & Scale |
| `ZY-3351-A2B9` | Mohammed Farhan | Dayananda Sagar College | Escape Room Cyber Challenge |
| `RIT26-NEUR-BA9F9D` | Rohan Mathur | Ramaiah Institute of Technology | NeuralHack: 36H Hackathon |

---

## 📦 Deployment Options

### Vercel / Railway / Render
1. Push the `QR registration` repository to GitHub.
2. In Vercel / Render, import the repository.
3. Add the environment variable:
   - `DATABASE_URL` = your Supabase connection string
   - `DATABASE_SSL` = `true`
4. The backend and frontend will run seamlessly.

