FROM nginx:alpine

# Copy Add-In files
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY fleetclaim.js /usr/share/nginx/html/
COPY config.json /usr/share/nginx/html/
COPY images/ /usr/share/nginx/html/images/

# Create nginx config for CORS (required for MyGeotab Add-Ins)
RUN echo 'server { \
    listen 8080; \
    location / { \
        root /usr/share/nginx/html; \
        add_header Access-Control-Allow-Origin "*"; \
        add_header Access-Control-Allow-Methods "GET, OPTIONS"; \
        add_header Access-Control-Allow-Headers "Content-Type"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 8080
