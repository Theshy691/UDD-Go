FROM node:24-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends libcurl4-openssl-dev \
    && docker-php-ext-install curl opcache && rm -rf /var/lib/apt/lists/*
COPY --from=frontend /app/dist /var/www/html
RUN printf '<Directory /var/www/html>\nFallbackResource /index.html\nCGIPassAuth On\n</Directory>\nServerSignature Off\nServerTokens Prod\n' > /etc/apache2/conf-available/udd-go.conf && a2enconf udd-go
EXPOSE 80
