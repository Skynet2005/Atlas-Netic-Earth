import type * as Cesium from 'cesium';
import { countryLabelFontSize, countryLabelMaximumDistance, countryLabelViewport, showCountryLabels } from './country-labels';

type CModule = typeof Cesium;
export type CountryLabelRecord = { name: string; lat: number; lng: number; size: number };

type Anchor = {
  record: CountryLabelRecord;
  position: Cesium.Cartesian3;
  element: HTMLSpanElement;
};

type Occupied = { x: number; y: number; halfWidth: number; halfHeight: number };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export class CountryLabelOverlay {
  private readonly root: HTMLDivElement;
  private anchors: Anchor[] = [];
  private enabled = true;
  private frame: number | null = null;
  private destroyed = false;

  constructor(private C: CModule, private viewer: Cesium.Viewer, host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '6',
      pointerEvents: 'none',
      overflow: 'hidden',
      contain: 'layout paint style',
      userSelect: 'none',
    });
    host.appendChild(this.root);
  }

  load(records: CountryLabelRecord[]) {
    this.root.replaceChildren();
    this.anchors = [];
    for (const record of [...records].sort((a, b) => a.size - b.size || a.name.localeCompare(b.name))) {
      if (!record.name || !Number.isFinite(record.lat) || !Number.isFinite(record.lng)) continue;
      const element = document.createElement('span');
      element.textContent = record.name;
      Object.assign(element.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        display: 'none',
        whiteSpace: 'nowrap',
        transform: 'translate3d(-9999px,-9999px,0)',
        transformOrigin: 'center center',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        lineHeight: '1',
        letterSpacing: '0.01em',
        color: 'rgba(232,242,247,.84)',
        textShadow: '0 1px 2px rgba(1,7,12,.98), 0 0 5px rgba(1,7,12,.88)',
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
        willChange: 'transform, opacity',
      });
      this.root.appendChild(element);
      this.anchors.push({
        record,
        position: this.C.Cartesian3.fromDegrees(record.lng, record.lat),
        element,
      });
    }
    this.requestUpdate();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.requestUpdate();
  }

  requestUpdate() {
    if (this.destroyed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  update() {
    if (this.destroyed || this.viewer.isDestroyed()) return;
    const C = this.C;
    const viewer = this.viewer;
    const camera = viewer.camera;
    const width = Math.max(1, viewer.canvas.clientWidth);
    const height = Math.max(1, viewer.canvas.clientHeight);
    const altitude = camera.positionCartographic.height;
    const pitch = C.Math.toDegrees(camera.pitch);
    const visible = showCountryLabels(this.enabled, altitude, width, pitch);
    this.root.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const layout = countryLabelViewport(width, height, altitude);
    const ellipsoid = viewer.scene.globe.ellipsoid;
    const scaledCamera = ellipsoid.transformPositionToScaledSpace(camera.positionWC, new C.Cartesian3());
    const scaledAnchor = new C.Cartesian3();
    const direction = new C.Cartesian3();
    const occupied: Occupied[] = [];
    let shown = 0;

    for (const anchor of this.anchors) {
      const { record, position, element } = anchor;
      const maximumDistance = countryLabelMaximumDistance(record.size);
      const distance = C.Cartesian3.distance(camera.positionWC, position);
      const horizon = C.Cartesian3.dot(scaledCamera, ellipsoid.transformPositionToScaledSpace(position, scaledAnchor));
      if (distance > maximumDistance || horizon <= 1.002) {
        element.style.display = 'none';
        continue;
      }
      C.Cartesian3.subtract(position, camera.positionWC, direction);
      if (C.Cartesian3.dot(direction, camera.directionWC) <= 0) {
        element.style.display = 'none';
        continue;
      }
      const screen = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
      if (!screen) {
        element.style.display = 'none';
        continue;
      }

      const fontSize = countryLabelFontSize(width, altitude, record.size);
      const halfWidth = Math.max(18, record.name.length * fontSize * 0.29);
      const halfHeight = Math.max(7, fontSize * 0.58);
      const x = Math.round(screen.x);
      const y = Math.round(screen.y);
      if (
        x < layout.sideInset + halfWidth ||
        x > width - layout.sideInset - halfWidth ||
        y < layout.topInset + halfHeight ||
        y > height - layout.bottomInset - halfHeight
      ) {
        element.style.display = 'none';
        continue;
      }

      const collides = occupied.some(other =>
        Math.abs(x - other.x) < halfWidth + other.halfWidth + layout.horizontalGap &&
        Math.abs(y - other.y) < halfHeight + other.halfHeight + layout.verticalGap
      );
      if (collides || shown >= layout.maxVisible) {
        element.style.display = 'none';
        continue;
      }

      const distanceFade = 1 - clamp(distance / maximumDistance, 0, 1);
      const horizonFade = clamp((horizon - 1.002) / 0.05, 0, 1);
      const opacity = clamp(0.5 + distanceFade * 0.34, 0.5, 0.9) * clamp(0.5 + horizonFade * 0.5, 0.5, 1);
      element.style.display = 'block';
      element.style.fontSize = `${fontSize.toFixed(1)}px`;
      element.style.fontWeight = record.size <= 2 ? '650' : record.size <= 4 ? '580' : '520';
      element.style.opacity = opacity.toFixed(3);
      element.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      occupied.push({ x, y, halfWidth, halfHeight });
      shown++;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.anchors = [];
    this.root.remove();
  }
}
