/**
 * PreviewBackground - Three.js 动态背景动画
 * 为文件预览面板提供全息球体和数据海洋动画效果
 * 
 * @created 2026-01-17
 * @module features/explorer/PreviewBackground
 */

class PreviewBackground {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {string|HTMLElement} options.container 容器元素或选择器
   */
  constructor(options = {}) {
    this.container = typeof options.container === 'string' 
      ? document.querySelector(options.container) 
      : options.container;
    
    if (!this.container) {
      console.warn('[PreviewBackground] Container not found');
      return;
    }
    
    // Three.js 核心对象
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    
    // 动画元素
    this.particles = null;
    this.sphereGroup = null;
    this.coreSphere = null;
    this.outerShell = null;
    this.rings = [];
    
    // 动画状态
    this.count = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.isRunning = false;
    this.animationId = null;
    
    // 容器尺寸
    this.width = 0;
    this.height = 0;
  }

  /**
   * 初始化背景动画
   */
  init() {
    if (!window.THREE) {
      console.warn('[PreviewBackground] Three.js not loaded');
      return;
    }
    
    if (!this.container) {
      return;
    }
    
    this.setupScene();
    this.createParticles();
    this.createHolographicSphere();
    this.setupRenderer();
    this.bindEvents();
    this.start();
    
    console.log('[PreviewBackground] Initialized');
  }

  /**
   * 设置场景和相机
   */
  setupScene() {
    const THREE = window.THREE;
    
    this.width = this.container.offsetWidth || 800;
    this.height = this.container.offsetHeight || 600;
    
    // 创建相机
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 1, 10000);
    this.camera.position.z = 800;
    this.camera.position.y = 150;
    
