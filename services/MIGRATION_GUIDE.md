# TalkTime Microservice Migration Guide

This guide explains how to deploy and enable the microservices extracted from the TalkTime monolith.

## Services Overview

| Service | Port | Status | Description |
|---------|------|--------|-------------|
| Auth Service | 3002 | Ready | JWT authentication, user login/signup |
| Meeting Service | 3003 | Ready | Meeting CRUD, business rules |
| Call Service | 3004 | Ready | WebRTC signaling, Socket.IO, timers |
| Notification Service | 3005 | Ready | Notifications, reminders, auto-launch |
| Newsletter Service | 3006 | Ready | Mailchimp integration, subscriptions |
| Analytics Service | 3007 | Ready | Read-only metrics, dashboards |

## Phase 1: Deploy Services (Canary Mode)

The services are configured to run alongside the monolith. Initially, all traffic goes to the monolith while the services run in canary mode.

### Step 1: Build and Start Services

```bash
# From /root/ADEA/talktime directory
# Build all microservices
docker-compose build auth-service meeting-service notification-service call-service newsletter-service analytics-service

# Start all microservices
docker-compose up -d auth-service meeting-service notification-service call-service newsletter-service analytics-service
```

### Step 2: Verify Health

```bash
# Check service health
curl http://localhost/auth-health
curl http://localhost/meeting-health
curl http://localhost/notification-health
curl http://localhost/call-health
curl http://localhost/newsletter-health
curl http://localhost/analytics-health
```

Expected response:
```json
{"success":true,"service":"auth-service","status":"healthy","version":"1.0.0"}
```

### All Health Endpoints

| Service | Health Endpoint |
|---------|-----------------|
| Auth | `/auth-health` |
| Meeting | `/meeting-health` |
| Call | `/call-health` |
| Notification | `/notification-health` |
| Newsletter | `/newsletter-health` |
| Analytics | `/analytics-health` |

## Phase 2: Enable Auth Service

### Step 1: Enable Internal Token Introspection

The monolith can use the auth service for token validation with local fallback.

```bash
# Set environment variable
export USE_AUTH_SERVICE=true

# Restart backend
docker-compose restart backend
```

### Step 2: Enable Full Auth Service Routing (Canary)

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block:
location /api/v1/auth/ {
    limit_req zone=talktime_api burst=50 nodelay;
    proxy_pass http://talktime_auth_service;
    # ... rest of config
}
```

Reload nginx:
```bash
docker-compose exec nginx nginx -s reload
```

### Rollback

```bash
# Disable auth service
export USE_AUTH_SERVICE=false
docker-compose restart backend

# Or comment out nginx location block
docker-compose exec nginx nginx -s reload
```

## Phase 3: Enable Meeting Service

### Step 1: Verify Meeting Service

```bash
# Test internal endpoint
curl -X POST http://meeting-service:3003/api/v1/meetings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"studentId": 1, "scheduledTime": "2024-01-01T10:00:00Z"}'
```

### Step 2: Enable Routing

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block:
location /api/v1/meetings {
    limit_req zone=talktime_api burst=50 nodelay;
    proxy_pass http://talktime_meeting_service;
    # ... rest of config
}
```

## Phase 4: Enable Notification Service

The notification service automatically subscribes to meeting events via Redis pub/sub.

### Step 1: Verify Event Flow

Create a meeting and check notification service logs:

```bash
docker-compose logs -f notification-service
```

You should see:
```
[Notification Service] Received event: meeting.created
[Notification Service] Scheduled reminders for meeting 123
```

