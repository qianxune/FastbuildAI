-- Migration: Create XHS Tables
-- Version: 25.2.1
-- Generated: 2026-01-10
-- Description: Create tables for XHS Note Generator feature

-- Create xhs_groups table
CREATE TABLE IF NOT EXISTS "xhs_groups" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "name" varchar(100) NOT NULL,
    "is_default" boolean NOT NULL DEFAULT false,
    "user_id" uuid NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_xhs_groups" PRIMARY KEY ("id"),
    CONSTRAINT "FK_xhs_groups_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Create xhs_notes table
CREATE TABLE IF NOT EXISTS "xhs_notes" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "title" varchar(200) NOT NULL,
    "content" text NOT NULL,
    "cover_images" jsonb,
    "word_count" int NOT NULL DEFAULT 0,
    "mode" varchar(50) NOT NULL DEFAULT 'ai-generate',
    "original_input" text,
    "user_id" uuid NOT NULL,
    "group_id" uuid,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_xhs_notes" PRIMARY KEY ("id"),
    CONSTRAINT "FK_xhs_notes_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE,
    CONSTRAINT "FK_xhs_notes_group" FOREIGN KEY ("group_id") REFERENCES "xhs_groups"("id") ON DELETE SET NULL
);

-- Create xhs_hot_topics table
CREATE TABLE IF NOT EXISTS "xhs_hot_topics" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "title" varchar(100) NOT NULL,
    "category" varchar(50),
    "usage_count" int NOT NULL DEFAULT 0,
    "sort_order" int NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_xhs_hot_topics" PRIMARY KEY ("id")
);

-- Create xhs_images table
CREATE TABLE IF NOT EXISTS "xhs_images" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "url" varchar(500) NOT NULL,
    "type" varchar(50) NOT NULL,
    "user_id" uuid NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_xhs_images" PRIMARY KEY ("id"),
    CONSTRAINT "FK_xhs_images_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
);

