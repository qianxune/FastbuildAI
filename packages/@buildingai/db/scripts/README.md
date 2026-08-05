# Migration Scripts

## 运行迁移 (Run migrations)

迁移在 API 启动时自动执行。使用 Docker 时可按以下方式运行迁移：

### 方式一：仅数据库在 Docker，本地运行 API（推荐开发）

1. 在 `.env` 中暴露 Postgres/Redis 端口（用于本地 API 连接）：
   ```env
   POSTGRES_EXTERNAL_PORT=5432
   REDIS_EXTERNAL_PORT=6379
   ```
2. 启动 Postgres 与 Redis 容器：
   ```bash
   pnpm run docker:up:db
   # 或
   docker compose up -d postgres redis
   ```
3. 构建 db 包并启动 API（会执行迁移）：
   ```bash
   pnpm run build --filter=@buildingai/db
   pnpm run dev:api
   ```

### 方式二：一键构建 + 起库 + 起 API（执行迁移）

在项目根目录执行（需已配置 `POSTGRES_EXTERNAL_PORT=5432` 和 `REDIS_EXTERNAL_PORT=6379`）：

```bash
pnpm run migration:run
```

该命令会：构建 `@buildingai/db` → 启动 Docker 中的 postgres、redis → 启动 API（API 启动时自动执行迁移）。

### 方式三：完整 Docker 栈（数据库 + API 都在 Docker）

```bash
docker compose up -d
```

会启动 postgres、redis 和 nodejs；nodejs 内运行 API，启动时自动执行迁移。

---

## 主程序迁移

```bash
# 自动生成
pnpm --filter @buildingai/db migration:generate <version> <description>

# 手动创建
pnpm --filter @buildingai/db migration:create <version> <description>
```

## 插件迁移

```bash
# 自动生成
pnpm --filter @buildingai/db migration:generate:extension <identifier> <version> <description>

# 手动创建
pnpm --filter @buildingai/db migration:create:extension <identifier> <version> <description>
```

**示例:**

```bash
pnpm --filter @buildingai/db migration:generate:extension buildingai-simple-blog 0.0.3 add-tags
```
