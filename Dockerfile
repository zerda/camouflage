FROM node:alpine as builder
WORKDIR /build
COPY . .
RUN npm config set registry https://npmmirror.com/
RUN npm install && npm run build && npm pack && mv camouflage-server-*.tgz app.tgz

FROM node:alpine as runner
WORKDIR /app
COPY --from=builder /build/app.tgz /tmp/
RUN npm install -g /tmp/app.tgz
RUN camouflage init
CMD ["camouflage", "--config", "config.yml"]