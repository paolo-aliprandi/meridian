import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import tzlookup from "tz-lookup";
import { canonicalZone, solarPosition } from "./time";

type Coordinate = [number, number];
type Feature = {
  properties: { tzid: string };
  geometry:
    | { type: "Polygon"; coordinates: Coordinate[][] }
    | { type: "MultiPolygon"; coordinates: Coordinate[][][] };
};
type Geography = { features: Feature[] };
export type HoverZone = { zone: string; x: number; y: number } | null;
type Props = {
  instant: Date;
  selectedZone: string;
  boundaries: boolean;
  rotating: boolean;
  focus: { lat: number; lon: number; key: number } | null;
  onHover: (hover: HoverZone) => void;
  onSelect: (zone: string) => void;
};

function vector(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.cos(theta),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(theta),
  );
}

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D selectionMap;
  uniform vec3 sunDirection;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(vNormal);
    float sunlight = dot(n, sunDirection);
    float day = smoothstep(-0.15, 0.2, sunlight);
    vec3 textureDay = texture2D(dayMap, vUv).rgb;
    vec3 textureNight = texture2D(nightMap, vUv).rgb;
    vec3 daylight = textureDay * (0.32 + 0.75 * max(sunlight, 0.0));
    vec3 night = textureDay * vec3(0.038, 0.06, 0.095) + textureNight * vec3(1.0, 0.8, 0.48) * 1.5;
    vec3 color = mix(night, daylight, day);
    float selected = texture2D(selectionMap, vUv).r;
    color = mix(color, vec3(0.60, 0.87, 0.43), selected * 0.29);
    float fresnel = pow(1.0 - max(dot(n, normalize(cameraPosition - vWorld)), 0.0), 3.5);
    color += vec3(0.14, 0.37, 0.55) * fresnel * (0.2 + day * 0.55);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export default function Globe(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const api = useRef<{
    focus: (lat: number, lon: number) => void;
    reset: () => void;
  } | null>(null);
  const [status, setStatus] = useState("Loading our little blue planet");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    current.current = props;
  });
  useEffect(() => {
    if (props.focus) api.current?.focus(props.focus.lat, props.focus.lon);
  }, [props.focus]);

  useEffect(() => {
    const container = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      console.error("WebGL initialization failed", error);
      setFailed(true);
      setStatus(
        "The globe needs WebGL. Enable hardware acceleration or try a different browser. Time conversion still works.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive Earth. Drag to rotate, scroll to zoom, and tap a time zone to select it.",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.copy(vector(23, 24, 3.55));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 2.45;
    controls.maxDistance = 5.2;
    controls.autoRotateSpeed = 0.28;
    controls.rotateSpeed = 0.6;
    controls.enableZoom = true;

    const selectionCanvas = document.createElement("canvas");
    selectionCanvas.width = 2048;
    selectionCanvas.height = 1024;
    const context = selectionCanvas.getContext("2d")!;
    const selectionTexture = new THREE.CanvasTexture(selectionCanvas);
    const loader = new THREE.TextureLoader();
    let disposed = false;
    const textures: THREE.Texture[] = [selectionTexture];
    let loaded = 0;
    const loadTexture = (name: string) => {
      const texture = loader.load(
        `${import.meta.env.BASE_URL}${name}`,
        () => {
          loaded++;
          if (loaded === 2 && !disposed) setStatus("");
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error(`Earth texture failed: ${name}`, error);
          setStatus(
            "Earth imagery could not load. Check your connection and reload.",
          );
        },
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        8,
      );
      textures.push(texture);
      return texture;
    };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dayMap: { value: loadTexture("earth-day.jpg") },
        nightMap: { value: loadTexture("earth-night.png") },
        selectionMap: { value: selectionTexture },
        sunDirection: { value: new THREE.Vector3() },
      },
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
    scene.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vWorld;
          void main() {
            float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld))), 4.0);
            gl_FragColor = vec4(0.23, 0.54, 0.83, edge * 0.24);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(atmosphere);
    const linesGroup = new THREE.Group();
    scene.add(linesGroup);
    const graticulePositions: number[] = [];
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -90; lat < 90; lat += 2) {
        graticulePositions.push(
          ...vector(lat, lon, 1.002).toArray(),
          ...vector(lat + 2, lon, 1.002).toArray(),
        );
      }
    }
    for (const lat of [-60, -30, 0, 30, 60]) {
      for (let lon = -180; lon < 180; lon += 2) {
        graticulePositions.push(
          ...vector(lat, lon, 1.002).toArray(),
          ...vector(lat, lon + 2, 1.002).toArray(),
        );
      }
    }
    const graticule = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute(graticulePositions, 3),
      ),
      new THREE.LineBasicMaterial({
        color: 0xb5c9d5,
        transparent: true,
        opacity: 0.095,
      }),
    );
    linesGroup.add(graticule);
    let geography: Geography | null = null;
    const featuresByZone = new Map<string, Feature>();
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}timezones.geojson`, {
      signal: abort.signal,
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Timezone boundaries: HTTP ${response.status}`);
        return response.json() as Promise<Geography>;
      })
      .then((data) => {
        if (disposed) return;
        geography = data;
        for (const feature of data.features) {
          featuresByZone.set(canonicalZone(feature.properties.tzid), feature);
        }
        const positions: number[] = [];
        for (const feature of data.features) {
          const polygons =
            feature.geometry.type === "Polygon"
              ? [feature.geometry.coordinates]
              : feature.geometry.coordinates;
          for (const polygon of polygons) {
            for (const ring of polygon) {
              for (let i = 1; i < ring.length; i++) {
                const [lon1, lat1] = ring[i - 1];
                const [lon2, lat2] = ring[i];
                const steps = Math.max(
                  1,
                  Math.ceil(
                    Math.max(Math.abs(lat2 - lat1), Math.abs(lon2 - lon1)) / 2,
                  ),
                );
                for (let j = 0; j < steps; j++) {
                  positions.push(
                    ...vector(
                      lat1 + ((lat2 - lat1) * j) / steps,
                      lon1 + ((lon2 - lon1) * j) / steps,
                      1.004,
                    ).toArray(),
                    ...vector(
                      lat1 + ((lat2 - lat1) * (j + 1)) / steps,
                      lon1 + ((lon2 - lon1) * (j + 1)) / steps,
                      1.004,
                    ).toArray(),
                  );
                }
              }
            }
          }
        }
        linesGroup.add(
          new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute(
              "position",
              new THREE.Float32BufferAttribute(positions, 3),
            ),
            new THREE.LineBasicMaterial({
              color: 0xc5f78b,
              transparent: true,
              opacity: 0.25,
            }),
          ),
        );
      })
      .catch((error: unknown) => {
        if (
          disposed ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        console.error("Timezone geography failed", error);
        setStatus(
          "Zone outlines could not load. Hover and time conversion are still available.",
        );
      });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hover: string | null = null;
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let downTime = 0;
    let lastInteraction = performance.now();
    let target: THREE.Vector3 | null = null;
    let selectionKey = "";
    let solarKey = "";
    let frame = 0;
    let pageVisible = !document.hidden;
    let viewportVisible = true;
    const locate = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(earth)[0];
      if (!hit) return null;
      const point = hit.point.clone().normalize();
      const lat =
        (Math.asin(THREE.MathUtils.clamp(point.y, -1, 1)) * 180) / Math.PI;
      const lon = (Math.atan2(-point.z, point.x) * 180) / Math.PI;
      return tzlookup(lat, lon);
    };
    const onDown = (event: PointerEvent) => {
      dragging = true;
      downX = event.clientX;
      downY = event.clientY;
      downTime = performance.now();
      lastInteraction = performance.now();
      target = null;
      hover = null;
      current.current.onHover(null);
    };
    const onMove = (event: PointerEvent) => {
      if (dragging || event.pointerType === "touch") return;
      hover = locate(event);
      renderer.domElement.style.cursor = hover ? "grab" : "default";
      current.current.onHover(
        hover ? { zone: hover, x: event.clientX, y: event.clientY } : null,
      );
    };
    const onUp = (event: PointerEvent) => {
      if (
        dragging &&
        Math.hypot(event.clientX - downX, event.clientY - downY) < 6 &&
        performance.now() - downTime < 700
      ) {
        const zone = locate(event);
        if (zone) current.current.onSelect(zone);
      }
      dragging = false;
      lastInteraction = performance.now();
    };
    const onLeave = () => {
      hover = null;
      current.current.onHover(null);
    };
    const onWheel = () => {
      target = null;
      lastInteraction = performance.now();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true });

    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const intersection = new IntersectionObserver(([entry]) => {
      viewportVisible = entry.isIntersecting;
    });
    intersection.observe(container);
    const onVisibility = () => {
      pageVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    api.current = {
      focus: (lat, lon) => {
        target = vector(lat, lon, 3.55);
        lastInteraction = performance.now();
      },
      reset: () => {
        target = vector(23, 24, 3.55);
      },
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function animate() {
      frame = requestAnimationFrame(animate);
      if (!pageVisible || !viewportVisible) return;
      const state = current.current;
      const timeKey = `${Math.floor(state.instant.getTime() / 60_000)}`;
      if (solarKey !== timeKey) {
        solarKey = timeKey;
        const sun = solarPosition(state.instant);
        material.uniforms.sunDirection.value.copy(
          vector(sun.latitude, sun.longitude),
        );
      }
      const selected = hover ?? state.selectedZone;
      if (geography && selectionKey !== selected) {
        selectionKey = selected;
        context.clearRect(0, 0, 2048, 1024);
        context.fillStyle = "white";
        const feature = featuresByZone.get(canonicalZone(selected));
        if (feature) {
          const polygons =
            feature.geometry.type === "Polygon"
              ? [feature.geometry.coordinates]
              : feature.geometry.coordinates;
          for (const polygon of polygons) {
            context.beginPath();
            for (const ring of polygon) {
              ring.forEach(([lon, lat], index) => {
                const x = ((lon + 180) / 360) * 2048;
                const y = ((90 - lat) / 180) * 1024;
                if (!index) context.moveTo(x, y);
                else context.lineTo(x, y);
              });
              context.closePath();
            }
            context.fill("evenodd");
          }
        }
        selectionTexture.needsUpdate = true;
      }
      linesGroup.visible = state.boundaries;
      controls.autoRotate =
        state.rotating &&
        !reducedMotion.matches &&
        !hover &&
        !dragging &&
        !target &&
        performance.now() - lastInteraction > 4000;
      if (target) {
        camera.position.lerp(target, reducedMotion.matches ? 1 : 0.055);
        if (camera.position.distanceTo(target) < 0.002) target = null;
      }
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setFailed(true);
      setStatus(
        "The graphics connection was interrupted. Reload to restore the globe; the time converter is still available.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      controls.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments
        ) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((item: THREE.Material) => item.dispose());
        }
      });
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      container.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  return (
    <div className={`globe-surface ${failed ? "globe-failed" : ""}`}>
      <div className="globe-canvas" ref={mount} />
      {status ? (
        <div className="globe-status" role="status">
          {!failed && <span className="loading-orbit" />}
          {status}
        </div>
      ) : null}
    </div>
  );
}
