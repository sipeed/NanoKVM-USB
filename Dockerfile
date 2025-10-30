FROM node:24-alpine3.21 AS frontend
WORKDIR /app

COPY browser browser

RUN yarn global add http-server

RUN cd browser && \
    yarn install && \
    yarn build

FROM nginx:1.29.1-alpine   

COPY --from=frontend /app/browser/dist /usr/share/nginx/html

RUN apk add tzdata

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend /app/browser/dist /usr/share/nginx/html
RUN ls -alh /usr/share/nginx/html
EXPOSE 80
ENTRYPOINT ["nginx", "-g", "daemon off;"]