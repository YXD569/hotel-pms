# 云澜 PMS · 全栈镜像
# 单镜像同时承载 FastAPI 后端 与 原生前端静态资源，部署后单 URL 可用。
# 构建上下文 = 仓库根（Dockerfile 所在目录）。

FROM python:3.12-slim

WORKDIR /app

# 1) 先装依赖（利用层缓存）
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 2) 后端代码 -> /app/app，使 `import app.main` 成立
COPY backend/app ./app

# 3) 前端静态资源 -> /frontend（与后端源码隔离，避免通过静态服务暴露后端代码）
RUN mkdir -p /frontend
COPY index.html /frontend/
COPY css /frontend/css
COPY js /frontend/js

# 4) 运行配置
ENV FRONTEND_DIR=/frontend
# Railway 会注入 $PORT；本地 docker run 可覆盖，例如 -e PORT=8000
ENV PORT=8000
EXPOSE 8000

# 监听 0.0.0.0:$PORT；Railway 健康检查走 /api/health
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
