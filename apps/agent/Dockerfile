FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

COPY dist ./dist

ENV NODE_ENV=production
ENV DOCKER_SOCKET_PATH=/var/run/docker.sock

CMD ["node", "dist/index.js"]
