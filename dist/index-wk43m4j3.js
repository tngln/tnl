// src/core/reactivity.ts
var activeEffect = null;
var effectStack = [];
var nextSignalId = 1;
var debugSignals = new Map;
var debugMeta = new Map;
function listSignals() {
  const out = [];
  for (const [id, sig] of debugSignals) {
    const meta = debugMeta.get(id);
    const subs = sig._subs;
    out.push({
      id,
      name: meta?.name,
      scope: meta?.scope,
      createdAt: meta?.createdAt ?? 0,
      subscribers: subs?.size ?? 0,
      peek: () => sig.peek()
    });
  }
  return out;
}
function setSignalMeta(sig, meta) {
  const id = sig._id;
  if (!id)
    return;
  const cur = debugMeta.get(id) ?? { createdAt: Date.now() };
  debugMeta.set(id, { createdAt: cur.createdAt, name: meta.name ?? cur.name, scope: meta.scope ?? cur.scope });
}
function signal(initial) {
  let value = initial;
  const subs = new Set;
  function track() {
    if (!activeEffect)
      return;
    subs.add(activeEffect);
    activeEffect.deps ??= new Set;
    activeEffect.deps.add(sig);
  }
  function notify() {
    for (const sub of [...subs])
      sub();
  }
  const sig = {
    get() {
      track();
      return value;
    },
    peek() {
      return value;
    },
    set(next) {
      const nextValue = typeof next === "function" ? next(value) : next;
      if (Object.is(nextValue, value))
        return;
      value = nextValue;
      notify();
    }
  };
  sig.get = sig.get;
  sig.set = sig.set;
  sig.peek = sig.peek;
  sig._subs = subs;
  const id = nextSignalId++;
  sig._id = id;
  debugSignals.set(id, sig);
  debugMeta.set(id, { createdAt: Date.now() });
  return sig;
}
function cleanupEffect(eff) {
  if (eff.cleanup) {
    const c = eff.cleanup;
    eff.cleanup = undefined;
    if (typeof c === "function")
      c();
  }
  if (!eff.deps)
    return;
  for (const dep of eff.deps) {
    const subs = dep._subs;
    subs?.delete(eff);
  }
  eff.deps.clear();
}
function effect(fn) {
  const runner = () => {
    cleanupEffect(runner);
    activeEffect = runner;
    effectStack.push(runner);
    try {
      runner.cleanup = fn() ?? undefined;
    } finally {
      effectStack.pop();
      activeEffect = effectStack.length ? effectStack[effectStack.length - 1] : null;
    }
  };
  runner();
  return () => cleanupEffect(runner);
}
var g = globalThis;
g.__TNL_DEVTOOLS__ ??= {};
g.__TNL_DEVTOOLS__.reactivity = { listSignals, setSignalMeta };

// src/config/theme.ts
function font(theme, spec) {
  return `${spec.weight} ${spec.size}px ${theme.typography.family}`;
}
var theme = {
  colors: {
    appBg: "#0b0f17",
    windowBg: "#121825",
    windowTitleBg: "#e9edf3",
    windowTitleText: "#0b0f17",
    windowBorder: "rgba(255,255,255,0.18)",
    windowDivider: "#1a2233",
    textPrimary: "#e9edf3",
    textMuted: "rgba(233,237,243,0.75)",
    textOnLightMuted: "rgba(11,15,23,0.65)",
    closeHoverBg: "#e81123",
    closeDownBg: "#b32020",
    closeGlyph: "#0b0f17",
    closeGlyphOnHover: "#ffffff"
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18
  },
  radii: {
    sm: 6
  },
  shadows: {
    window: { color: "rgba(0,0,0,0.5)", blur: 18, offsetY: 6 }
  },
  typography: {
    family: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    title: { size: 13, weight: 600 },
    body: { size: 12, weight: 400 },
    headline: { size: 16, weight: 600 }
  },
  ui: {
    titleBarHeight: 32,
    closeButtonPad: 6
  }
};

// src/core/draw.ts
function dprOf(ctx) {
  const t = ctx.getTransform();
  const sx = Math.hypot(t.a, t.b);
  return sx || 1;
}
function withShadow(ctx, shadow, fn) {
  if (!shadow)
    return fn();
  const dpr = dprOf(ctx);
  ctx.save();
  ctx.shadowColor = shadow.color;
  ctx.shadowBlur = shadow.blur / dpr;
  ctx.shadowOffsetX = (shadow.offsetX ?? 0) / dpr;
  ctx.shadowOffsetY = (shadow.offsetY ?? 0) / dpr;
  const out = fn();
  ctx.restore();
  return out;
}
function applyFillStyle(ctx, style) {
  ctx.fillStyle = style.color;
}
function applyStrokeStyle(ctx, style) {
  const dpr = dprOf(ctx);
  const width = style.hairline ? 1 / dpr : style.width ?? 1;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = width;
  ctx.lineCap = style.lineCap ?? "butt";
  ctx.lineJoin = style.lineJoin ?? "miter";
  if (style.dash?.length)
    ctx.setLineDash(style.dash);
  else
    ctx.setLineDash([]);
}
function snappedRect(ctx, r) {
  const dpr = dprOf(ctx);
  const o = 0.5 / dpr;
  return { x: r.x + o, y: r.y + o, w: r.w - 2 * o, h: r.h - 2 * o };
}
function snappedRRect(ctx, rr) {
  const dpr = dprOf(ctx);
  const o = 0.5 / dpr;
  return { x: rr.x + o, y: rr.y + o, w: rr.w - 2 * o, h: rr.h - 2 * o, r: rr.r };
}
function rrectPath(ctx, rr) {
  ctx.beginPath();
  const r = Math.max(0, Math.min(rr.r, Math.min(rr.w, rr.h) / 2));
  ctx.roundRect(rr.x, rr.y, rr.w, rr.h, r);
}
function fillRectOp(ctx, rect, fill) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  });
}
function strokeRectOp(ctx, rect, stroke) {
  withShadow(ctx, stroke.shadow, () => {
    applyStrokeStyle(ctx, stroke);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });
}
function fillPathOp(ctx, fill, buildPath, fillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill);
    buildPath();
    if (fillRule)
      ctx.fill(fillRule);
    else
      ctx.fill();
  });
}
function strokePathOp(ctx, stroke, buildPath) {
  withShadow(ctx, stroke.shadow, () => {
    applyStrokeStyle(ctx, stroke);
    buildPath();
    ctx.stroke();
  });
}
function fillShapeOp(ctx, fill, path, fillRule) {
  withShadow(ctx, fill.shadow, () => {
    applyFillStyle(ctx, fill);
    if (fillRule)
      ctx.fill(path, fillRule);
    else
      ctx.fill(path);
  });
}
function draw(ctx, ...ops) {
  for (const op of ops) {
    switch (op.kind) {
      case "Rect": {
        if (op.fill)
          fillRectOp(ctx, op.rect, op.fill);
        if (op.stroke)
          strokeRectOp(ctx, op.pixelSnap ? snappedRect(ctx, op.rect) : op.rect, op.stroke);
        break;
      }
      case "RRect": {
        if (op.fill)
          fillPathOp(ctx, op.fill, () => rrectPath(ctx, op.rrect));
        if (op.stroke)
          strokePathOp(ctx, op.stroke, () => rrectPath(ctx, op.pixelSnap ? snappedRRect(ctx, op.rrect) : op.rrect));
        break;
      }
      case "Circle": {
        if (op.fill)
          fillPathOp(ctx, op.fill, () => {
            ctx.beginPath();
            ctx.arc(op.circle.x, op.circle.y, op.circle.r, 0, Math.PI * 2);
          });
        if (op.stroke)
          strokePathOp(ctx, op.stroke, () => {
            ctx.beginPath();
            ctx.arc(op.circle.x, op.circle.y, op.circle.r, 0, Math.PI * 2);
          });
        break;
      }
      case "Text": {
        const { text } = op;
        const s = text.style;
        ctx.fillStyle = s.color;
        ctx.font = s.font;
        ctx.textAlign = s.align ?? "start";
        ctx.textBaseline = s.baseline ?? "alphabetic";
        if (text.maxWidth === undefined)
          ctx.fillText(text.text, text.x, text.y);
        else
          ctx.fillText(text.text, text.x, text.y, text.maxWidth);
        break;
      }
      case "Line": {
        const { stroke, a, b } = op;
        strokePathOp(ctx, stroke, () => {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        });
        break;
      }
      case "Shape": {
        fillShapeOp(ctx, op.fill, op.shape.path, op.shape.fillRule);
        break;
      }
    }
  }
}
function Rect(rect, style) {
  return { kind: "Rect", rect, fill: style?.fill, stroke: style?.stroke, pixelSnap: style?.pixelSnap };
}
function RRect(rrect, style) {
  return { kind: "RRect", rrect, fill: style?.fill, stroke: style?.stroke, pixelSnap: style?.pixelSnap };
}
function Circle(circle, style) {
  return { kind: "Circle", circle, fill: style?.fill, stroke: style?.stroke };
}
function Text(text) {
  return { kind: "Text", text };
}
function Line(a, b, stroke) {
  return { kind: "Line", a, b, stroke };
}

// src/core/rect.ts
function normalizeRect(r) {
  const x0 = Math.min(r.x, r.x + r.w);
  const x1 = Math.max(r.x, r.x + r.w);
  const y0 = Math.min(r.y, r.y + r.h);
  const y1 = Math.max(r.y, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function inflateRect(r, pad) {
  const p = Math.max(0, pad);
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
}
function clampRect(r, bounds) {
  const x0 = Math.max(bounds.x, r.x);
  const y0 = Math.max(bounds.y, r.y);
  const x1 = Math.min(bounds.x + bounds.w, r.x + r.w);
  const y1 = Math.min(bounds.y + bounds.h, r.y + r.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0)
    return null;
  return { x: x0, y: y0, w, h };
}
function intersects(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}
function unionRect(a, b) {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function rectArea(r) {
  return Math.max(0, r.w) * Math.max(0, r.h);
}
function mergeRectInto(list, next) {
  let r = next;
  for (let i = 0;i < list.length; i++) {
    const cur = list[i];
    if (!intersects(cur, r))
      continue;
    r = unionRect(cur, r);
    list.splice(i, 1);
    i = -1;
  }
  list.push(r);
}

// src/ui/base/compositor.ts
function makeCanvas(wPx, hPx) {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(wPx, hPx);
  const c = document.createElement("canvas");
  c.width = wPx;
  c.height = hPx;
  return c;
}
function get2d(c) {
  const ctx = c.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx)
    throw new Error("2D context not available");
  return ctx;
}

class Compositor {
  layers = new Map;
  presents = [];
  main = null;
  frame = 0;
  beginFrame(main, frameId) {
    this.main = main;
    this.frame = frameId;
    this.presents = [];
  }
  ensureLayer(id, wCss, hCss, dpr) {
    const w = Math.max(1, Math.floor(wCss * dpr));
    const h = Math.max(1, Math.floor(hCss * dpr));
    const cur = this.layers.get(id);
    if (cur && cur.canvas.width === w && cur.canvas.height === h && cur.dpr === dpr && cur.wCss === wCss && cur.hCss === hCss)
      return cur;
    const canvas = cur?.canvas ?? makeCanvas(w, h);
    canvas.width = w;
    canvas.height = h;
    const ctx = cur?.ctx ?? get2d(canvas);
    const next = { id, canvas, ctx, wCss, hCss, dpr, renderedFrame: -1 };
    this.layers.set(id, next);
    return next;
  }
  withLayer(id, wCss, hCss, dpr, render) {
    const layer = this.ensureLayer(id, wCss, hCss, dpr);
    if (layer.renderedFrame !== this.frame) {
      layer.renderedFrame = this.frame;
      layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layer.ctx.clearRect(0, 0, wCss, hCss);
      render(layer.ctx);
    }
    return layer;
  }
  present(layerId, dest, opts = {}) {
    const blendMode = opts.blendMode ?? "source-over";
    const opacity = opts.opacity ?? 1;
    this.presents.push({ layerId, x: dest.x, y: dest.y, w: dest.w, h: dest.h, blendMode, opacity });
  }
  blit(layerId, dest, opts = {}) {
    const main = this.main;
    if (!main)
      return;
    const layer = this.layers.get(layerId);
    if (!layer)
      return;
    main.save();
    main.globalCompositeOperation = opts.blendMode ?? "source-over";
    main.globalAlpha = opts.opacity ?? 1;
    main.drawImage(layer.canvas, dest.x, dest.y, dest.w, dest.h);
    main.restore();
  }
  flush() {
    const main = this.main;
    if (!main)
      return;
    for (const p of this.presents) {
      const layer = this.layers.get(p.layerId);
      if (!layer)
        continue;
      main.save();
      main.globalCompositeOperation = p.blendMode;
      main.globalAlpha = p.opacity;
      main.drawImage(layer.canvas, p.x, p.y, p.w, p.h);
      main.restore();
    }
  }
}

// src/ui/base/ui.ts
function pointInRect(p, r) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
}
class PointerUIEvent {
  pointerId;
  x;
  y;
  button;
  buttons;
  altKey;
  ctrlKey;
  shiftKey;
  metaKey;
  captured = false;
  constructor(e) {
    this.pointerId = e.pointerId;
    this.x = e.x;
    this.y = e.y;
    this.button = e.button;
    this.buttons = e.buttons;
    this.altKey = e.altKey;
    this.ctrlKey = e.ctrlKey;
    this.shiftKey = e.shiftKey;
    this.metaKey = e.metaKey;
  }
  capture() {
    this.captured = true;
  }
  get didCapture() {
    return this.captured;
  }
}

class WheelUIEvent {
  x;
  y;
  deltaX;
  deltaY;
  deltaZ;
  altKey;
  ctrlKey;
  shiftKey;
  metaKey;
  handled = false;
  constructor(e) {
    this.x = e.x;
    this.y = e.y;
    this.deltaX = e.deltaX;
    this.deltaY = e.deltaY;
    this.deltaZ = e.deltaZ;
    this.altKey = e.altKey;
    this.ctrlKey = e.ctrlKey;
    this.shiftKey = e.shiftKey;
    this.metaKey = e.metaKey;
  }
  handle() {
    this.handled = true;
  }
  get didHandle() {
    return this.handled;
  }
}

class UIElement {
  parent = null;
  children = [];
  visible = true;
  z = 0;
  rt = null;
  containsPoint(p, _ctx) {
    return pointInRect(p, this.bounds());
  }
  add(child) {
    child.parent = this;
    this.children.push(child);
    this.children.sort((a, b) => a.z - b.z);
  }
  remove(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0)
      this.children.splice(idx, 1);
    child.parent = null;
  }
  hitTest(p, ctx) {
    if (!this.visible)
      return null;
    if (!this.containsPoint(p, ctx))
      return null;
    for (let i = this.children.length - 1;i >= 0; i--) {
      const hit = this.children[i].hitTest(p, ctx);
      if (hit)
        return hit;
    }
    return this;
  }
  bringToFront() {
    if (!this.parent)
      return;
    const siblings = this.parent.children;
    const maxZ = siblings.reduce((m, c) => Math.max(m, c.z), 0);
    this.z = maxZ + 1;
    siblings.sort((a, b) => a.z - b.z);
  }
  renderRuntime() {
    return this.rt;
  }
  draw(ctx, rt) {
    if (!this.visible)
      return;
    this.rt = rt ?? null;
    const clip = rt?.clip;
    if (clip) {
      const b = this.bounds();
      if (!intersects(b, clip))
        return;
    }
    this.onDraw(ctx);
    for (const child of this.children)
      child.draw(ctx, rt);
  }
  onDraw(_ctx) {}
  onPointerDown(_e) {}
  onPointerMove(_e) {}
  onPointerUp(_e) {}
  onWheel(_e) {}
  onPointerEnter() {}
  onPointerLeave() {}
}

