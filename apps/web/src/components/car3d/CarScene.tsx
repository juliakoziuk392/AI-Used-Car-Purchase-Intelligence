import { CAR_ZONE_LABELS, type CarZone, type ReportFinding } from '@carintel/shared';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SEVERITY_COLOR, worstSeverity } from '../car/zones';
import { CarModel, type ZoneAnchors } from './CarModel';

CameraControlsImpl.install({ THREE });

/** Команди, якими HTML-оверлей керує камерою. */
export interface SceneCommands {
  rotateBy: (degrees: number) => void;
  zoom: (step: number) => void;
  reset: () => void;
  focus: (zone: CarZone) => void;
}

export interface CarSceneProps {
  paint: string;
  findings: ReportFinding[];
  selectedZone: CarZone | null;
  onSelectZone: (zone: CarZone | null) => void;
  scanning: boolean;
  commands: MutableRefObject<SceneCommands | null>;
}

type HotspotElements = Map<CarZone, HTMLDivElement>;

const HOME_DIRECTION = new THREE.Vector3(1, 0.24, 0.9).normalize();
const HOME_TARGET = new THREE.Vector3(0, 0.5, 0);
const HOME_DISTANCE = 8;

/** Початкова позиція камери: на вузьких екранах відходимо далі, щоб авто влазило повністю. */
function homeLookAt(aspect: number) {
  const distance = HOME_DISTANCE * Math.max(1, 1.55 / aspect);
  const eye = HOME_TARGET.clone().addScaledVector(HOME_DIRECTION, distance);
  return [eye.x, eye.y, eye.z, HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z] as const;
}
const AUTO_ROTATE_SPEED = 0.12;
const IDLE_BEFORE_AUTO_ROTATE_MS = 5000;
const STAGE_RADIUS = 4.3;

