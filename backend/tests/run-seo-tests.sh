#!/bin/bash

# Run SEO and Navigation Tests in Docker
echo "🐳 Running SEO and Navigation Tests in Docker..."

# Navigate to project root (now from backend/tests/)
cd "$(dirname "$0")/../.."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Make sure the app is running
if ! docker ps | grep -q "talktime_frontend"; then
  echo "⚠️ TalkTime app doesn't appear to be running in Docker."
  echo "⚠️ Starting the app using docker-compose..."
  
  # Start the app using docker-compose
  docker-compose up -d
  
  # Wait for the app to start
  echo "⏳ Waiting for the app to start (30 seconds)..."
  sleep 30
fi

# Copy test files to the frontend container
echo "📋 Copying test files to frontend container..."
docker cp ./backend/tests/seo-navigation-test.js talktime_frontend:/app/public/tests/
docker cp ./backend/tests/package.json talktime_frontend:/app/public/tests/

# Install puppeteer in the frontend container
echo "📦 Installing puppeteer in the frontend container..."
docker exec talktime_frontend sh -c "cd /app/public/tests && npm install puppeteer --no-save"

# Run the tests in the frontend container
echo "🧪 Running tests..."
docker exec talktime_frontend sh -c "cd /app/public/tests && node seo-navigation-test.js"

echo "✅ Test run complete!"