### Step 2: Enable Notification Routes

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block:
location /api/v1/notifications {
    proxy_pass http://talktime_notification_service;
    # ... rest of config
}
```

## Environment Variables

### Required for All Services

| Variable | Description | Default |
|----------|-------------|---------|
| DB_HOST | PostgreSQL host | db |
| DB_USER | PostgreSQL user | talktime_user |
| DB_PASSWORD | PostgreSQL password | talktime_secure_pass_2024 |
| DB_DATABASE | Database name | talktimedb |
| DB_PORT | PostgreSQL port | 5432 |
| REDIS_URL | Redis connection URL | redis://redis:6379 |

### Auth Service Specific

| Variable | Description | Default |
|----------|-------------|---------|
| JWT_SECRET | JWT signing key | (required) |
| JWT_EXPIRES_IN | Access token expiry | 24h |
| JWT_REFRESH_EXPIRES_IN | Refresh token expiry | 7d |
| ADMIN_SECRET_CODE | Admin signup code | (required) |
| INTERNAL_API_KEY | Service-to-service key | (required) |

### Backend (Monolith) Integration

| Variable | Description | Default |
|----------|-------------|---------|
| USE_AUTH_SERVICE | Enable auth service | false |
| AUTH_SERVICE_URL | Auth service URL | http://auth-service:3002 |
| INTERNAL_API_KEY | Same as auth service | (required) |

## Verification Checklist

### Auth Service

- [ ] Volunteer login works
- [ ] Student login works
- [ ] Admin login works
- [ ] Token refresh works
- [ ] Token introspection returns correct user data
- [ ] Fallback to local JWT works when service down

### Meeting Service

- [ ] Create meeting enforces 1-call-per-day rule
- [ ] Create meeting enforces 3-meeting limit
- [ ] Auto-timeout marks meetings as 'missed' after 40 min
- [ ] Performance restrictions block high-cancel volunteers
- [ ] Events published to Redis correctly

### Notification Service

- [ ] Receives meeting.created events
- [ ] 30/10/5 min reminders scheduled correctly
- [ ] Auto-launch triggers at 5-min mark
- [ ] Notifications stored in database

## Rollback Procedures

### Full Rollback to Monolith

```bash
# 1. Stop microservices
docker-compose stop auth-service meeting-service notification-service

# 2. Disable backend integration
export USE_AUTH_SERVICE=false
docker-compose restart backend

# 3. Comment out nginx routing
# Edit nginx/production-http.conf and comment microservice locations
docker-compose exec nginx nginx -s reload
```

### Per-Service Rollback

```bash
# Auth Service
export USE_AUTH_SERVICE=false
docker-compose restart backend

# Meeting Service - comment nginx location
docker-compose exec nginx nginx -s reload

# Notification Service - comment nginx location
docker-compose exec nginx nginx -s reload
```

## Monitoring

### Health Endpoints

- `/auth-health` - Auth service status
- `/meeting-health` - Meeting service status
- `/notification-health` - Notification service status

### Logs

```bash
# View all microservice logs
docker-compose logs -f auth-service meeting-service notification-service

# View specific service
docker-compose logs -f auth-service
```

### Key Metrics to Monitor

- Request latency (p50, p95, p99)
- Error rate per endpoint
- Redis pub/sub event lag
- Database connection pool utilization

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs auth-service

# Common issues:
# - Database not ready: Wait for db container
# - Port conflict: Check no other service using port
# - Missing env vars: Check docker-compose.yml
```

### Token Validation Failures

```bash
# Check auth service is running
curl http://localhost/auth-health

# Check INTERNAL_API_KEY matches between services
docker-compose exec backend env | grep INTERNAL_API_KEY
docker-compose exec auth-service env | grep INTERNAL_API_KEY
```

### Events Not Being Received

```bash
# Check Redis connectivity
docker-compose exec notification-service redis-cli ping

# Check subscription
docker-compose logs notification-service | grep "Subscribed to"
```

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Backend   │ (Monolith - fallback)
│  (Gateway)  │     │   :3001     │
└─────────────┘     └─────────────┘
       │
       ├──────────▶ Auth Service (:3002)
       │            └── JWT validation
       │            └── User login/signup
       │
       ├──────────▶ Meeting Service (:3003)
       │            └── Meeting CRUD
       │            └── Business rules
       │            └── Event publishing
       │
       └──────────▶ Notification Service (:3005)
                    └── Scheduled reminders
                    └── Auto-launch triggers
                    └── Event subscriber

┌─────────────┐     ┌─────────────┐
│  PostgreSQL │◀────│    Redis    │
│   (Shared)  │     │   (Events)  │
└─────────────┘     └─────────────┘
```

## Phase 5: Enable Call Service

The call service handles WebRTC signaling and meeting timers.

### Step 1: Verify Socket.IO Connection

```bash
# Test internal Socket.IO
docker-compose logs -f call-service
```

You should see:
```
[Call Service] Socket.IO Redis adapter initialized
[Call Service] Ready to accept connections
```

### Step 2: Enable Call Service Routing

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block for WebRTC signaling:
location /call-socket.io/ {
    proxy_pass http://talktime_call_service/socket.io/;
    # ... rest of config
}

# Uncomment this block for API:
location /api/v1/calls {
    proxy_pass http://talktime_call_service;
    # ... rest of config
}
```

