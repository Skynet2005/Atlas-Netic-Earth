"use client";

import { useEffect, useRef, useState } from 'react';
import type * as Cesium from 'cesium';
import { loadCesium } from '@/lib/globe';
import type { TrafficTarget } from '@/lib/traffic';
import { trafficModelSpec } from '@/lib/traffic-models';
import styles from './aircraft-live-preview.module.css';

function modelColor(C: typeof Cesium, target: TrafficTarget) {
  if (target.kind === 'military') return C.Color.fromCssColorString('#ffbd75');
  if (target.heading === null || target.altitude === null) return C.Color.fromCssColorString('#c8d0d6');
  return C.Color.fromCssColorString('#a4ecdb');
}

function rangeFor(target: TrafficTarget) {
  const cls = trafficModelSpec(target).className;
  if (cls === 'air-heavy') return 190;
  if (cls === 'air-helicopter') return 90;
  if (cls === 'air-fighter') return 115;
  if (cls === 'air-prop') return 105;
  return 125;
}

export function AircraftLivePreview({ target }: { target: TrafficTarget }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const entityRef = useRef<Cesium.Entity | null>(null);
  const cesiumRef = useRef<typeof Cesium | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let viewer: Cesium.Viewer | null = null;
    void (async () => {
      try {
        const C = await loadCesium();
        if (cancelled || !hostRef.current || !creditRef.current) return;
        cesiumRef.current = C;
        viewer = new C.Viewer(hostRef.current, {
          globe: false,
          baseLayer: false,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          scene3DOnly: true,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          shouldAnimate: false,
          creditContainer: creditRef.current,
          contextOptions: { webgl: { alpha: true, antialias: true } },
        });
        if (cancelled) { viewer.destroy(); return; }
        viewerRef.current = viewer;
        const scene = viewer.scene;
        scene.backgroundColor = C.Color.TRANSPARENT;
        if (scene.skyBox) scene.skyBox.show = false;
        if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
        scene.sun.show = false;
        scene.moon.show = false;
        scene.fog.enabled = false;
        scene.highDynamicRange = true;
        scene.postProcessStages.fxaa.enabled = true;

        const position = C.Cartesian3.fromDegrees(0, 0, 10_000);
        const spec = trafficModelSpec(target);
        const entity = viewer.entities.add({
          id: 'aircraft-live-preview',
          position,
          orientation: C.Transforms.headingPitchRollQuaternion(
            position,
            new C.HeadingPitchRoll(C.Math.toRadians((target.heading ?? 0) - 90), 0, 0),
          ),
          model: {
            uri: spec.detail,
            minimumPixelSize: 112,
            maximumScale: 5_000,
            runAnimations: false,
            incrementallyLoadTextures: false,
            shadows: C.ShadowMode.DISABLED,
            color: modelColor(C, target),
            colorBlendMode: C.ColorBlendMode.MIX,
            colorBlendAmount: 0.08,
            silhouetteColor: C.Color.WHITE.withAlpha(0.96),
            silhouetteSize: target.kind === 'military' ? 2.6 : 1.8,
          },
        });
        entityRef.current = entity;
        const transform = C.Transforms.eastNorthUpToFixedFrame(position);
        viewer.camera.lookAtTransform(
          transform,
          new C.HeadingPitchRange(C.Math.toRadians(138), C.Math.toRadians(-16), rangeFor(target)),
        );
        scene.requestRender();
        setReady(true);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => {
      cancelled = true;
      entityRef.current = null;
      cesiumRef.current = null;
      viewerRef.current = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [target.id]);

  useEffect(() => {
    const C = cesiumRef.current, viewer = viewerRef.current, entity = entityRef.current;
    if (!C || !viewer || !entity) return;
    const position = C.Cartesian3.fromDegrees(0, 0, 10_000);
    entity.orientation = new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(
      position,
      new C.HeadingPitchRoll(C.Math.toRadians((target.heading ?? 0) - 90), 0, 0),
    ));
    if (entity.model) {
      const spec = trafficModelSpec(target);
      entity.model.uri = new C.ConstantProperty(spec.detail);
      entity.model.color = new C.ConstantProperty(modelColor(C, target));
      entity.model.silhouetteSize = new C.ConstantProperty(target.kind === 'military' ? 2.6 : 1.8);
    }
    viewer.scene.requestRender();
  }, [target]);

  const ageSeconds = Math.max(0, Math.round((now - target.observedAt) / 1000));
  const spec = trafficModelSpec(target);

  return <section className={styles.preview} aria-label="Live aircraft close-up">
    <div className={styles.viewport} ref={hostRef}>
      {!ready && <div className={styles.loading}>Preparing 3D close-up…</div>}
      <div className={styles.scan}/>
      <div className={styles.badge}><span/> LIVE REPORT</div>
      <div className={styles.type}>{target.aircraftType || spec.label}</div>
      <div ref={creditRef} className={styles.credit}/>
    </div>
    <div className={styles.telemetry}>
      <span>{target.callSign || target.registration || target.name}</span>
      <span>{target.heading === null ? 'HDG —' : `HDG ${Math.round(target.heading)}°`}</span>
      <span>{target.speed === null ? 'SPD —' : `${Math.round(target.speed)} kt`}</span>
      <span>{ageSeconds}s ago</span>
    </div>
    <p>3D class representation from the reported aircraft type; position, heading and telemetry update from the latest public report.</p>
  </section>;
}