export default function CarScene(props: CarSceneProps) {
  const [ready, setReady] = useState(false);
  const hotspots = useRef<HotspotElements>(new Map());
  const zones = useMemo(() => groupByZone(props.findings), [props.findings]);

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [9, 2.6, 8], fov: 30 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.95;
        }}
      >
        <Suspense fallback={null}>
          <SceneContent {...props} zones={zones} hotspots={hotspots} onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/15 border-t-ice" />
          <span className="text-shimmer text-sm font-medium">Заганяємо авто в шоурум…</span>
        </div>
      )}

      {/* Точки дефектів — звичайний DOM над canvas; сцена щокадру ставить їх у проєкцію деталі. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...zones.entries()].map(([zone, items], index) => (
          <div
            key={zone}
            ref={(element) => {
              if (element) hotspots.current.set(zone, element);
              else hotspots.current.delete(zone);
            }}
            className="absolute left-0 top-0 opacity-0 transition-opacity duration-300"
          >
            <HotspotButton
              zone={zone}
              count={items.length}
              color={SEVERITY_COLOR[worstSeverity(items.map((f) => f.severity))]}
              selected={props.selectedZone === zone}
              delayMs={2300 + index * 160}
              onClick={() => props.onSelectZone(props.selectedZone === zone ? null : zone)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function SceneContent({
  paint,
  zones,
  selectedZone,
  scanning,
  commands,
  hotspots,
  onReady,
}: CarSceneProps & {
  zones: Map<CarZone, ReportFinding[]>;
  hotspots: RefObject<HotspotElements>;
  onReady: () => void;
}) {
  const controls = useRef<CameraControlsImpl | null>(null);
  const car = useRef<THREE.Group>(null);
  const [anchors, setAnchors] = useState<ZoneAnchors>({});
  const lastInteraction = useRef(0);
  const size = useThree((state) => state.size);
  const aspect = useRef(size.width / size.height);
  aspect.current = size.width / size.height;

  const highlightColor = selectedZone
    ? SEVERITY_COLOR[worstSeverity((zones.get(selectedZone) ?? []).map((f) => f.severity))]
    : '#000';

  useEffect(() => {
    onReady();
    // Камера плавно під'їжджає, поки авто заїжджає на сцену.
    const timer = setTimeout(() => void controls.current?.setLookAt(...homeLookAt(aspect.current), true), 400);
    return () => clearTimeout(timer);
  }, [onReady]);

  useEffect(() => {
    const touch = () => (lastInteraction.current = performance.now());
    commands.current = {
      rotateBy: (degrees) => {
        touch();
        void controls.current?.rotate(THREE.MathUtils.degToRad(degrees), 0, true);
      },
      zoom: (step) => {
        touch();
        void controls.current?.dolly(step, true);
      },
      reset: () => void controls.current?.setLookAt(...homeLookAt(aspect.current), true),
      focus: (zone) => {
        const point = anchors[zone];
        if (!point || !controls.current) return;
        touch();
        // Камера стає «зовні» від деталі — з того боку авто, де вона розташована.
        const outward = new THREE.Vector3(point.x, 0, point.z);
        if (outward.lengthSq() < 0.3) outward.set(1, 0, 0.6);
        outward.normalize();
        const eye = point.clone().addScaledVector(outward, 4.2).setY(Math.max(1.4, point.y + 1.1));
        void controls.current.setLookAt(eye.x, eye.y, eye.z, point.x, point.y, point.z, true);
      },
    };
  }, [anchors, commands]);

  useEffect(() => {
    if (selectedZone) commands.current?.focus(selectedZone);
  }, [selectedZone, commands]);

  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }, delta) => {
    // Повільне обертання, поки користувач не чіпає авто.
    const idle = performance.now() - lastInteraction.current > IDLE_BEFORE_AUTO_ROTATE_MS;
    if (controls.current && idle && !selectedZone) controls.current.rotate(delta * AUTO_ROTATE_SPEED, 0, false);

    // Ставимо DOM-точки в екранні координати деталей; ховаємо ті, що на дальньому боці авто.
    const offset = car.current?.position ?? new THREE.Vector3();
    for (const [zone, element] of hotspots.current ?? []) {
      const anchor = anchors[zone];
      if (!anchor) continue;
      projected.copy(anchor).add(offset).project(camera);
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

      let visible = projected.z < 1;
      if (Math.hypot(anchor.x, anchor.z) > 0.9) {
        const toPoint = new THREE.Vector2(anchor.x, anchor.z).normalize();
        const toCamera = new THREE.Vector2(camera.position.x, camera.position.z).normalize();
        visible &&= toPoint.dot(toCamera) > -0.15;
      }
      const dimmed = selectedZone !== null && selectedZone !== zone;
      element.style.opacity = visible ? (dimmed ? '0.35' : '1') : '0';
      element.style.pointerEvents = visible ? 'auto' : 'none';
    }
  });

  const handleAnchors = useCallback((next: ZoneAnchors) => setAnchors(next), []);

  return (
    <>
      <Controls controlsRef={controls} onStart={() => (lastInteraction.current = performance.now())} />
      <StudioEnvironment />

      <ambientLight intensity={0.2} />
      <spotLight
        position={[0, 9, 2]}
        angle={0.55}
        penumbra={1}
        intensity={70}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-6, 3, -4]} intensity={0.6} color="#bfe3ff" />

      <CarModel
        carRef={car}
        paint={paint}
        highlightZone={selectedZone}
        highlightColor={highlightColor}
        onAnchors={handleAnchors}
      >
        {scanning && <ScanBeam />}
      </CarModel>

      <Stage />
    </>
  );
}

function Controls({
  controlsRef,
  onStart,
}: {
  controlsRef: MutableRefObject<CameraControlsImpl | null>;
  onStart: () => void;
}) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const controls = useMemo(() => new CameraControlsImpl(camera, domElement), [camera, domElement]);

  useEffect(() => {
    controls.minDistance = 4;
    controls.maxDistance = 22;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.truckSpeed = 0;
    controls.smoothTime = 0.6;
    // Колесо миші лишаємо для прокрутки сторінки; наближення — кнопками.
    controls.mouseButtons.wheel = CameraControlsImpl.ACTION.NONE;
    controls.mouseButtons.right = CameraControlsImpl.ACTION.NONE;
    controls.addEventListener('controlstart', onStart);
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener('controlstart', onStart);
      controls.dispose();
    };
  }, [controls, controlsRef, onStart]);

  useFrame((_, delta) => controls.update(delta));
  return null;
}

/** Студійне оточення: дає довгі відблиски софтбоксів на лаку. */
function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;
    scene.environmentIntensity = 0.7;
    return () => {
      scene.environment = null;
      environment.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Поворотний стіл: дзеркальний диск із затемненим «лаком», тінню й пунктирним краєм. */
function Stage() {
  const mirror = useMemo(() => {
    const reflector = new Reflector(new THREE.CircleGeometry(STAGE_RADIUS, 96), {
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x5d6b75,
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.003;
    return reflector;
  }, []);

  const dots = useRef<THREE.Points>(null);
  const dotsGeometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 240; i++) {
      const angle = (i / 240) * Math.PI * 2;
      points.push(Math.cos(angle) * (STAGE_RADIUS + 0.25), 0.01, Math.sin(angle) * (STAGE_RADIUS + 0.25));
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  }, []);

  useFrame((_, delta) => {
    if (dots.current) dots.current.rotation.y += delta * 0.05;
  });

  return (
    <group>
      <primitive object={mirror} />
      {/* Напівпрозорий шар над дзеркалом — відображення м'яке, як на полірованій підлозі. */}
      {/* Неосвітлюваний шар: інакше він відбиває яскраве студійне оточення й підлога стає білою. */}
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[STAGE_RADIUS, 96]} />
        <meshBasicMaterial color="#1b252c" transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
        <circleGeometry args={[STAGE_RADIUS, 96]} />
        <shadowMaterial transparent opacity={0.55} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.004}>
        <ringGeometry args={[STAGE_RADIUS - 0.02, STAGE_RADIUS + 0.02, 128]} />
        <meshBasicMaterial color="#d9ecf7" transparent opacity={0.35} />
      </mesh>
      <points ref={dots} geometry={dotsGeometry}>
        <pointsMaterial size={0.035} color="#ffffff" transparent opacity={0.45} sizeAttenuation />
      </points>
    </group>
  );
}

