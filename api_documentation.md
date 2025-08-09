# TalkTime API Documentation

This document provides detailed information about the TalkTime backend API endpoints. All API routes are prefixed with `/api`.

---

## Authentication

### `POST /auth/login`

Authenticates a volunteer and creates a session for them.

**Request Body:**

```json
{
  "email": "volunteer@example.com",
  "password": "securepassword123"
}
```

**Parameters:**

- `email` (string, required): The volunteer's registered email address.
- `password` (string, required): The volunteer's password.

**Responses:**

- **`302 Found`**: On successful authentication. The user is redirected to `/volunteer/dashboard`.
- **`401 Unauthorized`**: If the credentials are invalid.
- **`403 Forbidden`**: If the user's account has not been approved yet.
- **`500 Internal Server Error`**: If a server-side error occurs.

---

## Volunteer Management

### `POST /volunteer/signup`

Registers a new volunteer user.

**Request Body:**

```json
{
  "full_name": "Jane Doe",
  "email": "jane.doe@example.com",
  "password": "securepassword123",
  "age": 25,
  "gender": "Female",
  "phone": "+1234567890",
  "is_student_volunteer": false,
  "school_name": null,
  "parental_consent_given": true,
  "parent_name": null,
  "parent_email": null,
  "parent_phone": null
}
```

**Parameters:**

- `full_name` (string, required): The full name of the volunteer.
- `email` (string, required): The volunteer's email address. Must be unique.
- `password` (string, required): The password for the account.
- `age` (integer, required): The age of the volunteer.
- `gender` (string, required): The gender of the volunteer.
- `phone` (string, required): The volunteer's phone number.
- `is_student_volunteer` (boolean, required): `true` if the user is a student volunteer.
- `school_name` (string, optional): The name of the school (required if `is_student_volunteer` is `true`).
- `parental_consent_given` (boolean): `true` if parental consent has been provided (relevant for student volunteers).
- `parent_name` (string, optional): The name of the parent/guardian.
- `parent_email` (string, optional): The email of the parent/guardian.
- `parent_phone` (string, optional): The phone number of the parent/guardian.

**Responses:**

- **`302 Found`**: On successful registration. The user is redirected to `/volunteer/dashboard`.
- **`409 Conflict`**: If the email address is already registered.
- **`400 Bad Request`**: If the request body is missing required fields or contains invalid data.
- **`500 Internal Server Error`**: If a server-side error occurs.
