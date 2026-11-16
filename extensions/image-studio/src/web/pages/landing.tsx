import { useAuthStore } from "@buildingai/stores";
import { ArrowLeftRight, ArrowRight, Camera, Check, CreditCard, Grid2X2, Layers, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";

import type { ToolKey } from "../../api/shared/tools";
import { TOOL_ICONS, TOOL_LABELS } from "./workspace-navigation";

const studioUrl = "/studio";
const imageUrl = (name: string) => `/extension/image-studio/images/${name}`;
const CATEGORIES = ["全部", "电商主图", "服饰穿搭", "AI修图"] as const;
type Category = (typeof CATEGORIES)[number];

interface CatalogTool {
  key: ToolKey;
  group: Exclude<Category, "全部">;
  desc: string;
}

const CATALOG: CatalogTool[] = [
  { key: "main", group: "电商主图", desc: "白底、场景、卖点图，在同一工作流中生成" },
  { key: "detail", group: "电商主图", desc: "卖点自动分段排版，生成详情长图" },
  { key: "replica", group: "电商主图", desc: "复刻参考图的布景、光影与风格" },
  { key: "creative", group: "电商主图", desc: "一句描述，生成商品场景图" },
  { key: "fusion", group: "电商主图", desc: "多张素材融合成一张完整构图" },
  { key: "expand", group: "电商主图", desc: "延展背景，自由转换商品图画幅" },
  { key: "cutout", group: "AI修图", desc: "识别商品边缘，透明背景直接导出" },
  { key: "recolor", group: "AI修图", desc: "保留版型与材质，切换商品配色" },
  { key: "watermark", group: "AI修图", desc: "圈选水印与杂物，修复背景纹理" },
  { key: "translate", group: "AI修图", desc: "图中文字识别与多语言替换" },
  { key: "retouch", group: "AI修图", desc: "修复瑕疵，增强光影与材质表现" },
  { key: "sku", group: "AI修图", desc: "多色多码，批量产出商品规格图" },
  { key: "redraw", group: "AI修图", desc: "圈选局部区域，按描述重新绘制" },
  { key: "tryon", group: "服饰穿搭", desc: "商品上身，指定场景与姿态" },
  { key: "model_swap", group: "服饰穿搭", desc: "保留服装，替换为指定模特" },
  { key: "outfit", group: "服饰穿搭", desc: "单件服装生成整套穿搭方案" },
  { key: "fabric", group: "服饰穿搭", desc: "面料图生成成衣，预览上身效果" },
  { key: "apparel_sku", group: "服饰穿搭", desc: "服饰多色多码，批量生成规格图" },
  { key: "ugc_outfit", group: "服饰穿搭", desc: "将服装融入生活化穿搭场景" },
  { key: "nail_tryon", group: "服饰穿搭", desc: "上传甲片款式，预览自然上手效果" },
  { key: "dewrinkle", group: "服饰穿搭", desc: "抚平褶皱，保留细腻面料纹理" },
];

interface FeaturedTool extends CatalogTool {
  title: string;
  tag: string;
  detail: string;
  action: string;
}

const FEATURED: FeaturedTool[] = [
  { key: "main", group: "电商主图", title: "商品主图生成", tag: "白底 → 置景", detail: "多图输出", action: "立即出图", desc: "白底图或随手拍一键置景，自由选择极简木纹、室外阳光等场景，让商品拥有自己的商业光影。" },
  { key: "replica", group: "电商主图", title: "爆款光影复刻", tag: "热销同款构图", detail: "参考风格迁移", action: "上传参考图", desc: "上传同类商品的热卖参考图，提取布光、材质反光与景深构图，套用到你的商品上。" },
  { key: "detail", group: "电商主图", title: "商品详情套图", tag: "全套详情卖点", detail: "统一视觉风格", action: "生成详情", desc: "围绕商品卖点与细节生成分段详情图，保持场景、色温与质感一致，让详情页更有完整感。" },
  { key: "expand", group: "电商主图", title: "智能扩图与画幅转换", tag: "全向智能延展", detail: "自由画幅", action: "自由扩图", desc: "把正方形产品图延展为横版轮播 Banner 或竖版封面，适配不同渠道的展示尺寸。" },
  { key: "tryon", group: "服饰穿搭", title: "平铺 / 假人模特试穿", tag: "平铺 → 模特", detail: "自然垂坠", action: "一键试穿", desc: "上传平铺衣服或假人台拍图，预览真人模特上身效果，搭配品牌所需的场景与姿态。" },
  { key: "model_swap", group: "服饰穿搭", title: "模特换脸与肤色适配", tag: "跨境出海定制", detail: "指定模特", action: "更换模特", desc: "保留服装造型，使用指定模特素材替换人物形象，为不同市场建立一致的品牌视觉。" },
  { key: "apparel_sku", group: "服饰穿搭", title: "多 SKU 服装批量换色", tag: "无需重复打样", detail: "批量变体", action: "批量换色", desc: "从一件样衣出发，配置颜色与规格变体，批量制作服饰 SKU 图片，减少重复拍摄与整理。" },
  { key: "dewrinkle", group: "服饰穿搭", title: "服饰智能平整去皱", tag: "平整免烫", detail: "保留面料纹理", action: "一键熨平", desc: "修复运输拆包后的杂乱褶皱与折痕，保留面料本身的纹理，让商品展示更整洁。" },
  { key: "cutout", group: "AI修图", title: "发丝级一键抠图", tag: "透明通道 PNG", detail: "透明背景", action: "快速抠图", desc: "识别毛绒、玻璃与细线等商品边缘，导出透明背景图片，便于继续置景与排版。" },
  { key: "watermark", group: "AI修图", title: "全自动去水印与杂物", tag: "涂抹即消", detail: "背景纹理修复", action: "开始消除", desc: "圈选有权编辑的图片中的水印、杂物或无关背景，修复选区并融合周围纹理。" },
  { key: "translate", group: "AI修图", title: "跨境主图智能翻译", tag: "原版式保留", detail: "多语言替换", action: "智能翻译", desc: "识别图片中的说明文案，替换为目标语言，帮助商品主图与包装展示适配跨境市场。" },
  { key: "retouch", group: "AI修图", title: "产品画质与质感精修", tag: "微观细节重建", detail: "高清增强", action: "画质提升", desc: "针对商品瑕疵、光影与材质细节进行精修，清晰度与输出规格以所选模型能力为准。" },
];

const TOOL_GROUPS: { category: CatalogTool["group"]; title: string; desc: string }[] = [
  { category: "电商主图", title: "专区一 · 爆款商品生图", desc: "白底照一键置景，参考热门光影，让主图、详情与跨渠道画幅一站完成。" },
  { category: "服饰穿搭", title: "专区二 · 服装与模特换装", desc: "平铺衣服预览模特上身，切换人物形象与商品配色，减少重复拍摄。" },
  { category: "AI修图", title: "专区三 · 日常修图工坊", desc: "精细抠图、水印消除、图片翻译与质感精修，让每张商品图更出彩。" },
];

const PLANS = [
  { name: "周卡", label: "入门体验", price: "9.9", original: "29.9", credits: 100, period: "7 天", badge: "新用户专享" },
  { name: "月卡", label: "日常测款", price: "39.9", original: "139.9", credits: 530, period: "30 天" },
  { name: "季卡", label: "稳定换季", price: "109", original: "379", credits: 1770, period: "90 天" },
  { name: "年卡", label: "长期创作", price: "359", original: "1249", credits: 7200, period: "365 天", badge: "用户首选 · 最受欢迎", hot: true },
  { name: "尊享季卡", label: "企业高频", price: "1280", original: "3840", credits: 25600, period: "90 天" },
];

export default function LandingPage() {
  const { hash } = useLocation();
  const { token, userInfo } = useAuthStore((state) => state.auth);
  const accountName = userInfo?.username || userInfo?.nickname || "我的账户";
  const [category, setCategory] = useState<Category>("全部");
  const [planMode, setPlanMode] = useState<"subscription" | "credits">("subscription");

  useEffect(() => {
    if (!hash) return;
    let anchor: string;
    try {
      anchor = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const frame = requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  const moreTools = CATALOG.filter((tool) => !FEATURED.some((featured) => featured.key === tool.key)
    && (category === "全部" || category === tool.group));

  return <main className="landing">
    <header className="nav">
      <div className="nav-in">
        <a className="wordmark" href="#top" aria-label="出图AI 首页">
          <span className="lp-logo"><Camera size={19} /></span>出图AI <span className="lp-studio-label">Studio</span>
        </a>
        <nav className="nav-links" aria-label="首页导航">
          <a href="#tools" onClick={() => setCategory("电商主图")}>电商生图</a>
          <a href="#tools" onClick={() => setCategory("服饰穿搭")}>服装模特</a>
          <a href="#tools" onClick={() => setCategory("AI修图")}>修图工具箱</a>
          <a href="#tools" onClick={() => setCategory("全部")}>效果案例</a>
          <a href="#pricing">收费价格</a>
        </nav>
        <div className="nav-right">
          <a className="link-dim" href={studioUrl} target="_top">{token ? "控制台" : "登录"}</a>
          <a className="btn btn-lime btn-sm" href={studioUrl} target="_top" title={token ? accountName : undefined} style={{ minWidth: 0, maxWidth: 160 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{token ? accountName : "免费开始"}</span>
          </a>
        </div>
      </div>
    </header>

    <section className="lp-hero" id="top">
      <div className="wrap lp-hero-layout">
        <div className="lp-hero-copy">
          <div className="lp-kicker"><span />商业视觉工坊 · 让好商品被看见</div>
          <h1 className="lp-hero-title">手机随手平拍，<br /><span>轻松生成商业大片</span></h1>
          <p className="lp-hero-sub">告别繁琐布光与昂贵影棚租赁。随手平拍即可搭配商业光影与专属场景，让每张商品图都成为你的品牌门面。</p>
          <div className="lp-hero-cta">
            <a className="btn btn-lime btn-lg" href={studioUrl} target="_top"><Sparkles size={17} />免费生成第一张</a>
            <a className="btn btn-ghost btn-lg" href="#tools" onClick={() => setCategory("全部")}><Grid2X2 size={17} />浏览 12 大出图工坊</a>
          </div>
          <div className="lp-trust">
            <span><Check size={15} />商品、服饰与修图一站完成</span>
            <span><Check size={15} />支持多场景商业创作</span>
            <span><Check size={15} />可视化配置工作流</span>
          </div>
        </div>
        <HeroComparison />
      </div>
    </section>

    <section className="sec lp-tools" id="tools">
      <div className="wrap">
        <div className="lp-catalog-heading">
          <div className="sec-head">
            <span className="sec-eyebrow">E-COMMERCE PRODUCTION MATRIX / 01—12</span>
            <h2 className="sec-title">一个工作台，搞定电商出图全流程</h2>
            <p className="sec-desc">告别多工具频繁切换。白底置景、真人模特换装与精细修图，一站式解决。</p>
          </div>
          <div className="lp-tabs" role="group" aria-label="工具分类">
            {CATEGORIES.map((item) => <button key={item} type="button" aria-pressed={category === item} className={`lp-tab${category === item ? " on" : ""}`} onClick={() => setCategory(item)}>
              <Grid2X2 size={14} />{item === "全部" ? "全部工坊 (12)" : TOOL_GROUPS.find((group) => group.category === item)?.title.split(" · ")[1]}
            </button>)}
          </div>
        </div>
        <div className="lp-tool-groups">
          {TOOL_GROUPS.filter((group) => category === "全部" || group.category === category).map((group) => <section className="lp-tool-group" key={group.category} aria-label={group.title}>
            <div className="lp-group-head">
              <span className="lp-group-number">{String(TOOL_GROUPS.indexOf(group) + 1).padStart(2, "0")}</span>
              <div><h3>{group.title}</h3><p>{group.desc}</p></div>
              <span className="lp-group-count">4 项能力</span>
            </div>
            <div className="lp-grid">
              {FEATURED.filter((item) => item.group === group.category).map((item) => {
                const Icon = TOOL_ICONS[item.key];
                return <a className="lp-tool" key={item.key} href={studioUrl} target="_top" aria-label={TOOL_LABELS[item.key]}>
                  <span className="lp-tool-media">
                    <img src={imageUrl(`home-${item.key}.jpg`)} alt={`${item.title}效果示例`} loading="lazy" />
                    <span className="lp-tool-tag">{item.tag}</span><span className="lp-tool-detail">{item.detail}</span>
                  </span>
                  <span className="lp-tool-name"><Icon size={17} />{item.title}</span>
                  <span className="lp-tool-desc">{item.desc}</span>
                  <span className="lp-tool-cta"><span>示例展示</span><span>{item.action}<ArrowRight size={13} /></span></span>
                </a>;
              })}
            </div>
          </section>)}
        </div>
        {moreTools.length > 0 && <details className="lp-more-tools">
          <summary>更多创作工具 <span>{moreTools.length} 项 · 工作台共 {CATALOG.length} 项工具</span></summary>
          <div className="lp-more-grid">{moreTools.map((tool) => {
            const Icon = TOOL_ICONS[tool.key];
            return <a key={tool.key} href={studioUrl} target="_top"><Icon size={18} /><span><strong>{TOOL_LABELS[tool.key]}</strong><small>{tool.desc}</small></span><ArrowRight size={14} /></a>;
          })}</div>
        </details>}
      </div>
    </section>

    <section className="lp-benefits wrap" id="cases" aria-labelledby="benefits-title">
      <div className="lp-benefits-heading"><span className="sec-eyebrow">LESS FRICTION, MORE CREATION</span><h2 id="benefits-title">商业出图，少一点繁琐</h2><p>把创作、素材与任务串成一条工作流，把时间留给更好的商品。</p></div>
      <div className="lp-benefit-grid">
        <article><span>减少重复拍摄<Camera size={16} /></span><strong>一站式</strong><p>主图、详情、模特与修图工具集中管理，减少跨工具切换与重复整理。</p></article>
        <article><span>让商品上新更从容<Layers size={16} /></span><strong>批量创作</strong><p>按商品与渠道配置规格、场景和张数，在工作台跟踪每一项生成任务。</p></article>
        <article><span>从实拍到商业展示<Sparkles size={16} /></span><strong>三步开启</strong><p>上传素材、选择工作流、配置生成。实际耗时取决于模型与任务队列。</p></article>
      </div>
      <div className="lp-benefit-cta"><Camera size={25} /><span><strong>新手卖家专属体验：从第一张商品图开始</strong><small>免费体验与账户权益以实际配置为准，让商业出图成为日常。</small></span><a className="btn btn-ghost" href={studioUrl} target="_top">立即免费体验<ArrowRight size={14} /></a></div>
    </section>

    <section className="sec lp-pricing" id="pricing">
      <div className="wrap">
        <div className="sec-head"><span className="sec-eyebrow">PRICING & SUBSCRIPTION / 商业创作方案</span><h2 className="sec-title">套餐与加油包</h2><p className="sec-desc">选择适合你的创作方式，实际套餐、价格与权益以账户中心为准。</p></div>
        <div className="lp-pricing-tabs" role="group" aria-label="付费方式">
          <button type="button" aria-pressed={planMode === "subscription"} onClick={() => setPlanMode("subscription")}>订阅套餐<span>方案示例</span></button>
          <button type="button" aria-pressed={planMode === "credits"} onClick={() => setPlanMode("credits")}>加油包</button>
        </div>
        {planMode === "subscription" ? <>
          <p className="lp-price-disclaimer">以下为参考设计的套餐展示，不代表当前可购买的价格或权益。</p>
          <div className="price-grid">
            {PLANS.map((plan) => <article className={`price-card${plan.hot ? " hot" : ""}`} key={plan.name}>
              {plan.badge && <span className="hot-badge">{plan.badge}</span>}
              <div className="lp-plan-heading"><h3 className="plan-name">{plan.name}</h3><span>{plan.label}</span></div>
              <div className="plan-price"><small>¥</small>{plan.price}<del>¥{plan.original}</del></div>
              <div className="plan-credit"><span><Sparkles size={12} />示例 {plan.credits.toLocaleString()} 订阅积分</span><small>展示周期：{plan.period}</small></div>
              <a className={`btn ${plan.hot || plan.badge ? "btn-lime" : "btn-ghost"}`} href={`${studioUrl}?account=subscribe`} target="_top">查看实际套餐</a>
              <ul className="feat">{[`示例周期 ${plan.period}`, "商品主图与详情工作流", "服饰与模特创作入口", "一键抠图与图片翻译", "商品换色与局部重绘", "素材管理与生成历史", "输出规格按模型配置", "实际积分与权益见账户"].map((feature) => <li key={feature}><Check size={13} />{feature}</li>)}</ul>
            </article>)}
          </div>
        </> : <div className="lp-pack-panel"><CreditCard size={30} /><h3>按需补充创作积分</h3><p>加油包价格、可用额度及充值开放状态由账户中心实时提供。</p><a className="btn btn-lime" href={`${studioUrl}?account=wallet`} target="_top">查看积分加油包<ArrowRight size={14} /></a></div>}
        <div className="lp-payment-note"><span><ShieldCheck size={14} />账户权益以实际配置为准</span><span><CreditCard size={14} />通过账户中心完成购买</span><a href={studioUrl} target="_top">前往创作工作台<ArrowRight size={13} /></a></div>
      </div>
    </section>

    <footer id="footer">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand"><a className="wordmark" href="#top"><span className="lp-logo"><Sparkles size={16} /></span>出图AI</a><p>专为电商卖家与视觉创作者打造的商业出图工具，让商品、服饰与修图创作在一个工作台完成。</p></div>
          <div className="foot-col"><h4>产品功能</h4><a href="#tools" onClick={() => setCategory("电商主图")}>电商生图</a><a href="#tools" onClick={() => setCategory("服饰穿搭")}>服装模特</a><a href="#tools" onClick={() => setCategory("AI修图")}>修图工具箱</a></div>
          <div className="foot-col"><h4>资源与支持</h4><a href="#tools" onClick={() => setCategory("全部")}>效果案例</a><a href="#pricing">收费价格</a><a href={studioUrl} target="_top">创作工作台</a></div>
          <div className="foot-col"><h4>商业创作</h4><p>从商品实拍到多渠道内容，组织属于你的商业视觉工作流。</p><span className="lp-footer-badges"><span>多场景工作流</span><span>统一账户管理</span></span></div>
        </div>
        <div className="foot-bottom"><span>© 2026 出图AI (Chutu AI Studio). 首页图片及套餐为展示示例。</span><span>Built on FastbuildAI</span></div>
      </div>
    </footer>
  </main>;
}

export function HeroComparison() {
  const [position, setPosition] = useState(50);
  const style: CSSProperties & { "--compare-position": string } = { "--compare-position": `${position}%` };
  return <div className="lp-comparison-card">
    <div className="lp-comparison-head"><span><i />实拍样品<ArrowRight size={14} />商业主图<small>85mm · 柔光晨曦</small></span><span className="lp-comparison-hint"><ArrowLeftRight size={14} />左右滑动对比</span></div>
    <div className="lp-comparison" style={style}>
      <div className="lp-comparison-before"><img className="lp-comparison-image" src={imageUrl("home-hero-before.jpg")} alt="原始日常随手拍示例" fetchPriority="high" /></div>
      <div className="lp-comparison-after"><img className="lp-comparison-image" src={imageUrl("home-hero-after.jpg")} alt="AI 商业光影置景示例" fetchPriority="high" /></div>
      <span className="lp-comparison-line"><span><ArrowLeftRight size={19} /></span></span>
      <span className="lp-comparison-label before">原始日常随手拍</span><span className="lp-comparison-label after">AI 商业光影置景</span>
      <input className="lp-comparison-range" type="range" min={0} max={100} value={position} aria-label="原图显示比例" aria-valuetext={`原图 ${position}%，AI 效果 ${100 - position}%`} onChange={(event) => setPosition(Number(event.target.value))} />
    </div>
    <div className="lp-comparison-foot"><div className="lp-lighting-styles"><span>光影风格：</span><span>奢感丝绸</span><span>暖阳微风</span><span>静谧大理石</span></div><a href={studioUrl} target="_top"><Sparkles size={13} />套用此光影</a></div>
  </div>;
}
