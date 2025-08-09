# TalkTime Overview

**TalkTime** is a web-based platform by the ADEA Foundation to connect Maasai students in Kenya with global volunteers for one-on-one English language practice via secure video calls. Built with no frameworks, it uses vanilla JavaScript, HTML, HTMX, Tailwind CSS, and is fully optimized for accessibility and SEO.

### Goals

- Empower Maasai youth through live English conversation
- Offer verified volunteer opportunities for students and professionals
- Maintain simplicity, accessibility, and low-bandwidth compatibility

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

- **Students** – View and join scheduled meetings
- **Student Volunteers** – Schedule and join calls (tracked impact)
- **Volunteers** – Normal users scheduling calls
- **ADEA Admins** – Manage student records, schedules, system config

### Containerized Architecture Overview

```
project-root/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   └── src/
├── frontend/
│   └── public/       # All static assets
└── nginx/
    └── default.conf  # Nginx reverse proxy config
```

### API Endpoints

- `GET /api/students`
  - **Description**: Retrieves a list of all available students.
  - **Response**: JSON array of student objects.