-- Create xhs_content_templates table
CREATE TABLE IF NOT EXISTS "xhs_content_templates" (
    "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
    "title" varchar(200) NOT NULL,
    "content" text NOT NULL,
    "category" varchar(50) NOT NULL,
    "usage_count" int NOT NULL DEFAULT 0,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_xhs_content_templates" PRIMARY KEY ("id")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "IDX_xhs_groups_user_id" ON "xhs_groups" ("user_id");

CREATE INDEX IF NOT EXISTS "IDX_xhs_notes_user_id_created_at" ON "xhs_notes" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_xhs_notes_group_id" ON "xhs_notes" ("group_id");
CREATE INDEX IF NOT EXISTS "IDX_xhs_notes_user_id" ON "xhs_notes" ("user_id");

CREATE INDEX IF NOT EXISTS "IDX_xhs_hot_topics_category" ON "xhs_hot_topics" ("category");
CREATE INDEX IF NOT EXISTS "IDX_xhs_hot_topics_usage_count" ON "xhs_hot_topics" ("usage_count");
CREATE INDEX IF NOT EXISTS "IDX_xhs_hot_topics_sort_order" ON "xhs_hot_topics" ("sort_order");

CREATE INDEX IF NOT EXISTS "IDX_xhs_images_user_id_created_at" ON "xhs_images" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "IDX_xhs_images_type" ON "xhs_images" ("type");
CREATE INDEX IF NOT EXISTS "IDX_xhs_images_user_id" ON "xhs_images" ("user_id");

CREATE INDEX IF NOT EXISTS "IDX_xhs_content_templates_category" ON "xhs_content_templates" ("category");
CREATE INDEX IF NOT EXISTS "IDX_xhs_content_templates_usage_count" ON "xhs_content_templates" ("usage_count");

-- Create full-text search index for notes
CREATE INDEX IF NOT EXISTS "IDX_xhs_notes_title_content_search" ON "xhs_notes" USING gin(to_tsvector('english', title || ' ' || content));

-- Insert some sample hot topics
INSERT INTO "xhs_hot_topics" ("title", "category", "sort_order") VALUES
('今天的美食分享', '美食', 1),
('OOTD穿搭记录', '穿搭', 2),
('好物推荐清单', '好物', 3),
('旅游攻略分享', '旅游', 4),
('美妆产品测评', '美妆', 5),
('萌宠日常记录', '萌宠', 6),
('日常生活vlog', '日常', 7),
('探店打卡体验', '美食', 8),
('护肤心得分享', '美妆', 9),
('家居好物推荐', '好物', 10)
ON CONFLICT DO NOTHING;

-- Insert some sample content templates
INSERT INTO "xhs_content_templates" ("title", "content", "category") VALUES
('美妆产品测评模板', '🌟【产品名称】测评来啦！\n\n✨ 产品信息：\n品牌：xxx\n价格：xxx\n购买渠道：xxx\n\n💄 使用感受：\n质地：xxx\n上妆效果：xxx\n持久度：xxx\n\n⭐ 总体评分：x/5分\n\n💡 适合人群：xxx\n\n#美妆测评 #好物推荐', '美妆'),
('OOTD穿搭模板', '👗 今日OOTD分享\n\n📍 场合：xxx\n🌡️ 天气：xxx\n\n👕 单品清单：\n上衣：xxx\n下装：xxx\n鞋子：xxx\n配饰：xxx\n\n💡 搭配心得：\nxxx\n\n🔗 购买链接：xxx\n\n#OOTD #穿搭分享 #时尚', 'OOTD'),
('好物分享模板', '🛒 好物推荐 | xxx\n\n⭐ 推荐理由：\n1. xxx\n2. xxx\n3. xxx\n\n💰 价格：xxx\n🛍️ 购买渠道：xxx\n\n📝 使用心得：\nxxx\n\n🏷️ 适用人群：xxx\n\n#好物推荐 #种草', '好物分享'),
('探店打卡模板', '🍽️ 探店打卡 | 店名\n\n📍 地址：xxx\n💰 人均：xxx\n⏰ 营业时间：xxx\n\n🌟 推荐菜品：\n1. xxx - 评分x/5\n2. xxx - 评分x/5\n3. xxx - 评分x/5\n\n🏪 环境：xxx\n👥 服务：xxx\n\n💡 小贴士：xxx\n\n#探店 #美食推荐', '探店'),
('美食分享模板', '🍳 今日美食 | xxx\n\n📋 食材准备：\n- xxx\n- xxx\n- xxx\n\n👩‍🍳 制作步骤：\n1. xxx\n2. xxx\n3. xxx\n\n💡 小贴士：\nxxx\n\n😋 味道：xxx\n\n#美食制作 #家常菜', '美食'),
('萌宠日常模板', '🐱 萌宠日常 | 宠物名字\n\n📸 今日份可爱：\nxxx\n\n🎯 今天做了什么：\n- xxx\n- xxx\n- xxx\n\n😊 心情指数：⭐⭐⭐⭐⭐\n\n💡 养宠小贴士：\nxxx\n\n#萌宠日常 #宠物', '萌宠'),
('日常生活模板', '📝 日常记录 | 日期\n\n🌅 今日安排：\n上午：xxx\n下午：xxx\n晚上：xxx\n\n✨ 今日亮点：\nxxx\n\n💭 心情感悟：\nxxx\n\n📚 今日学习：\nxxx\n\n#日常生活 #生活记录', '日常')
ON CONFLICT DO NOTHING;

COMMENT ON TABLE "xhs_groups" IS '小红书笔记分组';
COMMENT ON TABLE "xhs_notes" IS '小红书笔记';
COMMENT ON TABLE "xhs_hot_topics" IS '小红书热门主题';
COMMENT ON TABLE "xhs_images" IS '小红书图片';
COMMENT ON TABLE "xhs_content_templates" IS '小红书内容模板';