import { Vec3 } from 'playcanvas';

import { ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

type EffectType = 'none' | 'dissolve' | 'noise' | 'noiseDissolve';

class ParticleEffects {
    private events: Events;
    private scene: Scene;
    private activeEffect: EffectType = 'none';
    private progress = 0;
    private targetProgress = 0;
    private sceneSize = 1;
    private center = new Vec3();
    private animating = false;
    private resetting = false;
    private directControl = false; // true when gesture is driving progress directly
    private elapsedTime = 0; // accumulated time for animated effects like noise
    private noiseFreq = 10.0;
    private noiseAmplitude = 0.1;
    private noiseSpeed = 0;     // was 0.5 — set to 0 to test if "camera moving" is just noise wiggle
    private noiseExponent = 1.0;

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;

        // button-triggered effects
        events.on('particle.trigger', (effect: EffectType) => {
            console.log('[ParticleEffects] trigger:', effect);
            this.directControl = false;
            this.trigger(effect);
        });

        events.on('particle.reset', () => {
            console.log('[ParticleEffects] reset');
            this.directControl = false;
            this.reset();
        });

        // gesture sets the active effect type (without starting animation)
        events.on('particle.setEffect', (effect: EffectType) => {
            this.activeEffect = effect;
            this.ensureSceneInfo();
        });

        // noise parameter controls
        events.on('particle.setFreq', (value: number) => {
            this.noiseFreq = value;
            this.applyUniforms();
        });

        events.on('particle.setAmplitude', (value: number) => {
            this.noiseAmplitude = value;
            this.applyUniforms();
        });

        events.on('particle.setSpeed', (value: number) => {
            this.noiseSpeed = value;
            this.applyUniforms();
        });

        events.on('particle.setExponent', (value: number) => {
            this.noiseExponent = value;
            this.applyUniforms();
        });

        // gesture directly controls progress (continuous)
        events.on('particle.setProgress', (value: number) => {
            this.directControl = true;
            this.progress = value;
            this.animating = true;

            if (this.activeEffect === 'none') {
                this.activeEffect = 'dissolve';
            }
            this.ensureSceneInfo();
            this.applyUniforms();
        });

        scene.app.on('update', (dt: number) => {
            if ((this.activeEffect === 'noise' || this.activeEffect === 'noiseDissolve') && this.animating) {
                this.elapsedTime += dt;
                if (this.directControl) {
                    this.applyUniforms();
                }
            }
            if (!this.directControl) {
                this.update(dt);
            }
        });
    }

    private ensureSceneInfo() {
        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];
        if (splats.length > 0) {
            const bound = splats[0].worldBound;
            const he = bound.halfExtents;
            this.sceneSize = Math.max(he.x, he.y, he.z) * 2;
            this.center.copy(bound.center);
        }
    }

    private trigger(effect: EffectType) {
        if (effect === 'none') {
            this.reset();
            return;
        }

        this.activeEffect = effect;
        this.progress = 0;
        this.resetting = false;
        this.ensureSceneInfo();
        this.animating = true;

        if (effect === 'noise') {
            // noise runs continuously at full strength
            this.progress = 1;
            this.targetProgress = 1;
            this.elapsedTime = 0;
        } else if (effect === 'noiseDissolve') {
            // noise+dissolve: progress animates 0→1 while noise runs continuously
            this.elapsedTime = 0;
            this.targetProgress = 1;
        } else {
            this.targetProgress = 1;
        }

        this.events.fire('particle.effectChanged', effect);
    }

    private reset() {
        this.targetProgress = 0;
        this.resetting = true;
        this.animating = true;
        // keep activeEffect until progress reaches 0 so shader still runs during fade-out
        this.events.fire('particle.effectChanged', 'none');
    }

    private update(dt: number) {
        if (!this.animating) return;

        // noise runs continuously — just update uniforms each frame
        if (this.activeEffect === 'noise' && !this.resetting) {
            this.applyUniforms();
            return;
        }

        // noiseDissolve: keep updating uniforms every frame for time, but also animate progress
        const needsContinuousUpdate = this.activeEffect === 'noiseDissolve';

        const speed = this.resetting ? 3.0 : 1.2;
        const diff = this.targetProgress - this.progress;

        if (Math.abs(diff) < 0.001) {
            this.progress = this.targetProgress;
            if (this.targetProgress === 0) {
                this.animating = false;
                this.activeEffect = 'none';
                this.resetting = false;
                this.elapsedTime = 0;
            }
        } else {
            this.progress += diff * Math.min(1, dt * speed);
        }

        this.applyUniforms();
    }

    private applyUniforms() {
        const effectId = this.getEffectId();
        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];

        for (const splat of splats) {
            if (!splat.entity?.gsplat?.instance) continue;
            const material = splat.entity.gsplat.instance.material;
            material.setParameter('u_particleEffect', effectId);
            material.setParameter('u_particleProgress', this.progress);
            material.setParameter('u_particleCenter', [this.center.x, this.center.y, this.center.z]);
            material.setParameter('u_particleSceneSize', this.sceneSize);
            material.setParameter('u_particleTime', this.elapsedTime);
            material.setParameter('u_particleFreq', this.noiseFreq);
            material.setParameter('u_particleAmplitude', this.noiseAmplitude);
            material.setParameter('u_particleSpeed', this.noiseSpeed);
            material.setParameter('u_particleExponent', this.noiseExponent);
        }

        this.scene.forceRender = true;
    }

    private getEffectId(): number {
        switch (this.activeEffect) {
            case 'dissolve': return 2.0;
            case 'noise': return 3.0;
            case 'noiseDissolve': return 4.0;
            default: return 0.0;
        }
    }
}

export { ParticleEffects };
