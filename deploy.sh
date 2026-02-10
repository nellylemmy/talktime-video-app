#!/bin/bash

# TalkTime Deployment Script
set -e

echo "========================================="
echo "Deploying TalkTime Video App"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}Please edit .env file with your configuration${NC}"
fi

# Build frontend assets if needed
echo -e "${YELLOW}Checking frontend builds...${NC}"
for frontend in volunteer admin student; do
    if [ -d "frontends/$frontend" ] && [ ! -d "frontends/$frontend/public" ]; then
        echo -e "${YELLOW}Building $frontend frontend...${NC}"
        cd frontends/$frontend
        if [ -f "package.json" ]; then
            npm install && npm run build
        fi
        cd ../..
    fi
done

# Stop existing containers
echo -e "${YELLOW}Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Build and start services
echo -e "${YELLOW}Building and starting services...${NC}"
docker-compose up -d --build

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check service health
echo -e "${YELLOW}Checking service health...${NC}"
services=("talktime_nginx" "talktime_backend" "talktime_db" "talktime_redis")
all_healthy=true

for service in "${services[@]}"; do
    if docker ps --format "{{.Names}}" | grep -q "^$service$"; then
        echo -e "${GREEN}✓ $service is running${NC}"
    else
        echo -e "${RED}✗ $service is not running${NC}"
        all_healthy=false
    fi
done

if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}TalkTime deployed successfully!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    echo -e "Access the application at:"
    echo -e "  Main App: ${GREEN}http://$(hostname -I | awk '{print $1}'):8101${NC}"
    echo -e "  Admin: ${GREEN}http://$(hostname -I | awk '{print $1}'):8101/admin${NC}"
    echo -e "  Student: ${GREEN}http://$(hostname -I | awk '{print $1}'):8101/student${NC}"
    echo ""
    echo -e "View logs: ${YELLOW}docker-compose logs -f${NC}"
else
    echo -e "${RED}Deployment failed. Check logs with: docker-compose logs${NC}"
    exit 1
fi