class CanvasUI {
  canvas;
  ctx;
  root;
  rafPending = false;
  capture = null;
  hover = null;
  dpr = 1;
  cssW = 1;
  cssH = 1;
  dirty = [];
  dirtyFull = true;
  frameId = 0;
  compositor = new Compositor;
  get sizeCss() {
    return { x: this.cssW, y: this.cssH };
  }
  get devicePixelRatio() {
    return this.dpr;
  }
  constructor(canvas, root) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx)
      throw new Error("2D context not available");
    this.ctx = ctx;
    this.root = root;
    this.resize();
    window.addEventListener("resize", this.resize);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  destroy() {
    window.removeEventListener("resize", this.resize);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
  invalidate() {
    this.dirtyFull = true;
    this.dirty = [];
    this.scheduleRender();
  }
  invalidateRect(r, opts = {}) {
    if (opts.force)
      return this.invalidate();
    const pad = opts.pad ?? 2;
    const b = { x: 0, y: 0, w: this.cssW, h: this.cssH };
    const n = normalizeRect(r);
    const inf = inflateRect(n, pad);
    const c = clampRect(inf, b);
    if (!c)
      return;
    if (this.dirtyFull) {
      this.scheduleRender();
      return;
    }
    mergeRectInto(this.dirty, c);
    const maxRects = 32;
    if (this.dirty.length > maxRects) {
      this.dirtyFull = true;
      this.dirty = [];
    } else {
      const total = this.dirty.reduce((s, rr) => s + rectArea(rr), 0);
      if (total > 0.4 * rectArea(b)) {
        this.dirtyFull = true;
        this.dirty = [];
      }
    }
    this.scheduleRender();
  }
  scheduleRender() {
    if (this.rafPending)
      return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }
  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    this.dpr = dpr;
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const w = Math.max(1, Math.floor(this.cssW * dpr));
    const h = Math.max(1, Math.floor(this.cssH * dpr));
    if (this.canvas.width !== w)
      this.canvas.width = w;
    if (this.canvas.height !== h)
      this.canvas.height = h;
    this.invalidate();
  };
  toCanvasPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  toCssWheelDelta(e) {
    let factor = 1;
    if (e.deltaMode === 1)
      factor = 16;
    else if (e.deltaMode === 2)
      factor = Math.max(this.cssH, 1);
    return { x: e.deltaX * factor, y: e.deltaY * factor };
  }
  render() {
    if (!this.dirtyFull && this.dirty.length === 0)
      return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const frameId = this.frameId += 1;
    this.compositor.beginFrame(ctx, frameId);
    const full = { x: 0, y: 0, w: this.cssW, h: this.cssH };
    const rects = this.dirtyFull ? [full] : this.dirty.slice();
    this.dirty = [];
    this.dirtyFull = false;
    for (const r of rects) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.fillStyle = theme.colors.appBg;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      this.root.draw(ctx, { clip: r, compositor: this.compositor, frameId, dpr: this.dpr });
      ctx.restore();
    }
  }
  onPointerDown = (e) => {
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.toCanvasPoint(e);
    const target = this.root.hitTest(p, this.ctx);
    if (!target)
      return;
    let top = target;
    while (top.parent && top.parent !== this.root)
      top = top.parent;
    top.bringToFront();
    const ev = new PointerUIEvent({
      pointerId: e.pointerId,
      x: p.x,
      y: p.y,
      button: e.button,
      buttons: e.buttons,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });
    const before = top.bounds();
    target.onPointerDown(ev);
    if (ev.didCapture)
      this.capture = target;
    const after = top.bounds();
    this.invalidateRect(unionRect(before, after), { pad: 24 });
  };
  onPointerMove = (e) => {
    const p = this.toCanvasPoint(e);
    const over = this.root.hitTest(p, this.ctx);
    if (over !== this.hover) {
      const oldTop = this.hover ? (() => {
        let t = this.hover;
        while (t.parent && t.parent !== this.root)
          t = t.parent;
        return t;
      })() : null;
      const newTop = over ? (() => {
        let t = over;
        while (t.parent && t.parent !== this.root)
          t = t.parent;
        return t;
      })() : null;
      this.hover?.onPointerLeave();
      over?.onPointerEnter();
      this.hover = over;
      if (oldTop && newTop)
        this.invalidateRect(unionRect(oldTop.bounds(), newTop.bounds()), { pad: 8 });
      else if (oldTop)
        this.invalidateRect(oldTop.bounds(), { pad: 8 });
      else if (newTop)
        this.invalidateRect(newTop.bounds(), { pad: 8 });
    }
    const target = this.capture ?? over;
    if (!target)
      return;
    const ev = new PointerUIEvent({
      pointerId: e.pointerId,
      x: p.x,
      y: p.y,
      button: e.button,
      buttons: e.buttons,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });
    target.onPointerMove(ev);
    let top = target;
    while (top && top.parent && top.parent !== this.root)
      top = top.parent;
    if (top)
      this.invalidateRect(top.bounds(), { pad: 8 });
  };
  onPointerUp = (e) => {
    const p = this.toCanvasPoint(e);
    const target = this.capture ?? this.root.hitTest(p, this.ctx);
    if (!target)
      return;
    const ev = new PointerUIEvent({
      pointerId: e.pointerId,
      x: p.x,
      y: p.y,
      button: e.button,
      buttons: e.buttons,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });
    let top = target;
    while (top && top.parent && top.parent !== this.root)
      top = top.parent;
    const before = top ? top.bounds() : { x: 0, y: 0, w: 0, h: 0 };
    target.onPointerUp(ev);
    this.capture = null;
    const after = top ? top.bounds() : before;
    this.invalidateRect(unionRect(before, after), { pad: 24 });
  };
  onWheel = (e) => {
    const p = this.toCanvasPoint(e);
    const target = this.root.hitTest(p, this.ctx);
    if (!target)
      return;
    const d = this.toCssWheelDelta(e);
    const ev = new WheelUIEvent({
      x: p.x,
      y: p.y,
      deltaX: d.x,
      deltaY: d.y,
      deltaZ: e.deltaZ,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });
    target.onWheel(ev);
    if (!ev.didHandle)
      return;
    e.preventDefault();
    let top = target;
    while (top && top.parent && top.parent !== this.root)
      top = top.parent;
    if (top)
      this.invalidateRect(top.bounds(), { pad: 24 });
  };
}

// src/ui/window/window.ts
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class Root extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
  onDraw(ctx) {
    const t = ctx.getTransform();
    const dpr = Math.hypot(t.a, t.b) || 1;
    const cssW = ctx.canvas.width / dpr;
    const cssH = ctx.canvas.height / dpr;
    const pad = theme.spacing.sm;
    const gap = theme.spacing.xs;
    const tileH = 26;
    const tileW = 220;
    const minimized = [];
    for (const child of this.children) {
      if (child instanceof ModalWindow && child.open.peek() && child.minimized.peek())
        minimized.push(child);
    }
    minimized.sort((a, b) => a.minimizedOrder - b.minimizedOrder);
    let cx = pad;
    let cy = cssH - pad - tileH;
    for (const win of minimized) {
      if (cx + tileW > cssW - pad && cx > pad) {
        cx = pad;
        cy -= tileH + gap;
      }
      win.setMinimizedRect({ x: cx, y: cy, w: tileW, h: tileH });
      cx += tileW + gap;
    }
  }
}

class ModalWindow extends UIElement {
  id;
  x;
  y;
  w;
  h;
  title;
  open;
  minimized;
  chrome;
  minimizable;
  minW;
  minH;
  maxW;
  maxH;
  resizable;
  minimizedRect = { x: 0, y: 0, w: 0, h: 0 };
  restoreRect = null;
  minimizedOrder = 0;
  dragging = false;
  dragOffset = { x: 0, y: 0 };
  titleBarHeight;
  constructor(opts) {
    super();
    this.id = opts.id;
    this.chrome = opts.chrome ?? "default";
    this.minW = Math.max(0, opts.minW ?? 0);
    this.minH = Math.max(0, opts.minH ?? 0);
    this.maxW = Math.max(this.minW, opts.maxW ?? Number.POSITIVE_INFINITY);
    this.maxH = Math.max(this.minH, opts.maxH ?? Number.POSITIVE_INFINITY);
    this.resizable = opts.resizable ?? false;
    this.minimizable = opts.minimizable ?? this.chrome !== "tool";
    this.titleBarHeight = this.chrome === "tool" ? 24 : theme.ui.titleBarHeight;
    this.x = signal(opts.x);
    this.y = signal(opts.y);
    this.w = signal(clamp(opts.w, this.minW, this.maxW));
    this.h = signal(clamp(opts.h, this.minH, this.maxH));
    this.title = signal(opts.title);
    this.open = signal(opts.open ?? true);
    this.minimized = signal(false);
    this.add(new CloseButton(this));
    if (this.minimizable)
      this.add(new MinimizeButton(this));
    if (this.resizable)
      this.add(new ResizeHandle(this));
  }
  bounds() {
    if (!this.open.get())
      return { x: 0, y: 0, w: 0, h: 0 };
    if (this.minimized.get())
      return this.minimizedRect;
    return { x: this.x.get(), y: this.y.get(), w: this.w.get(), h: this.h.get() };
  }
  titleBarRect() {
    const b = this.bounds();
    return { x: b.x, y: b.y, w: b.w, h: this.titleBarHeight };
  }
  onDraw(ctx) {
    if (!this.open.peek())
      return;
    const b = this.bounds();
    const x = b.x;
    const y = b.y;
    const w = b.w;
    const h = b.h;
    draw(ctx, Rect({ x, y, w, h }, { fill: { color: theme.colors.windowBg, shadow: theme.shadows.window }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true }));
    if (this.chrome === "default") {
      draw(ctx, Rect({ x, y, w, h: this.titleBarHeight }, { fill: { color: theme.colors.windowTitleBg } }), Text({
        x: x + theme.spacing.sm,
        y: y + this.titleBarHeight / 2 + 0.5,
        text: this.title.peek(),
        style: { color: theme.colors.windowTitleText, font: font(theme, theme.typography.title), baseline: "middle" }
      }), Line({ x, y: y + this.titleBarHeight }, { x: x + w, y: y + this.titleBarHeight }, { color: theme.colors.windowDivider, hairline: true }));
    } else {
      const t = this.title.peek().trim();
      if (t.length) {
        const size = Math.max(10, theme.typography.title.size - 2);
        const f = `${theme.typography.title.weight} ${size}px ${theme.typography.family}`;
        draw(ctx, Text({
          x: x + theme.spacing.sm,
          y: y + this.titleBarHeight / 2 + 0.5,
          text: t.toUpperCase(),
          style: { color: theme.colors.textMuted, font: f, baseline: "middle" }
        }));
      }
    }
    if (!this.minimized.peek())
      this.drawBody(ctx, x, y + this.titleBarHeight, w, h - this.titleBarHeight);
  }
  drawBody(ctx, x, y, _w, _h) {
    draw(ctx, Text({
      x: x + theme.spacing.md,
      y: y + theme.spacing.md,
      text: "Hello World",
      style: {
        color: theme.colors.textOnLightMuted,
        font: font(theme, theme.typography.body),
        baseline: "top"
      }
    }));
  }
  isInTitleBar(p) {
    if (this.minimized.peek())
      return false;
    if (!pointInRect(p, this.titleBarRect()))
      return false;
    const close = this.children.find((c) => c instanceof CloseButton);
    if (close && pointInRect(p, close.bounds()))
      return false;
    const min = this.children.find((c) => c instanceof MinimizeButton);
    if (min && pointInRect(p, min.bounds()))
      return false;
    return true;
  }
  onPointerDown(e) {
    if (!this.open.peek())
      return;
    if (e.button !== 0)
      return;
    if (this.minimized.peek()) {
      this.restore();
      return;
    }
    const p = { x: e.x, y: e.y };
    if (!this.isInTitleBar(p))
      return;
    this.dragging = true;
    this.dragOffset = { x: p.x - this.x.peek(), y: p.y - this.y.peek() };
    e.capture();
  }
  onPointerMove(e) {
    if (!this.dragging)
      return;
    const nx = e.x - this.dragOffset.x;
    const ny = e.y - this.dragOffset.y;
    this.x.set(nx);
    this.y.set(ny);
  }
  onPointerUp(_e) {
    this.dragging = false;
  }
  minimize() {
    if (this.minimized.peek())
      return;
    this.restoreRect = { x: this.x.peek(), y: this.y.peek(), w: this.w.peek(), h: this.h.peek() };
    this.minimizedOrder = Date.now();
    this.minimized.set(true);
  }
  restore() {
    if (!this.minimized.peek())
      return;
    this.minimized.set(false);
    const r = this.restoreRect;
    if (!r)
      return;
    this.x.set(r.x);
    this.y.set(r.y);
    this.w.set(clamp(r.w, this.minW, this.maxW));
    this.h.set(clamp(r.h, this.minH, this.maxH));
  }
  setMinimizedRect(r) {
    this.minimizedRect = r;
  }
}

class CloseButton extends UIElement {
  win;
  hover = false;
  down = false;
  constructor(win) {
    super();
    this.win = win;
    this.z = 100;
  }
  bounds() {
    if (!this.win.open.get() || this.win.minimized.get())
      return { x: 0, y: 0, w: 0, h: 0 };
    const pad = this.win.chrome === "tool" ? 6 : theme.ui.closeButtonPad;
    const size = this.win.titleBarHeight - pad * 2;
    return {
      x: this.win.x.get() + this.win.w.get() - pad - size,
      y: this.win.y.get() + pad,
      w: size,
      h: size
    };
  }
  onDraw(ctx) {
    if (!this.win.open.peek())
      return;
    const r = this.bounds();
    const bg = this.win.chrome === "tool" ? this.down ? "rgba(233,237,243,0.12)" : this.hover ? "rgba(233,237,243,0.08)" : "transparent" : this.down ? theme.colors.closeDownBg : this.hover ? theme.colors.closeHoverBg : "transparent";
    if (bg !== "transparent")
      draw(ctx, Rect(r, { fill: { color: bg } }));
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const color = this.win.chrome === "tool" ? theme.colors.textPrimary : this.hover || this.down ? theme.colors.closeGlyphOnHover : theme.colors.closeGlyph;
    const d = Math.max(3.5, Math.min(5.5, r.w / 2 - 2.5));
    draw(ctx, Line({ x: cx - d, y: cy - d }, { x: cx + d, y: cy + d }, { color, width: 1.8, lineCap: "round" }), Line({ x: cx + d, y: cy - d }, { x: cx - d, y: cy + d }, { color, width: 1.8, lineCap: "round" }));
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.win.open.set(false);
  }
}

class MinimizeButton extends UIElement {
  win;
  hover = false;
  down = false;
  constructor(win) {
    super();
    this.win = win;
    this.z = 100;
  }
  bounds() {
    if (!this.win.open.get() || this.win.minimized.get())
      return { x: 0, y: 0, w: 0, h: 0 };
    const pad = this.win.chrome === "tool" ? 6 : theme.ui.closeButtonPad;
    const size = this.win.titleBarHeight - pad * 2;
    return {
      x: this.win.x.get() + this.win.w.get() - pad - size * 2 - 2,
      y: this.win.y.get() + pad,
      w: size,
      h: size
    };
  }
  onDraw(ctx) {
    if (!this.win.open.peek() || this.win.minimized.peek())
      return;
    const r = this.bounds();
    const bg = this.down ? "rgba(11,15,23,0.22)" : this.hover ? "rgba(11,15,23,0.12)" : "transparent";
    if (bg !== "transparent")
      draw(ctx, Rect(r, { fill: { color: bg } }));
    const x0 = r.x + 5;
    const x1 = r.x + r.w - 5;
    const y = r.y + r.h - 6;
    draw(ctx, Line({ x: x0, y }, { x: x1, y }, { color: this.win.chrome === "tool" ? theme.colors.textPrimary : theme.colors.windowTitleText, width: 1.8, lineCap: "round" }));
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.win.minimize();
  }
}