/** Площина-сканер, що проходить уздовж авто, поки AI аналізує оголошення. */
function ScanBeam() {
  const beam = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!beam.current) return;
    beam.current.position.z = Math.sin(clock.elapsedTime * 1.1) * 2.5;
    (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.08 * Math.sin(clock.elapsedTime * 6);
  });
  return (
    <mesh ref={beam} position={[0, 0.75, 0]}>
      <boxGeometry args={[2.6, 1.6, 0.02]} />
      <meshBasicMaterial color="#9fd8ff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function HotspotButton({
  zone,
  count,
  color,
  selected,
  delayMs,
  onClick,
}: {
  zone: CarZone;
  count: number;
  color: string;
  selected: boolean;
  delayMs: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hotspot-3d group relative block h-8 w-8"
      style={{ animationDelay: `${delayMs}ms` }}
      aria-label={`${CAR_ZONE_LABELS[zone]}: ${count} знахідок`}
    >
      <span className="hotspot-ring absolute inset-0 rounded-full" style={{ background: color }} />
      <span
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-night shadow-[0_0_24px_rgba(0,0,0,0.5)] transition-transform ${
          selected ? 'scale-125' : 'group-hover:scale-110'
        }`}
        style={{ background: color }}
      >
        {count}
      </span>
      <span
        className={`pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-night/85 px-3 py-1 text-xs font-medium text-ice backdrop-blur transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {CAR_ZONE_LABELS[zone]}
      </span>
    </button>
  );
}

function groupByZone(findings: ReportFinding[]) {
  const map = new Map<CarZone, ReportFinding[]>();
  for (const finding of findings) map.set(finding.zone, [...(map.get(finding.zone) ?? []), finding]);
  return map;
}
