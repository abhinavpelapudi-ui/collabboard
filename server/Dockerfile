FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared ../shared
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./

USER node
EXPOSE 3001
CMD ["npm", "start"]
