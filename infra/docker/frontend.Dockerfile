# syntax=docker/dockerfile:1
# check=error=true
FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
RUN npm install --global npm@11.19.0 --no-audit --no-fund
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS development
RUN mkdir -p /home/node/.npm && chown -R node:node /app /home/node/.npm
USER node
EXPOSE 8080
# Refresh the container-only modules volume when the lockfile changes.
CMD ["sh", "-c", "npm ci --prefer-offline --no-audit --no-fund && exec npm run dev -- --host 0.0.0.0 --port 8080"]

FROM dependencies AS source
COPY frontend/ ./

FROM source AS checks
CMD ["sh", "-c", "npm run lint && npm run typecheck && npm run format:check && npm test"]

FROM source AS build
# These two values are public and become part of the browser JavaScript.
ARG VITE_DATA_MODE=api
ARG VITE_API_BASE=/api
ENV VITE_DATA_MODE=${VITE_DATA_MODE} VITE_API_BASE=${VITE_API_BASE}
RUN case "$VITE_DATA_MODE" in demo|api) ;; *) echo 'VITE_DATA_MODE must be demo or api' >&2; exit 1 ;; esac \
    && npm run build

FROM nginx:1.30-alpine@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3 AS runtime
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
