import type { CarZone } from '@carintel/shared';
import { useFrame, useLoader } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { tokenStorage } from '../../lib/api';

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

/**
 * Модель з фото (TRELLIS) — суцільна сітка без іменованих деталей. Зони ставимо за габаритами:
 * частки ширини (x, бік камери), висоти (y) і довжини (z: 1 — перед, TRELLIS дивиться в +Z, як і шоурум).
 */
const ZONE_FRACTIONS: Record<CarZone, [number, number, number]> = {
  front: [0.5, 0.45, 1],
  engine: [0.5, 0.72, 0.82],
  electrics: [0.5, 0.78, 0.62],
  interior: [0.5, 0.9, 0.45],
  body: [1, 0.5, 0.5],
  rear: [0.5, 0.6, 0],
  front_wheel: [1, 0.2, 0.8],
  rear_wheel: [1, 0.2, 0.2],
  transmission: [0.5, 0.1, 0.62],
  underbody: [0.5, 0.05, 0.38],
  documents: [0.5, 0.3, 0],
};

const WHEELS = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'];

export type CarPart = 'doors' | 'hood' | 'trunk';

/**
 * Деталі стандартної моделі, що відчиняються. hinge — вісь петлі в частках габаритів самої деталі
 * (x — ширина, y — довжина: 0 — передній край, z — висота; осі вузла, бо GLB зроблено в Z-up),
 * axis і angle — поворот навколо петлі в осях батьківського вузла. Модель з фото — суцільна сітка, там цих вузлів нема.
 */
const OPENINGS: Record<CarPart, { node: string; hinge: [number, number, number]; axis: 'x' | 'z'; angle: number }[]> = {
  doors: [
    { node: 'BodyDoorLColor1', hinge: [0.5, 0, 0.5], axis: 'z', angle: -65 },
    { node: 'BodyDoorRColor1', hinge: [0.5, 0, 0.5], axis: 'z', angle: 65 },
  ],
  // Капот-«раковина» разом із фарами: петля біля лобового скла, перед піднімається.
  hood: [{ node: 'BodyHood', hinge: [0.5, 1, 1], axis: 'x', angle: -40 }],
  // Задня кришка з вікном і ліхтарями: петля на краю даху.
  trunk: [{ node: 'BodyRearPanelsColor1', hinge: [0.5, 0, 1], axis: 'x', angle: 55 }],
};

export type ZoneAnchors = Partial<Record<CarZone, THREE.Vector3>>;

/** Що вміє модель: точки зон дефектів, деталі, які можна відчинити, і точка огляду салону. */
export interface CarLayout {
  anchors: ZoneAnchors;
  parts: CarPart[];
  cabin: THREE.Vector3 | null;
}

interface CarModelProps {
  /** GLB саме цього авто (з фото оголошення); без нього — стандартна модель. */
  url?: string;
  carRef?: RefObject<THREE.Group | null>;
  paint: string;
  highlightZone: CarZone | null;
  highlightColor: string;
  openParts: ReadonlySet<CarPart>;
  onLayout: (layout: CarLayout) => void;
  /** Діти рендеряться всередині групи авто — їдуть разом з ним (точки дефектів). */
  children?: ReactNode;
}