    // 创建场景
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0012);
  }

  /**
   * 创建底部数据海洋粒子
   */
  createParticles() {
    const THREE = window.THREE;
    
    const SEPARATION = 60;
    const AMOUNTX = 50;
    const AMOUNTY = 50;
    const numParticles = AMOUNTX * AMOUNTY;
    
    const positions = new Float32Array(numParticles * 3);
    const scales = new Float32Array(numParticles);
    
    let i = 0, j = 0;
    for (let ix = 0; ix < AMOUNTX; ix++) {
      for (let iy = 0; iy < AMOUNTY; iy++) {
        positions[i] = ix * SEPARATION - ((AMOUNTX * SEPARATION) / 2);
        positions[i + 1] = 0;
        positions[i + 2] = iy * SEPARATION - ((AMOUNTY * SEPARATION) / 2);
        scales[j] = 1;
        i += 3;
        j++;
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    
    const material = new THREE.PointsMaterial({
      color: 0x444444,
      size: 2,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true
    });
    
    this.particles = new THREE.Points(geometry, material);
    this.particles.position.y = -250;
    this.scene.add(this.particles);
    
    // 存储粒子参数供动画使用
    this._particleParams = { SEPARATION, AMOUNTX, AMOUNTY };
  }

  /**
   * 创建全息球体
   */
  createHolographicSphere() {
    const THREE = window.THREE;
    
    this.sphereGroup = new THREE.Group();
    this.sphereGroup.position.y = 100;
    this.scene.add(this.sphereGroup);
    
    // A. 核心线框球
    const coreGeo = new THREE.IcosahedronGeometry(140, 2);
    const coreMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      wireframe: true, 
      transparent: true, 
      opacity: 0.25 
    });
    this.coreSphere = new THREE.Mesh(coreGeo, coreMat);
    this.sphereGroup.add(this.coreSphere);
    
    // B. 内部发光核
    const innerGeo = new THREE.IcosahedronGeometry(80, 4);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.08
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    this.sphereGroup.add(innerSphere);
    
    // C. 外部点阵壳
    const shellGeo = new THREE.IcosahedronGeometry(180, 3);
    const shellPos = shellGeo.attributes.position;
    const shellPointsGeo = new THREE.BufferGeometry();
    shellPointsGeo.setAttribute('position', shellPos);
    
    const shellMat = new THREE.PointsMaterial({
      color: 0x888888,
      size: 2,
      transparent: true,
      opacity: 0.5,
      sizeAttenuation: true
    });
    this.outerShell = new THREE.Points(shellPointsGeo, shellMat);
    this.sphereGroup.add(this.outerShell);
    
    // D. 旋转轨道环
    this.createRing(220, 1.5, 16, 100, Math.PI * 2, { x: Math.PI / 2, y: 0, z: 0 });
    this.createRing(250, 1, 16, 100, Math.PI * 2, { x: Math.PI / 3, y: Math.PI / 6, z: 0 });
    this.createRing(280, 1, 16, 100, Math.PI * 2, { x: -Math.PI / 4, y: 0, z: Math.PI / 6 });
    
    // E. 浮动粒子云
    this.createParticleCloud();
  }

  /**
   * 创建单个轨道环
   */
  createRing(radius, tube, radialSegments, tubularSegments, arc, rotation) {
    const THREE = window.THREE;
    
    const ringGeo = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc);
    const ringMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      wireframe: true,
      transparent: true,
      opacity: 0.15
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.set(rotation.x, rotation.y, rotation.z);
    this.sphereGroup.add(ring);
    this.rings.push(ring);
  }

  /**
   * 创建浮动粒子云
   */
  createParticleCloud() {
    const THREE = window.THREE;
    
    const cloudGeo = new THREE.BufferGeometry();
    const cloudCount = 150;
    const cloudPos = new Float32Array(cloudCount * 3);
    
    for (let k = 0; k < cloudCount * 3; k += 3) {
      const r = 240 + Math.random() * 150;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      cloudPos[k] = r * Math.sin(phi) * Math.cos(theta);
      cloudPos[k + 1] = r * Math.sin(phi) * Math.sin(theta);
      cloudPos[k + 2] = r * Math.cos(phi);
    }
    
    cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
    const cloudMat = new THREE.PointsMaterial({
      color: 0x666666,
      size: 1.5,
      transparent: true,
      opacity: 0.35
    });
    const cloud = new THREE.Points(cloudGeo, cloudMat);
    this.sphereGroup.add(cloud);
  }

  /**
   * 设置渲染器
   */
  setupRenderer() {
    const THREE = window.THREE;
    
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true 
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x000000, 1);
    
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * 绑定事件监听
   */
  bindEvents() {
    // 鼠标移动
    this._onMouseMove = this.onMouseMove.bind(this);
    document.addEventListener('mousemove', this._onMouseMove);
    
    // 窗口大小变化
    this._onResize = this.onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    
    // 使用 ResizeObserver 监听容器大小变化
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.onResize());
      this._resizeObserver.observe(this.container);
    }
  }

  /**
   * 鼠标移动事件处理
   */
  onMouseMove(event) {
    const rect = this.container.getBoundingClientRect();
    this.mouseX = event.clientX - rect.left - this.width / 2;
    this.mouseY = event.clientY - rect.top - this.height / 2;
  }

  /**
   * 窗口大小变化事件处理
   */
  onResize() {
    if (!this.container || !this.camera || !this.renderer) return;
    
    this.width = this.container.offsetWidth || 800;
    this.height = this.container.offsetHeight || 600;
    
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  /**
   * 开始动画
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.animate();
  }

  /**
   * 停止动画
   */
  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 动画循环
   */
  animate() {
    if (!this.isRunning) return;
    
    this.animationId = requestAnimationFrame(() => this.animate());
    this.render();
  }

  /**
   * 渲染一帧
   */
  render() {
    if (!this.camera || !this.scene || !this.renderer) return;
    
    // 摄像机跟随鼠标缓慢移动
    this.camera.position.x += (this.mouseX * 0.5 - this.camera.position.x) * 0.015;
    this.camera.position.y += (-this.mouseY * 0.3 + 150 - this.camera.position.y) * 0.015;
    this.camera.lookAt(this.scene.position);
    
    // 粒子波浪动画
    if (this.particles && this._particleParams) {
      const { SEPARATION, AMOUNTX, AMOUNTY } = this._particleParams;
      const positions = this.particles.geometry.attributes.position.array;
      
      let i = 0;
      for (let ix = 0; ix < AMOUNTX; ix++) {
        for (let iy = 0; iy < AMOUNTY; iy++) {
          positions[i + 1] = (Math.sin((ix + this.count) * 0.25) * 40) +
                            (Math.sin((iy + this.count) * 0.4) * 40);
          i += 3;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    
    this.count += 0.08;
    
    // 全息球动画
    if (this.sphereGroup) {
      this.sphereGroup.position.y = 100 + Math.sin(this.count * 0.15) * 15;
      
      if (this.coreSphere) {
        this.coreSphere.rotation.y += 0.004;
        this.coreSphere.rotation.z += 0.002;
      }
      
      if (this.outerShell) {
        this.outerShell.rotation.y -= 0.002;
      }
      
      this.rings.forEach((ring, idx) => {
        ring.rotation.x += 0.0015 * (idx + 1);
        ring.rotation.y += 0.0015 * (idx + 1);
      });
      
      // 鼠标交互
      this.sphereGroup.rotation.x = this.mouseY * 0.0003;
      this.sphereGroup.rotation.y = this.mouseX * 0.0003;
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 显示背景
   */
  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
    this.start();
  }

  /**
   * 隐藏背景
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
    this.stop();
  }

  /**
   * 销毁实例
   */
  destroy() {
    this.stop();
    
    // 移除事件监听
    if (this._onMouseMove) {
      document.removeEventListener('mousemove', this._onMouseMove);
    }
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
    
    // 清理 Three.js 资源
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    
    // 清理场景
    if (this.scene) {
      this.scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.particles = null;
    this.sphereGroup = null;
    this.coreSphere = null;
    this.outerShell = null;
    this.rings = [];
    
    console.log('[PreviewBackground] Destroyed');
  }
}

// 导出到全局
if (typeof window !== 'undefined') {
  window.PreviewBackground = PreviewBackground;
}
