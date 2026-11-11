import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    Color,
    DoubleSide,
    Mesh,
    NormalBlending,
    OrthographicCamera,
    PerspectiveCamera,
    PlaneGeometry,
    Points,
    Scene,
    ShaderMaterial,
    Vector3,
    WebGLRenderer,
} from "three";
import {
    INTRO_CAMERA,
    INTRO_CARD_NODES,
    INTRO_COPY_ANCHORS,
    INTRO_MAX_PROGRESS,
    introAnchorForViewport,
    introMomentAt,
} from "./scene-config";
import { introPalettes, type IntroPalette } from "./palettes";
import { starPathAt, type StarPathSample } from "./star-path";

const CARD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CARD_FRAGMENT = `
uniform vec3 uColor;
uniform vec3 uBorder;
uniform float uOpacity;
uniform float uRadius;
uniform float uAspect;
varying vec2 vUv;

float roundedBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = roundedBox(p, vec2(uAspect, 1.0) * 0.5, uRadius);
  float fill = 1.0 - smoothstep(-0.004, 0.006, d);
  float edge = 1.0 - smoothstep(0.0, 0.018, abs(d));
  vec3 color = mix(uColor, uBorder, edge);
  float alpha = fill * uOpacity;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const STAR_VERTEX = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uPixelRatio;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float distanceToCamera = -mv.z;
  float nearFade = smoothstep(0.6, 3.2, distanceToCamera);
  float farFade = 1.0 - smoothstep(56.0, 92.0, distanceToCamera);
  vAlpha = aAlpha * nearFade * farFade;
  gl_PointSize = aSize * uPixelRatio * clamp(26.0 / max(distanceToCamera, 1.0), 0.26, 5.2);
  gl_Position = projectionMatrix * mv;
}
`;

const STAR_FRAGMENT = `
varying float vAlpha;
uniform vec3 uColor;
void main() {
  vec2 point = gl_PointCoord - 0.5;
  float alpha = smoothstep(0.5, 0.08, length(point));
  gl_FragColor = vec4(uColor, alpha * vAlpha);
}
`;

const TRAIL_VERTEX = `
attribute float aAlpha;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}
`;

const HEAD_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HEAD_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = abs((vUv - 0.5) * 2.0);
  vec2 starP = p * 2.5;
  float astroid = pow(starP.x, 0.66) + pow(starP.y, 0.66);
  float star = 1.0 - smoothstep(0.96, 1.02, astroid);
  float glow = (1.0 - smoothstep(0.0, 1.08, length(p))) * 0.28;
  float alpha = max(star, glow);
  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}
`;

const BACKGROUND_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BACKGROUND_FRAGMENT = `
uniform vec3 uBase;
uniform vec3 uFieldA;
uniform vec3 uFieldB;
uniform float uLightMix;
uniform float uTime;
uniform float uVelocity;
varying vec2 vUv;

float field(vec2 uv, vec2 center, float radius) {
  return smoothstep(radius, 0.0, distance(uv, center));
}

