FROM node:22.16.0-alpine
WORKDIR /app
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
ENV API_INTERNAL_URL=http://game:8080
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
