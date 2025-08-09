# TalkTime Admin Frontend Dockerfile
FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Copy static files
COPY public/ .

# Create nginx config for this frontend
RUN echo 'server {' > /etc/nginx/conf.d/default.conf && \
    echo '    listen 80;' >> /etc/nginx/conf.d/default.conf && \
    echo '    server_name localhost;' >> /etc/nginx/conf.d/default.conf && \
    echo '    root /usr/share/nginx/html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    index index.html;' >> /etc/nginx/conf.d/default.conf && \
    echo '    try_files $uri $uri/ $uri.html =404;' >> /etc/nginx/conf.d/default.conf && \
    echo '    # Enhanced security headers for admin' >> /etc/nginx/conf.d/default.conf && \
    echo '    add_header X-Frame-Options DENY always;' >> /etc/nginx/conf.d/default.conf && \
    echo '    add_header X-Content-Type-Options nosniff always;' >> /etc/nginx/conf.d/default.conf && \
    echo '    add_header X-XSS-Protection "1; mode=block" always;' >> /etc/nginx/conf.d/default.conf && \
    echo '    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' >> /etc/nginx/conf.d/default.conf && \
    echo '    add_header Referrer-Policy "strict-origin-when-cross-origin" always;' >> /etc/nginx/conf.d/default.conf && \
    echo '}' >> /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Labels
LABEL maintainer="Nelson Lemein <nelsonlemmy61@gmail.com>"
LABEL description="TalkTime Admin Frontend - Administrative portal for ADEA Foundation"
LABEL version="1.0.0"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