class ResizeHandle extends UIElement {
  win;
  drag = false;
  start = { x: 0, y: 0 };
  startSize = { x: 0, y: 0 };
  constructor(win) {
    super();
    this.win = win;
    this.z = 100;
  }
  bounds() {
    if (!this.win.open.get() || this.win.minimized.get())
      return { x: 0, y: 0, w: 0, h: 0 };
    const size = 16;
    return { x: this.win.x.get() + this.win.w.get() - size, y: this.win.y.get() + this.win.h.get() - size, w: size, h: size };
  }
  onDraw(ctx) {
    if (!this.win.open.peek())
      return;
    const r = this.bounds();
    const color = "rgba(233,237,243,0.35)";
    const x0 = r.x + 4;
    const y0 = r.y + 4;
    const x1 = r.x + r.w;
    const y1 = r.y + r.h;
    draw(ctx, Line({ x: x0, y: y1 - 4 }, { x: x1 - 4, y: y0 }, { color, hairline: true }), Line({ x: x0 + 4, y: y1 - 4 }, { x: x1 - 4, y: y0 + 4 }, { color, hairline: true }));
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.drag = true;
    this.start = { x: e.x, y: e.y };
    this.startSize = { x: this.win.w.peek(), y: this.win.h.peek() };
    e.capture();
  }
  onPointerMove(e) {
    if (!this.drag)
      return;
    const nw = clamp(this.startSize.x + (e.x - this.start.x), this.win.minW, this.win.maxW);
    const nh = clamp(this.startSize.y + (e.y - this.start.y), this.win.minH, this.win.maxH);
    this.win.w.set(nw);
    this.win.h.set(nh);
  }
  onPointerUp(_e) {
    this.drag = false;
  }
}

// src/core/draw.text.ts
class LruCache {
  maxEntries;
  map = new Map;
  constructor(maxEntries) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }
  get size() {
    return this.map.size;
  }
  get(key) {
    const v = this.map.get(key);
    if (v === undefined)
      return;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  set(key, value) {
    if (this.map.has(key))
      this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value;
      if (first === undefined)
        break;
      this.map.delete(first);
    }
  }
}
var measureCache = new LruCache(5000);
var metricsCache = new LruCache(512);
var wordSeg = null;
var graphemeSeg = null;
function fontString(base, emphasis) {
  const weight = emphasis?.bold ? 700 : base.fontWeight ?? 400;
  const italic = emphasis?.italic ? "italic " : "";
  return `${italic}${weight} ${base.fontSize}px ${base.fontFamily}`;
}
function segmentWords(text) {
  if (!text)
    return [];
  if (!wordSeg && typeof Intl !== "undefined" && "Segmenter" in Intl)
    wordSeg = new Intl.Segmenter(undefined, { granularity: "word" });
  if (!wordSeg)
    return splitWithWhitespace(text);
  const out = [];
  for (const s of wordSeg.segment(text))
    out.push(s.segment);
  return out.length ? out : splitWithWhitespace(text);
}
function segmentGraphemes(text) {
  if (!text)
    return [];
  if (!graphemeSeg && typeof Intl !== "undefined" && "Segmenter" in Intl)
    graphemeSeg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  if (!graphemeSeg)
    return Array.from(text);
  const out = [];
  for (const s of graphemeSeg.segment(text))
    out.push(s.segment);
  return out.length ? out : Array.from(text);
}
function splitWithWhitespace(text) {
  const parts = text.split(/(\s+)/g).filter((p) => p.length > 0);
  return parts.length ? parts : [text];
}
function isWhitespaceToken(t) {
  return /^\s+$/.test(t);
}
function normalizeSpace(t) {
  return isWhitespaceToken(t) ? " " : t;
}
function measureUncached(ctx, text, font2) {
  const prev = ctx.font;
  ctx.font = font2;
  const w = ctx.measureText(text).width;
  ctx.font = prev;
  return w;
}
function measureTextWidth(ctx, text, font2) {
  const key = `${font2}
${text}`;
  const hit = measureCache.get(key);
  if (hit !== undefined)
    return hit;
  const w = measureUncached(ctx, text, font2);
  measureCache.set(key, w);
  return w;
}
function measureTextLine(ctx, text, font2, lineHeight) {
  const w = measureTextWidth(ctx, text, font2);
  return { w, h: lineHeight };
}
function fontMetrics(ctx, font2) {
  const hit = metricsCache.get(font2);
  if (hit)
    return hit;
  const prevFont = ctx.font;
  const prevBase = ctx.textBaseline;
  ctx.font = font2;
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText("Mg");
  const ascent = Math.max(0, m.actualBoundingBoxAscent ?? 0);
  const descent = Math.max(0, m.actualBoundingBoxDescent ?? 0);
  ctx.font = prevFont;
  ctx.textBaseline = prevBase;
  const out = {
    ascent: ascent || 0.8 * (parseFloat(font2.split(" ").find((p) => p.endsWith("px"))?.slice(0, -2) ?? "12") || 12),
    descent: descent || 0.2 * (parseFloat(font2.split(" ").find((p) => p.endsWith("px"))?.slice(0, -2) ?? "12") || 12)
  };
  metricsCache.set(font2, out);
  return out;
}
function tokenize(ctx, spans, base) {
  const tokens = [];
  for (let i = 0;i < spans.length; i++) {
    const span = spans[i];
    const font2 = fontString(base, span.emphasis);
    const underline = span.emphasis?.underline;
    const segs = segmentWords(span.text);
    for (const raw of segs) {
      const t = normalizeSpace(raw);
      if (!t)
        continue;
      tokens.push({ text: t, spanIndex: i, font: font2, color: span.color, underline, isSpace: t === " " });
    }
  }
  return tokens;
}
function pushRun(line, run) {
  line.runs.push(run);
  line.w = Math.max(line.w, run.x + run.w);
}
function newLine(y) {
  return { y, w: 0, runs: [] };
}
function layoutRichText(ctx, spans, base, opts) {
  const maxWidth = Math.max(0, opts.maxWidth);
  const align = opts.align ?? "start";
  const lh = Math.max(0, base.lineHeight);
  const tokens = tokenize(ctx, spans, base);
  const lines = [newLine(0)];
  let line = lines[0];
  let cursor = 0;
  let prevSpace = false;
  function nextLine() {
    cursor = 0;
    prevSpace = false;
    line = newLine(lines.length * lh);
    lines.push(line);
  }
  function placeToken(tok) {
    if (tok.isSpace) {
      if (cursor <= 0)
        return;
      if (prevSpace)
        return;
    }
    const w = measureTextWidth(ctx, tok.text, tok.font);
    if (cursor > 0 && cursor + w > maxWidth && !tok.isSpace)
      nextLine();
    if (cursor === 0 && tok.isSpace)
      return;
    const run = {
      text: tok.text,
      x: cursor,
      w,
      spanIndex: tok.spanIndex,
      font: tok.font,
      color: tok.color,
      underline: tok.underline
    };
    pushRun(line, run);
    cursor += w;
    prevSpace = tok.isSpace;
  }
  function placeLongToken(tok) {
    const parts = segmentGraphemes(tok.text);
    for (const p of parts) {
      const part = { ...tok, text: p, isSpace: p === " " };
      if (part.isSpace && cursor === 0)
        continue;
      const w = measureTextWidth(ctx, part.text, part.font);
      if (cursor > 0 && cursor + w > maxWidth)
        nextLine();
      const run = {
        text: part.text,
        x: cursor,
        w,
        spanIndex: part.spanIndex,
        font: part.font,
        color: part.color,
        underline: part.underline
      };
      pushRun(line, run);
      cursor += w;
      prevSpace = part.isSpace;
    }
  }
  for (const tok of tokens) {
    const w = tok.isSpace ? 0 : measureTextWidth(ctx, tok.text, tok.font);
    if (!tok.isSpace && w > maxWidth && maxWidth > 0)
      placeLongToken(tok);
    else
      placeToken(tok);
  }
  for (const l of lines) {
    while (l.runs.length && l.runs[l.runs.length - 1].text === " ")
      l.runs.pop();
    l.w = l.runs.reduce((m, r) => Math.max(m, r.x + r.w), 0);
  }
  const h = lines.length * lh;
  return { lines, w: maxWidth, h, align };
}
function drawRichText(ctx, origin, layout, base) {
  const lh = Math.max(0, base.lineHeight);
  const prevAlign = ctx.textAlign;
  const prevBase = ctx.textBaseline;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  for (const line of layout.lines) {
    let xOffset = 0;
    if (layout.align === "center")
      xOffset = (layout.w - line.w) / 2;
    else if (layout.align === "end")
      xOffset = layout.w - line.w;
    if (!Number.isFinite(xOffset))
      xOffset = 0;
    for (const run of line.runs) {
      ctx.fillStyle = run.color;
      ctx.font = run.font;
      const m = fontMetrics(ctx, run.font);
      const x = origin.x + xOffset + run.x;
      const yBase = origin.y + line.y + m.ascent;
      ctx.fillText(run.text, x, yBase);
      if (run.underline) {
        const uy = yBase + Math.max(1, m.descent * 0.2);
        draw(ctx, Line({ x, y: uy }, { x: x + run.w, y: uy }, { color: run.color, hairline: true }));
      }
    }
  }
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBase;
}
function createRichTextBlock(spans, base, opts = {}) {
  let lastMaxWidth = -1;
  let lastLayout = null;
  function ensure(ctx, maxWidth) {
    const w = Math.max(0, maxWidth);
    if (lastLayout && lastMaxWidth === w)
      return lastLayout;
    lastMaxWidth = w;
    lastLayout = layoutRichText(ctx, spans, base, { ...opts, maxWidth: w });
    return lastLayout;
  }
  return {
    measure: (ctx, maxWidth) => {
      const l = ensure(ctx, maxWidth);
      return { w: maxWidth, h: l.h };
    },
    draw: (ctx, origin) => {
      const l = ensure(ctx, lastMaxWidth >= 0 ? lastMaxWidth : 0);
      drawRichText(ctx, origin, l, base);
    },
    getLayout: () => lastLayout
  };
}