### Call Service Features

- **WebRTC Signaling**: Offer/Answer/ICE candidate exchange
- **40-Minute Timer**: Auto-ends meetings with warnings at 5min and 1min
- **Instant Calls**: 3-minute timeout for student response
- **Room Management**: Redis-backed room state persistence
- **Timer Recovery**: Timers survive service restarts

## Phase 6: Enable Newsletter Service

### Step 1: Configure Mailchimp (Optional)

Set environment variables in `.env`:

```bash
MAILCHIMP_API_KEY=your-api-key-here
MAILCHIMP_SERVER_PREFIX=us1  # From your API key (e.g., us1, us2, etc.)
MAILCHIMP_LIST_ID=your-list-id
```

Without Mailchimp configured, subscriptions are stored locally only.

### Step 2: Enable Newsletter Routes

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block:
location /api/v1/newsletter {
    proxy_pass http://talktime_newsletter_service;
    # ... rest of config
}
```

### Newsletter Endpoints

- `POST /api/v1/newsletter/subscribe` - Subscribe to newsletter
- `POST /api/v1/newsletter/unsubscribe` - Unsubscribe
- `GET /api/v1/newsletter/status/:email` - Check subscription status
- `GET /api/v1/newsletter/subscribers` - List all subscribers (admin)
- `GET /api/v1/newsletter/stats` - Subscription statistics (admin)

## Phase 7: Enable Analytics Service

### Step 1: Verify Read-Only Access

```bash
curl http://localhost/analytics-health
```

Expected:
```json
{"success":true,"service":"analytics-service","status":"healthy","mode":"read-only"}
```

### Step 2: Enable Analytics Routes

Edit `nginx/production-http.conf`:

```nginx
# Uncomment this block:
location /api/v1/analytics {
    proxy_pass http://talktime_analytics_service;
    # ... rest of config
}
```

### Analytics Endpoints

- `GET /api/v1/analytics/dashboard` - Overall platform stats
- `GET /api/v1/analytics/volunteers/:id` - Volunteer performance metrics
- `GET /api/v1/analytics/volunteers/top` - Top performing volunteers
- `GET /api/v1/analytics/meetings/trends` - Meeting trends over time
- `GET /api/v1/analytics/students/engagement` - Student engagement metrics

## Full Rollback to Monolith

```bash
# 1. Stop all microservices
docker-compose stop auth-service meeting-service notification-service call-service newsletter-service analytics-service

# 2. Disable backend integration
export USE_AUTH_SERVICE=false
docker-compose restart backend

# 3. Comment out all nginx microservice locations
# Edit nginx/production-http.conf
docker-compose exec nginx nginx -s reload
```

## Architecture Diagram

```
┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Backend   │ (Monolith - fallback)
│  (Gateway)  │     │   :3001     │
└─────────────┘     └─────────────┘
       │
       ├──────────▶ Auth Service (:3002)
       │            └── JWT validation
       │            └── User login/signup
       │
       ├──────────▶ Meeting Service (:3003)
       │            └── Meeting CRUD
       │            └── Business rules (1-call/day, 3-limit)
       │            └── Event publishing
       │
       ├──────────▶ Call Service (:3004)
       │            └── WebRTC signaling
       │            └── 40-min timer
       │            └── Instant calls
       │
       ├──────────▶ Notification Service (:3005)
       │            └── Scheduled reminders
       │            └── Auto-launch triggers
       │            └── Event subscriber
       │
       ├──────────▶ Newsletter Service (:3006)
       │            └── Mailchimp integration
       │            └── Subscription management
       │
       └──────────▶ Analytics Service (:3007)
                    └── Dashboard stats
                    └── Performance metrics
                    └── Read-only access

┌─────────────┐     ┌─────────────┐
│  PostgreSQL │◀────│    Redis    │
│   (Shared)  │     │   (Events)  │
└─────────────┘     └─────────────┘
```

## Next Steps

1. **Database Separation** - Optionally separate databases per service
2. **API Gateway** - Consider Kong or similar for advanced routing
3. **Service Mesh** - Evaluate Istio/Linkerd for observability
4. **CI/CD Pipeline** - Per-service deployment pipelines
