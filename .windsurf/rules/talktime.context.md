---
trigger: always_on
---

#YOU ARE A HELPFUL ASSISTANT FOR TALKTIME APP DEVELOPMENT GIVING FULLSTACK HELP AND FOLLOW NELSON'S IDEAS MAKING IT A REALITY.
# TalkTime Documentation Structure (BY NELSON. TALKTIME DEVELOPER)

This documentation is modular and split by role, using HTML + Tailwind CSS + HTMX with Vanilla JS for behavior. No frameworks are used.
All routes and UI should be crawlable and accessible (SEO/ARIA optimized). strongly API first approach as everything must be independent.

---

## `overview.md`

# TalkTime Overview

**TalkTime** is a web-based platform by the ADEA Foundation to connect Maasai students in Kenya with global volunteers for one-on-one English language practice via secure video calls. Built with no frameworks, it uses vanilla JavaScript, HTML, HTMX, Tailwind CSS, and is fully optimized for accessibility and SEO.

### Goals

* Empower Maasai youth through live English conversation
* Offer verified volunteer opportunities for students and professionals
* Maintain simplicity, accessibility, and low-bandwidth compatibility

### Stack Summary

| Layer            | Tools Used                                                 |
| ---------------- | ---------------------------------------------------------- |
| Frontend         | HTML + Tailwind CSS + Vanilla JS + HTMX                    |
| Backend          | Node.js + Express                                          |
| Video Signaling  | WebRTC + Socket.IO                                         |
| Containerization | Docker (multi-container setup)                             |
| Reverse Proxy    | Nginx (serving both frontend and backend inside container) |
| Hosting          | VPS (self-managed, production ready)                       |

### Core Roles

* **Students** – View and join scheduled meetings
* **Student Volunteers** – Schedule and join calls (tracked impact)
* **Volunteers** – Normal users scheduling calls
* **ADEA Admins** – Manage student records, schedules, system config

### Containerized Architecture Overview

```
project-root/
├── docker/
│   ├── nginx/
│   │   └── default.conf          # Nginx reverse proxy config
│   ├── backend/                  # Node.js + Express
│   │   ├── Dockerfile
│   │   └── app/
│   ├── frontend/                 # HTML + HTMX + Tailwind
│   │   ├── Dockerfile
│   │   └── public/
├── docker-compose.yml
└── README.md
```

---

## `admin.md`

# Admin Controls (ADEA Staff Only)

### Access

* Admins log in with secure credentials
* No student or volunteer can access admin panel

### Student CRUD

* Create student profiles with:

  * Full name
  * Admission number
  * Age, gender
  * Bio/story
  * Photos (gallery)
* Edit or remove existing students
* All changes are logged

### Call Timer Configuration

* Default time per meeting is 40 minutes
* Admins can:

  * Change time per meeting
  * Allow infinite call duration (no timer)

### Scheduling Oversight

* Admin can override any student's availability
* Force unavailability for breaks or conflicts
* Manual meeting creation for testing/training

### Notifications

* Admin actions notify involved volunteers/students via email and/or SMS
* Approvals and changes are reflected system-wide in real-time

---

## `volunteer.md`

# Volunteer Guide

### Signup Options

* **Standard Volunteer**: Any user over 18
* **Student Volunteer**: Requires parental approval if under 18

### Under-18 Workflow

1. Volunteer fills parental email and phone
2. System sends approval link (email + SMS)
3. Once clicked, access is granted immediately

### Scheduling Meetings

* Volunteers view list of available students
* Can book multiple meetings across different days
* Schedule UI auto-converts to volunteer's local time
* Students only appear once per day
* Rescheduling a meeting retains the same immutable meeting link
* Each meeting link is unique and constant regardless of schedule changes

### Dashboard Tools

* View upcoming and past meetings
* Join meetings directly from dashboard
* Edit or cancel meetings
* Notifications at 30, 10, 5 minutes before meetings
* Call links are always visible
* Email + SMS + In-browser alerts triggered by all actions

---

## `student.md`

# Student Portal

### Login

* Uses **Name + Admission Number**
* Managed and issued by ADEA admin

### Features

* View list of upcoming meetings
* Countdown for each scheduled call
* Auto-launches call screen at scheduled time
* Rings and vibrates like a phone
* Buttons:

  * Join Call
  * Leave Message (if volunteer not present)

### In-Call Experience

* Cannot end call but can mute/unmute or switch video off/on
* Sees volunteer name
* Joins a clean and distraction-free video screen
* Awaiting mode if volunteer hasn’t joined
* Volunteer sees full student backstory if student not yet joined

---

## `meeting.md`

# Meeting Behavior & WebRTC Logic

### Call Setup

* Unique, immutable `roomId` per meeting
* Generated once and reused, even after rescheduling

### Connection Flow

* WebRTC peer-to-peer connection with Socket.IO signaling
* Role-based logic (Volunteer vs Student)

### Call Timing

* Admin-defined timer
* Countdown visible to both parties
* If no timer: call goes indefinitely unless ended manually

### UI Elements

* Video grid (1-on-1)
* Toggle mic/camera
* Copy link
* Leave/end call
* Kick (volunteer only)
* Overlay with student bio (volunteer side)
* Dynamic waiting screen if only one party has joined

---

## `notifications.md`

# Notifications

### Channels

* Email (SendGrid or SMTP)
* SMS (Twilio or equivalent)
* In-browser notifications (with permission)
* Sound and vibration (if on mobile)

### Trigger Points

| Event                      | Channel                 |
| -------------------------- | ----------------------- |
| Meeting Scheduled          | Email + SMS + Dashboard |
| Meeting Rescheduled        | Email + SMS + Dashboard |
| Parent Approval Received   | Email + SMS             |
| 30-min Reminder            | Email + Push            |
| 10-min Reminder            | Push + Sound            |
| 5-min Reminder             | Push + Vibration        |
| Meeting Started/Ended      | Dashboard + Log         |
| Message Left (Missed Call) | Email + Dashboard       |

### Permissions

* Browser must request and store permission to send push and vibrate alerts
* Users can adjust this via browser settings

---

## SEO & Accessibility Guidelines

### HTML Semantics

* Use `<section>`, `<main>`, `<header>`, `<nav>` appropriately
* Proper heading levels (h1 → h2 → h3…)

### HTMX Integration

* Endpoints return full HTML when required
* All dynamic parts have fallback behavior

### SEO Metadata

* Page-specific `<title>`
* `<meta name="description">`
* `<link rel="canonical">`

### Accessibility

* Use `aria-label`, `aria-hidden`, `role` where needed
* Ensure keyboard navigation
* Use screen-reader-friendly text
* All buttons have visible focus styles

---

## Recommended Folder Structure

```
/docs
  overview.md
  admin.md
  volunteer.md
  student.md
  meeting.md
  notifications.md

/docker
  nginx/
    default.conf
  backend/
    Dockerfile
    app/
  frontend/
    Dockerfile
    public/

docker-compose.yml
README.md
```
