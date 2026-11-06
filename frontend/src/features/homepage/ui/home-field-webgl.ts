import { EMBLEMS, emblemSvgMarkup, type EmblemId } from "../presentation/emblems";
import {
  HOME_FIELD_SLOTS_BY_DENSITY,
  resolveFieldSlot,
  type FieldDensity,
  type FieldSlot,
} from "../presentation/field-layout";
import type { FieldPalette } from "../presentation/field-palette";

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aPosition;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uRotation;

out vec2 vUv;

void main() {
  vec2 point = aPosition * uSize;
  float c = cos(uRotation);
  float s = sin(uRotation);
  point = mat2(c, -s, s, c) * point;
  vec2 pixel = uCenter + point;
  vec2 clip = (pixel / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aPosition + 0.5;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform sampler2D uTexture;
uniform vec4 uColor;
uniform float uOpacity;

in vec2 vUv;
out vec4 outColor;

void main() {
  vec4 textureColor = texture(uTexture, vUv);
  outColor = vec4(uColor.rgb, textureColor.a * uColor.a * uOpacity);
}
`;

export interface FieldEngine {
  setDensity(density: FieldDensity): void;
  setPaused(paused: boolean): void;
  setPalette(palette: FieldPalette): void;
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

const DENSITY_SCALE: Record<FieldDensity, number> = {
  wide: 1,
  medium: 0.86,
  compact: 0.74,
};

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

function loadSvgCanvas(markup: string, size: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([markup], { type: "image/svg+xml" }),
    );
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Unable to create emblem raster context"));
        return;
      }
      context.drawImage(image, 0, 0, size, size);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to decode emblem artwork"));
    };
    image.src = url;
  });
}

async function createEmblemTextures(
  gl: WebGL2RenderingContext,
): Promise<Map<EmblemId, WebGLTexture>> {
  const textures = new Map<EmblemId, WebGLTexture>();

  for (const emblem of EMBLEMS) {
    const markup = emblemSvgMarkup(emblem, {
      fill: "#ffffff",
      stroke: "#ffffff",
      soft: "rgba(255,255,255,0.1)",
      size: 256,
    });
    const bitmap = await loadSvgCanvas(markup, 256);
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Unable to create texture");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bitmap,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures.set(emblem.id, texture);
  }

  return textures;
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

export async function createHomeFieldEngine(
  options: CreateFieldEngineOptions,
): Promise<FieldEngine> {
  const { canvas, dprCap, onReady, onFailure } = options;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL2 is unavailable");
  const context = gl;

  let palette = options.palette;
  let density: FieldDensity = "wide";
  let paused = options.startPaused ?? false;
  let destroyed = false;
  let elapsed = 0;
  let frame = 0;
  let lastTime = 0;
  let ready = false;

  const program = createProgram(gl);
  const vertexArray = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  if (!vertexArray || !vertexBuffer) throw new Error("Unable to create buffers");

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const resolutionLocation = gl.getUniformLocation(program, "uResolution");
  const centerLocation = gl.getUniformLocation(program, "uCenter");
  const sizeLocation = gl.getUniformLocation(program, "uSize");
  const rotationLocation = gl.getUniformLocation(program, "uRotation");
  const textureLocation = gl.getUniformLocation(program, "uTexture");
  const colorLocation = gl.getUniformLocation(program, "uColor");
  const opacityLocation = gl.getUniformLocation(program, "uOpacity");
  if (
    resolutionLocation === null ||
    centerLocation === null ||
    sizeLocation === null ||
    rotationLocation === null ||
    textureLocation === null ||
    colorLocation === null ||
    opacityLocation === null
  ) {
    throw new Error("Unable to find shader uniforms");
  }

  gl.useProgram(program);
  gl.uniform1i(textureLocation, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  const textures = await createEmblemTextures(gl);
  if (destroyed) {
    textures.forEach((texture) => gl.deleteTexture(texture));
    gl.deleteBuffer(vertexBuffer);
    gl.deleteVertexArray(vertexArray);
    gl.deleteProgram(program);
    throw new Error("Field engine was disposed");
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(slots: readonly FieldSlot[], time: number) {
    resize();
    if (!canvas.width || !canvas.height) return;

    context.viewport(0, 0, canvas.width, canvas.height);
    context.clear(context.COLOR_BUFFER_BIT);
    context.useProgram(program);
    context.bindVertexArray(vertexArray);
    context.activeTexture(context.TEXTURE0);

    context.uniform2f(resolutionLocation, canvas.width, canvas.height);

    const ink = parseHex(palette.ink);
    const soft = parseHex(palette.soft);
    const densityScale = DENSITY_SCALE[density];

    for (const slot of slots) {
      const texture = textures.get(slot.emblemId);
      if (!texture) continue;
      const position = resolveFieldSlot(slot, time);
      const size = slot.size * densityScale * (0.94 + slot.depth * 0.12);
      const color = slot.depth >= 0.55 ? ink : soft;
      const opacity = Math.min(1, slot.opacity * (0.9 + slot.depth * 0.1));

      context.bindTexture(context.TEXTURE_2D, texture);
      context.uniform2f(
        centerLocation,
        (position.x / 100) * canvas.width,
        (position.y / 100) * canvas.height,
      );
      context.uniform2f(sizeLocation, size, size);
      context.uniform1f(rotationLocation, position.rotation);
      context.uniform4f(colorLocation, color[0], color[1], color[2], 1);
      context.uniform1f(opacityLocation, opacity);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    }
  }

  function drawCurrentFrame() {
    draw(HOME_FIELD_SLOTS_BY_DENSITY[density], elapsed);
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
    const arrivalBoost = 1 + 1.6 * Math.exp(-elapsed / 1.15);
    elapsed += delta * arrivalBoost;
    drawCurrentFrame();
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
    resize();
    if (paused && ready) drawCurrentFrame();
  });
  resizeObserver.observe(canvas);
  canvas.addEventListener("webglcontextlost", handleContextLost);

  resize();
  drawCurrentFrame();
  ready = true;
  onReady();
  if (!paused) start();

  return {
    setDensity(nextDensity) {
      if (nextDensity === density) return;
      density = nextDensity;
      if (paused && ready) drawCurrentFrame();
    },
    setPaused(nextPaused) {
      if (nextPaused === paused) return;
      paused = nextPaused;
      if (paused) {
        stop();
      } else {
        start();
      }
    },
    setPalette(nextPalette) {
      palette = nextPalette;
      if (paused && ready) drawCurrentFrame();
    },
    destroy() {
      destroyed = true;
      ready = false;
      stop();
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      textures.forEach((texture) => gl.deleteTexture(texture));
      gl.deleteBuffer(vertexBuffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    },
  };
}
