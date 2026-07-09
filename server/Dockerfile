FROM node:22-alpine
WORKDIR /app
COPY package.json relay.mjs ./
RUN npm install --omit=dev
EXPOSE 8787
CMD ["node", "relay.mjs"]
