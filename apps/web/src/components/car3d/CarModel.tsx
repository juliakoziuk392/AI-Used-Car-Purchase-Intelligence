import type { CarZone } from '@carintel/shared';
import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const MODEL_URL = '/models/car-concept.glb';
/** Довжина авто на сцені в метрах сцени. */
const CAR_LENGTH = 4.6;
const DRIVE_IN_FROM = -9;
const DRIVE_IN_SECONDS = 2.2;

/** До якої деталі моделі прив'язана кожна зона дефектів. */
const ZONE_NODES: Record<CarZone, { node: string; anchor: 'center' | 'top' | 'bottom' }> = {
  front: { node: 'BodyHeadlights', anchor: 'center' },
  engine: { node: 'BodyHood', anchor: 'top' },
  electrics: { node: 'InteriorDashMid', anchor: 'top' },
  interior: { node: 'InteriorSeatsColor1', anchor: 'top' },
  body: { node: 'BodyDoorLColor1', anchor: 'center' },
  rear: { node: 'BodyTaillights', anchor: 'center' },
  front_wheel: { node: 'WheelFrontL', anchor: 'center' },
  rear_wheel: { node: 'WheelRearL', anchor: 'center' },
  transmission: { node: 'Axles', anchor: 'bottom' },
  underbody: { node: 'BodyUnderside', anchor: 'bottom' },
  documents: { node: 'License Plate', anchor: 'center' },
};

const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'];

export type ZoneAnchors = Partial<Record<CarZone, THREE.Vector3>>;

interface CarModelProps {
  carRef?: RefObject<THREE.Group | null>;
  paint: string;
  highlightZone: CarZone | null;
  highlightColor: string;
  onAnchors: (anchors: ZoneAnchors) => void;
  /** Діти рендеряться всередині групи авто — їдуть разом з ним (точки дефектів). */
  children?: ReactNode;
}

export function CarModel({ carRef, paint, highlightZone, highlightColor, onAnchors, children }: CarModelProps) {
  const { scene } = useLoader(GLTFLoader, MODEL_URL);
  const ownRef = useRef<THREE.Group>(null);
  const group = carRef ?? ownRef;
  const driveStart = useRef<number | null>(null);

  // Власна копія сцени й матеріалів: їх перефарбовуємо й підсвічуємо незалежно від кешу.
  const { model, wheels } = useMemo(() => {
    const model = scene.clone(true);
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.material = (object.material as THREE.Material).clone();
      }
      // Логотип Khronos не входить у ліцензію моделі — ховаємо.
      if (object.name === 'InteriorSteeringEmblem') object.visible = false;
    });
    normalize(model);
    const wheels = WHEELS.map((name) => model.getObjectByName(name)).filter(Boolean) as THREE.Object3D[];
    return { model, wheels };
  }, [scene]);

  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material as THREE.MeshPhysicalMaterial;
      if (material.name.startsWith('Paint 1')) material.color.set(paint);
      else if (material.name.startsWith('Paint 2')) material.color.set('#24292e');
      else if (material.name.startsWith('Interior 3')) material.color.set('#2e3338');
      else if (material.name === 'License') {
        material.map = null;
        material.color.set('#e8ebee');
      }
      material.needsUpdate = true;
    });
  }, [model, paint]);

  useEffect(() => {
    model.updateMatrixWorld(true);
    const anchors: ZoneAnchors = {};
    for (const [zone, { node, anchor }] of Object.entries(ZONE_NODES) as [CarZone, (typeof ZONE_NODES)[CarZone]][]) {
      const object = model.getObjectByName(node);
      if (!object) continue;
      const box = new THREE.Box3().setFromObject(object);
      const point = box.getCenter(new THREE.Vector3());
      if (anchor === 'top') point.y = box.max.y + 0.05;
      if (anchor === 'bottom') point.y = Math.max(0.15, box.min.y + 0.05);
      anchors[zone] = point;
    }
    onAnchors(anchors);
  }, [model, onAnchors]);

  const highlighted = useMemo(() => {
    if (!highlightZone) return [];
    const root = model.getObjectByName(ZONE_NODES[highlightZone].node);
    const meshes: THREE.Mesh[] = [];
    root?.traverse((object) => object instanceof THREE.Mesh && meshes.push(object));
    return meshes;
  }, [model, highlightZone]);

  // Знімаємо підсвітку з деталей, які перестали бути виділеними.
  useEffect(
    () => () => {
      for (const mesh of highlighted) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive?.set('#000000');
        material.emissiveIntensity = 1;
      }
    },
    [highlighted],
  );

  useFrame(({ clock }) => {
    const car = group.current;
    if (!car) return;

    // Заїзд на сцену: плавне гальмування, колеса крутяться відповідно до пройденої відстані.
    driveStart.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - driveStart.current) / DRIVE_IN_SECONDS);
    const z = DRIVE_IN_FROM * Math.pow(1 - t, 3);
    const travelled = z - car.position.z;
    car.position.z = z;
    if (travelled !== 0) for (const wheel of wheels) wheel.rotation.x += travelled / 0.36;

    const pulse = 0.45 + 0.35 * Math.sin(clock.elapsedTime * 4);
    for (const mesh of highlighted) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissive?.set(highlightColor);
      material.emissiveIntensity = pulse;
    }
  });

  return (
    <group ref={group} position={[0, 0, DRIVE_IN_FROM]}>
      <primitive object={model} />
      {children}
    </group>
  );
}

/** Ставить авто на підлогу (y = 0), центрує й масштабує до CAR_LENGTH. */
function normalize(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.multiplyScalar(CAR_LENGTH / Math.max(size.x, size.z));
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
}

useLoader.preload(GLTFLoader, MODEL_URL);
