# Notifications

### Channels

- Email (SendGrid or SMTP)
- SMS (Twilio or equivalent)
- In-browser notifications (with permission)
- Sound and vibration (if on mobile)

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

- Browser must request and store permission to send push and vibrate alerts
- Users can adjust this via browser settings
