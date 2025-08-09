# TalkTime Project: Development Guidelines

This document outlines the strict development rules for the TalkTime project to ensure consistency, maintain design integrity, and focus our efforts on the required tasks.

## 1. Frontend is Finalized

The user interface (UI) and user experience (UX) of the existing frontend are considered complete and final.

-   **DO NOT** modify existing HTML structure, CSS styles (Tailwind classes), or UI components.
-   **DO NOT** change any text, branding elements, or visual content on existing pages.
-   The primary goal is to preserve the current design and user experience without any alterations.

## 2. Development Focus: Backend Implementation

All development work should be concentrated on the following areas:

-   **Backend Functionality**: Implement the server-side logic, APIs, and database interactions required to make the frontend functional. This includes features outlined in the project documentation (`admin.md`, `volunteer.md`, `student.md`, `meeting.md`, `notifications.md`).
-   **New Pages**: Create new pages as required. Any new page **must** strictly adhere to the existing branding, color scheme, typography, and component design. Reuse existing components and styles wherever possible.
-   **Frontend-Driven Development**: All backend functionality must be built to serve the needs of the existing, finalized frontend design. The frontend is the source of truth; do not create backend features that are not required by the UI.

## 3. No Regressions

It is critical that no new implementation introduces visual bugs or breaks the existing frontend.

-   Thoroughly test your changes to ensure they do not impact the UI.
-   Backend logic should be decoupled from the frontend presentation.

## 4. Guiding Principle

Our role is to bring the existing, highly-designed frontend to life by building the backend engine that powers it. We are not redesigning or altering the user-facing elements.

---

By adhering to these guidelines, we can efficiently complete the project while respecting the established design vision.
