FROM node:24-alpine3.21 AS frontend
WORKDIR /app

RUN npm install -g pnpm@12.21.0

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps/browser ./apps/browser

RUN pnpm install --frozen-lockfile --filter @nanokvm/browser...
RUN pnpm --filter @nanokvm/browser build

FROM nginx:1.29.1-alpine

COPY --from=frontend /app/apps/browser/dist /usr/share/nginx/html

RUN apk add tzdata

COPY nginx.conf /etc/nginx/nginx.conf
RUN ls -alh /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]