export function CarModel({
  url = MODEL_URL,
  carRef,
  paint,
  highlightZone,
  highlightColor,
  openParts,
  onLayout,
  children,
}: CarModelProps) {
  // Згенеровані моделі віддає API за JWT.
  const { scene } = useLoader(GLTFLoader, url, (loader) => {
    const token = tokenStorage.get();
    if (token) loader.setRequestHeader({ Authorization: `Bearer ${token}` });
  });
  const ownRef = useRef<THREE.Group>(null);
  const group = carRef ?? ownRef;
  const driveStart = useRef<number | null>(null);

  // Власна копія сцени й матеріалів: їх перефарбовуємо й підсвічуємо незалежно від кешу.
  const { model, wheels, hinges } = useMemo(() => {
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
    const hinges = attachHinges(model);
    normalize(model);
    const wheels = WHEELS.map((name) => model.getObjectByName(name)).filter(Boolean) as THREE.Object3D[];
    return { model, wheels, hinges };
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
    const whole = new THREE.Box3().setFromObject(model);
    const size = whole.getSize(new THREE.Vector3());
    for (const [zone, { node, anchor }] of Object.entries(ZONE_NODES) as [CarZone, (typeof ZONE_NODES)[CarZone]][]) {
      const object = model.getObjectByName(node);
      if (!object) {
        const [x, y, z] = ZONE_FRACTIONS[zone];
        anchors[zone] = whole.min.clone().add(new THREE.Vector3(x, y, z).multiply(size));
        continue;
      }
      const box = new THREE.Box3().setFromObject(object);
      const point = box.getCenter(new THREE.Vector3());
      if (anchor === 'top') point.y = box.max.y + 0.05;
      if (anchor === 'bottom') point.y = Math.max(0.15, box.min.y + 0.05);
      anchors[zone] = point;
    }
    const parts = [...new Set(hinges.map((hinge) => hinge.part))];
    onLayout({ anchors, parts, cabin: cabinPoint(model) });
  }, [model, hinges, onLayout]);

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

  useFrame(({ clock }, delta) => {
    const car = group.current;
    if (!car) return;

    // Двері, капот і багажник плавно доходять до відчиненого чи зачиненого положення.
    for (const { part, pivot, axis, angle } of hinges) {
      const target = openParts.has(part) ? angle : 0;
      const current = pivot.rotation[axis];
      if (Math.abs(current - target) < 1e-4) {
        pivot.rotation[axis] = target;
      } else {
        pivot.rotation[axis] = THREE.MathUtils.damp(current, target, 5, delta);
      }
    }

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

interface Hinge {
  part: CarPart;
  pivot: THREE.Group;
  axis: 'x' | 'z';
  angle: number;
}

/** Підвішує кожну деталь з OPENINGS на групу-петлю: обертання групи відчиняє деталь навколо петлі. */
function attachHinges(model: THREE.Object3D): Hinge[] {
  const hinges: Hinge[] = [];
  for (const [part, openings] of Object.entries(OPENINGS) as [CarPart, (typeof OPENINGS)[CarPart]][]) {
    for (const { node, hinge, axis, angle } of openings) {
      const object = model.getObjectByName(node);
      if (!object?.parent) continue;
      const box = localBox(object);
      const point = box.min.clone().add(new THREE.Vector3(...hinge).multiply(box.getSize(new THREE.Vector3())));
      object.updateMatrix();
      point.applyMatrix4(object.matrix);

      const pivot = new THREE.Group();
      pivot.position.copy(point);
      object.parent.add(pivot);
      object.position.sub(point);
      pivot.add(object);
      hinges.push({ part, pivot, axis, angle: THREE.MathUtils.degToRad(angle) });
    }
  }
  return hinges;
}

/**
 * Габарити вузла в його власних осях. Деталь з кількома примітивами (капот з фарами, кришка з вікном)
 * в glTF — Group, а не Mesh, тож у неї немає власної геометрії: беремо межі всіх вкладених сіток.
 */
function localBox(object: THREE.Object3D) {
  if (object instanceof THREE.Mesh) {
    object.geometry.computeBoundingBox();
    return object.geometry.boundingBox!.clone();
  }
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object).applyMatrix4(object.matrixWorld.clone().invert());
}

/** Точка між сидіннями на рівні очей водія — звідси оглядаємо салон. */
function cabinPoint(model: THREE.Object3D) {
  const floor = model.getObjectByName('InteriorFloor');
  const roof = model.getObjectByName('BodyRoofPanel');
  if (!floor || !roof) return null;
  const floorBox = new THREE.Box3().setFromObject(floor);
  const roofBox = new THREE.Box3().setFromObject(roof);
  const point = floorBox.getCenter(new THREE.Vector3());
  point.y = THREE.MathUtils.lerp(floorBox.max.y, roofBox.min.y, 0.55);
  return point;
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