// src/core/layout.ts
function clamp2(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function safePos(v, fallback) {
  if (v === undefined)
    return fallback;
  if (!Number.isFinite(v))
    return fallback;
  return v;
}
function resolvePadding(p) {
  if (!p)
    return { l: 0, t: 0, r: 0, b: 0 };
  if (typeof p === "number")
    return { l: p, t: p, r: p, b: p };
  return { l: p.l, t: p.t, r: p.r, b: p.b };
}
function contentBox(outer, pad) {
  const x = outer.x + pad.l;
  const y = outer.y + pad.t;
  const w = Math.max(0, outer.w - pad.l - pad.r);
  const h = Math.max(0, outer.h - pad.t - pad.b);
  return { x, y, w, h };
}
function axisOf(style) {
  return style?.axis ?? "row";
}
function justifyOf(style) {
  return style?.justify ?? "start";
}
function alignOf(style) {
  return style?.align ?? "stretch";
}
function gapOf(style) {
  return Math.max(0, safePos(style?.gap, 0));
}
function growOf(style) {
  return Math.max(0, safePos(style?.grow, 0));
}
function shrinkOf(style) {
  return Math.max(0, safePos(style?.shrink, 1));
}
function basisOf(style) {
  return style?.basis ?? "auto";
}
function minMainOf(style, axis) {
  const v = axis === "row" ? style?.minW : style?.minH;
  return Math.max(0, safePos(v, 0));
}
function maxMainOf(style, axis) {
  const v = axis === "row" ? style?.maxW : style?.maxH;
  const out = safePos(v, Number.POSITIVE_INFINITY);
  return out <= 0 ? 0 : out;
}
function minCrossOf(style, axis) {
  const v = axis === "row" ? style?.minH : style?.minW;
  return Math.max(0, safePos(v, 0));
}
function maxCrossOf(style, axis) {
  const v = axis === "row" ? style?.maxH : style?.maxW;
  const out = safePos(v, Number.POSITIVE_INFINITY);
  return out <= 0 ? 0 : out;
}
function explicitMain(style, axis) {
  const v = axis === "row" ? style?.w : style?.h;
  return typeof v === "number" ? v : undefined;
}
function explicitCross(style, axis) {
  const v = axis === "row" ? style?.h : style?.w;
  return typeof v === "number" ? v : undefined;
}
function measured(node, max) {
  if (!node.measure)
    return { w: 0, h: 0 };
  const out = node.measure(max);
  return {
    w: Math.max(0, safePos(out?.w, 0)),
    h: Math.max(0, safePos(out?.h, 0))
  };
}
function distributeGrow(sizes, weights, maxes, extra) {
  let remaining = extra;
  let active = [];
  for (let i = 0;i < sizes.length; i++)
    if (weights[i] > 0 && sizes[i] < maxes[i])
      active.push(i);
  for (let iter = 0;iter < 8 && remaining > 0.000001 && active.length > 0; iter++) {
    const total = active.reduce((s, i) => s + weights[i], 0);
    if (total <= 0)
      break;
    const startRemaining = remaining;
    let changed = 0;
    for (const i of active) {
      const add = startRemaining * weights[i] / total;
      const next = Math.min(maxes[i], sizes[i] + add);
      const delta = next - sizes[i];
      if (delta > 0) {
        sizes[i] = next;
        remaining -= delta;
        changed += delta;
      }
    }
    if (changed <= 0.000001)
      break;
    active = active.filter((i) => sizes[i] < maxes[i] - 0.000000001);
  }
}
function distributeShrink(sizes, weights, mins, deficit) {
  let remaining = deficit;
  let active = [];
  for (let i = 0;i < sizes.length; i++)
    if (weights[i] > 0 && sizes[i] > mins[i])
      active.push(i);
  for (let iter = 0;iter < 8 && remaining > 0.000001 && active.length > 0; iter++) {
    const total = active.reduce((s, i) => s + weights[i], 0);
    if (total <= 0)
      break;
    const startRemaining = remaining;
    let changed = 0;
    for (const i of active) {
      const sub = startRemaining * weights[i] / total;
      const next = Math.max(mins[i], sizes[i] - sub);
      const delta = sizes[i] - next;
      if (delta > 0) {
        sizes[i] = next;
        remaining -= delta;
        changed += delta;
      }
    }
    if (changed <= 0.000001)
      break;
    active = active.filter((i) => sizes[i] > mins[i] + 0.000000001);
  }
}
function placeChildren(container, box) {
  const style = container.style;
  const axis = axisOf(style);
  const justify = justifyOf(style);
  const align = alignOf(style);
  const gap = gapOf(style);
  const children = container.children ?? [];
  if (children.length === 0)
    return;
  const mainAvail = axis === "row" ? box.w : box.h;
  const crossAvail = axis === "row" ? box.h : box.w;
  const base = new Array(children.length);
  const grow = new Array(children.length);
  const shrink = new Array(children.length);
  const minMain = new Array(children.length);
  const maxMain = new Array(children.length);
  const cross = new Array(children.length);
  const minCross = new Array(children.length);
  const maxCross = new Array(children.length);
  const alignSelf = new Array(children.length);
  const maxForMeasure = { w: box.w, h: box.h };
  for (let i = 0;i < children.length; i++) {
    const child = children[i];
    const cs = child.style;
    const b = basisOf(cs);
    const expMain = explicitMain(cs, axis);
    const expCross = explicitCross(cs, axis);
    const m = measured(child, maxForMeasure);
    const intrinsicMain = axis === "row" ? m.w : m.h;
    const intrinsicCross = axis === "row" ? m.h : m.w;
    const basis = typeof b === "number" ? b : expMain ?? intrinsicMain;
    base[i] = Math.max(0, basis);
    grow[i] = growOf(cs);
    shrink[i] = shrinkOf(cs);
    minMain[i] = minMainOf(cs, axis);
    maxMain[i] = maxMainOf(cs, axis);
    const al = cs?.alignSelf ?? align;
    alignSelf[i] = al;
    const csz = al === "stretch" ? crossAvail : expCross ?? intrinsicCross;
    cross[i] = Math.max(0, csz);
    minCross[i] = minCrossOf(cs, axis);
    maxCross[i] = maxCrossOf(cs, axis);
  }
  const sizes = base.slice();
  const baseSum = sizes.reduce((s, v) => s + v, 0);
  const gapSum = gap * Math.max(0, children.length - 1);
  const totalBase = baseSum + gapSum;
  const totalGrow = grow.reduce((s, v) => s + v, 0);
  const totalShrink = shrink.reduce((s, v) => s + v, 0);
  if (totalBase < mainAvail && totalGrow > 0)
    distributeGrow(sizes, grow, maxMain, mainAvail - totalBase);
  if (totalBase > mainAvail && totalShrink > 0)
    distributeShrink(sizes, shrink, minMain, totalBase - mainAvail);
  for (let i = 0;i < sizes.length; i++)
    sizes[i] = clamp2(sizes[i], minMain[i], maxMain[i]);
  for (let i = 0;i < cross.length; i++)
    cross[i] = clamp2(cross[i], minCross[i], maxCross[i]);
  for (let i = 0;i < cross.length; i++)
    if (alignSelf[i] === "stretch")
      cross[i] = crossAvail;
  const usedMain = sizes.reduce((s, v) => s + v, 0);
  const usedGaps = gap * Math.max(0, children.length - 1);
  const usedTotal = usedMain + usedGaps;
  let startOffset = 0;
  let gapActual = gap;
  if (justify === "center")
    startOffset = (mainAvail - usedTotal) / 2;
  else if (justify === "end")
    startOffset = mainAvail - usedTotal;
  else if (justify === "space-between") {
    if (children.length > 1 && mainAvail > usedMain) {
      gapActual = (mainAvail - usedMain) / (children.length - 1);
      startOffset = 0;
    } else {
      gapActual = 0;
      startOffset = 0;
    }
  }
  if (!Number.isFinite(startOffset))
    startOffset = 0;
  let cursor = startOffset;
  for (let i = 0;i < children.length; i++) {
    const mainSize = sizes[i];
    const crossSize = cross[i];
    const al = alignSelf[i];
    let crossOffset = 0;
    if (al === "center")
      crossOffset = (crossAvail - crossSize) / 2;
    else if (al === "end")
      crossOffset = crossAvail - crossSize;
    if (!Number.isFinite(crossOffset))
      crossOffset = 0;
    let childRect;
    if (axis === "row") {
      childRect = { x: box.x + cursor, y: box.y + crossOffset, w: mainSize, h: crossSize };
    } else {
      childRect = { x: box.x + crossOffset, y: box.y + cursor, w: crossSize, h: mainSize };
    }
    layout(children[i], childRect);
    cursor += mainSize + gapActual;
  }
}
function applyNodeSize(style, outer) {
  let w = outer.w;
  let h = outer.h;
  if (typeof style?.w === "number")
    w = style.w;
  if (typeof style?.h === "number")
    h = style.h;
  const minW = Math.max(0, safePos(style?.minW, 0));
  const minH = Math.max(0, safePos(style?.minH, 0));
  const maxW = safePos(style?.maxW, Number.POSITIVE_INFINITY);
  const maxH = safePos(style?.maxH, Number.POSITIVE_INFINITY);
  w = clamp2(Math.max(0, w), minW, maxW);
  h = clamp2(Math.max(0, h), minH, maxH);
  return { x: outer.x, y: outer.y, w, h };
}
function layout(node, outer) {
  const rect = applyNodeSize(node.style, outer);
  node.rect = rect;
  const pad = resolvePadding(node.style?.padding);
  const box = contentBox(rect, pad);
  if (node.children && node.children.length)
    placeChildren(node, box);
  return node;
}

// src/ui/window/windows.ts
var ABOUT_WINDOW_ID = "Help.About";

class AboutWindow extends ModalWindow {
  constructor() {
    super({
      id: ABOUT_WINDOW_ID,
      x: 80,
      y: 80,
      w: 480,
      h: 260,
      minW: 320,
      minH: 220,
      title: "About",
      open: true,
      resizable: true
    });
  }
  drawBody(ctx, x, y, w, h) {
    const headlineText = "tnl - Tung's Non-Linear Editor";
    const mitText = "MIT License";
    const headlineFont = font(theme, theme.typography.headline);
    const bodyFont = font(theme, theme.typography.body);
    const lh = theme.spacing.lg;
    const copyStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: lh
    };
    const copySpans = [
      { text: "Copyright (c) ", color: theme.colors.textMuted },
      { text: "Tung Leen", color: theme.colors.textPrimary, emphasis: { bold: true } },
      { text: " & ", color: theme.colors.textMuted },
      { text: "tnl contributors", color: theme.colors.textPrimary, emphasis: { underline: true } },
      { text: ". ", color: theme.colors.textMuted },
      { text: "All rights reserved.", color: theme.colors.textMuted, emphasis: { italic: true } },
      { text: " This message is here mostly to fill space.", color: theme.colors.textMuted }
    ];
    const copyBlock = createRichTextBlock([...copySpans], copyStyle, { align: "start", wrap: "word" });
    const items = [
      {
        id: "headline",
        node: {
          id: "headline",
          measure: (max) => {
            const m = measureTextLine(ctx, headlineText, headlineFont, lh);
            return { w: Math.min(m.w, max.w), h: m.h };
          }
        },
        draw: (ctx2, r) => draw(ctx2, Text({
          x: r.x,
          y: r.y,
          text: headlineText,
          style: { color: theme.colors.textPrimary, font: headlineFont, baseline: "top" }
        }))
      },
      { id: "spacer", node: { id: "spacer", style: { basis: theme.spacing.sm }, measure: () => ({ w: 0, h: theme.spacing.sm }) } },
      {
        id: "mit",
        node: {
          id: "mit",
          measure: (max) => {
            const m = measureTextLine(ctx, mitText, bodyFont, lh);
            return { w: Math.min(m.w, max.w), h: m.h };
          }
        },
        draw: (ctx2, r) => draw(ctx2, Text({
          x: r.x,
          y: r.y,
          text: mitText,
          style: { color: theme.colors.textMuted, font: bodyFont, baseline: "top" }
        }))
      },
      { id: "spacer2", node: { id: "spacer2", style: { basis: theme.spacing.xs }, measure: () => ({ w: 0, h: theme.spacing.xs }) } },
      {
        id: "copy",
        node: {
          id: "copy",
          measure: (max) => {
            const m = copyBlock.measure(ctx, max.w);
            return { w: max.w, h: m.h };
          }
        },
        draw: (_ctx, r) => copyBlock.draw(ctx, { x: r.x, y: r.y })
      }
    ];
    const root = {
      style: { axis: "column", padding: theme.spacing.md, gap: 0, align: "start" },
      children: items.map((it) => it.node)
    };
    layout(root, { x, y, w, h });
    for (const it of items) {
      const r = it.node.rect;
      if (!r || !it.draw)
        continue;
      it.draw(ctx, r);
    }
  }
}

// src/ui/base/viewport.ts
function toLocalEvent(e, p) {
  return new PointerUIEvent({
    pointerId: e.pointerId,
    x: p.x,
    y: p.y,
    button: e.button,
    buttons: e.buttons,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey
  });
}
function toLocalWheelEvent(e, p) {
  return new WheelUIEvent({
    x: p.x,
    y: p.y,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey
  });
}

class ViewportElement extends UIElement {
  rect;
  target = null;
  clip;
  padding;
  scroll;
  active;
  capture = null;
  hover = null;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.target = opts.target ?? null;
    this.clip = opts.options?.clip ?? true;
    this.padding = Math.max(0, opts.options?.padding ?? 0);
    this.scroll = opts.options?.scroll ? () => opts.options.scroll : () => ({ x: 0, y: 0 });
    this.active = opts.options?.active ?? (() => true);
  }
  setTarget(s) {
    this.target = s;
  }
  bounds() {
    if (!this.active())
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  viewportCtx() {
    const rect = this.rect();
    const pad = this.padding;
    const contentRect = { x: rect.x + pad, y: rect.y + pad, w: Math.max(0, rect.w - pad * 2), h: Math.max(0, rect.h - pad * 2) };
    const scroll = this.scroll();
    const rt = this.renderRuntime();
    const dpr = rt?.dpr ?? 1;
    return {
      rect,
      contentRect,
      clip: this.clip,
      scroll,
      toSurface: (pViewport) => ({ x: pViewport.x - contentRect.x + scroll.x, y: pViewport.y - contentRect.y + scroll.y }),
      dpr
    };
  }
  onDraw(ctx) {
    if (!this.active())
      return;
    const s = this.target;
    if (!s)
      return;
    const vp = this.viewportCtx();
    const rt = this.renderRuntime();
    const comp = rt?.compositor;
    if (vp.clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(vp.rect.x, vp.rect.y, vp.rect.w, vp.rect.h);
      ctx.clip();
    }
    if (comp && s.compose) {
      s.compose(comp, vp);
    } else if (comp) {
      const layerId = `surface:${s.id}`;
      comp.withLayer(layerId, vp.rect.w, vp.rect.h, vp.dpr, (lctx) => {
        lctx.save();
        lctx.translate(vp.contentRect.x - vp.scroll.x - vp.rect.x, vp.contentRect.y - vp.scroll.y - vp.rect.y);
        s.render(lctx, vp);
        lctx.restore();
      });
      comp.blit(layerId, { x: vp.rect.x, y: vp.rect.y, w: vp.rect.w, h: vp.rect.h }, { blendMode: s.blendMode, opacity: s.opacity });
    } else {
      ctx.save();
      ctx.translate(vp.contentRect.x - vp.scroll.x, vp.contentRect.y - vp.scroll.y);
      s.render(ctx, vp);
      ctx.restore();
    }
    if (vp.clip)
      ctx.restore();
  }
  containsPoint(p) {
    if (!this.active())
      return false;
    return pointInRect(p, this.rect());
  }
  hitTest(p, ctx) {
    if (!this.active())
      return null;
    const r = this.rect();
    if (!pointInRect(p, r))
      return null;
    const s = this.target;
    if (!s)
      return this;
    const vp = this.viewportCtx();
    const local = vp.toSurface(p);
    const hit = s.hitTest?.(local, vp);
    if (hit)
      return this;
    return this;
  }
  onPointerLeave() {
    this.capture = null;
    if (this.hover)
      this.hover.onPointerLeave();
    this.hover = null;
  }
  onPointerDown(e) {
    if (!this.active())
      return;
    const s = this.target;
    if (!s)
      return;
    const vp = this.viewportCtx();
    const local = vp.toSurface({ x: e.x, y: e.y });
    const le = toLocalEvent(e, local);
    const hit = s.hitTest?.(local, vp);
    if (hit) {
      if (hit !== this.hover) {
        this.hover?.onPointerLeave();
        hit.onPointerEnter();
        this.hover = hit;
      }
      this.capture = null;
      hit.onPointerDown(le);
      if (le.didCapture) {
        this.capture = hit;
        e.capture();
      }
      return;
    }
    s.onPointerDown?.(le, vp);
  }
  onPointerMove(e) {
    if (!this.active())
      return;
    const s = this.target;
    if (!s)
      return;
    const vp = this.viewportCtx();
    const local = vp.toSurface({ x: e.x, y: e.y });
    const le = toLocalEvent(e, local);
    const target = this.capture ?? s.hitTest?.(local, vp);
    if (target && target !== this.hover) {
      this.hover?.onPointerLeave();
      target.onPointerEnter();
      this.hover = target;
    } else if (!target && this.hover) {
      this.hover.onPointerLeave();
      this.hover = null;
    }
    if (target)
      target.onPointerMove(le);
    else
      s.onPointerMove?.(le, vp);
  }
  onPointerUp(e) {
    if (!this.active())
      return;
    const s = this.target;
    if (!s)
      return;
    const vp = this.viewportCtx();
    const local = vp.toSurface({ x: e.x, y: e.y });
    const le = toLocalEvent(e, local);
    const target = this.capture ?? s.hitTest?.(local, vp);
    if (target)
      target.onPointerUp(le);
    else
      s.onPointerUp?.(le, vp);
    this.capture = null;
  }
  onWheel(e) {
    if (!this.active())
      return;
    const s = this.target;
    if (!s)
      return;
    if (!pointInRect({ x: e.x, y: e.y }, this.rect()))
      return;
    const vp = this.viewportCtx();
    const local = vp.toSurface({ x: e.x, y: e.y });
    const le = toLocalWheelEvent(e, local);
    const target = s.hitTest?.(local, vp);
    if (target)
      target.onWheel(le);
    if (!le.didHandle)
      s.onWheel?.(le, vp);
    if (le.didHandle)
      e.handle();
  }
}

// src/ui/widgets/button.ts
function isActive(active) {
  return active ? active() : true;
}

class Button extends UIElement {
  rect;
  text;
  onClick;
  active;
  hover = false;
  down = false;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    if (typeof opts.text === "string") {
      const t = opts.text;
      this.text = () => t;
    } else {
      this.text = opts.text;
    }
    this.onClick = opts.onClick;
    this.active = opts.active;
  }
  bounds() {
    if (!isActive(this.active))
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  onDraw(ctx) {
    if (!isActive(this.active))
      return;
    const r = this.rect();
    const bg = this.down ? "rgba(233,237,243,0.12)" : this.hover ? "rgba(233,237,243,0.08)" : "rgba(233,237,243,0.06)";
    draw(ctx, RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: theme.radii.sm }, { fill: { color: bg }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true }), Text({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2 + 0.5,
      text: this.text(),
      style: {
        color: theme.colors.textPrimary,
        font: font(theme, theme.typography.body),
        align: "center",
        baseline: "middle"
      }
    }));
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (!isActive(this.active))
      return;
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.onClick?.();
  }
}
// src/ui/widgets/label.ts
function isActive2(active) {
  return active ? active() : true;
}

class Label extends UIElement {
  rect;
  text;
  color;
  active;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    if (typeof opts.text === "string") {
      const t = opts.text;
      this.text = () => t;
    } else {
      this.text = opts.text;
    }
    if (!opts.color) {
      this.color = () => theme.colors.textMuted;
    } else if (typeof opts.color === "string") {
      const c = opts.color;
      this.color = () => c;
    } else {
      this.color = opts.color;
    }
    this.active = opts.active;
  }
  bounds() {
    if (!isActive2(this.active))
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  onDraw(ctx) {
    if (!isActive2(this.active))
      return;
    const r = this.rect();
    draw(ctx, Text({
      x: r.x,
      y: r.y,
      text: this.text(),
      style: { color: this.color(), font: font(theme, theme.typography.body), baseline: "top" }
    }));
  }
}
// src/ui/widgets/paragraph.ts
function isActive3(active) {
  return active ? active() : true;
}

class Paragraph extends UIElement {
  rect;
  block;
  active;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.block = createRichTextBlock(opts.spans, opts.style, { align: "start", wrap: "word" });
    this.active = opts.active;
  }
  bounds() {
    if (!isActive3(this.active))
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  onDraw(ctx) {
    if (!isActive3(this.active))
      return;
    const r = this.rect();
    this.block.measure(ctx, r.w);
    this.block.draw(ctx, { x: r.x, y: r.y });
  }
}
// src/ui/widgets/checkbox.ts
function isActive4(active) {
  return active ? active() : true;
}

class Checkbox extends UIElement {
  rect;
  label;
  checked;
  active;
  hover = false;
  down = false;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    if (typeof opts.label === "string") {
      const t = opts.label;
      this.label = () => t;
    } else {
      this.label = opts.label;
    }
    this.checked = opts.checked;
    this.active = opts.active;
  }
  bounds() {
    if (!isActive4(this.active))
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  containsPoint(p) {
    return pointInRect(p, this.bounds());
  }
  onDraw(ctx) {
    if (!isActive4(this.active))
      return;
    const r = this.rect();
    const box = { x: r.x, y: r.y + 2, w: 16, h: 16, r: 4 };
    const bg = this.down ? "rgba(233,237,243,0.10)" : this.hover ? "rgba(233,237,243,0.08)" : "rgba(233,237,243,0.06)";
    draw(ctx, RRect(box, { fill: { color: bg }, stroke: { color: theme.colors.windowBorder, hairline: true }, pixelSnap: true }), Text({
      x: r.x + 24,
      y: r.y,
      text: this.label(),
      style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" }
    }));
    if (this.checked.peek()) {
      const x0 = box.x + 4;
      const y0 = box.y + 8;
      const x1 = box.x + 7;
      const y1 = box.y + 11;
      const x2 = box.x + 13;
      const y2 = box.y + 5;
      draw(ctx, Line({ x: x0, y: y0 }, { x: x1, y: y1 }, { color: theme.colors.textPrimary, width: 2, lineCap: "round" }), Line({ x: x1, y: y1 }, { x: x2, y: y2 }, { color: theme.colors.textPrimary, width: 2, lineCap: "round" }));
    }
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (!isActive4(this.active))
      return;
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.checked.set((v) => !v);
  }
}
// src/ui/widgets/radio.ts
function isActive5(active) {
  return active ? active() : true;
}

