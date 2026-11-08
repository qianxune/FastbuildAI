# Apparel Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在原工作台中新增同级服饰穿戴栏目和八项独立工作流。

**Architecture:** 共享服饰角色合同接入原工具任务、参考图、报价、计费、历史及下载链路。目标模特仅使用我的模特，在现有用户锁内校验归属和图片快照；复用区域编辑实现独立服饰 SKU，不改变原商品 SKU。

**Tech Stack:** React / TypeScript / TanStack Query / NestJS / PostgreSQL / BullMQ / Jest；Docker Compose + pnpm。

---

## Approved Scope

- 2026-11-07，用户授权开始实施，并确认材料到服装和服饰 SKU 初始方案“一起实现”。
- 同级栏目及八个键：tryon、model_swap、outfit、fabric、apparel_sku、ugc_outfit、nail_tryon、dewrinkle。
- 模特试穿与换模特须恰好一位保存模特；材料到服装平铺或保存模特展示。原人物图片可正常上传，目标人物不可直接上传或随机生成。
- 服饰穿搭/种草穿搭/美甲使用各自的图片、场景及人物或手部样式；去皱仅单图单输出，保留纹理和设计褶皱。
- 材料到服装：面料、必填服装类别/描述、可选款式参考。服饰 SKU：单模板、最多三区域/十显式变体，逐变体要求，不自动组合或虚构尺码。
- 参考图合计最多五张且服从模型能力；普通输出一至四张，比例沿用五项，不新增 4:5。计费与进度来自实际模型和任务，不使用截图示例价格或伪造百分比。
- 保留浅色工作台、桌面/手机导航、原工具逻辑、定制模特上半身构图和未提交发布资源。

## Tasks

1. 共享合同与后端：新增 src/api/shared/apparel-workflow.ts，修改 tools.ts、tool-workflow.ts、DTO、生成/资产/计费服务和报价入口；扩展原 tool-workflow、tool-generation、asset-record、generation-billing、generation-image-client 测试。首个编辑后立即运行行为定向测试。
2. 独立审查后端：需求合规审查通过后做质量/安全审查，修复当前范围发现的问题并重跑定向检查。
3. 表单与路由：新增小型 apparel-tool-form.tsx 和 apparel-workflow.ts；复用 AssetRolePicker、ProtectedAsset、保存模特查询及 SKU 区域编辑；修改 navigation、overview、index 和必要历史恢复边界。扩展 workspace、specialized-form、works 原套件。
4. 前端审查：检查八项有效输入、仅保存模特、空/错/移除状态、总引用限额、忙碌/卸载门禁、历史恢复、实际引用图片、SKU 独立类型及旧流程兼容；再检查类型/质量。
5. 运行集成定向套件、API/Web noEmit 对比基线、定向 lint 与 Docker API --no-clean / Web 构建。既有共享 console-logo 两条 TS18048 不属于本次修复，不宣称全仓类型清零。
6. 只读真实组件夹具验收 1440x960、808x684、390x844、320x740；图片须解码、预览完整且按钮不遮挡、无横向溢出、桌面/手机工具层级一致。区分模拟检查与真实登录/供应商效果。
7. 增量本地发布保留旧资源内容，只覆盖入口并添加新哈希；仅重启 buildingai-api，核验新旧 JS/CSS MIME 与 JSON 健康。完成状态同步 Obsidian。

## Commands

```powershell
docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand test/tool-workflow.spec.ts test/tool-generation.spec.ts test/asset-record.spec.ts test/generation-billing.spec.ts test/generation-image-client.spec.ts
docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm test --runInBand test/workspace.spec.ts test/specialized-form.spec.ts test/works.spec.ts test/assets-frontend.spec.ts
docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm exec tsc --noEmit -p tsconfig.api.json
docker-compose exec -T -w /buildingai/extensions/image-studio nodejs pnpm exec tsc --noEmit -p tsconfig.web.json
docker-compose exec -T nodejs pnpm --filter image-studio build:api --no-clean
docker-compose exec -T nodejs pnpm --filter image-studio build:web
```

