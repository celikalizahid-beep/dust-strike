// Son işlem efektleri (Yüksek / Ultra kalite): kenar yumuşatma (MSAA), ışık parlaması (bloom),
// ortam gölgelendirmesi (GTAO, sadece Ultra), harita temasına göre renk düzenleme ve kenar karartma.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Silah görünümü (viewmodel) ayrı sahnede: derinlik temizlenip dünyanın üstüne çizilir
class OverlayPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

// Ton eşlemeden önce (doğrusal renkte): renk tonu, doygunluk, kontrast ve kenar karartma
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1.05 },
    contrast: { value: 1.05 },
    vignette: { value: 0.6 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 tint; uniform float saturation; uniform float contrast; uniform float vignette;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = max(c.rgb * tint, 0.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, saturation), 0.0);
      col = pow(col / 0.18, vec3(contrast)) * 0.18;
      vec2 d = vUv - 0.5;
      col *= clamp(1.0 - dot(d, d) * vignette, 0.0, 1.0);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, vmScene, vmCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.vmScene = vmScene;
    this.vmCamera = vmCamera;
    this.composer = null;
    this.grade = { tint: [1, 1, 1], sat: 1.05 };
  }

  get active() { return !!this.composer; }

  // q: kalite ayarı ({ post, bloom, gtao, msaa }); post kapalıysa normal (doğrudan) çizime dönülür
  configure(q) {
    this.dispose();
    if (!q.post) return;
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    const c = new EffectComposer(r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (q.gtao) {
      const ao = new GTAOPass(this.scene, this.camera, size.x * pr, size.y * pr);
      ao.blendIntensity = 0.75;
      ao.updateGtaoMaterial({ radius: 0.9, distanceFallOff: 1, thickness: 1.5, scale: 1, samples: 12 });
      // Parçacıklar (duman, kıvılcım) ve saydam yüzeyler gölge hesabına girmesin
      const hide = ao._overrideVisibility.bind(ao);
      ao._overrideVisibility = () => {
        hide();
        this.scene.traverse((o) => {
          if (o.visible && (o.isSprite || (o.material && (o.material.transparent || o.userData.noAO)))) { o.visible = false; ao._visibilityCache.push(o); }
        });
      };
      c.addPass(ao);
    }
    this.vmPass = new OverlayPass(this.vmScene, this.vmCamera);
    c.addPass(this.vmPass);
    if (q.bloom) c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.95));
    this.gradePass = new ShaderPass(GradeShader);
    c.addPass(this.gradePass);
    c.addPass(new OutputPass());
    c.setPixelRatio(pr);
    c.setSize(size.x, size.y);
    this.composer = c;
    this.setGrade(this.grade);
  }

  setGrade(g) {
    this.grade = g || { tint: [1, 1, 1], sat: 1.05 };
    if (!this.gradePass) return;
    const u = this.gradePass.uniforms;
    u.tint.value.set(...this.grade.tint);
    u.saturation.value = this.grade.sat;
  }

  setSize(w, h) { if (this.composer) this.composer.setSize(w, h); }
  setPixelRatio(r) { if (this.composer) this.composer.setPixelRatio(r); }

  render(dt, vmVisible) {
    this.vmPass.enabled = vmVisible;
    this.composer.render(dt);
  }

  dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.dispose();
    this.composer = null;
    this.vmPass = null;
    this.gradePass = null;
  }
}
