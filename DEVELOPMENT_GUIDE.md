# TalkTime Development Guide

## Development vs Production Environments

### **Development Environment** 🛠️

#### **Current Setup (Path-based routing)**
```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up -d

# Access the 3 sites via paths:
http://localhost/                    # Volunteer site (main)
http://localhost/admin/              # Admin site  
http://localhost/student/            # Student site

# Direct API access:
http://localhost:3001/api/           # Backend API
http://localhost:5432                # PostgreSQL (direct)
http://localhost:6379                # Redis (direct)
```

#### **Enhanced Development (Separate dev servers)**
```bash
# Start with hot-reload development servers
docker-compose -f docker-compose.dev.yml --profile dev-servers up -d

# Access each site on separate ports:
http://localhost:3000                # Volunteer site (hot-reload)
http://localhost:3002                # Admin site (hot-reload)
http://localhost:3003                # Student site (hot-reload)
http://localhost:3001/api/           # Backend API
```

### **Production Environment** 🚀

#### **Subdomain-based routing**
```bash
# Start production environment
docker-compose -f docker-compose.production.yml up -d

# Access the 3 sites via subdomains:
https://adeatalktime.org             # Volunteer site (main)
https://admin.adeatalktime.org       # Admin site
https://students.adeatalktime.org    # Student site

# API is shared across all subdomains
# SSL certificates automatically handled
```

## Directory Structure

### **Target Structure**
```
talktime/
├── frontends/               # Separate frontend builds
│   ├── volunteer/           # Volunteer site (adeatalktime.org)
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   ├── dashboard/
│   │   │   └── assets/
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   └── package.json
│   ├── admin/               # Admin site (admin.adeatalktime.org)
│   │   ├── public/
│   │   │   ├── index.html
│   │   │   ├── dashboard/
│   │   │   └── assets/
│   │   ├── Dockerfile
│   │   ├── Dockerfile.dev
│   │   └── package.json
│   └── student/             # Student site (students.adeatalktime.org)
│       ├── public/
│       │   ├── index.html
│       │   ├── dashboard/
│       │   └── assets/
│       ├── Dockerfile
│       ├── Dockerfile.dev
│       └── package.json
├── backend/                 # Shared API backend
├── nginx/
│   ├── development.conf     # Dev: path-based routing
│   └── production.conf      # Prod: subdomain routing
├── docker-compose.yml       # Current setup
├── docker-compose.dev.yml   # Development setup
└── docker-compose.production.yml  # Production setup
```

## Where to Find the 3 Sites

### **Development Phase**
1. **Before Migration**: All sites accessible via paths on `localhost`
2. **During Migration**: Sites available on separate dev ports
3. **Testing**: Use development docker-compose with path routing

### **Production Phase**
1. **DNS Setup**: Point subdomains to your server IP
2. **SSL Setup**: Configure certificates for each subdomain
3. **Deploy**: Use production docker-compose with subdomain routing

## Migration Commands

### **Step 1: Create Development Environment**
```bash
# Copy current setup to development config
cp docker-compose.yml docker-compose.current.yml

# Start enhanced development environment
docker-compose -f docker-compose.dev.yml up -d
```

### **Step 2: Create Frontend Separation**
```bash
# Create frontend directories
mkdir -p frontends/{volunteer,admin,student}

# Copy and customize frontend files
# (We'll do this in the next phase)
```

### **Step 3: Test Locally**
```bash
# Test development setup
curl http://localhost/api/v1/health
curl http://localhost/admin/
curl http://localhost/student/

# Test with dev servers
curl http://localhost:3000
curl http://localhost:3002  
curl http://localhost:3003
```

### **Step 4: Production Deployment**
```bash
# Build production images
docker-compose -f docker-compose.production.yml build

# Deploy to production
docker-compose -f docker-compose.production.yml up -d

# Verify subdomains (after DNS setup)
curl https://adeatalktime.org
curl https://admin.adeatalktime.org
curl https://students.adeatalktime.org
```

## Benefits Summary

### **Development Benefits**
- ✅ **Hot Reload**: Instant changes during development
- ✅ **Direct Access**: Database and Redis exposed for debugging
- ✅ **Path Routing**: Simple localhost-based testing
- ✅ **Isolated Testing**: Each frontend can be tested independently

### **Production Benefits**  
- ✅ **Professional URLs**: Clean subdomain structure
- ✅ **Role Isolation**: Complete separation of concerns
- ✅ **Scalability**: Independent scaling per role
- ✅ **Security**: Reduced attack surface per site
- ✅ **SEO Optimization**: Targeted content per subdomain

## Next Steps
1. **Create frontend separation** (extract 3 sites from current frontend)
2. **Implement JWT authentication** (replace session cookies)
3. **Test development environment** (verify all 3 sites work)
4. **Deploy to production** (configure DNS and SSL)