class Radio extends UIElement {
  rect;
  label;
  value;
  selected;
  active;
  hover = false;
  down = false;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    if (typeof opts.label === "string") {
      const t = opts.label;
      this.label = () => t;
    } else {
      this.label = opts.label;
    }
    this.value = opts.value;
    this.selected = opts.selected;
    this.active = opts.active;
  }
  bounds() {
    if (!isActive5(this.active))
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  containsPoint(p) {
    return pointInRect(p, this.bounds());
  }
  onDraw(ctx) {
    if (!isActive5(this.active))
      return;
    const r = this.rect();
    const cx = r.x + 8;
    const cy = r.y + 10;
    const stroke = this.down ? "rgba(233,237,243,0.30)" : this.hover ? "rgba(233,237,243,0.24)" : "rgba(233,237,243,0.20)";
    draw(ctx, Circle({ x: cx, y: cy, r: 8 }, { stroke: { color: stroke, hairline: true } }));
    if (this.selected.peek() === this.value) {
      draw(ctx, Circle({ x: cx, y: cy, r: 4 }, { fill: { color: theme.colors.textPrimary } }));
    }
    draw(ctx, Text({
      x: r.x + 24,
      y: r.y,
      text: this.label(),
      style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.body), baseline: "top" }
    }));
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (!isActive5(this.active))
      return;
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.selected.set(this.value);
  }
}
// src/ui/widgets/scrollbar.ts
function clamp3(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function isActive6(active) {
  return active ? active() : true;
}

class Scrollbar extends UIElement {
  rect;
  axis;
  viewportSize;
  contentSize;
  value;
  onChange;
  minThumb;
  active;
  autoHide;
  hover = false;
  down = false;
  dragOffset = 0;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.axis = opts.axis ?? "y";
    this.viewportSize = opts.viewportSize;
    this.contentSize = opts.contentSize;
    this.value = opts.value;
    this.onChange = opts.onChange;
    this.minThumb = Math.max(10, opts.minThumb ?? 20);
    this.autoHide = opts.autoHide ?? true;
    this.active = opts.active;
    this.z = 40;
  }
  metrics() {
    const r = this.rect();
    const viewport = Math.max(0, this.viewportSize());
    const content = Math.max(0, this.contentSize());
    const trackLength = Math.max(0, this.axis === "y" ? r.h : r.w);
    const maxValue = Math.max(0, content - viewport);
    if (trackLength <= 0 || maxValue <= 0 || content <= 0 || viewport <= 0) {
      return { maxValue, trackLength, thumbLength: trackLength, thumbOffset: 0 };
    }
    const thumbLength = clamp3(viewport / content * trackLength, this.minThumb, trackLength);
    const span = Math.max(0, trackLength - thumbLength);
    const value = clamp3(this.value(), 0, maxValue);
    const thumbOffset = span <= 0 ? 0 : value / maxValue * span;
    return { maxValue, trackLength, thumbLength, thumbOffset };
  }
  hidden() {
    if (!isActive6(this.active))
      return true;
    if (!this.autoHide)
      return false;
    return this.metrics().maxValue <= 0;
  }
  thumbRect() {
    const r = this.rect();
    const m = this.metrics();
    if (this.axis === "y")
      return { x: r.x, y: r.y + m.thumbOffset, w: r.w, h: m.thumbLength };
    return { x: r.x + m.thumbOffset, y: r.y, w: m.thumbLength, h: r.h };
  }
  setByPointer(pointer) {
    const r = this.rect();
    const m = this.metrics();
    if (m.maxValue <= 0)
      return;
    const trackPos = this.axis === "y" ? pointer - r.y : pointer - r.x;
    const span = Math.max(0, m.trackLength - m.thumbLength);
    const nextThumb = clamp3(trackPos - this.dragOffset, 0, span);
    const next = span <= 0 ? 0 : nextThumb / span * m.maxValue;
    this.onChange(next);
  }
  bounds() {
    if (this.hidden())
      return { x: 0, y: 0, w: 0, h: 0 };
    return this.rect();
  }
  containsPoint(p) {
    return pointInRect(p, this.bounds());
  }
  onDraw(ctx) {
    if (this.hidden())
      return;
    const r = this.rect();
    const t = this.thumbRect();
    const track = this.down ? "rgba(255,255,255,0.07)" : this.hover ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.04)";
    const thumb = this.down ? "rgba(233,237,243,0.46)" : this.hover ? "rgba(233,237,243,0.38)" : "rgba(233,237,243,0.30)";
    draw(ctx, RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: Math.min(theme.radii.sm, Math.min(r.w, r.h) / 2) }, { fill: { color: track } }), RRect({ x: t.x + 1, y: t.y + 1, w: Math.max(0, t.w - 2), h: Math.max(0, t.h - 2), r: Math.min(theme.radii.sm, Math.min(t.w, t.h) / 2) }, { fill: { color: thumb } }));
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (this.hidden())
      return;
    if (e.button !== 0)
      return;
    const thumb = this.thumbRect();
    const p = this.axis === "y" ? e.y : e.x;
    if (pointInRect({ x: e.x, y: e.y }, thumb)) {
      this.dragOffset = this.axis === "y" ? e.y - thumb.y : e.x - thumb.x;
    } else {
      const thumbLen = this.axis === "y" ? thumb.h : thumb.w;
      this.dragOffset = thumbLen / 2;
      this.setByPointer(p);
    }
    this.down = true;
    e.capture();
  }
  onPointerMove(e) {
    if (!this.down)
      return;
    this.setByPointer(this.axis === "y" ? e.y : e.x);
  }
  onPointerUp(_e) {
    this.down = false;
  }
}
// src/ui/widgets/row.ts
class Row extends UIElement {
  layout = { rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" };
  onClick;
  hover = false;
  down = false;
  set(layout2, onClick) {
    this.layout = layout2;
    this.onClick = onClick;
  }
  bounds() {
    const r = this.layout.rect;
    if (r.w <= 0 || r.h <= 0)
      return { x: 0, y: 0, w: 0, h: 0 };
    return r;
  }
  containsPoint(p) {
    return pointInRect(p, this.bounds());
  }
  onDraw(ctx) {
    const r = this.layout.rect;
    if (r.w <= 0 || r.h <= 0)
      return;
    const bg = this.down ? "rgba(255,255,255,0.06)" : this.layout.selected ? "rgba(255,255,255,0.055)" : this.hover ? "rgba(255,255,255,0.05)" : "transparent";
    if (bg !== "transparent")
      draw(ctx, Rect(r, { fill: { color: bg } }));
    const indent = Math.max(0, this.layout.indent ?? 0);
    const isGroup = (this.layout.variant ?? "item") === "group";
    const leftColor = isGroup ? theme.colors.textPrimary : theme.colors.textMuted;
    const leftFont = `${isGroup ? 600 : 500} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`;
    const leftPad = 8;
    draw(ctx, Text({
      x: r.x + leftPad + indent,
      y: r.y + r.h / 2 + 0.5,
      text: this.layout.leftText,
      style: { color: leftColor, font: leftFont, baseline: "middle" }
    }));
    const right = this.layout.rightText;
    if (right) {
      const t = right.length > 80 ? right.slice(0, 77) + "..." : right;
      draw(ctx, Text({
        x: r.x + r.w - leftPad,
        y: r.y + r.h / 2 + 0.5,
        text: t,
        style: {
          color: theme.colors.textMuted,
          font: `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`,
          baseline: "middle",
          align: "end"
        }
      }));
    }
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.onClick?.();
  }
}
// src/ui/surfaces/tab_panel_surface.ts
function clamp4(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class SurfaceRoot extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
}

class TabButton extends UIElement {
  rect;
  text;
  selected;
  onSelect;
  coverLineY;
  coverColor;
  hover = false;
  down = false;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.text = opts.text;
    this.selected = opts.selected;
    this.onSelect = opts.onSelect;
    this.coverLineY = opts.coverLineY;
    this.coverColor = opts.coverColor;
    this.z = 10;
  }
  bounds() {
    return this.rect();
  }
  onDraw(ctx) {
    const r = this.rect();
    const sel = this.selected();
    const bg = sel ? "rgba(255,255,255,0.06)" : this.down ? "rgba(255,255,255,0.05)" : this.hover ? "rgba(255,255,255,0.04)" : "transparent";
    const stroke = sel || this.hover ? { color: "rgba(255,255,255,0.14)", hairline: true } : undefined;
    if (bg !== "transparent" || stroke)
      draw(ctx, RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: 6 }, { fill: bg !== "transparent" ? { color: bg } : undefined, stroke, pixelSnap: true }));
    draw(ctx, Text({
      x: r.x + r.w / 2,
      y: r.y + r.h / 2 + 0.5,
      text: this.text().toUpperCase(),
      style: {
        color: sel ? theme.colors.textPrimary : theme.colors.textMuted,
        font: `${600} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`,
        align: "center",
        baseline: "middle"
      }
    }));
    if (sel) {
      const y = this.coverLineY();
      draw(ctx, Line({ x: r.x + 6, y }, { x: r.x + r.w - 6, y }, { color: this.coverColor, width: 2 }));
    }
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.down = true;
    e.capture();
  }
  onPointerUp(_e) {
    if (!this.down)
      return;
    this.down = false;
    if (!this.hover)
      return;
    this.onSelect();
  }
}

class TabPanelSurface {
  id;
  root = new SurfaceRoot;
  size = { x: 0, y: 0 };
  contentScroll = { x: 0, y: 0 };
  contentExtent = { x: 0, y: 0 };
  tabs;
  selectedId;
  contentViewport;
  contentPadding = theme.spacing.sm;
  scrollbar;
  lastSurface = null;
  tabBarH = 24;
  constructor(opts) {
    this.id = opts.id;
    this.tabs = opts.tabs;
    this.selectedId = signal(opts.selectedId ?? (opts.tabs[0]?.id ?? ""));
    const containerFill = "rgba(255,255,255,0.02)";
    const tabW = 82;
    const gap = 4;
    const pad = theme.spacing.xs;
    const dividerY = () => this.tabBarH + 0.5;
    const contentY = () => this.tabBarH;
    for (let i = 0;i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      this.root.add(new TabButton({
        rect: () => ({
          x: pad + i * (tabW + gap),
          y: 1,
          w: tabW,
          h: this.tabBarH - 1
        }),
        text: () => tab.title,
        selected: () => this.selectedId.peek() === tab.id,
        onSelect: () => this.selectedId.set(tab.id),
        coverLineY: dividerY,
        coverColor: containerFill
      }));
    }
    this.root.add(new TabBarDivider({
      rect: () => ({ x: 0, y: dividerY(), w: this.size.x, h: 1 })
    }));
    this.contentViewport = new ViewportElement({
      rect: () => ({ x: 0, y: contentY(), w: this.size.x, h: Math.max(0, this.size.y - contentY()) }),
      target: this.currentSurface(),
      options: { clip: true, padding: this.contentPadding, scroll: this.contentScroll }
    });
    this.contentViewport.z = 1;
    this.root.add(this.contentViewport);
    if (opts.scrollbar) {
      this.scrollbar = new Scrollbar({
        rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: contentY() + 2, w: 10, h: Math.max(0, this.size.y - contentY() - 4) }),
        axis: "y",
        viewportSize: () => this.contentViewportSize().y,
        contentSize: () => this.contentExtent.y,
        value: () => this.contentScroll.y,
        onChange: (next) => {
          this.contentScroll.y = next;
        }
      });
      this.root.add(this.scrollbar);
    } else {
      this.scrollbar = null;
    }
  }
  currentSurface() {
    const id = this.selectedId.peek();
    return this.tabs.find((t) => t.id === id)?.surface ?? this.tabs[0]?.surface ?? null;
  }
  contentViewportSize() {
    const outerH = Math.max(0, this.size.y - this.tabBarH);
    return {
      x: Math.max(0, this.size.x - this.contentPadding * 2),
      y: Math.max(0, outerH - this.contentPadding * 2)
    };
  }
  maxScrollY() {
    const view = this.contentViewportSize();
    return Math.max(0, this.contentExtent.y - view.y);
  }
  scrollBy(dy) {
    const maxY = this.maxScrollY();
    const next = clamp4(this.contentScroll.y + dy, 0, maxY);
    if (next === this.contentScroll.y)
      return false;
    this.contentScroll.y = next;
    return true;
  }
  render(ctx, viewport) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
    draw(ctx, RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.02)" }, stroke: { color: "rgba(255,255,255,0.10)", hairline: true }, pixelSnap: true }));
    draw(ctx, Rect({ x: 0, y: 0, w: this.size.x, h: this.tabBarH }, { fill: { color: "rgba(255,255,255,0.015)" } }));
    const s = this.currentSurface();
    if (s !== this.lastSurface) {
      this.lastSurface = s;
      this.contentViewport.setTarget(s);
      this.contentScroll.y = 0;
    }
    const viewSize = this.contentViewportSize();
    const measured2 = s?.contentSize?.(viewSize) ?? viewSize;
    this.contentExtent = {
      x: Math.max(viewSize.x, measured2.x),
      y: Math.max(viewSize.y, measured2.y)
    };
    const maxY = this.maxScrollY();
    this.contentScroll.y = clamp4(this.contentScroll.y, 0, maxY);
    this.root.draw(ctx);
  }
  hitTest(pSurface) {
    return this.root.hitTest(pSurface);
  }
  onWheel(e) {
    const contentRect = { x: 0, y: this.tabBarH, w: this.size.x, h: Math.max(0, this.size.y - this.tabBarH) };
    if (!pointInRect({ x: e.x, y: e.y }, contentRect))
      return;
    const delta = Math.abs(e.deltaY) > 0.001 ? e.deltaY : e.deltaX;
    if (Math.abs(delta) <= 0.001)
      return;
    if (!this.scrollBy(delta))
      return;
    e.handle();
  }
}

class TabBarDivider extends UIElement {
  rect;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.z = 2;
  }
  bounds() {
    return this.rect();
  }
  onDraw(ctx) {
    const r = this.rect();
    draw(ctx, Line({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { color: "rgba(255,255,255,0.10)", hairline: true }));
  }
}

// src/ui/surfaces/text_surface.ts
function createMeasureContext() {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(2, 2);
    const ctx = c.getContext("2d", { alpha: true });
    if (ctx)
      return ctx;
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { alpha: true });
    if (ctx)
      return ctx;
  }
  return null;
}

class TextSurface {
  id;
  title;
  bodyBlock = null;
  body;
  measureCtx = null;
  constructor(opts) {
    this.id = opts.id;
    this.title = opts.title;
    this.body = opts.body;
    const lh = theme.spacing.lg;
    this.bodyBlock = createRichTextBlock([{ text: this.body, color: theme.colors.textMuted }], { fontFamily: theme.typography.family, fontSize: theme.typography.body.size, fontWeight: theme.typography.body.weight, lineHeight: lh }, { align: "start", wrap: "word" });
  }
  contentSize(viewportSize) {
    const width = Math.max(0, viewportSize.x);
    const minHeight = Math.max(0, viewportSize.y);
    const body = this.bodyBlock;
    if (!body)
      return { x: width, y: minHeight };
    const ctx = this.measureCtx ?? (this.measureCtx = createMeasureContext());
    if (!ctx)
      return { x: width, y: minHeight };
    const measured2 = body.measure(ctx, width);
    const titleTop = theme.spacing.lg + theme.spacing.sm;
    return { x: width, y: Math.max(minHeight, titleTop + measured2.h) };
  }
  render(ctx, viewport) {
    const w = viewport.contentRect.w;
    draw(ctx, Text({ x: 0, y: 0, text: this.title, style: { color: theme.colors.textPrimary, font: font(theme, theme.typography.headline), baseline: "top" } }));
    const body = this.bodyBlock;
    if (!body)
      return;
    const c = ctx;
    body.measure(c, Math.max(0, w));
    body.draw(c, { x: 0, y: theme.spacing.lg + theme.spacing.sm });
  }
}

