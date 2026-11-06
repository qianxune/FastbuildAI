import { useAuthStore } from "@buildingai/stores";
import {
  ArrowRight,
  Check,
  ChevronRight,
  ImageIcon,
  Minus,
  Plus,
  ScanLine,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const studioUrl = "/studio";
const imageUrl = (name: string) => `/extension/image-studio/images/${name}`;

const tickers = [
  { target: 2000000, label: "张商品图已生成", format: "comma", small: "+" },
  { target: 380000, label: "卖家正在使用", format: "comma", small: "+" },
  { target: 18, label: "平均出图耗时", dec: 0, small: "s" },
  { target: 4.9, label: "卖家满意度评分", dec: 1, small: "/5" },
];

export default function LandingPage() {
  const { hash } = useLocation();
  const { token, userInfo } = useAuthStore((state) => state.auth);
  const accountName = userInfo?.username || userInfo?.nickname || "我的账户";
  const [comparison, setComparison] = useState(58);
  const cmpRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // auto comparison animation
    let t0: number | null = null;
    let raf: number | null = null;
    const autoCmp = (ts: number) => {
      if (t0 === null) t0 = ts;
      const s = (ts - t0) / 1000;
      setComparison(50 + 12 * Math.sin(s * 1.1));
      raf = requestAnimationFrame(autoCmp);
    };
    raf = requestAnimationFrame(autoCmp);
    const stopAuto = () => {
      if (raf) cancelAnimationFrame(raf);
    };
    const el = cmpRef.current;
    el?.addEventListener("pointerdown", stopAuto, { once: true });

    // reveal observer
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    document.querySelectorAll(".rv").forEach((el) => io.observe(el));

    return () => {
      stopAuto();
      io.disconnect();
    };
  }, []);

  const updateComparison = (clientX: number, element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const percentage = ((clientX - bounds.left) / bounds.width) * 100;
    setComparison(Math.min(96, Math.max(4, percentage)));
  };

  return (
    <main className="landing">
      {/* NAV */}
      <header className="nav">
        <div className="nav-in">
          <a className="wordmark" href="#top" aria-label="出图AI 首页">
            出图AI <span className="mark-dot" />
          </a>
          <nav className="nav-links">
            <a href="#features">功能</a>
            <a href="#pricing">价格</a>
            <a href="#cases">案例</a>
            <a href="#footer">更新日志</a>
          </nav>
          <div className="nav-right">
            <a className="link-dim" href={studioUrl} target="_top">
              {token ? "控制台" : "登录"}
            </a>
            <a
              className="btn btn-lime btn-sm"
              href={studioUrl}
              target="_top"
              title={token ? accountName : undefined}
              style={{ minWidth: 0, maxWidth: 160 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {token ? accountName : "免费开始"}
              </span>
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero" id="top">
        <div className="wrap hero-grid">
          <div>
            <span className="eyebrow rv">AI E-COMMERCE IMAGERY · 电商出图引擎 V2</span>
            <h1 className="rv" data-d="1">
              商品照片进，<br />
              <span style={{ color: "var(--lime)" }}>爆款大图</span>出
            </h1>
            <p className="hero-sub rv" data-d="2">
              上传一张随手拍的商品图，出图AI 自动完成布景、打光、文案排版——白底图、场景图、卖点图一次四张，直接上架。
            </p>
            <div className="hero-cta rv" data-d="3">
              <a className="btn btn-lime btn-lg" href={studioUrl} target="_top">
                免费生成第一张
              </a>
              <a className="btn btn-ghost btn-lg" href="#features">
                看看能做什么
              </a>
            </div>
            <p className="trust rv" data-d="4">
              注册即送 <b>30 积分</b> · 无需信用卡 · 平均 18 秒出图
            </p>
          </div>

          <div className="hero-visual rv" data-d="2">
            <div
              ref={cmpRef}
              className="cmp"
              style={{ "--pos": `${comparison}%` } as CSSProperties}
              onPointerDown={(event) => {
                const el = event.currentTarget;
                el.setPointerCapture(event.pointerId);
                updateComparison(event.clientX, el);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  updateComparison(event.clientX, event.currentTarget);
                }
              }}
              role="slider"
              aria-label="查看 AI 生成前后对比"
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") setComparison((v) => Math.max(4, v - 4));
                if (event.key === "ArrowRight") setComparison((v) => Math.min(96, v + 4));
              }}
            >
              <img className="cmp-img" src={imageUrl("perfume-before.jpg")} alt="商品原图" />
              <div
                className="cmp-after"
                style={{ clipPath: `inset(0 calc(100% - ${comparison}%) 0 0)` }}
              >
                <img className="cmp-img" src={imageUrl("perfume-after.jpg")} alt="AI 生成结果" />
              </div>
              <div className="cmp-handle" style={{ left: `${comparison}%` }}>
                <span className="cmp-grip">
                  <ScanLine width={16} height={16} />
                </span>
              </div>
              <span className="cmp-tag l">原图</span>
              <span className="cmp-tag r">AI 生成</span>
              <div className="chip chip-a">
                <span className="chip-dot" /> 生成完成 · <b>4 张</b> · 18s
              </div>
              <div className="chip chip-b">-30 积分</div>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO / 工具矩阵 */}
      <section className="sec" id="features" style={{ borderTop: "1px solid var(--line)", paddingTop: 96 }}>
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-eyebrow">
              <b>§02</b> — 工具矩阵
            </span>
            <h2 className="sec-title">一个工作台，覆盖商品出图全流程</h2>
            <p className="sec-desc">从主图到详情页，从精修到扩图。所有工具共享同一个画布与积分体系，随取随用。</p>
          </div>

          <div className="bento">
            <a className="tile t-main rv" href={studioUrl} target="_top">
              <span className="tile-no">§01</span>
              <h3>商品主图</h3>
              <p>白底图、场景图、卖点图一次四张。拖动滑块，看看同一只鞋的两种命运。</p>
              <div className="mini-cmp" style={{ "--pos": "62%" } as CSSProperties}>
                <img className="cmp-img" src={imageUrl("sneaker-before.jpg")} alt="球鞋原图" />
                <div
                  className="cmp-after"
                  style={{ clipPath: "inset(0 calc(100% - 62%) 0 0)" }}
                >
                  <img className="cmp-img" src={imageUrl("sneaker-after.jpg")} alt="球鞋出图" />
                </div>
                <div className="cmp-handle" style={{ left: "62%" }}>
                  <span className="cmp-grip">
                    <ScanLine width={14} height={14} />
                  </span>
                </div>
                <span className="cmp-tag l">原图</span>
                <span className="cmp-tag r">出图</span>
              </div>
            </a>

            <a className="tile t-replica rv" data-d="1" href={studioUrl} target="_top">
              <span className="tile-no">§02</span>
              <h3>爆款复刻</h3>
              <p>丢一张对标图，复刻同款布景与光影</p>
              <div className="tile-visual">
                <img src={imageUrl("perfume-after.jpg")} alt="爆款复刻示意" />
              </div>
            </a>

            <a className="tile t-retouch rv" data-d="2" href={studioUrl} target="_top">
              <span className="tile-no">§03</span>
              <h3>产品精修</h3>
              <p>瑕疵修复、质感增强，一键到位</p>
              <div className="tile-visual">
                <img src={imageUrl("bottle-scene.jpg")} alt="产品精修示意" />
              </div>
            </a>

            <a className="tile t-expand rv" href={studioUrl} target="_top">
              <span className="tile-no">§04</span>
              <h3>智能扩图</h3>
              <p>1:1 变 3:4，画布向外生长</p>
              <span className="expand-note">1:1 → 3:4</span>
              <div className="tile-visual">
                <div className="expand-frame">
                  <img src={imageUrl("mug-scene.jpg")} alt="智能扩图示意" />
                </div>
              </div>
            </a>

            <a className="tile t-cutout rv" data-d="1" href={studioUrl} target="_top">
              <span className="tile-no">§05</span>
              <h3>一键抠图</h3>
              <p>发丝级边缘，透明底直出</p>
              <div className="tile-visual">
                <div className="cutout-stage">
                  <svg viewBox="0 0 96 64" fill="none">
                    <path
                      d="M30 44c0-10 4-18 10-22l2-8h12l2 8c6 4 10 12 10 22 0 8-4 14-10 16H40c-6-2-10-8-10-16z"
                      fill="#F4F4F1"
                    />
                    <path d="M42 14h12v6H42z" fill="#CDFF57" />
                    <rect x="34" y="12" width="28" height="3" rx="1.5" fill="none" stroke="#CDFF57" strokeWidth="1.2" strokeDasharray="3 3" />
                  </svg>
                </div>
              </div>
            </a>

            <a className="tile t-sku rv" data-d="2" href={studioUrl} target="_top">
              <span className="tile-no">§06</span>
              <h3>商品SKU图</h3>
              <p>多色多码，批量产出规格图</p>
              <div className="mini-row">
                <div className="mini-thumb">
                  <img src={imageUrl("sneaker-after.jpg")} alt="SKU变体1" />
                </div>
                <div className="mini-thumb">
                  <img src={imageUrl("mug-scene.jpg")} alt="SKU变体2" />
                </div>
                <div className="mini-thumb">
                  <img src={imageUrl("bottle-scene.jpg")} alt="SKU变体3" />
                </div>
              </div>
            </a>

            <a className="tile t-detail rv" data-d="3" href={studioUrl} target="_top">
              <span className="tile-no">§07</span>
              <h3>商品详情页</h3>
              <p>卖点排版自动生成长图</p>
              <div className="mini-row">
                <div className="mini-thumb">
                  <img src={imageUrl("bottle-scene.jpg")} alt="详情页1" />
                </div>
                <div className="mini-thumb">
                  <img src={imageUrl("perfume-after.jpg")} alt="详情页2" />
                </div>
                <div className="mini-thumb">
                  <img src={imageUrl("sneaker-after.jpg")} alt="详情页3" />
                </div>
              </div>
            </a>

            <div className="tile t-stats rv">
              <div>
                <span className="tile-no">§08</span>
                <div className="stat-big" style={{ fontFamily: "var(--font-disp)" }}>
                  <Ticker target={18} />
                  <small style={{ fontSize: 34, fontWeight: 600 }}>s</small>
                </div>
                <div className="stat-label">平均出图耗时</div>
              </div>
              <div className="stat-meta">
                单张成本 <b>¥0.11</b>
                <br />
                上架达标率 <b>98.2%</b>
                <br />
                重拍率 <b>-72%</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="sec" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-eyebrow">
              <b>§03</b> — 工作流
            </span>
            <h2 className="sec-title">三步，从随手拍到直接上架</h2>
          </div>
          <div className="flow">
            <div className="step rv">
              <div className="step-no">01</div>
              <h3>上传商品图</h3>
              <p>手机随手拍即可。AI 自动识别商品主体、类目与关键卖点。</p>
              <p className="mono-tip">支持 JPG / PNG / WEBP · 单张 ≤ 20MB</p>
            </div>
            <div className="step rv" data-d="1">
              <div className="step-no">02</div>
              <h3>选风格，配参数</h3>
              <p>选择目标平台与配图类型，白底、场景、卖点图按需勾选。</p>
              <p className="mono-tip">8 大平台模板 · 比例 / 清晰度可调</p>
            </div>
            <div className="step rv" data-d="2">
              <div className="step-no">03</div>
              <h3>批量出图，下载</h3>
              <p>四张一组并行生成，满意的一键打包下载，直接上传店铺后台。</p>
              <p className="mono-tip">批量下载 ZIP · 保留高清原始尺寸</p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAND */}
      <section className="stats" id="cases">
        <div className="stats-grid">
          {tickers.map((t, i) => (
            <div className={`stat-cell rv${i > 0 ? "" : ""}`} key={t.label} data-d={i}>
              <div className="stat-num" style={{ fontFamily: "var(--font-disp)" }}>
                <Ticker target={t.target} decimals={t.dec} format={t.format} />
                <small>{t.small}</small>
              </div>
              <div className="stat-cap">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="sec" id="pricing">
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-eyebrow">
              <b>§05</b> — 价格
            </span>
            <h2 className="sec-title">按积分付费，用多少买多少</h2>
            <p className="sec-desc">1 积分 = 1 张标准图。积分永不过期，随时充值。</p>
          </div>
          <div className="price-grid">
            <div className="price-card rv">
              <div className="plan-name">体验版</div>
              <div className="plan-price">¥0</div>
              <div className="plan-credit">注册赠送 30 积分</div>
              <ul className="feat">
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 全部 10 个出图工具
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 1K 标准清晰度
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 单张生成，含水印
                </li>
              </ul>
              <a className="btn btn-ghost" href={studioUrl} target="_top">
                免费开始
              </a>
            </div>

            <div className="price-card hot rv" data-d="1">
              <span className="hot-badge">最受欢迎</span>
              <div className="plan-name">卖家版</div>
              <div className="plan-price">
                ¥99<small> /月</small>
              </div>
              <div className="plan-credit">每月 1,000 积分</div>
              <ul className="feat">
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 全部 10 个出图工具
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 2K 高清 · 无水印 · 批量下载
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 爆款复刻 + 详情页排版
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 生成历史云端保存 90 天
                </li>
              </ul>
              <a className="btn btn-lime" href={studioUrl} target="_top">
                开通卖家版
              </a>
            </div>

            <div className="price-card rv" data-d="2">
              <div className="plan-name">团队版</div>
              <div className="plan-price">
                ¥399<small> /月</small>
              </div>
              <div className="plan-credit">每月 5,000 积分</div>
              <ul className="feat">
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 含卖家版全部权益
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 5 个子账号 + 团队协作空间
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> API 接入 · 品牌风格自定义训练
                </li>
                <li>
                  <Check width={15} height={15} style={{ color: "var(--lime)" }} /> 专属客户成功经理
                </li>
              </ul>
              <a className="btn btn-ghost" href={studioUrl} target="_top">
                联系销售
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="sec-head rv">
            <span className="sec-eyebrow">
              <b>§06</b> — FAQ
            </span>
            <h2 className="sec-title">常见问题</h2>
          </div>
          <div className="faq rv" data-d="1">
            <details open>
              <summary>
                生成的图片可以直接上架平台吗？<span style={{ fontFamily: "var(--font-mono)" }}>+</span>
              </summary>
              <p className="ans">
                可以。卖家版生成的 2K 无水印图片符合淘宝、天猫、拼多多、抖音商城等主流平台的主图与详情页规范，白底图满足纯白背景要求。
              </p>
            </details>
            <details>
              <summary>
                商品图会有「AI 生成」痕迹吗？<span style={{ fontFamily: "var(--font-mono)" }}>+</span>
              </summary>
              <p className="ans">
                出图AI 只重绘背景与光影，商品主体保持原样，并针对主流平台审核规则做了适配优化。部分平台要求标注 AI 生成内容，请在发布时按平台规则勾选。
              </p>
            </details>
            <details>
              <summary>
                积分怎么算？生成失败会扣吗？<span style={{ fontFamily: "var(--font-mono)" }}>+</span>
              </summary>
              <p className="ans">标准图 1 积分/张，精修 2 积分/张。生成失败自动全额退回积分，无需申请。</p>
            </details>
            <details>
              <summary>
                我的商品图会被拿去训练模型吗？<span style={{ fontFamily: "var(--font-mono)" }}>+</span>
              </summary>
              <p className="ans">
                不会。上传的图片仅用于当次生成，默认 7 天后自动删除；也可在设置中开启「用后即焚」，生成完成立即删除。
              </p>
            </details>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-band">
        <div className="wrap">
          <h2 className="rv">
            下一张爆款，<span style={{ color: "var(--lime)" }}>18 秒</span>后到达
          </h2>
          <div className="rv" data-d="1">
            <a className="btn btn-lime btn-lg" href={studioUrl} target="_top">
              免费开始出图
            </a>
            <p className="mono-sub">NO CREDIT CARD · 30 FREE CREDITS</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer id="footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="wordmark" href="#top">
                出图AI <span className="mark-dot" />
              </a>
              <p>面向电商卖家的 AI 出图引擎。商品照片进，爆款大图出。</p>
            </div>
            <div className="foot-col">
              <h4>产品</h4>
              <a href="#features">功能矩阵</a>
              <a href="#pricing">价格</a>
              <a href={studioUrl} target="_top">创作工作台</a>
              <a href="#footer">更新日志</a>
            </div>
            <div className="foot-col">
              <h4>资源</h4>
              <a href="#faq">帮助中心</a>
              <a href="#footer">API 文档</a>
              <a href="#footer">卖家案例</a>
              <a href="#footer">社区</a>
            </div>
            <div className="foot-col">
              <h4>公司</h4>
              <a href="#footer">关于我们</a>
              <a href="#footer">加入我们</a>
              <a href="#footer">联系方式</a>
              <a href="#footer">服务协议</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 出图AI CHUTU.AI — 本页为设计原型，数据均为演示模拟</span>
            <span>Built on FastbuildAI</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/* Simple ticker component */
function Ticker({
  target,
  decimals = 0,
  format,
}: {
  target: number;
  decimals?: number;
  format?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting && !started.current) {
            started.current = true;
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduced) {
              setValue(target);
              return;
            }
            const dur = 1400;
            let t0: number | null = null;
            const frame = (ts: number) => {
              if (t0 === null) t0 = ts;
              const p = Math.min(1, (ts - t0) / dur);
              const e = 1 - Math.pow(1 - p, 3);
              setValue(target * e);
              if (p < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  let text: string;
  if (decimals) text = value.toFixed(decimals);
  else if (format === "comma") text = Math.round(value).toLocaleString("en-US");
  else text = Math.round(value).toString();

  return <span ref={ref}>{text}</span>;
}
