// Wet concrete floor: a planar mirror (based on three.js Reflector) whose reflection is
// broken up by wet/dry patches, ripples and a vertical streak blur, then fades into the dark.
import * as THREE from 'three';

export class WetFloor extends THREE.Mesh {
  constructor({ size = 70, resolutionScale = 0.5 } = {}) {
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);

    const rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 0 });
    const textureMatrix = new THREE.Matrix4();

    const mat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: {
        tReflect: { value: rt.texture },
        textureMatrix: { value: textureMatrix },
        uSpotPos: { value: new THREE.Vector2(0, 0.4) },
        uFadeNear: { value: 9.0 },
        uFadeFar: { value: 30.0 },
      },
      vertexShader: /* glsl */`
        uniform mat4 textureMatrix;
        varying vec4 vUvR; varying vec3 vWorld;
        void main(){
          vUvR = textureMatrix * vec4(position, 1.0);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tReflect; uniform vec2 uSpotPos; uniform float uFadeNear, uFadeFar;
        varying vec4 vUvR; varying vec3 vWorld;

        float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
        }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }

        void main(){
          vec2 p = vWorld.xz;
          // wet (mirror) vs dry (rough) patches
          float n = fbm(p*0.55 + 3.1);
          float wet = 1.0 - smoothstep(0.40, 0.58, n);
          // ripples + fine grain distort the reflection
          vec2 rip = vec2(fbm(p*1.7), fbm(p*1.7 + 19.7)) - 0.5;
          float grain = noise(p*26.0);
          vec2 uv = vUvR.xy / vUvR.w;
          uv += rip * vec2(0.004, 0.03) * mix(1.6, 0.6, wet) + vec2(0.0, (grain-0.5)*0.003);

          // vertical streak blur: rougher where dry
          float spread = mix(0.14, 0.05, wet);
          vec3 refl = vec3(0.0); float wsum = 0.0;
          for (int i = 0; i < 12; i++){
            float o = (float(i)/11.0 - 0.5);
            float w = 1.0 - abs(o)*1.2;
            refl += texture2D(tReflect, uv + vec2(0.0, o*spread)).rgb * w; wsum += w;
          }
          refl /= wsum;

          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.04 + 0.96*pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
          float reflAmt = mix(0.22, 0.95, wet) * mix(0.45, 1.0, fres);

          // spot pool on the floor with a little concrete texture
          float pool = exp(-pow(length(p - uSpotPos)/2.9, 2.0));
          vec3 base = vec3(0.008) + vec3(1.0,0.97,0.93) * pool * (0.02 + 0.03*grain) * (1.0 - 0.5*wet);

          vec3 col = base + refl * reflAmt;
          float d = length(vWorld.xz);
          col *= 1.0 - smoothstep(uFadeNear, uFadeFar, d);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });

    super(geo, mat);
    this.name = 'WetFloor';
    this.renderTarget = rt;
    this.resolutionScale = resolutionScale;

    const scope = this;
    const reflectorPlane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const reflectorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const virtualCamera = new THREE.PerspectiveCamera();
    virtualCamera.layers.enable(1);   // sees the reflection-only light bars

    this.onBeforeRender = function (renderer, scene, camera) {
      reflectorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(scope.matrixWorld);
      normal.set(0, 1, 0).applyMatrix4(rotationMatrix);
      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(reflectorWorldPosition);

      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition, lookAtPosition).reflect(normal).negate().add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(scope.matrixWorld);

      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
      const pm = virtualCamera.projectionMatrix;
      q.x = (Math.sign(clipPlane.x) + pm.elements[8]) / pm.elements[0];
      q.y = (Math.sign(clipPlane.y) + pm.elements[9]) / pm.elements[5];
      q.z = -1.0;
      q.w = (1.0 + pm.elements[10]) / pm.elements[14];
      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      pm.elements[2] = clipPlane.x;
      pm.elements[6] = clipPlane.y;
      pm.elements[10] = clipPlane.z + 1.0 - 0.003;
      pm.elements[14] = clipPlane.w;

      scope.visible = false;
      const currentRenderTarget = renderer.getRenderTarget();
      const currentXrEnabled = renderer.xr.enabled;
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(rt);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.xr.enabled = currentXrEnabled;
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
      renderer.setRenderTarget(currentRenderTarget);
      const viewport = camera.viewport;
      if (viewport !== undefined) renderer.state.viewport(viewport);
      scope.visible = true;
    };
  }

  setSize(w, h) {
    this.renderTarget.setSize(Math.max(64, Math.round(w * this.resolutionScale)), Math.max(64, Math.round(h * this.resolutionScale)));
  }
}
