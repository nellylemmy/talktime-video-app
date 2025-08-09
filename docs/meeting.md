# Meeting Behavior & WebRTC Logic

### Call Setup

- Unique, immutable `roomId` per meeting
- Generated once and reused, even after rescheduling

### Connection Flow

- WebRTC peer-to-peer connection with Socket.IO signaling
- Role-based logic (Volunteer vs Student)

### Call Timing

- Admin-defined timer
- Countdown visible to both parties
- If no timer: call goes indefinitely unless ended manually

### UI Elements

- Video grid (1-on-1)
- Toggle mic/camera
- Copy link
- Leave/end call
- Kick (volunteer only)
- Overlay with student bio (volunteer side)
