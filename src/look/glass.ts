import * as T from 'three';

// 透明な球: 中心は透け、縁ほど白く光るフレネル。ダッシュ中は縁が水色に輝く。
export function glassMaterial() {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      tint: { value: new T.Color('#d8fbff') },
      rim: { value: new T.Color('#ffffff') },
      boostColor: { value: new T.Color('#48eaff') },
      boost: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 tint;
      uniform vec3 rim;
      uniform vec3 boostColor;
      uniform float boost;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float facing = max(dot(n, vView), 0.0);
        float fresnel = pow(1.0 - facing, 2.3);
        vec3 light = normalize(vec3(-0.45, 0.75, 0.5));
        float spec = pow(max(dot(n, normalize(light + vView)), 0.0), 70.0);
        float spec2 = pow(max(dot(n, normalize(vec3(0.6, -0.2, 0.7) + vView)), 0.0), 30.0) * 0.25;
        vec3 edge = mix(rim, boostColor, boost);
        vec3 c = mix(tint, edge, fresnel) + (spec + spec2) * vec3(1.0);
        float a = 0.05 + fresnel * (0.6 + boost * 0.35) + spec * 0.9 + spec2 + boost * 0.06;
        gl_FragColor = vec4(c, clamp(a, 0.0, 0.95));
        #include <colorspace_fragment>
      }`,
  });
}

/** 立ちのぼる光の柱。カメラに近いほど消え、通り抜けても画面を覆わない。 */
export function beamMaterial(color: string, map: T.Texture) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    uniforms: {
      map: { value: map },
      color: { value: new T.Color(color) },
      opacity: { value: 0.3 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float rise = 1.0 - smoothstep(0.2, 1.0, vUv.y);
        float a = texture2D(map, vUv).a * opacity * rise * smoothstep(7.0, 16.0, vDepth);
        gl_FragColor = vec4(color * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** 光る模様（矢印など）。テクスチャの offset を流し、カメラの目の前では薄くする。 */
export function glowMaterial(color: string, map: T.Texture, opacity: number, near = 3) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    uniforms: {
      map: { value: map },
      offset: { value: map.offset },
      color: { value: new T.Color(color) },
      opacity: { value: opacity },
      near: { value: near },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 offset;
      uniform vec3 color;
      uniform float opacity;
      uniform float near;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vec4 t = texture2D(map, vUv + offset);
        float a = t.a * opacity * smoothstep(near, near * 2.4, vDepth);
        gl_FragColor = vec4(color * t.rgb * a, a);
        #include <colorspace_fragment>
      }`,
  });
}