// src/ui/window/developer/panels/codec_panel.ts
function createCodecPanel() {
  return {
    id: "Developer.Codec",
    title: "Codec",
    build: (_ctx) => new TextSurface({
      id: "Developer.Codec.Surface",
      title: "WebCodecs",
      body: "TODO: show codec support matrix and hardware acceleration hints. TODO: expose active decoder/encoder instances and their configuration. TODO: surface dropped frames, queue sizes, and decode/encode latency."
    })
  };
}

// src/ui/surfaces/controls_surface.ts
class SurfaceRoot2 extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
}

class ControlsSurface {
  id = "ControlsSurface";
  root = new SurfaceRoot2;
  size = { x: 0, y: 0 };
  clicks = signal(0);
  checked = signal(false);
  radio = signal("A");
  constructor() {
    const pad = theme.spacing.md;
    const lh = theme.spacing.lg;
    const content = () => ({
      x: 0,
      y: 0,
      w: Math.max(0, this.size.x),
      h: Math.max(0, this.size.y)
    });
    const titleStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.headline.size,
      fontWeight: theme.typography.headline.weight,
      lineHeight: lh
    };
    const bodyStyle = {
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: lh
    };
    const y0 = () => content().y + pad;
    const y1 = () => y0() + lh + theme.spacing.xs;
    const y2 = () => y1() + lh * 2 + theme.spacing.sm;
    const y3 = () => y2() + 34 + theme.spacing.sm;
    const y4 = () => y3() + 26 + theme.spacing.xs;
    const y5 = () => y4() + 26 + theme.spacing.xs;
    const y6 = () => y5() + 26 + theme.spacing.sm;
    const x0 = () => content().x + pad;
    const w0 = () => Math.max(0, content().w - pad * 2);
    const title = new Paragraph({
      rect: () => ({ x: x0(), y: y0(), w: w0(), h: lh }),
      spans: [{ text: "Developer", color: theme.colors.textPrimary, emphasis: { bold: true } }],
      style: titleStyle
    });
    const hint = new Paragraph({
      rect: () => ({ x: x0(), y: y1(), w: w0(), h: lh * 2 }),
      spans: [
        { text: "Use this window to test UI controls. ", color: theme.colors.textMuted },
        { text: "Resize", color: theme.colors.textPrimary, emphasis: { underline: true } },
        { text: ", ", color: theme.colors.textMuted },
        { text: "minimize", color: theme.colors.textPrimary, emphasis: { italic: true } },
        { text: ", and click around.", color: theme.colors.textMuted }
      ],
      style: bodyStyle
    });
    const button = new Button({
      rect: () => ({ x: x0(), y: y2(), w: 140, h: 32 }),
      text: () => `Button (${this.clicks.peek()})`,
      onClick: () => this.clicks.set((v) => v + 1)
    });
    button.z = 10;
    const status = new Label({
      rect: () => ({ x: x0() + 160, y: y2() + 7, w: Math.max(0, w0() - 160), h: lh }),
      text: () => `Checked: ${this.checked.peek() ? "true" : "false"}, Radio: ${this.radio.peek()}`,
      color: theme.colors.textMuted
    });
    const checkbox = new Checkbox({
      rect: () => ({ x: x0(), y: y3(), w: w0(), h: 24 }),
      label: "Checkbox: enable something",
      checked: this.checked
    });
    checkbox.z = 10;
    const radioA = new Radio({
      rect: () => ({ x: x0(), y: y4(), w: w0(), h: 24 }),
      label: "Radio A",
      value: "A",
      selected: this.radio
    });
    radioA.z = 10;
    const radioB = new Radio({
      rect: () => ({ x: x0(), y: y5(), w: w0(), h: 24 }),
      label: "Radio B",
      value: "B",
      selected: this.radio
    });
    radioB.z = 10;
    const paragraph = new Paragraph({
      rect: () => ({ x: x0(), y: y6(), w: w0(), h: Math.max(0, content().h - y6() - pad) }),
      spans: [
        { text: "Paragraph: ", color: theme.colors.textMuted },
        { text: "this should wrap automatically", color: theme.colors.textPrimary, emphasis: { bold: true } },
        { text: " when the window is resized narrower. ", color: theme.colors.textMuted },
        { text: "Bold", color: theme.colors.textPrimary, emphasis: { bold: true } },
        { text: "/", color: theme.colors.textMuted },
        { text: "Italic", color: theme.colors.textPrimary, emphasis: { italic: true } },
        { text: "/", color: theme.colors.textMuted },
        { text: "Underline", color: theme.colors.textPrimary, emphasis: { underline: true } },
        { text: " and colors are supported.", color: theme.colors.textMuted }
      ],
      style: bodyStyle
    });
    this.root.add(title);
    this.root.add(hint);
    this.root.add(button);
    this.root.add(status);
    this.root.add(checkbox);
    this.root.add(radioA);
    this.root.add(radioB);
    this.root.add(paragraph);
  }
  compose(compositor, viewport) {
    const w = viewport.rect.w;
    const h = viewport.rect.h;
    const dpr = viewport.dpr;
    const baseId = "controls.base";
    const overlayId = "controls.overlay";
    compositor.withLayer(baseId, w, h, dpr, (ctx) => {
      this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
      ctx.save();
      ctx.translate(viewport.contentRect.x - viewport.rect.x, viewport.contentRect.y - viewport.rect.y);
      this.root.draw(ctx);
      ctx.restore();
    });
    compositor.blit(baseId, viewport.rect);
    compositor.withLayer(overlayId, w, h, dpr, (ctx) => {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "rgba(80,160,255,0.12)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.beginPath();
      ctx.arc(w * 0.75, h * 0.3, Math.min(w, h) * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,80,140,0.22)";
      ctx.fill();
      ctx.restore();
    });
    compositor.blit(overlayId, viewport.rect, { blendMode: "screen", opacity: 0.75 });
  }
  render(ctx, viewport) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
    this.root.draw(ctx);
  }
  hitTest(pSurface) {
    return this.root.hitTest(pSurface);
  }
}

// src/ui/window/developer/panels/control_panel.ts
function createControlPanel() {
  return {
    id: "Developer.Control",
    title: "Control",
    build: (_ctx) => new ControlsSurface
  };
}

// src/ui/window/developer/states.ts
function preview(value) {
  if (value === null)
    return "null";
  if (value === undefined)
    return "undefined";
  if (typeof value === "string")
    return value.length > 120 ? JSON.stringify(value.slice(0, 117) + "...") : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return String(value);
  if (typeof value === "symbol")
    return value.toString();
  if (typeof value === "function")
    return "[Function]";
  if (Array.isArray(value))
    return `Array(${value.length})`;
  if (value instanceof Map)
    return `Map(${value.size})`;
  if (value instanceof Set)
    return `Set(${value.size})`;
  if (value instanceof Date)
    return `Date(${Number.isFinite(value.valueOf()) ? value.toISOString() : "Invalid"})`;
  if (value instanceof Error)
    return `${value.name}: ${value.message}`;
  const ctor = value?.constructor?.name;
  if (ctor && ctor !== "Object")
    return `${ctor}{...}`;
  return "{...}";
}
function getStateTree(records = listSignals()) {
  const byScope = new Map;
  for (const r of records) {
    const scope = r.scope?.trim() || "unknown";
    const list = byScope.get(scope);
    if (list)
      list.push(r);
    else
      byScope.set(scope, [r]);
  }
  const scopes = [...byScope.keys()].sort((a, b) => a.localeCompare(b));
  const roots = [];
  for (const scope of scopes) {
    const list = byScope.get(scope) ?? [];
    list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.id - b.id);
    const children = list.map((r) => {
      const name = r.name?.trim() ? r.name.trim() : `signal#${r.id}`;
      return {
        kind: "signal",
        id: `signal:${r.id}`,
        label: name,
        valuePreview: preview(r.peek()),
        subscribers: r.subscribers
      };
    });
    roots.push({ kind: "group", id: `scope:${scope}`, label: scope, count: list.length, children });
  }
  return roots;
}

// src/ui/window/developer/panels/data_panel.ts
function createDataPanel() {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) => new DataPanelSurface
  };
}

class SurfaceRoot3 extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
}
function clamp5(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class DataPanelSurface {
  id = "Developer.Data.Surface";
  root = new SurfaceRoot3;
  size = { x: 0, y: 0 };
  scroll = signal(0);
  contentH = 0;
  expanded = new Set;
  initialized = false;
  scrollbar;
  rowWidgets = [];
  constructor() {
    this.scrollbar = new Scrollbar({
      rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: 2, w: 10, h: Math.max(0, this.size.y - 4) }),
      axis: "y",
      viewportSize: () => Math.max(0, this.size.y),
      contentSize: () => this.contentH,
      value: () => this.scroll.peek(),
      onChange: (next) => this.scroll.set(next)
    });
    this.root.add(this.scrollbar);
  }
  rows(tree) {
    const rows = [];
    for (const g2 of tree) {
      if (g2.kind !== "group")
        continue;
      rows.push({ kind: "group", id: g2.id, depth: 0, label: `${g2.label}`, right: `${g2.count}` });
      if (!this.expanded.has(g2.id))
        continue;
      for (const c of g2.children) {
        if (c.kind !== "signal")
          continue;
        rows.push({
          kind: "signal",
          id: c.id,
          depth: 1,
          label: c.label,
          right: `${c.valuePreview}${c.subscribers ? ` · ${c.subscribers}` : ""}`
        });
      }
    }
    return rows;
  }
  maxScroll(rows) {
    const rowH = 22;
    const pad = 4;
    this.contentH = Math.max(0, rows.length * rowH + pad);
    return Math.max(0, this.contentH - this.size.y);
  }
  toggleGroup(id) {
    if (this.expanded.has(id))
      this.expanded.delete(id);
    else
      this.expanded.add(id);
    const maxY = this.maxScroll(this.rows(getStateTree()));
    this.scroll.set((v) => clamp5(v, 0, maxY));
  }
  hitTest(pSurface) {
    return this.root.hitTest(pSurface);
  }
  onWheel(e, _viewport) {
    const tree = getStateTree();
    const rows = this.rows(tree);
    const maxY = this.maxScroll(rows);
    const next = clamp5(this.scroll.peek() + e.deltaY, 0, maxY);
    if (next === this.scroll.peek())
      return;
    this.scroll.set(next);
    e.handle();
  }
  render(ctx, viewport) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
    const tree = getStateTree();
    if (!this.initialized) {
      for (const n of tree)
        if (n.kind === "group")
          this.expanded.add(n.id);
      this.initialized = true;
    }
    const rows = this.rows(tree);
    const maxY = this.maxScroll(rows);
    this.scroll.set((v) => clamp5(v, 0, maxY));
    const c = ctx;
    const rowH = 22;
    const topPad = 2;
    const clipW = Math.max(0, this.size.x - 14);
    draw(c, RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.01)" } }));
    const y0 = this.scroll.peek();
    const first = Math.max(0, Math.floor((y0 - topPad) / rowH));
    const visible = Math.ceil(this.size.y / rowH) + 2;
    const last = Math.min(rows.length - 1, first + visible);
    while (this.rowWidgets.length < visible) {
      const r = new Row;
      r.z = 1;
      this.rowWidgets.push(r);
      this.root.add(r);
    }
    for (let i = 0;i < this.rowWidgets.length; i++) {
      const rowIndex = first + i;
      const w = this.rowWidgets[i];
      const row = rows[rowIndex];
      if (!row || rowIndex > last) {
        w.set({ rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" });
        continue;
      }
      const y = topPad + rowIndex * rowH - y0;
      w.set({
        rect: { x: 2, y, w: clipW, h: rowH },
        indent: row.depth * 14,
        leftText: row.label,
        rightText: row.right,
        variant: row.kind === "group" ? "group" : "item"
      }, row.kind === "group" ? () => this.toggleGroup(row.id) : undefined);
    }
    this.root.draw(c);
  }
}

// src/ui/window/developer/panels/inspector_panel.ts
function createInspectorPanel() {
  return {
    id: "Developer.Inspector",
    title: "Inspector",
    build: (_ctx) => new TextSurface({
      id: "Developer.Inspector.Surface",
      title: "Inspector",
      body: "TODO: element picking (hover highlight + click select). TODO: show element bounds, props, and runtime state. TODO: REPL console with safe evaluation and restricted globals. TODO: history, autocomplete, and error reporting."
    })
  };
}

