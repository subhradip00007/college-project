FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/*.js ./server/
COPY package.json .
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 PORTAL_DB=/data/portal.sqlite STAFF_FILE=/data/department-credentials.local
VOLUME ["/data"]
EXPOSE 3000
CMD ["node","server/index.js"]
