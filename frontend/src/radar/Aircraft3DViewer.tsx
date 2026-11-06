import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  type AircraftSpecs,
  type FlightRouteDetails,
  lookupAirlineLivery,
} from "./aircraftSpecs";

export interface Aircraft3DViewerProps {
  specs: AircraftSpecs;
  airlineName?: string;
  callsign: string;
  onClose?: () => void;
  liveTelemetry?: {
    speedKts?: number;
    altitudeFt?: number;
    headingDeg?: number;
    phase?: string;
    icao24?: string;
    country?: string;
  } | null;
  routeDetails?: FlightRouteDetails;
}

export function Aircraft3DViewer({
  specs,
  airlineName,
  callsign,
  onClose,
  liveTelemetry,
  routeDetails,
}: Aircraft3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const setCamViewRef = useRef<((view: "iso" | "top" | "front" | "side") => void) | null>(null);

  const livery = lookupAirlineLivery(callsign);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 380;
    const height = 230;

    // Scene & Camera - Light Aviation Studio Aesthetic
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f8fa);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(26, 16, 28);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.innerHTML = "";
      container.appendChild(renderer.domElement);
    } catch {
      container.innerHTML = `<div style="display:flex;height:100%;align-items:center;justify-content:center;color:var(--text-secondary);font-size:12px;font-weight:600;">3D Model Preview (${specs.model})</div>`;
      return undefined;
    }

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.25);
    sunLight.position.set(30, 45, 25);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xb9e4e8, 0.55);
    rimLight.position.set(-25, 10, -25);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x167d8d, 0.3);
    fillLight.position.set(0, -20, 0);
    scene.add(fillLight);

    // Studio Pedestal (Clean light theme disc)
    const pedestalRadius = specs.category.includes("Wide-body") || specs.category.includes("Super") ? 22 : 18;
    const pedestalGeo = new THREE.CylinderGeometry(pedestalRadius, pedestalRadius + 0.5, 0.4, 48);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0xe9f2f5,
      roughness: 0.6,
      metalness: 0.1,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -6;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    // Outer Ring matching airline primary color or teal
    const ringGeo = new THREE.RingGeometry(pedestalRadius - 1.5, pedestalRadius - 1.2, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: livery.primaryColor, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = -5.75;
    scene.add(ringMesh);

    // Aircraft Group
    const plane = new THREE.Group();

    // Material definitions
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.25,
      roughness: 0.3,
    });
    const liveryPrimaryMat = new THREE.MeshStandardMaterial({
      color: livery.primaryColor,
      metalness: 0.3,
      roughness: 0.25,
    });
    const liveryAccentMat = new THREE.MeshStandardMaterial({
      color: livery.accentColor,
      metalness: 0.35,
      roughness: 0.2,
    });
    const cockpitGlassMat = new THREE.MeshStandardMaterial({
      color: 0x071b2b,
      metalness: 0.85,
      roughness: 0.1,
    });
    const engineMat = new THREE.MeshStandardMaterial({
      color: 0x5b6b7a,
      metalness: 0.65,
      roughness: 0.3,
    });

    const gType = specs.geometryType;

    // Build specific geometry based on airframe type
    if (gType === "B737") {
      // -------------------------------------------------------------
      // BOEING 737 (Pointed nose, CFM flat-bottom engines, Split-Scimitar winglets)
      // -------------------------------------------------------------
      const fuseGeo = new THREE.CylinderGeometry(1.5, 1.35, 29, 32);
      const fuse = new THREE.Mesh(fuseGeo, bodyMat);
      fuse.rotation.z = Math.PI / 2;
      plane.add(fuse);

      // Pointed Boeing Nose Cone
      const noseGeo = new THREE.ConeGeometry(1.5, 7.5, 32);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 18.2;
      plane.add(nose);

      // Cockpit windows
      const visorGeo = new THREE.CylinderGeometry(1.52, 1.52, 2.4, 16, 1, false, 0, Math.PI);
      const visor = new THREE.Mesh(visorGeo, cockpitGlassMat);
      visor.rotation.z = Math.PI / 2;
      visor.position.set(15.5, 0.4, 0);
      plane.add(visor);

      // Tail cone
      const tailConeGeo = new THREE.ConeGeometry(1.35, 8.5, 32);
      const tailCone = new THREE.Mesh(tailConeGeo, bodyMat);
      tailCone.rotation.z = Math.PI / 2;
      tailCone.position.x = -18.7;
      plane.add(tailCone);

      // Swept Wings
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(6, -2);
      wingShape.lineTo(3.5, -18.5);
      wingShape.lineTo(0.5, -18.5);
      wingShape.lineTo(-3, 0);
      wingShape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.28, bevelEnabled: false });
      const leftWing = new THREE.Mesh(wingGeo, bodyMat);
      leftWing.rotation.x = Math.PI / 2;
      leftWing.position.set(3, 0, 0);
      plane.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, bodyMat);
      rightWing.rotation.x = -Math.PI / 2;
      rightWing.scale.z = -1;
      rightWing.position.set(3, 0, 0);
      plane.add(rightWing);

      // Boeing Split-Scimitar Winglets (Upper blade pointing UP, Lower ventral pointing DOWN!)
      // Left Winglet Upper & Lower
      const upperBlade = new THREE.BoxGeometry(0.25, 2.4, 0.7);
      const leftUpper = new THREE.Mesh(upperBlade, liveryAccentMat);
      leftUpper.position.set(5.2, 1.2, 18.5);
      plane.add(leftUpper);

      const lowerBlade = new THREE.BoxGeometry(0.2, 1.4, 0.5);
      const leftLower = new THREE.Mesh(lowerBlade, liveryPrimaryMat);
      leftLower.position.set(5.0, -0.7, 18.5);
      plane.add(leftLower);

      // Right Winglet Upper & Lower
      const rightUpper = new THREE.Mesh(upperBlade, liveryAccentMat);
      rightUpper.position.set(5.2, 1.2, -18.5);
      plane.add(rightUpper);

      const rightLower = new THREE.Mesh(lowerBlade, liveryPrimaryMat);
      rightLower.position.set(5.0, -0.7, -18.5);
      plane.add(rightLower);

      // CFM56 Engines with flat bottom nacelles
      const engGeo = new THREE.CylinderGeometry(1.15, 1.05, 5, 24);
      engGeo.scale(1, 0.85, 1); // Flatten vertically for B737 signature nacelle chine
      const leftEng = new THREE.Mesh(engGeo, engineMat);
      leftEng.rotation.z = Math.PI / 2;
      leftEng.position.set(3.5, -1.3, 6.5);
      plane.add(leftEng);

      const rightEng = new THREE.Mesh(engGeo, engineMat);
      rightEng.rotation.z = Math.PI / 2;
      rightEng.position.set(3.5, -1.3, -6.5);
      plane.add(rightEng);

      // 737 Dorsal Fin Fillet + Vertical Stabilizer
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(-3, 1.2); // Dorsal fillet
      finShape.lineTo(-6.5, 8.5);
      finShape.lineTo(-10.2, 8.5);
      finShape.lineTo(-7.2, 0);
      finShape.closePath();

      const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.32, bevelEnabled: false });
      const fin = new THREE.Mesh(finGeo, liveryPrimaryMat);
      fin.position.set(-13, 1.1, -0.16);
      plane.add(fin);

      // Horizontal Stabilizers
      const hStabShape = new THREE.Shape();
      hStabShape.moveTo(0, 0);
      hStabShape.lineTo(2, -1);
      hStabShape.lineTo(1, -7);
      hStabShape.lineTo(-1, -7);
      hStabShape.lineTo(-2, 0);
      hStabShape.closePath();

      const hStabGeo = new THREE.ExtrudeGeometry(hStabShape, { depth: 0.2, bevelEnabled: false });
      const leftH = new THREE.Mesh(hStabGeo, bodyMat);
      leftH.rotation.x = Math.PI / 2;
      leftH.position.set(-16.5, 0.8, 0);
      plane.add(leftH);

      const rightH = new THREE.Mesh(hStabGeo, bodyMat);
      rightH.rotation.x = -Math.PI / 2;
      rightH.scale.z = -1;
      rightH.position.set(-16.5, 0.8, 0);
      plane.add(rightH);
    } else if (gType === "B787" || gType === "A350" || gType === "B777") {
      // -------------------------------------------------------------
      // WIDE-BODY JETLINER (Dreamliner / A350 / Triple Seven)
      // -------------------------------------------------------------
      const fuseR = gType === "B777" ? 2.6 : 2.4;
      const fuseL = gType === "B777" ? 42 : 36;
      const fuseGeo = new THREE.CylinderGeometry(fuseR, fuseR * 0.9, fuseL, 32);
      const fuse = new THREE.Mesh(fuseGeo, bodyMat);
      fuse.rotation.z = Math.PI / 2;
      plane.add(fuse);

      // Streamlined composite nose
      const noseGeo = new THREE.ConeGeometry(fuseR, 8.5, 32);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = fuseL / 2 + 4.2;
      plane.add(nose);

      // Cockpit windows (A350 black mask or B787 sleek windows)
      const visorGeo = new THREE.CylinderGeometry(fuseR * 1.01, fuseR * 1.01, 3.2, 16, 1, false, 0, Math.PI);
      const visor = new THREE.Mesh(visorGeo, cockpitGlassMat);
      visor.rotation.z = Math.PI / 2;
      visor.position.set(fuseL / 2 + 1, 0.6, 0);
      plane.add(visor);

      // Long Tail Cone
      const tailConeGeo = new THREE.ConeGeometry(fuseR * 0.9, 11, 32);
      const tailCone = new THREE.Mesh(tailConeGeo, bodyMat);
      tailCone.rotation.z = Math.PI / 2;
      tailCone.position.x = -fuseL / 2 - 5.5;
      plane.add(tailCone);

      // Wide High-Aspect Curved Raked Wings
      const wingSpanHalf = gType === "B777" ? 26 : 24;
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(9, -3);
      wingShape.lineTo(5, -wingSpanHalf);
      wingShape.lineTo(2, -wingSpanHalf);
      wingShape.lineTo(-4, 0);
      wingShape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.38, bevelEnabled: false });

      // Dreamliner upward wing flex dihedral
      const leftWing = new THREE.Mesh(wingGeo, bodyMat);
      leftWing.rotation.x = Math.PI / 2 + 0.05; // upward wing flex!
      leftWing.position.set(4, 0, 0);
      plane.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, bodyMat);
      rightWing.rotation.x = -Math.PI / 2 - 0.05;
      rightWing.scale.z = -1;
      rightWing.position.set(4, 0, 0);
      plane.add(rightWing);

      // Curved blended winglets or raked tips
      const tipGeo = new THREE.BoxGeometry(0.35, 3.2, 1.2);
      const leftTip = new THREE.Mesh(tipGeo, liveryAccentMat);
      leftTip.position.set(7, 1.6, wingSpanHalf);
      plane.add(leftTip);

      const rightTip = new THREE.Mesh(tipGeo, liveryAccentMat);
      rightTip.position.set(7, 1.6, -wingSpanHalf);
      plane.add(rightTip);

      // Massive GE90 / Trent 1000 Turbofans
      const engR = gType === "B777" ? 1.7 : 1.5;
      const engGeo = new THREE.CylinderGeometry(engR, engR * 0.92, 6.8, 28);
      const leftEng = new THREE.Mesh(engGeo, engineMat);
      leftEng.rotation.z = Math.PI / 2;
      leftEng.position.set(5, -2.4, 9.5);
      plane.add(leftEng);

      const rightEng = new THREE.Mesh(engGeo, engineMat);
      rightEng.rotation.z = Math.PI / 2;
      rightEng.position.set(5, -2.4, -9.5);
      plane.add(rightEng);

      // Vertical Tail Fin
      const finHeight = gType === "B777" ? 12 : 10.5;
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(-6, finHeight);
      finShape.lineTo(-11, finHeight);
      finShape.lineTo(-7.5, 0);
      finShape.closePath();

      const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.42, bevelEnabled: false });
      const fin = new THREE.Mesh(finGeo, liveryPrimaryMat);
      fin.position.set(-fuseL / 2 - 2, 1.6, -0.21);
      plane.add(fin);

      // Horizontal Stabilizers
      const hStabShape = new THREE.Shape();
      hStabShape.moveTo(0, 0);
      hStabShape.lineTo(3, -1.5);
      hStabShape.lineTo(1.5, -9.5);
      hStabShape.lineTo(-1.5, -9.5);
      hStabShape.lineTo(-3, 0);
      hStabShape.closePath();

      const hStabGeo = new THREE.ExtrudeGeometry(hStabShape, { depth: 0.25, bevelEnabled: false });
      const leftH = new THREE.Mesh(hStabGeo, bodyMat);
      leftH.rotation.x = Math.PI / 2;
      leftH.position.set(-fuseL / 2 - 6, 1.2, 0);
      plane.add(leftH);

      const rightH = new THREE.Mesh(hStabGeo, bodyMat);
      rightH.rotation.x = -Math.PI / 2;
      rightH.scale.z = -1;
      rightH.position.set(-fuseL / 2 - 6, 1.2, 0);
      plane.add(rightH);
    } else if (gType === "ATR72") {
      // -------------------------------------------------------------
      // ATR-72 REGIONAL TURBOPROP (High wing, T-tail, Twin Propellers)
      // -------------------------------------------------------------
      const fuseGeo = new THREE.CylinderGeometry(1.4, 1.25, 24, 32);
      const fuse = new THREE.Mesh(fuseGeo, bodyMat);
      fuse.rotation.z = Math.PI / 2;
      plane.add(fuse);

      // Nose
      const noseGeo = new THREE.ConeGeometry(1.4, 5.5, 32);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 14.7;
      plane.add(nose);

      // Cockpit
      const visorGeo = new THREE.CylinderGeometry(1.42, 1.42, 2.2, 16, 1, false, 0, Math.PI);
      const visor = new THREE.Mesh(visorGeo, cockpitGlassMat);
      visor.rotation.z = Math.PI / 2;
      visor.position.set(12.8, 0.4, 0);
      plane.add(visor);

      // High-mounted Wings (on TOP of fuselage!)
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(2.5, -1);
      wingShape.lineTo(1.5, -16);
      wingShape.lineTo(-1.5, -16);
      wingShape.lineTo(-2.5, 0);
      wingShape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.25, bevelEnabled: false });
      const leftWing = new THREE.Mesh(wingGeo, bodyMat);
      leftWing.rotation.x = Math.PI / 2;
      leftWing.position.set(2, 1.4, 0); // High mounted!
      plane.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, bodyMat);
      rightWing.rotation.x = -Math.PI / 2;
      rightWing.scale.z = -1;
      rightWing.position.set(2, 1.4, 0);
      plane.add(rightWing);

      // Turboprop Nacelles & Spinners
      const nacGeo = new THREE.CylinderGeometry(0.85, 0.8, 4.5, 16);
      const leftNac = new THREE.Mesh(nacGeo, engineMat);
      leftNac.rotation.z = Math.PI / 2;
      leftNac.position.set(3, 1.1, 5.5);
      plane.add(leftNac);

      const rightNac = new THREE.Mesh(nacGeo, engineMat);
      rightNac.rotation.z = Math.PI / 2;
      rightNac.position.set(3, 1.1, -5.5);
      plane.add(rightNac);

      // Spinning 6-Blade Propeller discs
      const propGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.05, 32);
      const propMat = new THREE.MeshBasicMaterial({ color: 0x223344, transparent: true, opacity: 0.45 });
      const leftProp = new THREE.Mesh(propGeo, propMat);
      leftProp.rotation.z = Math.PI / 2;
      leftProp.position.set(5.5, 1.1, 5.5);
      plane.add(leftProp);

      const rightProp = new THREE.Mesh(propGeo, propMat);
      rightProp.rotation.z = Math.PI / 2;
      rightProp.position.set(5.5, 1.1, -5.5);
      plane.add(rightProp);

      // T-Tail: Tall vertical fin with Horizontal stabilizer ON TOP
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(-3, 8.5);
      finShape.lineTo(-6.5, 8.5);
      finShape.lineTo(-5, 0);
      finShape.closePath();

      const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.28, bevelEnabled: false });
      const fin = new THREE.Mesh(finGeo, liveryPrimaryMat);
      fin.position.set(-11, 1.0, -0.14);
      plane.add(fin);

      // T-Tail Horizontal Stabilizer placed atop fin!
      const tTailShape = new THREE.Shape();
      tTailShape.moveTo(0, 0);
      tTailShape.lineTo(2, -1);
      tTailShape.lineTo(1, -6);
      tTailShape.lineTo(-1, -6);
      tTailShape.lineTo(-2, 0);
      tTailShape.closePath();

      const tTailGeo = new THREE.ExtrudeGeometry(tTailShape, { depth: 0.18, bevelEnabled: false });
      const leftT = new THREE.Mesh(tTailGeo, bodyMat);
      leftT.rotation.x = Math.PI / 2;
      leftT.position.set(-15, 9.3, 0); // At the top of the fin!
      plane.add(leftT);

      const rightT = new THREE.Mesh(tTailGeo, bodyMat);
      rightT.rotation.x = -Math.PI / 2;
      rightT.scale.z = -1;
      rightT.position.set(-15, 9.3, 0);
      plane.add(rightT);
    } else {
      // -------------------------------------------------------------
      // DEFAULT: AIRBUS A320neo / A321 (Sharklets, LEAP-1A, Clean airliner lines)
      // -------------------------------------------------------------
      const fuseGeo = new THREE.CylinderGeometry(1.65, 1.45, 29, 32);
      const fuse = new THREE.Mesh(fuseGeo, bodyMat);
      fuse.rotation.z = Math.PI / 2;
      plane.add(fuse);

      // Rounded Airbus Nose
      const noseGeo = new THREE.ConeGeometry(1.65, 6.5, 32);
      const nose = new THREE.Mesh(noseGeo, bodyMat);
      nose.rotation.z = -Math.PI / 2;
      nose.position.x = 17.5;
      plane.add(nose);

      // Cockpit windshield
      const visorGeo = new THREE.CylinderGeometry(1.68, 1.68, 2.8, 16, 1, false, 0, Math.PI);
      const visor = new THREE.Mesh(visorGeo, cockpitGlassMat);
      visor.rotation.z = Math.PI / 2;
      visor.position.set(15.2, 0.42, 0);
      plane.add(visor);

      // Tail cone
      const tailConeGeo = new THREE.ConeGeometry(1.45, 8.5, 32);
      const tailCone = new THREE.Mesh(tailConeGeo, bodyMat);
      tailCone.rotation.z = Math.PI / 2;
      tailCone.position.x = -18.5;
      plane.add(tailCone);

      // Swept Main Wings
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.lineTo(6.5, -2);
      wingShape.lineTo(4, -19);
      wingShape.lineTo(0.5, -19);
      wingShape.lineTo(-3, 0);
      wingShape.closePath();

      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.3, bevelEnabled: false });
      const leftWing = new THREE.Mesh(wingGeo, bodyMat);
      leftWing.rotation.x = Math.PI / 2;
      leftWing.position.set(3, 0, 0);
      plane.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, bodyMat);
      rightWing.rotation.x = -Math.PI / 2;
      rightWing.scale.z = -1;
      rightWing.position.set(3, 0, 0);
      plane.add(rightWing);

      // Airbus Sharklets (Tall sleek vertical wingtips in livery accent color)
      const sharkletGeo = new THREE.BoxGeometry(0.3, 2.6, 0.9);
      const leftSharklet = new THREE.Mesh(sharkletGeo, liveryAccentMat);
      leftSharklet.position.set(5.5, 1.25, 19);
      plane.add(leftSharklet);

      const rightSharklet = new THREE.Mesh(sharkletGeo, liveryAccentMat);
      rightSharklet.position.set(5.5, 1.25, -19);
      plane.add(rightSharklet);

      // Turbofan Engines
      const engineGeo = new THREE.CylinderGeometry(1.2, 1.1, 5.2, 24);
      const leftEngine = new THREE.Mesh(engineGeo, engineMat);
      leftEngine.rotation.z = Math.PI / 2;
      leftEngine.position.set(4, -1.8, 6.8);
      plane.add(leftEngine);

      const rightEngine = new THREE.Mesh(engineGeo, engineMat);
      rightEngine.rotation.z = Math.PI / 2;
      rightEngine.position.set(4, -1.8, -6.8);
      plane.add(rightEngine);

      // Tail Fin (Livery Primary & Accent)
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(-5.5, 8.8);
      finShape.lineTo(-9.5, 8.8);
      finShape.lineTo(-6.5, 0);
      finShape.closePath();

      const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.35, bevelEnabled: false });
      const fin = new THREE.Mesh(finGeo, liveryPrimaryMat);
      fin.position.set(-13.5, 1.2, -0.17);
      plane.add(fin);

      // Horizontal Stabilizers
      const hStabShape = new THREE.Shape();
      hStabShape.moveTo(0, 0);
      hStabShape.lineTo(2, -1);
      hStabShape.lineTo(1, -7.5);
      hStabShape.lineTo(-1, -7.5);
      hStabShape.lineTo(-2, 0);
      hStabShape.closePath();

      const hStabGeo = new THREE.ExtrudeGeometry(hStabShape, { depth: 0.2, bevelEnabled: false });
      const leftHStab = new THREE.Mesh(hStabGeo, bodyMat);
      leftHStab.rotation.x = Math.PI / 2;
      leftHStab.position.set(-16.5, 0.8, 0);
      plane.add(leftHStab);

      const rightHStab = new THREE.Mesh(hStabGeo, bodyMat);
      rightHStab.rotation.x = -Math.PI / 2;
      rightHStab.scale.z = -1;
      rightHStab.position.set(-16.5, 0.8, 0);
      plane.add(rightHStab);
    }

    plane.position.y = 0.5;
    scene.add(plane);

    // Interactive pointer drag rotation
    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let rotX = 0.2;
    let rotY = -0.65;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevPointerX;
      const dy = e.clientY - prevPointerY;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      rotY += dx * 0.012;
      rotX = Math.max(-0.6, Math.min(0.8, rotX + dy * 0.012));
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    setCamViewRef.current = (preset: "iso" | "top" | "front" | "side") => {
      if (preset === "top") {
        rotX = 1.35;
        rotY = 0;
      } else if (preset === "front") {
        rotX = 0.05;
        rotY = -Math.PI / 2;
      } else if (preset === "side") {
        rotX = 0.05;
        rotY = 0;
      } else {
        rotX = 0.2;
        rotY = -0.65;
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);

    // Animation loop: turntable rotation
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (autoRotate && !isDragging) {
        rotY += 0.007;
      }
      plane.rotation.y = rotY;
      plane.rotation.z = Math.sin(rotY) * 0.03;
      plane.rotation.x = rotX;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [specs, livery, autoRotate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* FlightRadar24 Style Route Header */}
      {routeDetails && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--white)",
            border: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: `#${livery.primaryColor.toString(16).padStart(6, "0")}`,
                }}
              />
              <strong style={{ fontSize: 14, color: "var(--teal)" }}>{routeDetails.flightNumber}</strong>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>({callsign})</span>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 4,
                backgroundColor: "var(--aqua)",
                color: "var(--ink)",
              }}
            >
              REG: {routeDetails.registration}
            </span>
          </div>

          {/* Route: Origin ➔ Destination */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                {routeDetails.origin.iata}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                {routeDetails.origin.city}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>DEP {routeDetails.scheduledDep}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, padding: "0 12px" }}>
              <div style={{ fontSize: 11, color: "var(--teal)", fontWeight: 700 }}>✈ EN ROUTE</div>
              <div
                style={{
                  width: "100%",
                  height: 4,
                  backgroundColor: "var(--paper)",
                  borderRadius: 2,
                  overflow: "hidden",
                  margin: "4px 0",
                }}
              >
                <div
                  style={{
                    width: `${routeDetails.progressPercent}%`,
                    height: "100%",
                    backgroundColor: "var(--teal)",
                  }}
                />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                Squawk: <strong>{routeDetails.squawk}</strong>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                {routeDetails.destination.iata}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                {routeDetails.destination.city}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>ETA {routeDetails.estimatedArr}</div>
            </div>
          </div>
        </div>
      )}

      {/* 3D Model Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 700, color: "var(--ink)" }}>
            {specs.model}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            {airlineName ?? livery.name} · {specs.category}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            title="Deselect aircraft"
            aria-label="Close aircraft inspector"
            style={{ width: 28, height: 28, fontSize: 16 }}
          >
            ×
          </button>
        )}
      </div>

      {/* 3D Canvas Container */}
      <div style={{ position: "relative" }}>
        <div
          ref={mountRef}
          style={{
            width: "100%",
            height: 230,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 2px 8px rgba(7, 27, 43, 0.06)",
            cursor: "grab",
            touchAction: "none",
          }}
          title="Drag to rotate 3D airframe"
        />

        {/* 3D Overlay Toolbar */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            right: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ display: "flex", gap: 4, pointerEvents: "auto" }}>
            <button
              type="button"
              className="btn-sm"
              style={{ fontSize: 10, padding: "2px 8px", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)" }}
              onClick={() => setCamViewRef.current?.("iso")}
            >
              3D
            </button>
            <button
              type="button"
              className="btn-sm"
              style={{ fontSize: 10, padding: "2px 8px", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)" }}
              onClick={() => setCamViewRef.current?.("top")}
            >
              Plan
            </button>
            <button
              type="button"
              className="btn-sm"
              style={{ fontSize: 10, padding: "2px 8px", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(4px)" }}
              onClick={() => setCamViewRef.current?.("front")}
            >
              Nose
            </button>
          </div>
          <button
            type="button"
            className="btn-sm"
            style={{
              fontSize: 10,
              padding: "2px 8px",
              background: autoRotate ? "var(--teal)" : "rgba(255,255,255,0.9)",
              color: autoRotate ? "var(--white)" : "var(--ink)",
              pointerEvents: "auto",
            }}
            onClick={() => setAutoRotate((r) => !r)}
          >
            {autoRotate ? "Pause Spin" : "Auto Spin"}
          </button>
        </div>
      </div>

      {/* Flight Dynamics Telemetry Bar */}
      {liveTelemetry && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--aqua)",
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 4,
            fontSize: 11,
            color: "var(--ink)",
            textAlign: "center",
          }}
        >
          <div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Speed</div>
            <strong>{liveTelemetry.speedKts != null ? Math.round(liveTelemetry.speedKts) : "—"} kt</strong>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Altitude</div>
            <strong>{liveTelemetry.altitudeFt != null ? Math.round(liveTelemetry.altitudeFt) : "—"} ft</strong>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Track</div>
            <strong>{liveTelemetry.headingDeg != null ? Math.round(liveTelemetry.headingDeg) : "—"}°</strong>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--text-secondary)", textTransform: "uppercase" }}>Phase</div>
            <strong style={{ textTransform: "uppercase" }}>{liveTelemetry.phase?.replace("_", " ") ?? "ENROUTE"}</strong>
          </div>
        </div>
      )}

      {/* Technical Specifications Grid */}
      <div className="kv-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <div className="kv-item">
          <div className="kv-label">Airframe Model</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.model}</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Manufacturer</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.manufacturer}</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Wingspan / Length</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.wingspanM}m / {specs.lengthM}m</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Max Takeoff Weight</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{(specs.maxTakeoffWeightKg / 1000).toFixed(1)} tons</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Cruising Speed</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.cruiseSpeedKts} kts</div>
        </div>
        <div className="kv-item">
          <div className="kv-label">Operational Range</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.maxRangeKm.toLocaleString()} km</div>
        </div>
        <div className="kv-item" style={{ gridColumn: "span 2" }}>
          <div className="kv-label">Typical Seating Configuration</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.typicalSeating}</div>
        </div>
        <div className="kv-item" style={{ gridColumn: "span 2" }}>
          <div className="kv-label">Turbofan Powerplants</div>
          <div className="kv-value" style={{ fontSize: 12 }}>{specs.engines}</div>
        </div>
      </div>
    </div>
  );
}