void main() {
  vec2 centerA = vec2(0.26 + 0.06 * sin(uTime * 0.11), 0.38 + 0.05 * cos(uTime * 0.13));
  vec2 centerB = vec2(0.77 + 0.05 * cos(uTime * 0.09), 0.67 + 0.06 * sin(uTime * 0.12));
  float a = field(vUv, centerA, 0.72);
  float b = field(vUv, centerB, 0.86);
  vec3 additive = uBase + uFieldA * a * 0.82 + uFieldB * b * 0.7;
  vec3 mixed = mix(uBase, uFieldA, a * 0.82);
  mixed = mix(mixed, uFieldB, b * 0.58);
  vec3 color = mix(additive, mixed, uLightMix);
  color += clamp(uVelocity, 0.0, 1.0) * (a + b) * 0.035;
  color = clamp(color, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`;

interface Plate {
    mesh: Mesh<PlaneGeometry, ShaderMaterial>;
    nodeId: string;
    moment: number;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
}

interface TrailPoint {
    position: Vector3;
}

interface IntroSceneOptions {
    root: HTMLElement;
    canvas: HTMLCanvasElement;
    dark: boolean;
    onUnavailable(): void;
    onActiveMoment(moment: number): void;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp((value - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
}

function hexToColor(hex: string): Color {
    return new Color(hex);
}

function paletteBlend(
    palettes: readonly IntroPalette[],
    progress: number
): {
    base: Color;
    fieldA: Color;
    fieldB: Color;
    ink: Color;
    accent: Color;
    line: Color;
    card: Color;
    border: Color;
} {
    const clamped = clamp(progress, 0, INTRO_MAX_PROGRESS);
    const lower = Math.floor(clamped);
    const upper = Math.min(lower + 1, INTRO_MAX_PROGRESS);
    const t = clamped - lower;
    const a = palettes[lower] ?? palettes[0]!;
    const b = palettes[upper] ?? a;
    const mix = (key: keyof IntroPalette) =>
        hexToColor(a[key]).lerp(hexToColor(b[key]), t);
    return {
        base: mix("base"),
        fieldA: mix("fieldA"),
        fieldB: mix("fieldB"),
        ink: mix("ink"),
        accent: mix("accent"),
        line: mix("line"),
        card: mix("card"),
        border: mix("border"),
    };
}

function seededRandom(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

function makeStars(count: number): {
    geometry: BufferGeometry;
    material: ShaderMaterial;
} {
    const random = seededRandom(0x5ab4a);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
        positions[index * 3] = (random() - 0.5) * 58;
        positions[index * 3 + 1] = (random() - 0.5) * 40;
        positions[index * 3 + 2] = 28 - random() * 126;
        const depth = random();
        sizes[index] = 0.9 + depth * 2.1;
        alphas[index] = 0.32 + depth * 0.53;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new BufferAttribute(alphas, 1));

    const material = new ShaderMaterial({
        uniforms: {
            uPixelRatio: { value: 1 },
            uColor: { value: new Color("#e9ddff") },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
    });

    return { geometry, material };
}

export class IntroSceneRenderer {
    private readonly root: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(
        INTRO_CAMERA.fov,
        1,
        INTRO_CAMERA.near,
        INTRO_CAMERA.far
    );
    private readonly backgroundScene = new Scene();
    private readonly backgroundCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly backgroundMaterial: ShaderMaterial;
    private readonly plates: Plate[] = [];
    private readonly starMaterial: ShaderMaterial;
    private readonly starGeometry: BufferGeometry;
    private readonly starPoints: Points<BufferGeometry, ShaderMaterial>;
    private readonly trailMesh: Mesh<BufferGeometry, ShaderMaterial>;
    private readonly trailGeometry: BufferGeometry;
    private readonly trailPosition: BufferAttribute;
    private readonly trailAlpha: BufferAttribute;
    private readonly trailMaterial: ShaderMaterial;
    private readonly trailHeadMesh: Mesh<PlaneGeometry, ShaderMaterial>;
    private readonly trailHistory: TrailPoint[] = [];
    private readonly domNodes = new Map<string, HTMLElement>();
    private readonly dark: boolean;
    private readonly onActiveMoment: (moment: number) => void;
    private readonly onUnavailable: () => void;
    private width = 1;
    private height = 1;
    private readDistance: number = INTRO_CAMERA.desktopReadDistance;
    private compact = false;
    private activeMoment = 0;
    private progress = 0;
    private velocity = 0;
    private pointerX = 0;
    private pointerY = 0;
    private lastDirection = 0;
    private trailPresence = 0;
    private disposed = false;
    private trailIndexCount = 0;
    private readonly palette: readonly IntroPalette[];

    constructor(options: IntroSceneOptions) {
        this.root = options.root;
        this.canvas = options.canvas;
        this.dark = options.dark;
        this.onActiveMoment = options.onActiveMoment;
        this.onUnavailable = options.onUnavailable;
        this.palette = introPalettes(options.dark);

        this.renderer = new WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            powerPreference: "high-performance",
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = false;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        this.backgroundMaterial = new ShaderMaterial({
            uniforms: {
                uBase: { value: new Color() },
                uFieldA: { value: new Color() },
                uFieldB: { value: new Color() },
                uLightMix: { value: this.dark ? 0 : 1 },
                uTime: { value: 0 },
                uVelocity: { value: 0 },
            },
            vertexShader: BACKGROUND_VERTEX,
            fragmentShader: BACKGROUND_FRAGMENT,
            depthTest: false,
            depthWrite: false,
        });
        const background = new Mesh(
            new PlaneGeometry(2, 2),
            this.backgroundMaterial
        );
        this.backgroundScene.add(background);

        const starData = makeStars(1800);
        this.starGeometry = starData.geometry;
        this.starMaterial = starData.material;
        this.starMaterial.blending = this.dark
            ? AdditiveBlending
            : NormalBlending;
        this.starMaterial.needsUpdate = true;
        this.starPoints = new Points(this.starGeometry, this.starMaterial);
        this.starPoints.renderOrder = 0;
        this.scene.add(this.starPoints);

        for (const node of INTRO_CARD_NODES) {
            if (node.kind === "qualifier") continue;
            const material = new ShaderMaterial({
                uniforms: {
                    uColor: { value: new Color() },
                    uBorder: { value: new Color() },
                    uOpacity: { value: 0 },
                    uRadius: { value: 0.055 },
                    uAspect: { value: 1 },
                },
                vertexShader: CARD_VERTEX,
                fragmentShader: CARD_FRAGMENT,
                transparent: true,
                depthWrite: false,
                side: DoubleSide,
            });
            const mesh = new Mesh(new PlaneGeometry(1, 1), material);
            mesh.renderOrder = 2;
            this.scene.add(mesh);
            this.plates.push({
                mesh,
                nodeId: node.id,
                moment: node.moment,
                x: 0,
                y: 0,
                z: 0,
                width: 1,
                height: 1,
            });
        }

        this.trailGeometry = new BufferGeometry();
        this.trailPosition = new BufferAttribute(
            new Float32Array(120 * 2 * 3),
            3
        );
        this.trailAlpha = new BufferAttribute(new Float32Array(120 * 2), 1);
        this.trailPosition.setUsage(35048);
        this.trailAlpha.setUsage(35048);
        this.trailGeometry.setAttribute("position", this.trailPosition);
        this.trailGeometry.setAttribute("aAlpha", this.trailAlpha);
        this.trailGeometry.setIndex([]);
        this.trailMaterial = new ShaderMaterial({
            uniforms: {
                uColor: { value: new Color() },
                uOpacity: { value: 0.72 },
            },
            vertexShader: TRAIL_VERTEX,
            fragmentShader: TRAIL_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: this.dark ? AdditiveBlending : NormalBlending,
            side: DoubleSide,
        });
        this.trailMesh = new Mesh(this.trailGeometry, this.trailMaterial);
        this.trailMesh.renderOrder = 1;
        this.trailMesh.frustumCulled = false;
        this.scene.add(this.trailMesh);

        const headGeometry = new PlaneGeometry(0.44, 0.44);
        const headMaterial = new ShaderMaterial({
            uniforms: {
                uColor: { value: new Color("#ffffff") },
                uOpacity: { value: 0.95 },
            },
            vertexShader: HEAD_VERTEX,
            fragmentShader: HEAD_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: this.dark ? AdditiveBlending : NormalBlending,
            side: DoubleSide,
        });
        this.trailHeadMesh = new Mesh(headGeometry, headMaterial);
        this.trailHeadMesh.renderOrder = 1;
        this.trailHeadMesh.frustumCulled = false;
        this.scene.add(this.trailHeadMesh);

        this.collectDomNodes();
        this.resize();
        this.seedTrail(0);
        this.render();
    }

    setProgress(progress: number, velocity: number): void {
        const clamped = clamp(progress, 0, INTRO_MAX_PROGRESS);
        this.progress = clamped;
        this.velocity = velocity;
        const moment = introMomentAt(clamped);
        if (moment !== this.activeMoment) {
            this.activeMoment = moment;
            this.onActiveMoment(moment);
        }
        this.updateTrail(clamped);
        this.render();
    }

    reset(): void {
        this.progress = 0;
        this.velocity = 0;
        this.lastDirection = 0;
        this.trailPresence = 0;
        this.activeMoment = 0;
        this.seedTrail(0);
        this.onActiveMoment(0);
        this.render();
    }

    setPointer(x: number, y: number): void {
        this.pointerX = clamp(x, -1, 1);
        this.pointerY = clamp(y, -1, 1);
        this.render();
    }

    resize(): void {
        const bounds = this.root.getBoundingClientRect();
        this.width = Math.max(1, bounds.width || window.innerWidth);
        this.height = Math.max(1, bounds.height || window.innerHeight);
        this.compact = this.width < 720;
        this.readDistance = this.compact
            ? INTRO_CAMERA.mobileReadDistance
            : INTRO_CAMERA.desktopReadDistance;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height, false);
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, 2)
        );
        this.starMaterial.uniforms.uPixelRatio!.value = Math.min(
            window.devicePixelRatio || 1,
            2
        );
        this.layoutPlates();
        this.render();
    }

    dispose(): void {
        this.disposed = true;
        this.trailGeometry.dispose();
        this.trailMaterial.dispose();
        this.starGeometry.dispose();
        this.starMaterial.dispose();
        this.backgroundMaterial.dispose();
        for (const plate of this.plates) {
            plate.mesh.geometry.dispose();
            plate.mesh.material.dispose();
        }
        this.trailHeadMesh.geometry.dispose();
        this.trailHeadMesh.material.dispose();
        this.renderer.dispose();
    }

    private collectDomNodes(): void {
        this.domNodes.clear();
        for (const element of this.root.querySelectorAll<HTMLElement>(
            "[data-intro-node]"
        )) {
            const id = element.dataset.introNode;
            if (id) this.domNodes.set(id, element);
        }
    }

    private layoutPlates(): void {
        for (const plate of this.plates) {
            const node = INTRO_CARD_NODES.find(
                (candidate) => candidate.id === plate.nodeId
            );
            if (!node) continue;
            const anchor = introAnchorForViewport(node, this.compact);
            plate.x = anchor.x;
            plate.y = anchor.y;
            plate.z = -node.moment * INTRO_CAMERA.stopGap + anchor.z;
            plate.width = anchor.width;
            plate.height = node.height;
            plate.mesh.position.set(plate.x, plate.y, plate.z);
            plate.mesh.scale.set(plate.width, plate.height, 1);
            plate.mesh.material.uniforms.uAspect!.value =
                plate.width / plate.height;
            plate.mesh.material.uniforms.uRadius!.value = this.compact
                ? 0.06
                : 0.045;
        }
    }

    private render(): void {
        if (this.disposed) return;
        const cameraZ = -this.progress * INTRO_CAMERA.stopGap + this.readDistance;
        this.camera.position.set(
            this.pointerX * 0.16,
            this.pointerY * 0.1,
            cameraZ
        );
        this.camera.lookAt(0, 0, -this.progress * INTRO_CAMERA.stopGap);
        this.camera.updateMatrixWorld();

        const blended = paletteBlend(this.palette, this.progress);
        this.backgroundMaterial.uniforms.uBase!.value.copy(blended.base);
        this.backgroundMaterial.uniforms.uFieldA!.value.copy(blended.fieldA);
        this.backgroundMaterial.uniforms.uFieldB!.value.copy(blended.fieldB);
        this.backgroundMaterial.uniforms.uTime!.value =
            performance.now() * 0.001;
        this.backgroundMaterial.uniforms.uVelocity!.value = Math.abs(
            this.velocity
        );
        this.starMaterial.uniforms.uColor!.value.copy(blended.line).lerp(
            blended.ink,
            0.45
        );

        this.applyCssEnvironment(blended);
        this.updateProjection(blended);
        this.updateTrailMesh(blended);
        this.updatePlates(blended);

        this.renderer.clear();
        this.renderer.render(this.backgroundScene, this.backgroundCamera);
        this.renderer.clearDepth();
        this.renderer.render(this.scene, this.camera);
    }

    private applyCssEnvironment(blended: ReturnType<typeof paletteBlend>): void {
        const style = (this.root.parentElement ?? this.root).style;
        style.setProperty("--intro-base", `#${blended.base.getHexString()}`);
        style.setProperty("--intro-ink", `#${blended.ink.getHexString()}`);
        style.setProperty("--intro-accent", `#${blended.accent.getHexString()}`);
        style.setProperty("--intro-line", `#${blended.line.getHexString()}`);
        style.setProperty(
            "--intro-card",
            `rgba(${Math.round(blended.card.r * 255)}, ${Math.round(
                blended.card.g * 255
            )}, ${Math.round(blended.card.b * 255)}, 0.72)`
        );
        style.setProperty(
            "--intro-border",
            `rgba(${Math.round(blended.border.r * 255)}, ${Math.round(
                blended.border.g * 255
            )}, ${Math.round(blended.border.b * 255)}, 0.32)`
        );
        style.setProperty(
            "--intro-muted",
            `rgba(${Math.round(blended.ink.r * 255)}, ${Math.round(
                blended.ink.g * 255
            )}, ${Math.round(blended.ink.b * 255)}, 0.68)`
        );
    }

    private worldToPixels(worldWidth: number, distance: number): number {
        const heightAtDistance =
            2 * Math.tan((INTRO_CAMERA.fov * Math.PI) / 360) * distance;
        return (worldWidth / heightAtDistance) * this.height;
    }

    private updateProjection(blended: ReturnType<typeof paletteBlend>): void {
        const vector = new Vector3();
        const active = introMomentAt(this.progress);
        for (const [id, element] of this.domNodes) {
            const copyIndex = id.startsWith("copy-")
                ? Number(id.slice(5))
                : -1;
            const card = copyIndex < 0
                ? INTRO_CARD_NODES.find((node) => node.id === id)
                : undefined;
            const anchor = copyIndex >= 0
                ? introAnchorForViewport(INTRO_COPY_ANCHORS[copyIndex]!, this.compact)
                : card
                  ? introAnchorForViewport(card, this.compact)
                  : undefined;
            if (!anchor) continue;
            const moment = copyIndex >= 0 ? copyIndex : card!.moment;
            const z = -moment * INTRO_CAMERA.stopGap + anchor.z;
            vector.set(anchor.x, anchor.y, z).project(this.camera);
            const visible =
                vector.z > -1 &&
                vector.z < 1 &&
                moment === active;
            const screenX = (vector.x * 0.5 + 0.5) * this.width;
            const screenY = (-vector.y * 0.5 + 0.5) * this.height;
            const distance = Math.max(
                0.1,
                this.camera.position.z - z
            );
            const width = clamp(
                this.worldToPixels(anchor.width, distance),
                this.compact ? 220 : 280,
                this.compact ? this.width - 20 : 960
            );
            const nearFade = smoothstep(3.4, 5.4, distance);
            const farFade = 1 - smoothstep(13.5, 16.5, distance);
            const opacity = visible ? nearFade * farFade : 0;
            element.style.width = `${width}px`;
            if (card && !this.compact) {
                element.style.height = `${this.worldToPixels(
                    card.height,
                    distance
                )}px`;
            } else {
                element.style.height = "";
            }
            element.style.opacity = String(opacity);
            element.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%)`;
            element.dataset.introActive =
                moment === active && opacity > 0.2 ? "true" : "false";
        }
        void blended;
    }

    private updatePlates(blended: ReturnType<typeof paletteBlend>): void {
        for (const plate of this.plates) {
            plate.mesh.material.uniforms.uColor!.value.copy(blended.card);
            plate.mesh.material.uniforms.uBorder!.value.copy(blended.border);
            plate.mesh.material.uniforms.uOpacity!.value = 0;
        }
    }

    /**
     * Places a normalised route sample in the world for the camera position at
     * `progress`. Because the sample is measured in screen space, the star
     * keeps the drawn route at any aspect ratio while `depth` still moves it
     * towards and away from the camera.
     */
    private starSamplePoint(
        sample: StarPathSample,
        progress: number
    ): Vector3 {
        const cameraZ =
            -clamp(progress, 0, INTRO_MAX_PROGRESS) * INTRO_CAMERA.stopGap +
            this.readDistance;
        const halfHeight =
            Math.tan((INTRO_CAMERA.fov * Math.PI) / 360) * sample.depth;
        const halfWidth = halfHeight * (this.width / this.height);
        return new Vector3(
            (sample.u - 0.5) * 2 * halfWidth,
            (0.5 - sample.v) * 2 * halfHeight,
            cameraZ - sample.depth
        );
    }

    private starPoint(progress: number): Vector3 {
        return this.starSamplePoint(starPathAt(progress), progress);
    }

    private seedTrail(progress: number): void {
        this.trailHistory.length = 0;
        const head = this.starPoint(progress);
        const tangent = head
            .clone()
            .sub(this.starPoint(Math.max(0, progress - 0.008)));
        if (tangent.lengthSq() < 1e-6) {
            tangent
                .copy(head)
                .sub(
                    this.starPoint(
                        Math.min(INTRO_MAX_PROGRESS, progress + 0.008)
                    )
                );
        }
        if (tangent.lengthSq() < 1e-6) tangent.set(0, 1, 0);
        tangent.normalize();
        for (let index = 11; index >= 0; index -= 1) {
            const point = head
                .clone()
                .addScaledVector(tangent, -index * 0.05);
            point.z += index * 0.03;
            this.trailHistory.push({ position: point });
        }
    }

    private updateTrail(progress: number): void {
        const direction = Math.sign(this.velocity);
        if (
            direction !== 0 &&
            this.lastDirection !== 0 &&
            direction !== this.lastDirection
        ) {
            this.seedTrail(progress);
            this.trailPresence = 0;
        }
        if (direction !== 0) this.lastDirection = direction;
        const cameraZ =
            -progress * INTRO_CAMERA.stopGap + this.readDistance;
        while (
            this.trailHistory.length > 2 &&
            this.trailHistory[0]!.position.z > cameraZ - 3
        ) {
            this.trailHistory.shift();
        }
        const head = this.starPoint(progress);
        const previous = this.trailHistory[this.trailHistory.length - 1];
        if (!previous || previous.position.distanceTo(head) > 0.015) {
            this.trailHistory.push({ position: head });
            if (this.trailHistory.length > 120) this.trailHistory.shift();
        }
        this.trailPresence = Math.min(1, this.trailPresence + 0.08);
    }

    private updateTrailMesh(blended: ReturnType<typeof paletteBlend>): void {
        const points = this.trailHistory;
        const count = points.length;
        if (count < 3) {
            this.trailMesh.visible = false;
            this.trailHeadMesh.visible = false;
            return;
        }
        this.trailMesh.visible = true;
        this.trailHeadMesh.visible = true;
        const positions = this.trailPosition.array as Float32Array;
        const alphas = this.trailAlpha.array as Float32Array;
        const indices: number[] = [];
        for (let index = 0; index < count; index += 1) {
            const point = points[index]!.position;
            const next = points[Math.min(index + 1, count - 1)]!.position;
            const previous = points[Math.max(index - 1, 0)]!.position;
            const direction = new Vector3().subVectors(next, previous);
            direction.z = 0;
            if (direction.lengthSq() < 1e-5) direction.set(0, 1, 0);
            direction.normalize();
            const t = index / (count - 1);
            const width = 0.004 + Math.pow(t, 1.5) * 0.05;
            const side = new Vector3(-direction.y, direction.x, 0);
            if (side.lengthSq() < 1e-5) side.set(0, 1, 0);
            side.normalize();
            const offset = side.multiplyScalar(width * 0.5);
            const base = index * 2;
            positions[base * 3] = point.x + offset.x;
            positions[base * 3 + 1] = point.y + offset.y;
            positions[base * 3 + 2] = point.z + offset.z;
            positions[(base + 1) * 3] = point.x - offset.x;
            positions[(base + 1) * 3 + 1] = point.y - offset.y;
            positions[(base + 1) * 3 + 2] = point.z - offset.z;
            const edgeFade =
                smoothstep(0, 0.14, t) *
                (1 - smoothstep(0.82, 1, t)) *
                this.trailPresence;
            alphas[base] = edgeFade;
            alphas[base + 1] = edgeFade;
            if (index < count - 1) {
                const nextBase = (index + 1) * 2;
                indices.push(
                    base,
                    base + 1,
                    nextBase,
                    base + 1,
                    nextBase + 1,
                    nextBase
                );
            }
        }
        this.trailPosition.needsUpdate = true;
        this.trailAlpha.needsUpdate = true;
        this.trailGeometry.setIndex(indices);
        this.trailGeometry.setDrawRange(0, indices.length);
        this.trailMaterial.uniforms.uColor!.value.copy(blended.line);
        this.trailMaterial.uniforms.uOpacity!.value = 0.7;
        this.trailHeadMesh.position.copy(points[count - 1]!.position);
        this.trailHeadMesh.quaternion.copy(this.camera.quaternion);
        this.trailHeadMesh.material.uniforms.uColor!.value.copy(blended.line);
        this.trailHeadMesh.material.uniforms.uOpacity!.value = 0.95;
    }
}
