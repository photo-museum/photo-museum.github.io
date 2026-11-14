// 가벼운 셰이더 재질들.
// 실제 조명(SpotLight) 대신, 미리 그린 "빛 무늬"(lightMap)를 곱해서 어둠 속 스포트라이트를 흉내 낸다.
// 그래서 사진이 몇 장이든 조명 계산 비용은 0에 가깝다. (휴대폰용)
import * as THREE from 'three';

const surfaceVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;                       // uv 는 미터 단위
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const surfaceFrag = /* glsl */`
  uniform sampler2D map;
  uniform vec2 tile;          // 무늬 한 장이 덮는 크기 (m)
  uniform vec3 tint;
  uniform sampler2D lightMap;
  uniform vec2 lmOrigin;      // 빛 무늬가 시작하는 uv (m)
  uniform vec2 lmSize;        // 빛 무늬가 덮는 크기 (m)
  uniform float lmIntensity;
  uniform vec3 lightColor;
  uniform float ambient;
  uniform float reflectAlpha; // 0 이면 불투명. 바닥만 사용
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vec3 albedo = texture2D(map, vUv / tile).rgb * tint;
    vec2 luv = (vUv - lmOrigin) / lmSize;
    vec4 lmt = texture2D(lightMap, luv);
    float lm = lmt.r * lmt.r;   // 빛이 끝으로 갈수록 빨리 사그라들게
    float occ = mix(0.35, 1.0, lmt.g); // 판 아래 그림자
    vec3 light = vec3(ambient) * occ + lightColor * lm * lmIntensity;
    vec3 col = albedo * light;
    float alpha = 1.0;
    if (reflectAlpha > 0.0) {
      // 매끈한 바닥: 비스듬히 볼수록 더 많이 비친다 (프레넬)
      vec3 V = normalize(cameraPosition - vWorld);
      float f = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
      float smudge = texture2D(map, vUv / (tile * 0.37)).r; // 얼룩진 광택
      float refl = reflectAlpha * (0.45 + 0.9 * f) * (0.55 + 0.6 * smudge);
      alpha = 1.0 - clamp(refl, 0.0, 0.6);
      col /= max(alpha, 0.4); // 비침이 섞여도 바닥 밝기는 유지
    }
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function surfaceMaterial({ map, tile = [2, 2], tint = 0xffffff, lightMap, lmOrigin = [0, 0], lmSize = [1, 1],
  lmIntensity = 1.6, lightColor = 0xffe2bd, ambient = 0.05, reflectAlpha = 0 }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      tile: { value: new THREE.Vector2(...tile) },
      tint: { value: new THREE.Color(tint) },
      lightMap: { value: lightMap },
      lmOrigin: { value: new THREE.Vector2(...lmOrigin) },
      lmSize: { value: new THREE.Vector2(...lmSize) },
      lmIntensity: { value: lmIntensity },
      lightColor: { value: new THREE.Color(lightColor) },
      ambient: { value: ambient },
      reflectAlpha: { value: reflectAlpha },
    },
    vertexShader: surfaceVert,
    fragmentShader: surfaceFrag,
    transparent: reflectAlpha > 0,
    depthWrite: true,
  });
  return m;
}

// 사진 / 빈 판의 앞면. 위쪽 스포트라이트를 받아 위가 아주 조금 더 밝다.
const photoFrag = /* glsl */`
  uniform sampler2D map;
  uniform vec2 tile;
  uniform float intensity;
  uniform vec3 lightColor;
  uniform float aspect;
  uniform float rot;          // 시계 방향 90도 몇 번 (사진만)
  uniform float spotMix;      // 1 = 스포트라이트 받은 느낌, 0 = 고른 빛
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (rot > 0.5 && rot < 1.5) uv = vec2(1.0 - vUv.y, vUv.x);
    else if (rot > 1.5 && rot < 2.5) uv = vec2(1.0 - vUv.x, 1.0 - vUv.y);
    else if (rot > 2.5) uv = vec2(vUv.y, 1.0 - vUv.x);
    vec3 c = texture2D(map, uv * tile).rgb;
    vec2 d = (vUv - vec2(0.5, 0.62)) * vec2(aspect, 1.0);
    float spot = 1.0 - smoothstep(0.35, 1.25, length(d));
    vec3 light = lightColor * intensity * mix(0.95, 0.8 + 0.25 * spot, spotMix);
    gl_FragColor = vec4(c * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const photoVert = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export function photoMaterial(map, { tile = [1, 1], intensity = 1.0, aspect = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      tile: { value: new THREE.Vector2(...tile) },
      intensity: { value: intensity },
      lightColor: { value: new THREE.Color(0xfff0dc) },
      aspect: { value: aspect },
      rot: { value: 0 },
      spotMix: { value: 1 },
    },
    vertexShader: photoVert,
    fragmentShader: photoFrag,
  });
}
