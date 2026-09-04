# Ladder Cloudflare Worker

## 首次部署

先通过 Cloudflare Dashboard 或 Wrangler 为现有 Worker 添加 `ADMIN_PASSWORD` secret。Wrangler 会根据 `wrangler.jsonc` 自动创建并绑定名为 `ladder-config` 的 D1 数据库。

```sh
npx wrangler secret put ADMIN_PASSWORD
pnpm db:migrate:remote
pnpm deploy
```

完成后访问 `/admin`，登录并配置订阅、自建节点、Tailscale Key 和客户端模板。除管理员密码和可选的 DAE 参数外，运行时配置全部存储在 D1 中。

## 本地开发

复制 `.dev.vars.example` 为 `.dev.vars`，然后执行：

```sh
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` 会通过 Cloudflare Vite 插件同时启动 React 管理页和 Worker API，并支持热更新。管理页源码位于 `web/`，Worker 通过静态资源绑定在 `/admin` 提供构建后的入口。

提交前可以运行：

```sh
pnpm test
```

该命令会依次检查 Worker 与 React 的 TypeScript、构建生产资源，并运行 Worker 测试。`pnpm deploy` 也会先执行生产构建，再通过 Wrangler 发布 Worker 和静态资源。