## Status And Boundaries

- 2026-11-08：八项独立工作流及同级栏目已实现，已完成定向回归、独立需求/质量审查、只读组件浏览器验收和本地增量发布。以下结果不等于真实账户或供应商出图验收。
- 自动化：后端五个定向套件 493 项通过；前端 workspace、specialized-form、works、assets-frontend 四套 420 项通过、1 项既有可选跳过。最后源码复验 workspace 与 specialized-form 两套 379 项通过、1 项跳过，不重复累计测试数量。覆盖角色、保存模特、历史恢复、权限与迟到回调、结果隔离及原 SKU 兼容。
- API noEmit、定向源码 lint、API --no-clean 和 Web 构建通过。Web noEmit 仅有共享 console-logo 两条既有 TS18048；完整能力套件另有九条已核实的无关基线失败，不宣称全仓测试或类型清零。
- 浏览器：真实组件、当前构建 CSS 与模拟服务禁止生成/上传；七项共享表单、保存模特搜索/选择/Escape、移动导航和总览入口已有只读记录。服饰 SKU 最终在 1440x960、808x684、390x844、320x740 下复验通过，模板位图 640x640 已解码、画布非零、完整包含、参考图可独立滚动查看，无页面横向越界或页脚与图片交叠；最窄模板画布 256x256。仅服饰 SKU 覆盖旧页脚负边距和画布高度/色彩规则，原商品 SKU 不改。
- 证据：storage/temp/apparel-browser-acceptance.json 保留修正前问题和过程记录，最终 SKU/总览结论以 apparel-sku-final-acceptance.json 为准。总览在 1440/390px 确认 21 个工具及八张服饰图片加载；apparel-sku-final-1440.png、apparel-sku-final-320.png、apparel-overview-final-1440.png 为最终截图。滚动时暂时离开视口的图片不记作源图被裁切。
- 图片来源：八个 apparel-*.jpg 从公开 Unsplash 图片缓存到扩展 public/images，正式预览不再依赖远程 URL。来源 photo IDs：试穿 1539109136881-3be0616acf4b；换模特/种草 1483985988355-763728e1935b；穿搭 1489987707025-afc232f7ea0f；SKU 1521572163474-6864f9cf17ab；美甲 1604654894610-df63bc536371；去皱 1598033129183-c4f50c736f10。面料为 SKU 棉质衬衫图片的 400x640 局部裁切，替换不相关的地毯示例。均为素材示例，不代表模型结果或人物商业授权承诺。
- 发布：2026-11-08 最后重建的 index-DlQCx8RU.js / index-CnvLStni.css 与已验收版本 SHA-256 完全一致；增量复制 13 个文件，56 个旧资源在实际服务和发布目录均原样保留，仅重启 buildingai-api。初次 HTTP 在启动窗口连接失败；随后真实入口引用最终资源，新 JS/CSS/browser 和旧定制模特 JS/CSS/browser HTTP 200、MIME 正确、字节匹配，八张本地图片 HTTP 200，/consoleapi/health 为 application/json、code 20000、data.status ok。访问 http://localhost:4090/studio。
- 原分支 feat/yingxiao；不自动暂存/提交/推送、创建分支/工作树或迁移数据库。
- 不执行付费生成、真实账户保存/扣费或配置变更。准确试穿、身份、手部解剖、纹理与真实费用另待授权验收；不将模拟或提示词断言当实际出图成功。
- Obsidian 持续同步：需求/出图AI-近期修改需求汇总，保留确认前方案历史及此前定制模特记录。
- 变更历史：2026-11-07 后端 493 项及 API 类型通过，前端/审查/浏览器/构建/发布当时待完成；2026-11-08 完成上述阶段并更新实施与验收状态，保留旧浏览器失败证据和真实业务待验收边界，未提交或推送。