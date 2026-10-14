# IM 后端服务镜像
# 构建：docker build -t im-server ./server
FROM node:22-alpine

WORKDIR /app

# 先装依赖以利用构建缓存
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production \
    PORT=3100

EXPOSE 3100

CMD ["node", "src/index.js"]
