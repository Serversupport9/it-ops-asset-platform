FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# No VITE_API_BASE_URL build arg: the frontend calls a relative "/api/..." path (see
# src/services/api.ts) that nginx proxies to the real backend at container-start time, not
# build time - this image is portable across dev/staging/prod without a rebuild.
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Restricts the official image's built-in envsubst-on-templates entrypoint to ONLY this
# variable - without it, envsubst would also blank out nginx's own $uri/$host/etc. variables
# in nginx.conf.template, since they aren't real environment variables either.
ENV NGINX_ENVSUBST_FILTER=^API_BACKEND_HOST$
ENV API_BACKEND_HOST=webapp-api:8000

EXPOSE 80
