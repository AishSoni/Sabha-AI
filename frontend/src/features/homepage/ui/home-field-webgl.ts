import { EMBLEMS, emblemSvgMarkup } from "../presentation/emblems";
import type { FieldDensity } from "../presentation/field-layout";
import type { FieldPalette } from "../presentation/field-palette";
import {
  SPIRAL_CAMERA_SIZE,
  SPIRAL_CARD_COUNT,
  SPIRAL_STAGE_MIN_SIZE,
  cardSceneAt,
  cardSizeAt,
  positiveModulo,
} from "../presentation/spiral";

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aCenter;
layout(location = 2) in vec2 aSize;
layout(location = 3) in float aAngle;
layout(location = 4) in float aOpacity;
layout(location = 5) in float aLayer;
layout(location = 6) in vec3 aAccent;
layout(location = 7) in float aVariant;

uniform vec2 uResolution;

out vec2 vLocal;
out vec2 vCardSize;
out float vOpacity;
flat out float vLayer;
flat out vec3 vAccent;
flat out float vVariant;

void main() {
  vec2 local = aCorner * aSize;
  float c = cos(aAngle);
  float s = sin(aAngle);
  // Match CSS rotate(): positive angles turn clockwise on screen (y-down).
  vec2 rotated = mat2(c, s, -s, c) * local;
  vec2 pixel = aCenter + rotated;
  vec2 clip = (pixel / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

  vLocal = aCorner;
  vCardSize = aSize;
  vOpacity = aOpacity;
  vLayer = aLayer;
  vAccent = aAccent;
  vVariant = aVariant;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler2DArray;

uniform sampler2DArray uGlyphs;
uniform vec3 uCardTop;
uniform vec3 uCardBottom;
uniform vec3 uGlyph;
uniform vec3 uRim;
uniform vec3 uGlow;
uniform float uRadius;
uniform vec2 uResolution;
uniform float uDpr;

in vec2 vLocal;
in vec2 vCardSize;
in float vOpacity;
flat in float vLayer;
flat in vec3 vAccent;
flat in float vVariant;

out vec4 outColor;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  vec2 halfSize = max(vCardSize * 0.5, vec2(1.0));
  vec2 p = vLocal * vCardSize;
  float dist = sdRoundedBox(p, halfSize, uRadius);
  float inside = 1.0 - smoothstep(-0.75, 0.75, dist);
  if (inside <= 0.001) discard;

  float grad = clamp((p.y + halfSize.y) / max(vCardSize.y, 1.0), 0.0, 1.0);
  vec3 card = mix(uCardBottom, uCardTop, grad);

  float radial = length(p / halfSize);
  card += uGlow * smoothstep(1.05, 0.0, radial) * (0.13 + 0.07 * vVariant);

  float sheen = smoothstep(-0.2, 1.0, (p.x / halfSize.x + p.y / halfSize.y) * 0.5);
  card += vec3(sheen * 0.045);

  float ring = 1.0 - smoothstep(0.0, 0.04, abs(radial - 0.62));
  card += vAccent * ring * 0.18;

  vec2 glyphScale =
    vCardSize / max(min(vCardSize.x, vCardSize.y), 1.0);
  vec2 glyphUv = vLocal * glyphScale + 0.5;
  float inGlyph =
    step(0.0, glyphUv.x) *
    step(glyphUv.x, 1.0) *
    step(0.0, glyphUv.y) *
    step(glyphUv.y, 1.0);
  vec4 glyph = texture(uGlyphs, vec3(clamp(glyphUv, 0.0, 1.0), vLayer));
  vec3 glyphColor = mix(uGlyph, vAccent, 0.28);
  card = mix(card, glyphColor, glyph.a * 0.96 * inGlyph);

  float rim = smoothstep(-2.4, -0.9, dist) * (1.0 - smoothstep(-0.9, 0.0, dist));
  card = mix(card, uRim, rim * 0.7);

  vec2 frag = gl_FragCoord.xy / uDpr;
  frag.y = uResolution.y - frag.y;
  vec2 radialCoord = (frag - uResolution * 0.5) / (uResolution * 0.45);
  float vignette = clamp(
    (length(radialCoord) - 0.505) / 0.395,
    0.0,
    1.0
  );
  float alpha = inside * vOpacity * vignette;
  outColor = vec4(card * alpha, alpha);
}
`;

const CARD_RADIUS = 16;
const BASE_VELOCITY = 0.32;
const BURST_MULTIPLIER = 20;
const BURST_DURATION = 3200;
const BURST_RAMP_UP = 700;
const SCROLL_RAMP_UP = 220;
const SCROLL_SURGE_HOLD = 140;
const INSTANCE_STRIDE = 11;
const TEXTURE_SIZE = 256;
const TEXTURE_LAYERS = EMBLEMS.length;

export interface FieldMask {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  /** Fraction of the radius that stays fully transparent (0-1). */
  readonly plateau?: number;
}

export interface FieldEngine {
  setDensity(density: FieldDensity): void;
  setPaused(paused: boolean): void;
  setPalette(palette: FieldPalette): void;
  setMask(mask: FieldMask): void;
  destroy(): void;
}

export interface CreateFieldEngineOptions {
  canvas: HTMLCanvasElement;
  palette: FieldPalette;
  dprCap: number;
  startPaused?: boolean;
  onReady: () => void;
  onFailure: () => void;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function loadSvgCanvas(markup: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([markup], { type: "image/svg+xml" }),
    );
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_SIZE;
      canvas.height = TEXTURE_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to create emblem raster context"));
        return;
      }
      context.drawImage(image, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode emblem artwork"));
    };
    image.src = url;
  });
}

async function createGlyphTextureArray(
  gl: WebGL2RenderingContext,
): Promise<WebGLTexture> {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to create glyph texture array");

  const levels = Math.floor(Math.log2(TEXTURE_SIZE)) + 1;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texStorage3D(
    gl.TEXTURE_2D_ARRAY,
    levels,
    gl.RGBA8,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    TEXTURE_LAYERS,
  );

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  for (let index = 0; index < EMBLEMS.length; index += 1) {
    const emblem = EMBLEMS[index]!;
    const raster = await loadSvgCanvas(
      emblemSvgMarkup(emblem, { color: "#ffffff", size: TEXTURE_SIZE }),
    );
    gl.texSubImage3D(
      gl.TEXTURE_2D_ARRAY,
      0,
      0,
      0,
      index,
      TEXTURE_SIZE,
      TEXTURE_SIZE,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      raster,
    );
  }

  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(
    gl.TEXTURE_2D_ARRAY,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(
    gl.TEXTURE_2D_ARRAY,
    gl.TEXTURE_MAG_FILTER,
    gl.LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function parseHex(color: string): [number, number, number] {
  const value = color.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : value;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function burstAt(now: number, startedAt: number): number {
  const elapsed = now - startedAt;
  if (elapsed <= 0) return 1;
  if (elapsed < BURST_RAMP_UP) {
    return 1 + (BURST_MULTIPLIER - 1) * (elapsed / BURST_RAMP_UP);
  }
  if (elapsed < BURST_DURATION) {
    const progress =
      (elapsed - BURST_RAMP_UP) / (BURST_DURATION - BURST_RAMP_UP);
    const remaining = 1 - progress;
    return 1 + (BURST_MULTIPLIER - 1) * remaining * remaining;
  }
  return 1;
}

function scrollSurgeAt(
  now: number,
  startedAt: number,
  activeUntil: number,
  anchor: number,
): number {
  if (!Number.isFinite(startedAt)) return 1;
  const elapsed = now - startedAt;
  if (elapsed < 0) return anchor;
  const ramped =
    anchor +
    (BURST_MULTIPLIER - anchor) *
      Math.min(elapsed / SCROLL_RAMP_UP, 1);
  if (now <= activeUntil) return ramped;
  const decayStart = Math.max(activeUntil, startedAt + SCROLL_RAMP_UP);
  const decayElapsed = Math.max(decayStart - startedAt, 0);
  const decayAnchor =
    anchor +
    (BURST_MULTIPLIER - anchor) *
      Math.min(decayElapsed / SCROLL_RAMP_UP, 1);
  const progress = (now - decayStart) / BURST_DURATION;
  if (progress >= 1) return 1;
  const remaining = 1 - progress;
  return 1 + (decayAnchor - 1) * remaining * remaining;
}

export async function createHomeFieldEngine(
  options: CreateFieldEngineOptions,
): Promise<FieldEngine> {
  const { canvas, dprCap, onReady, onFailure } = options;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL2 is unavailable");
  const context = gl;

  let palette = options.palette;
  let paused = options.startPaused ?? false;
  let destroyed = false;
  let frame = 0;
  let lastTime = 0;
  let offsetPercent = 0;
  const startedAt = performance.now();
  let ready = false;
  let mask: FieldMask = {
    centerX: canvas.clientWidth / 2,
    centerY: canvas.clientHeight / 2,
    radiusX: canvas.clientWidth * 0.34,
    radiusY: canvas.clientHeight * 0.3,
    plateau: 0.86,
  };
  let lastScrollY = typeof window === "undefined" ? 0 : window.scrollY;
  let scrollSurgeAnchor = 1;
  let scrollSurgeStartedAt = Number.NEGATIVE_INFINITY;
  let scrollActiveUntil = Number.NEGATIVE_INFINITY;

  const program = createProgram(gl);
  const vertexArray = gl.createVertexArray();
  const quadBuffer = gl.createBuffer();
  const instanceBuffer = gl.createBuffer();
  if (!vertexArray || !quadBuffer || !instanceBuffer) {
    throw new Error("Unable to create field buffers");
  }

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    SPIRAL_CARD_COUNT * INSTANCE_STRIDE * 4,
    gl.DYNAMIC_DRAW,
  );

  const attributeLayout = [
    { location: 1, size: 2, offset: 0 },
    { location: 2, size: 2, offset: 2 },
    { location: 3, size: 1, offset: 4 },
    { location: 4, size: 1, offset: 5 },
    { location: 5, size: 1, offset: 6 },
    { location: 6, size: 3, offset: 7 },
    { location: 7, size: 1, offset: 10 },
  ] as const;

  for (const attribute of attributeLayout) {
    gl.enableVertexAttribArray(attribute.location);
    gl.vertexAttribPointer(
      attribute.location,
      attribute.size,
      gl.FLOAT,
      false,
      INSTANCE_STRIDE * 4,
      attribute.offset * 4,
    );
    gl.vertexAttribDivisor(attribute.location, 1);
  }

  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    glyphs: gl.getUniformLocation(program, "uGlyphs"),
    cardTop: gl.getUniformLocation(program, "uCardTop"),
    cardBottom: gl.getUniformLocation(program, "uCardBottom"),
    glyph: gl.getUniformLocation(program, "uGlyph"),
    rim: gl.getUniformLocation(program, "uRim"),
    glow: gl.getUniformLocation(program, "uGlow"),
    radius: gl.getUniformLocation(program, "uRadius"),
    dpr: gl.getUniformLocation(program, "uDpr"),
  };

  for (const location of Object.values(uniforms)) {
    if (location === null) throw new Error("Unable to find field uniform");
  }

  gl.useProgram(program);
  gl.uniform1i(uniforms.glyphs!, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const glyphs = await createGlyphTextureArray(gl);
  if (destroyed) {
    gl.deleteTexture(glyphs);
    gl.deleteBuffer(quadBuffer);
    gl.deleteBuffer(instanceBuffer);
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
    throw new Error("Field engine was disposed");
  }

  const instanceData = new Float32Array(SPIRAL_CARD_COUNT * INSTANCE_STRIDE);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width: rect.width, height: rect.height };
  }

  function handleScroll() {
    const next = window.scrollY;
    if (next === lastScrollY) return;
    const now = performance.now();
    if (now > scrollActiveUntil) {
      scrollSurgeAnchor = scrollSurgeAt(
        now,
        scrollSurgeStartedAt,
        scrollActiveUntil,
        scrollSurgeAnchor,
      );
      scrollSurgeStartedAt = now;
    }
    scrollActiveUntil = now + SCROLL_SURGE_HOLD;
    lastScrollY = next;
  }

  function draw() {
    const css = resize();
    if (!canvas.width || !canvas.height) return;

    const stageCss = Math.max(SPIRAL_STAGE_MIN_SIZE, css.width);
    const sceneToCss = stageCss / SPIRAL_CAMERA_SIZE;
    const cx = css.width / 2;
    const cy = css.height / 2;

    let count = 0;
    for (let index = 0; index < SPIRAL_CARD_COUNT; index += 1) {
      const scene = cardSceneAt(index, SPIRAL_CARD_COUNT, offsetPercent);
      if (scene.fade <= 0.01) continue;

      const size = cardSizeAt(index);
      const width = size.width * sceneToCss * scene.scale;
      const height = size.height * sceneToCss * scene.scale;
      const x = cx + scene.x * sceneToCss;
      const y = cy + scene.y * sceneToCss;

      const normalizedX = (x - mask.centerX) / Math.max(mask.radiusX, 1);
      const normalizedY = (y - mask.centerY) / Math.max(mask.radiusY, 1);
      const centerDistance =
        Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY) +
        (Math.max(width, height) * 0.5) /
          Math.max(Math.min(mask.radiusX, mask.radiusY), 1);
      const cullDistance = Math.max(0.24, (mask.plateau ?? 0.86) - 0.06);
      if (centerDistance < cullDistance) continue;

      const radius = Math.hypot(width, height) * 0.5;
      if (
        x + radius < 0 ||
        x - radius > css.width ||
        y + radius < 0 ||
        y - radius > css.height
      ) {
        continue;
      }

      const emblem = EMBLEMS[index % EMBLEMS.length]!;
      const accent = parseHex(emblem.accent);
      const offset = count * INSTANCE_STRIDE;
      instanceData[offset] = x;
      instanceData[offset + 1] = y;
      instanceData[offset + 2] = width;
      instanceData[offset + 3] = height;
      instanceData[offset + 4] = scene.angle;
      instanceData[offset + 5] = scene.fade * (0.86 + scene.scale * 0.14);
      instanceData[offset + 6] = index % EMBLEMS.length;
      instanceData[offset + 7] = accent[0];
      instanceData[offset + 8] = accent[1];
      instanceData[offset + 9] = accent[2];
      instanceData[offset + 10] = (index * 0.61803398875) % 1;
      count += 1;
    }

    context.viewport(0, 0, canvas.width, canvas.height);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(program);
    context.bindVertexArray(vertexArray);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D_ARRAY, glyphs);

    context.uniform2f(uniforms.resolution!, css.width, css.height);
    context.uniform1f(uniforms.dpr!, canvas.width / Math.max(css.width, 1));
    context.uniform1f(uniforms.radius!, CARD_RADIUS);

    const top = parseHex(palette.cardTop);
    const bottom = parseHex(palette.cardBottom);
    const glyph = parseHex(palette.glyph);
    const rim = parseHex(palette.rim);
    const glow = parseHex(palette.glow);
    context.uniform3f(uniforms.cardTop!, top[0], top[1], top[2]);
    context.uniform3f(uniforms.cardBottom!, bottom[0], bottom[1], bottom[2]);
    context.uniform3f(uniforms.glyph!, glyph[0], glyph[1], glyph[2]);
    context.uniform3f(uniforms.rim!, rim[0], rim[1], rim[2]);
    context.uniform3f(uniforms.glow!, glow[0], glow[1], glow[2]);

    context.bindBuffer(context.ARRAY_BUFFER, instanceBuffer);
    context.bufferSubData(
      context.ARRAY_BUFFER,
      0,
      instanceData.subarray(0, count * INSTANCE_STRIDE),
    );
    context.drawArraysInstanced(context.TRIANGLE_STRIP, 0, 4, count);
  }

  function stop() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    lastTime = 0;
  }

  function tick(now: number) {
    frame = 0;
    if (destroyed || paused) return;
    if (!lastTime) lastTime = now;
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    const loadBurst = burstAt(now, startedAt);
    const scrollSurge = scrollSurgeAt(
      now,
      scrollSurgeStartedAt,
      scrollActiveUntil,
      scrollSurgeAnchor,
    );
    const surge = Math.max(loadBurst, scrollSurge);
    offsetPercent = positiveModulo(
      offsetPercent +
        BASE_VELOCITY * surge * Math.min(delta, 0.15),
      100,
    );

    draw();
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (destroyed || paused || !ready || frame) return;
    frame = requestAnimationFrame(tick);
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    ready = false;
    stop();
    onFailure();
  }

  const resizeObserver = new ResizeObserver(() => {
    const css = resize();
    mask = {
      ...mask,
      centerX: Math.min(mask.centerX, css.width),
      centerY: Math.min(mask.centerY, css.height),
    };
    if (paused && ready) draw();
  });
  resizeObserver.observe(canvas);
  canvas.addEventListener("webglcontextlost", handleContextLost);
  window.addEventListener("scroll", handleScroll, { passive: true });

  resize();
  draw();
  ready = true;
  onReady();
  if (!paused) start();

  return {
    setDensity() {
      // The spiral deliberately keeps the full 189-slot constellation at every
      // breakpoint; only the viewport changes which part of it is visible.
    },
    setPaused(nextPaused) {
      if (nextPaused === paused) return;
      paused = nextPaused;
      if (paused) {
        stop();
      } else {
        lastTime = 0;
        // The arrival burst is a one-shot first-load gesture. Resuming after a
        // pause must not replay it; only the initial load and scroll deltas
        // are allowed to accelerate the spiral.
        start();
      }
    },
    setPalette(nextPalette) {
      palette = nextPalette;
      if (paused && ready) draw();
    },
    setMask(nextMask) {
      mask = nextMask;
      if (paused && ready) draw();
    },
    destroy() {
      destroyed = true;
      ready = false;
      stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      window.removeEventListener("scroll", handleScroll);
      gl.deleteTexture(glyphs);
      gl.deleteBuffer(quadBuffer);
      gl.deleteBuffer(instanceBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    },
  };
}