// src/core/opfs.ts
class OpfsError extends Error {
  code;
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
  }
}
function normalizePath(input) {
  const raw = (input ?? "").trim();
  if (!raw)
    throw new OpfsError("InvalidPath", "Path is empty");
  if (raw.startsWith("/"))
    throw new OpfsError("InvalidPath", "Path must be relative");
  const parts = raw.split("/").filter((p) => p.length > 0);
  const out = [];
  for (const p of parts) {
    if (p === ".")
      continue;
    if (p === "..")
      throw new OpfsError("InvalidPath", "Path traversal is not allowed");
    out.push(p);
  }
  if (!out.length)
    throw new OpfsError("InvalidPath", "Path resolves to empty");
  return out.join("/");
}
function baseName(path) {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}
function dirName(path) {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}
function isDomErr(e) {
  return typeof DOMException !== "undefined" && e instanceof DOMException;
}
function toOpfsError(e, fallback) {
  if (isDomErr(e)) {
    const name = e.name;
    if (name === "NotFoundError")
      return new OpfsError("NotFound", fallback.message, e);
    if (name === "NotAllowedError" || name === "SecurityError")
      return new OpfsError("PermissionDenied", fallback.message, e);
  }
  return fallback;
}
function randomId() {
  const c = globalThis;
  const uuid = c?.crypto?.randomUUID;
  if (typeof uuid === "function")
    return uuid.call(c.crypto);
  const r = () => Math.floor(Math.random() * 4294967295).toString(16).padStart(8, "0");
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

class Mutex {
  tail = Promise.resolve();
  run(fn) {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(() => {
      return;
    }, () => {
      return;
    });
    return next;
  }
}
var DB_FILE = ".tnl-db.json";
var DB_TMP_FILE = ".tnl-db.json.tmp";
function emptyDb() {
  return { version: 1, updatedAt: Date.now(), entries: {} };
}
function parseDb(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch (e) {
    throw new OpfsError("DbCorrupted", "Database JSON parse failed", e);
  }
  if (!j || j.version !== 1 || typeof j.entries !== "object")
    throw new OpfsError("DbCorrupted", "Database schema mismatch");
  return { version: 1, updatedAt: typeof j.updatedAt === "number" ? j.updatedAt : Date.now(), entries: j.entries };
}
async function readTextFile(dir, name) {
  try {
    const h = await dir.getFileHandle(name, { create: false });
    const f = await h.getFile();
    return await f.text();
  } catch (e) {
    if (isDomErr(e) && e.name === "NotFoundError")
      return null;
    throw e;
  }
}
async function writeTextFile(dir, name, text) {
  const h = await dir.getFileHandle(name, { create: true });
  const w = await h.createWritable({ keepExistingData: false });
  await w.write(text);
  await w.close();
}
async function removeIfExists(dir, name) {
  try {
    await dir.removeEntry(name);
  } catch (e) {
    if (isDomErr(e) && e.name === "NotFoundError")
      return;
    throw e;
  }
}
async function getDir(root, path, create) {
  const dir = dirName(path);
  if (!dir)
    return root;
  const parts = dir.split("/").filter((p) => p.length);
  let cur = root;
  for (const p of parts)
    cur = await cur.getDirectoryHandle(p, { create });
  return cur;
}
async function getFileHandle(root, path, create) {
  const dir = await getDir(root, path, create);
  const name = baseName(path);
  const h = await dir.getFileHandle(name, { create });
  return { dir, name, handle: h };
}
function byPath(db) {
  const map = new Map;
  for (const e of Object.values(db.entries))
    map.set(e.path, e);
  return map;
}
function ensureUniquePath(db) {
  const seen = new Set;
  for (const e of Object.values(db.entries)) {
    if (seen.has(e.path))
      throw new OpfsError("DbCorrupted", "Duplicate path in database");
    seen.add(e.path);
  }
}

class OpfsFs {
  root;
  db;
  lock = new Mutex;
  constructor(root, db) {
    this.root = root;
    this.db = db;
  }
  static async open() {
    const nav = navigator;
    const getDirectory = nav?.storage?.getDirectory;
    if (typeof getDirectory !== "function")
      throw new OpfsError("Unsupported", "OPFS is not available in this environment");
    const root = await getDirectory.call(nav.storage);
    const db = await loadDb(root);
    return new OpfsFs(root, db);
  }
  close() {}
  async writeFile(path, data, meta = {}) {
    const p = normalizePath(path);
    return this.lock.run(async () => {
      const blob = data instanceof Blob ? data : data instanceof Uint8Array ? (() => {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        return new Blob([copy]);
      })() : new Blob([data]);
      const type = meta.type ?? (blob.type || "application/octet-stream");
      let file;
      try {
        const { handle } = await getFileHandle(this.root, p, true);
        const w = await handle.createWritable({ keepExistingData: false });
        await w.write(blob);
        await w.close();
        file = await handle.getFile();
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to write file: ${p}`, e));
      }
      const now = Date.now();
      const map = byPath(this.db);
      const prev = map.get(p);
      const id = prev?.id ?? randomId();
      const createdAt = prev?.createdAt ?? now;
      const entry = {
        id,
        path: p,
        name: baseName(p),
        type: prev?.type ?? type,
        size: file.size,
        createdAt,
        updatedAt: now,
        extras: meta.extras ?? prev?.extras,
        checksum: prev?.checksum
      };
      this.db.entries[id] = entry;
      if (prev && prev.id !== id)
        delete this.db.entries[prev.id];
      for (const [k, v] of Object.entries(this.db.entries)) {
        if (k !== id && v.path === p)
          delete this.db.entries[k];
      }
      await flushDb(this.root, this.db);
      return entry;
    });
  }
  async readFile(path) {
    const p = normalizePath(path);
    return this.lock.run(async () => {
      try {
        const { handle } = await getFileHandle(this.root, p, false);
        const f = await handle.getFile();
        return f;
      } catch (e) {
        throw toOpfsError(e, new OpfsError("NotFound", `File not found: ${p}`, e));
      }
    });
  }
  async stat(path) {
    const p = normalizePath(path);
    return this.lock.run(async () => {
      const map = byPath(this.db);
      const entry = map.get(p) ?? null;
      if (!entry)
        return null;
      try {
        const { handle } = await getFileHandle(this.root, p, false);
        const f = await handle.getFile();
        if (f.size !== entry.size) {
          entry.size = f.size;
          entry.updatedAt = Date.now();
          this.db.entries[entry.id] = entry;
          await flushDb(this.root, this.db);
        }
      } catch (e) {
        return null;
      }
      return entry;
    });
  }
  async list(prefix) {
    const pref = prefix ? normalizePath(prefix).replace(/\/+$/, "") : "";
    return this.lock.run(async () => {
      const entries = Object.values(this.db.entries);
      if (!pref)
        return entries.slice().sort((a, b) => a.path.localeCompare(b.path));
      const withSlash = pref + "/";
      return entries.filter((e) => e.path === pref || e.path.startsWith(withSlash)).slice().sort((a, b) => a.path.localeCompare(b.path));
    });
  }
  async delete(path) {
    const p = normalizePath(path);
    return this.lock.run(async () => {
      const map = byPath(this.db);
      const entry = map.get(p);
      if (!entry)
        throw new OpfsError("NotFound", `File not found: ${p}`);
      try {
        const { dir, name } = await getFileHandle(this.root, p, false);
        await dir.removeEntry(name);
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to delete file: ${p}`, e));
      }
      delete this.db.entries[entry.id];
      await flushDb(this.root, this.db);
    });
  }
  async move(from, to) {
    const src = normalizePath(from);
    const dst = normalizePath(to);
    return this.lock.run(async () => {
      const map = byPath(this.db);
      const entry = map.get(src);
      if (!entry)
        throw new OpfsError("NotFound", `File not found: ${src}`);
      if (map.get(dst))
        throw new OpfsError("AlreadyExists", `Target already exists: ${dst}`);
      let blob;
      try {
        const { handle } = await getFileHandle(this.root, src, false);
        blob = await handle.getFile();
      } catch (e) {
        throw toOpfsError(e, new OpfsError("NotFound", `File not found: ${src}`, e));
      }
      try {
        const { handle } = await getFileHandle(this.root, dst, true);
        const w = await handle.createWritable({ keepExistingData: false });
        await w.write(blob);
        await w.close();
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to move file to: ${dst}`, e));
      }
      try {
        const { dir, name } = await getFileHandle(this.root, src, false);
        await dir.removeEntry(name);
      } catch (e) {
        throw toOpfsError(e, new OpfsError("Unknown", `Failed to remove source file: ${src}`, e));
      }
      const now = Date.now();
      entry.path = dst;
      entry.name = baseName(dst);
      entry.updatedAt = now;
      this.db.entries[entry.id] = entry;
      await flushDb(this.root, this.db);
    });
  }
  async updateMeta(path, patch) {
    const p = normalizePath(path);
    return this.lock.run(async () => {
      const map = byPath(this.db);
      const entry = map.get(p);
      if (!entry)
        throw new OpfsError("NotFound", `File not found: ${p}`);
      const next = {
        ...entry,
        type: patch.type ?? entry.type,
        extras: patch.extras ?? entry.extras,
        updatedAt: Date.now()
      };
      this.db.entries[next.id] = next;
      await flushDb(this.root, this.db);
      return next;
    });
  }
  async getUsage() {
    return this.lock.run(async () => {
      const entries = Object.values(this.db.entries);
      const bytes = entries.reduce((s, e) => s + (Number.isFinite(e.size) ? e.size : 0), 0);
      const nav = navigator;
      const estimate = nav?.storage?.estimate;
      if (typeof estimate !== "function")
        return { entries: entries.length, bytes };
      try {
        const r = await estimate.call(nav.storage);
        return { entries: entries.length, bytes, quota: r?.quota, usage: r?.usage };
      } catch {
        return { entries: entries.length, bytes };
      }
    });
  }
}
async function openOpfs() {
  return OpfsFs.open();
}
async function loadDb(root) {
  const main = await readTextFile(root, DB_FILE);
  const tmp = await readTextFile(root, DB_TMP_FILE);
  if (main) {
    try {
      const db2 = parseDb(main);
      ensureUniquePath(db2);
      return db2;
    } catch (e) {
      if (tmp) {
        const db2 = parseDb(tmp);
        ensureUniquePath(db2);
        return db2;
      }
      throw e;
    }
  }
  if (tmp) {
    const db2 = parseDb(tmp);
    ensureUniquePath(db2);
    return db2;
  }
  const db = emptyDb();
  await flushDb(root, db);
  return db;
}
async function flushDb(root, db) {
  db.updatedAt = Date.now();
  ensureUniquePath(db);
  const text = JSON.stringify(db);
  try {
    await writeTextFile(root, DB_TMP_FILE, text);
    await writeTextFile(root, DB_FILE, text);
    await removeIfExists(root, DB_TMP_FILE);
  } catch (e) {
    throw toOpfsError(e, new OpfsError("Unknown", "Failed to persist database", e));
  }
}

// src/ui/window/developer/panels/storage_panel.ts
function createStoragePanel() {
  return {
    id: "Developer.Storage",
    title: "Storage",
    build: (_ctx) => new StoragePanelSurface
  };
}

class SurfaceRoot4 extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
}
function clamp6(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function formatBytes(bytes) {
  const b = Math.max(0, bytes);
  if (b < 1024)
    return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = b / 1024;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0;
  return `${n.toFixed(digits)} ${units[u]}`;
}
function invalidateAll() {
  globalThis.__TNL_DEVTOOLS__?.invalidate?.();
}
function ensureHiddenFileInput() {
  const id = "tnl-devtools-file-input";
  let el = document.getElementById(id);
  if (el)
    return el;
  el = document.createElement("input");
  el.id = id;
  el.type = "file";
  el.multiple = true;
  el.style.position = "fixed";
  el.style.left = "-10000px";
  el.style.top = "-10000px";
  document.body.appendChild(el);
  return el;
}

class StoragePanelSurface {
  id = "Developer.Storage.Surface";
  root = new SurfaceRoot4;
  size = { x: 0, y: 0 };
  fsPromise = null;
  opSeq = 0;
  entries = [];
  usage = { entries: 0, bytes: 0 };
  error = null;
  busy = false;
  prefix = null;
  selectedPath = null;
  scroll = signal(0);
  contentH = 0;
  scrollbar;
  rowWidgets = [];
  btnRefresh;
  btnUpload;
  btnDownload;
  btnDelete;
  btnEdit;
  btnPrefix;
  constructor() {
    const toolbarH = 28;
    const btnW = 78;
    const btnH = 22;
    const y = 4;
    const gap = 6;
    this.btnRefresh = new Button({
      rect: () => ({ x: 6, y, w: btnW, h: btnH }),
      text: () => this.busy ? "Refreshing" : "Refresh",
      onClick: () => void this.refresh()
    });
    this.btnUpload = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 1, y, w: btnW, h: btnH }),
      text: "Upload",
      onClick: () => void this.upload()
    });
    this.btnDownload = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 2, y, w: btnW, h: btnH }),
      text: "Download",
      active: () => !!this.selectedPath,
      onClick: () => void this.downloadSelected()
    });
    this.btnDelete = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 3, y, w: btnW, h: btnH }),
      text: "Delete",
      active: () => !!this.selectedPath,
      onClick: () => void this.deleteSelected()
    });
    this.btnEdit = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 4, y, w: btnW, h: btnH }),
      text: "Edit Meta",
      active: () => !!this.selectedPath,
      onClick: () => void this.editSelectedMeta()
    });
    this.btnPrefix = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 5, y, w: btnW, h: btnH }),
      text: () => this.prefix ? "Prefix*" : "Prefix",
      onClick: () => this.setPrefix()
    });
    this.scrollbar = new Scrollbar({
      rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: toolbarH + 2, w: 10, h: Math.max(0, this.size.y - toolbarH - 4) }),
      axis: "y",
      viewportSize: () => Math.max(0, this.size.y - toolbarH),
      contentSize: () => this.contentH,
      value: () => this.scroll.peek(),
      onChange: (next) => this.scroll.set(next)
    });
    this.btnRefresh.z = 10;
    this.btnUpload.z = 10;
    this.btnDownload.z = 10;
    this.btnDelete.z = 10;
    this.btnEdit.z = 10;
    this.btnPrefix.z = 10;
    this.scrollbar.z = 40;
    this.root.add(this.btnRefresh);
    this.root.add(this.btnUpload);
    this.root.add(this.btnDownload);
    this.root.add(this.btnDelete);
    this.root.add(this.btnEdit);
    this.root.add(this.btnPrefix);
    this.root.add(this.scrollbar);
  }
  async ensureFs() {
    if (!this.fsPromise)
      this.fsPromise = openOpfs();
    return await this.fsPromise;
  }
  async refresh() {
    const seq = ++this.opSeq;
    this.busy = true;
    this.error = null;
    invalidateAll();
    try {
      const fs = await this.ensureFs();
      const entries = await fs.list(this.prefix ?? undefined);
      const usage = await fs.getUsage();
      if (seq !== this.opSeq)
        return;
      this.entries = entries.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path));
      this.usage = usage;
      if (this.selectedPath && !this.entries.some((e) => e.path === this.selectedPath))
        this.selectedPath = null;
    } catch (e) {
      if (seq !== this.opSeq)
        return;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq !== this.opSeq)
        return;
      this.busy = false;
      invalidateAll();
    }
  }
  listRect() {
    const toolbarH = 28;
    return { x: 2, y: toolbarH + 2, w: Math.max(0, this.size.x - 14), h: Math.max(0, this.size.y - toolbarH - 4) };
  }
  maxScroll() {
    const rowH = 22;
    const pad = 4;
    const view = this.listRect().h;
    this.contentH = Math.max(0, this.entries.length * rowH + pad);
    return Math.max(0, this.contentH - view);
  }
  async upload() {
    const input = ensureHiddenFileInput();
    input.value = "";
    input.onchange = async () => {
      const files = input.files ? [...input.files] : [];
      if (!files.length)
        return;
      const prefix = (this.prefix ?? "uploads").trim() || "uploads";
      const seq = ++this.opSeq;
      this.busy = true;
      invalidateAll();
      try {
        const fs = await this.ensureFs();
        for (const f of files) {
          const dst = `${prefix}/${f.name}`;
          await fs.writeFile(dst, f, { type: f.type || "application/octet-stream" });
        }
        if (seq !== this.opSeq)
          return;
        await this.refresh();
      } catch (e) {
        if (seq !== this.opSeq)
          return;
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        if (seq !== this.opSeq)
          return;
        this.busy = false;
        invalidateAll();
      }
    };
    input.click();
  }
  async downloadSelected() {
    const path = this.selectedPath;
    if (!path)
      return;
    const seq = ++this.opSeq;
    this.busy = true;
    invalidateAll();
    try {
      const fs = await this.ensureFs();
      const blob = await fs.readFile(path);
      if (seq !== this.opSeq)
        return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() ?? "download";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (seq !== this.opSeq)
        return;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq !== this.opSeq)
        return;
      this.busy = false;
      invalidateAll();
    }
  }
  async deleteSelected() {
    const path = this.selectedPath;
    if (!path)
      return;
    if (!confirm(`Delete ${path}?`))
      return;
    const seq = ++this.opSeq;
    this.busy = true;
    invalidateAll();
    try {
      const fs = await this.ensureFs();
      await fs.delete(path);
      if (seq !== this.opSeq)
        return;
      this.selectedPath = null;
      await this.refresh();
    } catch (e) {
      if (seq !== this.opSeq)
        return;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq !== this.opSeq)
        return;
      this.busy = false;
      invalidateAll();
    }
  }
  async editSelectedMeta() {
    const path = this.selectedPath;
    if (!path)
      return;
    const cur = this.entries.find((e) => e.path === path);
    const type = prompt("type (mime)", cur?.type ?? "application/octet-stream");
    if (type === null)
      return;
    const extrasText = prompt("extras (JSON)", JSON.stringify(cur?.extras ?? {}, null, 2));
    if (extrasText === null)
      return;
    let extras;
    try {
      const v = JSON.parse(extrasText);
      if (v && typeof v === "object" && !Array.isArray(v))
        extras = v;
      else
        extras = { value: v };
    } catch (e) {
      alert("Invalid JSON");
      return;
    }
    const seq = ++this.opSeq;
    this.busy = true;
    invalidateAll();
    try {
      const fs = await this.ensureFs();
      await fs.updateMeta(path, { type: type.trim() || cur?.type, extras });
      if (seq !== this.opSeq)
        return;
      await this.refresh();
    } catch (e) {
      if (seq !== this.opSeq)
        return;
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      if (seq !== this.opSeq)
        return;
      this.busy = false;
      invalidateAll();
    }
  }
  setPrefix() {
    const next = prompt("prefix (optional)", this.prefix ?? "");
    if (next === null)
      return;
    const v = next.trim();
    this.prefix = v ? v : null;
    this.scroll.set(0);
    this.refresh();
  }
  hitTest(pSurface) {
    return this.root.hitTest(pSurface);
  }
  onWheel(e, _viewport) {
    const list = this.listRect();
    if (e.y < list.y || e.y > list.y + list.h)
      return;
    const maxY = this.maxScroll();
    const next = clamp6(this.scroll.peek() + e.deltaY, 0, maxY);
    if (next === this.scroll.peek())
      return;
    this.scroll.set(next);
    e.handle();
  }
  render(ctx, viewport) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
    const c = ctx;
    draw(c, RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.01)" } }));
    draw(c, Rect({ x: 0, y: 0, w: this.size.x, h: 28 }, { fill: { color: "rgba(255,255,255,0.015)" } }));
    if (this.entries.length === 0 && !this.busy && !this.error) {
      this.refresh();
    }
    const list = this.listRect();
    const rowH = 22;
    const topPad = list.y;
    const y0 = this.scroll.peek();
    const maxY = this.maxScroll();
    this.scroll.set((v) => clamp6(v, 0, maxY));
    const visible = Math.ceil(list.h / rowH) + 2;
    while (this.rowWidgets.length < visible) {
      const r = new Row;
      r.z = 1;
      this.rowWidgets.push(r);
      this.root.add(r);
    }
    const first = Math.max(0, Math.floor((y0 - 2) / rowH));
    const last = Math.min(this.entries.length - 1, first + visible);
    for (let i = 0;i < this.rowWidgets.length; i++) {
      const idx = first + i;
      const w = this.rowWidgets[i];
      const e = this.entries[idx];
      if (!e || idx > last) {
        w.set({ rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" });
        continue;
      }
      const y = topPad + idx * rowH - y0;
      const right = `${formatBytes(e.size)} · ${e.type}`;
      w.set({
        rect: { x: list.x, y, w: list.w, h: rowH },
        leftText: e.path,
        rightText: right,
        variant: "item",
        selected: e.path === this.selectedPath
      }, () => {
        this.selectedPath = e.path;
        invalidateAll();
      });
    }
    const usageTextParts = [];
    usageTextParts.push(`${this.usage.entries} files`);
    usageTextParts.push(formatBytes(this.usage.bytes));
    if (typeof this.usage.usage === "number" && typeof this.usage.quota === "number" && this.usage.quota > 0) {
      const pct = Math.min(100, Math.max(0, this.usage.usage / this.usage.quota * 100));
      usageTextParts.push(`${formatBytes(this.usage.usage)} / ${formatBytes(this.usage.quota)} (${pct.toFixed(1)}%)`);
    }
    const usageText = usageTextParts.join(" · ");
    draw(c, Text({
      x: Math.max(6, this.size.x - 6),
      y: 28 / 2 + 0.5,
      text: this.busy ? "Working…" : this.error ? this.error : usageText,
      style: { color: this.error ? "rgba(255,120,120,0.95)" : theme.colors.textMuted, font: `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`, baseline: "middle", align: "end" }
    }));
    this.root.draw(c);
  }
}

// src/ui/window/developer/panels/surface_panel.ts
function createSurfacePanel() {
  return {
    id: "Developer.Surface",
    title: "Surface",
    build: (_ctx) => new TextSurface({
      id: "Developer.Surface.Surface",
      title: "Surface",
      body: "TODO: add compositor debug hooks to list layers and their sizes. TODO: capture per-surface draw ops per frame. TODO: visualize layer tree and blending. TODO: select a layer and inspect its last frame commands."
    })
  };
}

// src/ui/window/developer/panels/timeline_panel.ts
function createTimelinePanel() {
  return {
    id: "Developer.Timeline",
    title: "Timeline",
    build: (_ctx) => new TextSurface({
      id: "Developer.Timeline.Surface",
      title: "Timeline",
      body: "TODO: define event schema and instrumentation points. TODO: ring buffer + sampling. TODO: timeline UI with zoom/pan and track lanes. TODO: mark long tasks, frames, surface renders, worker jobs. TODO: export snapshot."
    })
  };
}

// src/ui/window/developer/panels/wm_panel.ts
function createWmPanel() {
  return {
    id: "Developer.WM",
    title: "WM",
    build: (_ctx) => new TextSurface({
      id: "Developer.WM.Surface",
      title: "Window Manager",
      body: "TODO: define WindowManager API (list windows, focus, toggle open, minimize/restore, move/resize). TODO: render a window list with current state. TODO: actions per row + bulk actions. TODO: keep ids stable and reflect real-time changes."
    })
  };
}

// src/ui/window/developer/panels/worker_panel.ts
function createWorkerPanel() {
  return {
    id: "Developer.Worker",
    title: "Worker",
    build: (_ctx) => new TextSurface({
      id: "Developer.Worker.Surface",
      title: "Workers",
      body: "TODO: add a Worker registry. TODO: show active workers and current job description. TODO: progress reporting protocol and cancellation. TODO: surface errors and logs without leaking sensitive data."
    })
  };
}

// src/ui/window/developer/index.ts
function defaultDeveloperPanels() {
  return [
    createDataPanel(),
    createStoragePanel(),
    createControlPanel(),
    createWmPanel(),
    createTimelinePanel(),
    createWorkerPanel(),
    createCodecPanel(),
    createSurfacePanel(),
    createInspectorPanel()
  ];
}

// src/ui/window/developer/developer_tools_window.ts
var DEVELOPER_WINDOW_ID = "Developer";

class DeveloperToolsWindow extends ModalWindow {
  body = { x: 0, y: 0, w: 0, h: 0 };
  viewport;
  constructor(ctx = {}) {
    super({
      id: DEVELOPER_WINDOW_ID,
      x: 140,
      y: 120,
      w: 720,
      h: 480,
      minW: 520,
      minH: 320,
      title: "Developer",
      open: false,
      resizable: true
    });
    const panels = defaultDeveloperPanels();
    const tabs = new TabPanelSurface({
      id: "Developer.Tools.Tabs",
      tabs: panels.map((p) => ({ id: p.id, title: p.title, surface: p.build(ctx) })),
      selectedId: "Developer.Control",
      scrollbar: true
    });
    this.viewport = new ViewportElement({
      rect: () => this.body,
      target: tabs,
      options: { clip: true, padding: 0, active: () => this.open.peek() && !this.minimized.peek() }
    });
    this.viewport.z = 1;
    this.add(this.viewport);
  }
  drawBody(_ctx, x, y, w, h) {
    this.body = { x, y, w, h };
  }
}

// src/ui/surfaces/divider_surface.ts
class SurfaceRoot5 extends UIElement {
  bounds() {
    return { x: -1e9, y: -1e9, w: 2000000000, h: 2000000000 };
  }
}
function clamp7(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class DividerHandle extends UIElement {
  rect;
  axis;
  position;
  minA;
  minB;
  total;
  hover = false;
  down = false;
  start = 0;
  startPos = 0;
  constructor(opts) {
    super();
    this.rect = opts.rect;
    this.axis = opts.axis;
    this.position = opts.position;
    this.minA = opts.minA;
    this.minB = opts.minB;
    this.total = opts.total;
    this.z = 50;
  }
  bounds() {
    return this.rect();
  }
  containsPoint(p) {
    return pointInRect(p, this.rect());
  }
  onDraw(ctx) {
    const r = this.rect();
    const bg = this.down ? "rgba(255,255,255,0.08)" : this.hover ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)";
    draw(ctx, Rect(r, { fill: { color: bg } }), RRect({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2, r: 6 }, { stroke: { color: "rgba(255,255,255,0.10)", hairline: true }, pixelSnap: true }));
    if (this.axis === "x") {
      const x = r.x + r.w / 2;
      const y0 = r.y + 8;
      const y1 = r.y + r.h - 8;
      draw(ctx, Line({ x, y: y0 }, { x, y: y1 }, { color: "rgba(255,255,255,0.18)", width: 2, lineCap: "round" }));
    } else {
      const y = r.y + r.h / 2;
      const x0 = r.x + 8;
      const x1 = r.x + r.w - 8;
      draw(ctx, Line({ x: x0, y }, { x: x1, y }, { color: "rgba(255,255,255,0.18)", width: 2, lineCap: "round" }));
    }
  }
  onPointerEnter() {
    this.hover = true;
  }
  onPointerLeave() {
    this.hover = false;
    this.down = false;
  }
  onPointerDown(e) {
    if (e.button !== 0)
      return;
    this.down = true;
    this.start = this.axis === "x" ? e.x : e.y;
    this.startPos = this.position.peek();
    e.capture();
  }
  onPointerMove(e) {
    if (!this.down)
      return;
    const cur = this.axis === "x" ? e.x : e.y;
    const delta = cur - this.start;
    const total = this.total();
    const minA = this.minA();
    const minB = this.minB();
    const next = clamp7(this.startPos + delta, minA, Math.max(minA, total - minB));
    this.position.set(next);
  }
  onPointerUp(_e) {
    this.down = false;
  }
}

class DividerSurface {
  id;
  root = new SurfaceRoot5;
  size = { x: 0, y: 0 };
  axis;
  position;
  minA;
  minB;
  gutter;
  aViewport;
  bViewport;
  constructor(opts) {
    this.id = opts.id;
    this.axis = opts.axis ?? "x";
    this.minA = opts.minA ?? 160;
    this.minB = opts.minB ?? 160;
    this.gutter = Math.max(8, opts.gutter ?? 10);
    this.position = signal(opts.initial ?? 220);
    const aRect = () => {
      if (this.axis === "x")
        return { x: 0, y: 0, w: clamp7(this.position.peek(), 0, Math.max(0, this.size.x - this.gutter)), h: this.size.y };
      return { x: 0, y: 0, w: this.size.x, h: clamp7(this.position.peek(), 0, Math.max(0, this.size.y - this.gutter)) };
    };
    const handleRect = () => {
      if (this.axis === "x")
        return { x: aRect().w, y: 0, w: this.gutter, h: this.size.y };
      return { x: 0, y: aRect().h, w: this.size.x, h: this.gutter };
    };
    const bRect = () => {
      if (this.axis === "x")
        return { x: aRect().w + this.gutter, y: 0, w: Math.max(0, this.size.x - aRect().w - this.gutter), h: this.size.y };
      return { x: 0, y: aRect().h + this.gutter, w: this.size.x, h: Math.max(0, this.size.y - aRect().h - this.gutter) };
    };
    this.aViewport = new ViewportElement({ rect: aRect, target: opts.a, options: { clip: true, padding: theme.spacing.sm } });
    this.bViewport = new ViewportElement({ rect: bRect, target: opts.b, options: { clip: true, padding: theme.spacing.sm } });
    this.aViewport.z = 1;
    this.bViewport.z = 1;
    this.root.add(this.aViewport);
    this.root.add(this.bViewport);
    this.root.add(new DividerHandle({
      rect: handleRect,
      axis: this.axis,
      position: this.position,
      minA: () => this.minA,
      minB: () => this.minB,
      total: () => this.axis === "x" ? this.size.x : this.size.y
    }));
  }
  render(ctx, viewport) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h };
    const total = this.axis === "x" ? this.size.x : this.size.y;
    const maxPos = Math.max(this.minA, total - this.minB);
    const next = clamp7(this.position.peek(), this.minA, maxPos);
    if (next !== this.position.peek())
      this.position.set(next);
    this.root.draw(ctx);
  }
  hitTest(pSurface) {
    return this.root.hitTest(pSurface);
  }
}

// src/ui/window/tool_dialog.ts
class ToolDialog extends ModalWindow {
  constructor(opts) {
    super({
      ...opts,
      title: opts.title ?? "",
      chrome: "tool",
      minimizable: false
    });
  }
}

// src/ui/window/tools_dialog.ts
var TOOLS_DIALOG_ID = "Tools.Dialog";

class ToolsDialog extends ToolDialog {
  body = { x: 0, y: 0, w: 0, h: 0 };
  viewport;
  constructor() {
    super({
      id: TOOLS_DIALOG_ID,
      x: 20,
      y: 520,
      w: 320,
      h: 220,
      title: "",
      open: false,
      resizable: true,
      minW: 240,
      minH: 160
    });
    const tabs = this.createTabPanel();
    this.viewport = this.createViewport(tabs);
    this.add(this.viewport);
  }
  createTabPanel() {
    return new TabPanelSurface({
      id: "Tools.Tabs",
      tabs: [
        this.createScrollTab(),
        this.createControlsTab(),
        this.createSplitTab(),
        this.createInfoTab()
      ],
      selectedId: "scroll",
      scrollbar: true
    });
  }
  createScrollTab() {
    return {
      id: "scroll",
      title: "Scroll",
      surface: new TextSurface({
        id: "Tools.Scroll.Demo",
        title: "Wheel Scroll Demo",
        body: this.getScrollDemoText()
      })
    };
  }
  createControlsTab() {
    return {
      id: "controls",
      title: "Controls",
      surface: new ControlsSurface
    };
  }
  createSplitTab() {
    return {
      id: "split",
      title: "Split",
      surface: new DividerSurface({
        id: "Tools.Split",
        a: new ControlsSurface,
        b: new TextSurface({
          id: "Tools.Split.Info",
          title: "Divider",
          body: "A divider hosts two surfaces in one panel and lets you drag the handle to adjust the split position."
        }),
        initial: 220,
        minA: 140,
        minB: 140,
        gutter: 10
      })
    };
  }
  createInfoTab() {
    return {
      id: "info",
      title: "Info",
      surface: new TextSurface({
        id: "Tools.Info",
        title: "Tabs",
        body: "A tab panel switches content surfaces within one window. Each tab can host its own Surface and Viewport constraints."
      })
    };
  }
  createViewport(tabs) {
    const viewport = new ViewportElement({
      rect: () => this.body,
      target: tabs,
      options: {
        clip: true,
        padding: 0,
        active: () => this.open.peek() && !this.minimized.peek()
      }
    });
    viewport.z = 1;
    return viewport;
  }
  getScrollDemoText() {
    return [
      "Use the mouse wheel while the cursor is inside this content area. This panel is intentionally long so vertical scrolling is obvious. ",
      "Try slow wheel ticks and fast flicks, then resize this window to make the viewport shorter and verify that the scroll range grows. ",
      "You can also drag the scrollbar thumb on the right edge and then continue with wheel input; both paths should stay synchronized. ",
      "Expected behavior: scrolling is clamped at top and bottom, tab bar remains fixed, and switching tabs resets the panel scroll position. ",
      "Regression checks: Controls tab should remain interactive, Split tab divider should still drag correctly, and opening Developer window should keep its own scroll state independent from this dialog. ",
      "This text block repeats to force overflow. ".repeat(6)
    ].join("");
  }
  drawBody(ctx, x, y, _w, _h) {
    this.body = { x, y, w: _w, h: _h };
  }
}

// src/main.ts
var canvas = document.querySelector("#app");
if (!canvas)
  throw new Error("Canvas not found");
document.body.style.background = theme.colors.appBg;
var themeMeta = document.querySelector('meta[name="theme-color"]');
if (themeMeta)
  themeMeta.content = theme.colors.appBg;
var root = new Root;
var windows = new Map;
var about = new AboutWindow;
windows.set(about.id, about);
root.add(about);
var developer = new DeveloperToolsWindow;
windows.set(developer.id, developer);
root.add(developer);
var tools = new ToolsDialog;
windows.set(tools.id, tools);
root.add(tools);
var ui = new CanvasUI(canvas, root);
globalThis.__TNL_DEVTOOLS__ ??= {};
globalThis.__TNL_DEVTOOLS__.invalidate = () => ui.invalidate();
var lastRects = new Map;
effect(() => {
  const pad = 24;
  for (const win of windows.values()) {
    win.open.get();
    win.minimized.get();
    win.x.get();
    win.y.get();
    win.w.get();
    win.h.get();
    const cur = win.bounds();
    const prev = lastRects.get(win.id);
    lastRects.set(win.id, cur);
    if (!prev)
      ui.invalidateRect(cur, { pad });
    else
      ui.invalidateRect(unionRect(prev, cur), { pad });
  }
});
canvas.addEventListener("keydown", (e) => {
  if (e.key !== "F1" && e.key !== "F2" && e.key !== "F3")
    return;
  e.preventDefault();
  const id = e.key === "F1" ? ABOUT_WINDOW_ID : e.key === "F2" ? DEVELOPER_WINDOW_ID : TOOLS_DIALOG_ID;
  const win = windows.get(id);
  if (!win)
    return;
  win.open.set((v) => !v);
  if (win.open.peek())
    win.bringToFront();
  ui.invalidate();
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  });
}
