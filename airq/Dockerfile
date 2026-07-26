FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copies .env.local too, so NEXT_PUBLIC_MAPBOX_TOKEN is baked into the client
# bundle at build time (public pk. token — it ships to the browser regardless).
COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
