import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('public/models', { recursive: true });

function createModel(kind, detail = false) {
  const positions = [], normals = [], colors = [];

  const tri = (a, b, c, color) => {
    const u = b.map((v, i) => v - a[i]);
    const v = c.map((value, i) => value - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;
    for (const point of [a, b, c]) {
      positions.push(...point);
      normals.push(...n.map(value => value / length));
      colors.push(...color);
    }
  };

  const box = (cx, cy, cz, sx, sy, sz, color) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const p = [
      [x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],
      [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],
    ];
    for (const [a,b,c,d] of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[4,0,3,7]]) {
      tri(p[a],p[b],p[c],color); tri(p[a],p[c],p[d],color);
    }
  };

  const panel = (cx, cy, cz, sx, sz, color) => box(cx, cy, cz, sx, 0.18, sz, color);
  const dish = (cx, cy, cz, radius, color) => {
    const center = [cx, cy, cz];
    const segments = detail ? 16 : 8;
    for (let i = 0; i < segments; i++) {
      const a = i * Math.PI * 2 / segments, b = (i + 1) * Math.PI * 2 / segments;
      tri(center, [cx + Math.cos(a) * radius, cy + 0.35, cz + Math.sin(a) * radius], [cx + Math.cos(b) * radius, cy + 0.35, cz + Math.sin(b) * radius], color);
    }
  };

  const body = [.66,.73,.78], dark = [.16,.22,.28], solar = [.12,.34,.58], gold = [.72,.52,.22], white = [.84,.87,.88];

  if (kind === 'station') {
    box(0,0,0,11,3,3,white); box(0,0,0,3,4.5,3.8,dark);
    panel(-10,0,0,9,5.5,solar); panel(10,0,0,9,5.5,solar);
    panel(-19,0,0,8,4.8,solar); panel(19,0,0,8,4.8,solar);
    box(0,4.3,0,1,6,1,dark);
    if (detail) { box(-4,2.2,0,4,1.2,1.2,gold); box(4,-2.2,0,4,1.2,1.2,gold); }
  } else if (kind === 'starlink') {
    box(0,0,0,3.8,1.2,2.8,body);
    panel(0,0,-5.4,3.6,7.8,solar);
    box(0,1.2,0,1.1,1.6,1.1,gold);
    if (detail) box(0,-1.1,1.2,2.5,.6,.7,dark);
  } else if (kind === 'navigation') {
    box(0,0,0,4.8,3.2,3.8,body);
    panel(-6.8,0,0,8,4.8,solar); panel(6.8,0,0,8,4.8,solar);
    dish(0,2.1,0,1.7,white);
    if (detail) { box(0,-2.2,0,2.8,1.1,2.8,gold); box(0,0,2.5,.7,.7,2.6,dark); }
  } else if (kind === 'weather') {
    box(0,0,0,5.6,4.2,4.2,white);
    panel(-7.2,0,0,8.2,5.2,solar); panel(7.2,0,0,8.2,5.2,solar);
    dish(0,3,0,2.2,white);
    if (detail) box(0,-2.6,0,3.6,1.1,3.6,gold);
  } else if (kind === 'communications') {
    box(0,0,0,4.6,3.2,3.2,gold);
    panel(-6.5,0,0,7.4,4.6,solar); panel(6.5,0,0,7.4,4.6,solar);
    dish(0,2.5,0,2.4,white);
    if (detail) dish(0,-2.0,0,1.1,white);
  } else if (kind === 'earth-observation') {
    box(0,0,0,5.2,3,3.4,body);
    panel(-6.8,0,0,8,4.8,solar); panel(6.8,0,0,8,4.8,solar);
    box(0,-2.3,0,2.2,2,2.2,dark);
    box(0,-3.6,0,1.2,.8,1.2,[.08,.12,.16]);
    if (detail) { box(0,2.1,0,1,1.6,1,gold); box(2.2,0,0,.8,2.6,.8,dark); }
  } else if (kind === 'science') {
    box(0,0,0,6,3,3,body);
    panel(-7.2,0,0,8.2,4.4,solar); panel(7.2,0,0,8.2,4.4,solar);
    box(0,2.5,0,2,2,2,gold);
    if (detail) dish(0,4,0,1.4,white);
  } else {
    box(0,0,0,4.6,3,3.2,body);
    panel(-6.2,0,0,7.2,4.4,solar); panel(6.2,0,0,7.2,4.4,solar);
    box(0,2.1,0,1.1,1.3,1.1,gold);
    if (detail) dish(0,3.3,0,1.2,white);
  }

  const arrays = [positions, normals, colors].map(values => new Float32Array(values));
  const buffer = Buffer.concat(arrays.map(values => Buffer.from(values.buffer)));
  let offset = 0;
  const bufferViews = arrays.map(values => {
    const view = { buffer: 0, byteOffset: offset, byteLength: values.byteLength, target: 34962 };
    offset += values.byteLength;
    return view;
  });
  const accessors = arrays.map((values, index) => ({
    bufferView: index,
    componentType: 5126,
    count: values.length / 3,
    type: 'VEC3',
    ...(index === 0 ? {
      min: [0,1,2].map(axis => Math.min(...positions.filter((_, i) => i % 3 === axis))),
      max: [0,1,2].map(axis => Math.max(...positions.filter((_, i) => i % 3 === axis))),
    } : {}),
  }));

  return {
    asset: { version: '2.0', generator: 'Atlas-Netic satellite identity models' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }] }],
    materials: [{ doubleSided: true, pbrMetallicRoughness: { metallicFactor: .28, roughnessFactor: .54 } }],
    buffers: [{ byteLength: buffer.length, uri: 'data:application/octet-stream;base64,' + buffer.toString('base64') }],
    bufferViews,
    accessors,
  };
}

const kinds = ['generic','station','starlink','navigation','weather','communications','earth-observation','science'];
for (const kind of kinds) {
  for (const detail of [false, true]) {
    writeFileSync(`public/models/satellite-${kind}-${detail ? 'detail' : 'low'}.gltf`, JSON.stringify(createModel(kind, detail)));
  }
}
