FROM node:20-slim
WORKDIR /app

# Install deps first (better layer caching)
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY backend/package*.json backend/
RUN cd backend && npm ci

# Build the frontend; the backend serves frontend/dist
COPY frontend frontend
COPY backend backend
RUN cd frontend && npm run build

ENV NODE_ENV=production
CMD ["sh", "-c", "cd backend && npm start"]
