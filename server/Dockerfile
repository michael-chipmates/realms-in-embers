FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json relay.mjs ./
RUN npm ci --omit=dev
USER node
EXPOSE 8787
CMD ["node", "relay.mjs"]
