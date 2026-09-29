import { Button, Container, Label, NumericInput } from '@playcanvas/pcui';

import { Events } from '../events';

class ParticlePanel extends Container {
    constructor(events: Events, args = {}) {
        args = {
            ...args,
            id: 'particle-panel',
            hidden: true
        };

        super(args);

        const header = new Label({
            text: 'Particle Effects',
            class: 'particle-panel-header'
        });

        const buttonsContainer = new Container({
            class: 'particle-panel-buttons'
        });

        const effects = [
            { id: 'dissolve', label: 'Dissolve' },
            { id: 'noise', label: 'Noise' },
            { id: 'noiseDissolve', label: 'Noise+Dissolve' },
            { id: 'none', label: 'Reset' }
        ];

        const buttons: Map<string, Button> = new Map();

        for (const effect of effects) {
            const btn = new Button({
                text: effect.label,
                class: 'particle-panel-btn'
            });

            // use DOM click event directly
            btn.dom.addEventListener('click', (e: Event) => {
                e.stopPropagation();
                console.log('[ParticlePanel] clicked:', effect.id);
                if (effect.id === 'none') {
                    events.fire('particle.reset');
                } else {
                    events.fire('particle.trigger', effect.id);
                }
            });

            buttons.set(effect.id, btn);
            buttonsContainer.append(btn);
        }

        // noise frequency slider
        const freqContainer = new Container({
            class: 'particle-panel-slider'
        });

        const freqLabel = new Label({
            text: 'Noise Freq',
            class: 'particle-panel-slider-label'
        });

        const freqInput = new NumericInput({
            min: 0.1,
            max: 20.0,
            value: 10.0,
            step: 0.1,
            precision: 1
        });

        freqInput.on('change', (value: number) => {
            events.fire('particle.setFreq', value);
        });

        freqContainer.append(freqLabel);
        freqContainer.append(freqInput);

        // noise amplitude slider
        const ampContainer = new Container({
            class: 'particle-panel-slider'
        });

        const ampLabel = new Label({
            text: 'Amplitude',
            class: 'particle-panel-slider-label'
        });

        const ampInput = new NumericInput({
            min: 0.01,
            max: 3.0,
            value: 0.1,
            step: 0.01,
            precision: 2
        });

        ampInput.on('change', (value: number) => {
            events.fire('particle.setAmplitude', value);
        });

        ampContainer.append(ampLabel);
        ampContainer.append(ampInput);

        // noise speed slider
        const speedContainer = new Container({
            class: 'particle-panel-slider'
        });

        const speedLabel = new Label({
            text: 'Speed',
            class: 'particle-panel-slider-label'
        });

        const speedInput = new NumericInput({
            min: 0.0,
            max: 3.0,
            value: 0.5,
            step: 0.1,
            precision: 1
        });

        speedInput.on('change', (value: number) => {
            events.fire('particle.setSpeed', value);
        });

        speedContainer.append(speedLabel);
        speedContainer.append(speedInput);

        // noise exponent slider
        const expContainer = new Container({
            class: 'particle-panel-slider'
        });

        const expLabel = new Label({
            text: 'Exponent',
            class: 'particle-panel-slider-label'
        });

        const expInput = new NumericInput({
            min: 0.1,
            max: 5.0,
            value: 1.0,
            step: 0.1,
            precision: 1
        });

        expInput.on('change', (value: number) => {
            events.fire('particle.setExponent', value);
        });

        expContainer.append(expLabel);
        expContainer.append(expInput);

        this.append(header);
        this.append(buttonsContainer);
        this.append(freqContainer);
        this.append(ampContainer);
        this.append(speedContainer);
        this.append(expContainer);

        // stop pointer events from reaching the canvas
        this.dom.addEventListener('pointerdown', (e: Event) => {
            e.stopPropagation();
        });

        // highlight active effect
        events.on('particle.effectChanged', (effect: string) => {
            buttons.forEach((btn, id) => {
                btn.class[id === effect ? 'add' : 'remove']('active');
            });
        });
    }
}

export { ParticlePanel };
