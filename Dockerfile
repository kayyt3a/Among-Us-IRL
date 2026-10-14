# Single-stage build: this is a small house-party app, not a service that
# needs a minimal production image. Simplicity and a working build beat a
# few extra megabytes here.
FROM node:20-slim

WORKDIR /app
COPY . .

RUN npm install && npm run build

ENV NODE_ENV=production
# The canonical address. Old *.onrender.com links redirect here, and link previews use it.
ENV PUBLIC_URL=https://irlimposter.com
ENV PORT=4000
EXPOSE 4000

CMD ["npm", "--workspace", "server", "start"]
