import { Type } from '@wonderlandengine/api';
import { quat } from 'gl-matrix';
import { CSMComponent } from './CSMComponent.js';

const TEMP_ROT = new Float32Array(4);
const ROT_MUL = 180 / Math.PI / 100;

/**
 * Similar to the official mouse-look component, but with cursor-style-manager
 * support.
 */
export class CSMMouseLookComponent extends CSMComponent {
    static override TypeName = 'csm-mouse-look';
    static override Properties = {
        // inherit CSMComponent properties
        ...CSMComponent.Properties,
        /** Mouse look sensitivity */
        sensitivity: {type: Type.Float, default: 0.25},
        /** Require a mouse button to be pressed to control view.
         * Otherwise view will allways follow mouse movement */
        requireMouseDown: {type: Type.Bool, default: true},
        /** If "moveOnClick" is enabled, mouse button which should
         * be held down to control view */
        mouseButtonIndex: {type: Type.Int},
        /** Enables pointer lock on "mousedown" event on canvas */
        pointerLockOnClick: {type: Type.Bool, default: false},
        /** Should pointer events be listened to instead of mouse events */
        listenToPointerInsteadOfMouse: {type: Type.Bool, default: false},
    };

    // property values
    sensitivity!: number;
    requireMouseDown!: number;
    mouseButtonIndex!: number;
    pointerLockOnClick!: number;
    listenToPointerInsteadOfMouse!: boolean;
    // working values
    currentRotationX!: number;
    currentRotationY!: number;
    mouseDown!: boolean;

    override init() {
        super.init();
        this.currentRotationY = 0;
        this.currentRotationX = 0;
        this.mouseDown = false;
    }

    override start() {
        document.addEventListener(this.listenToPointerInsteadOfMouse ? 'pointermove' : 'mousemove', (e) => {
            if (this.active && (this.mouseDown || !this.requireMouseDown)) {
                this.currentRotationX += (-this.sensitivity * e.movementY) * ROT_MUL;
                this.currentRotationY += (-this.sensitivity * e.movementX) * ROT_MUL;
                // 89 deg instead of 90 so that there are no camera glitches
                // when looking straight down/up
                this.currentRotationX = Math.max(-89, Math.min(89, this.currentRotationX));
                quat.fromEuler(TEMP_ROT, this.currentRotationX, this.currentRotationY, 0);
                this.object.setRotationLocal(TEMP_ROT);
            }
        });

        const canvas = this.engine.canvas;
        if (this.pointerLockOnClick) {
            canvas.addEventListener('mousedown', () => {
                canvas.requestPointerLock =
                    canvas.requestPointerLock ||
                    (canvas as { mozRequestPointerLock?: CallableFunction }).mozRequestPointerLock ||
                    (canvas as { webkitRequestPointerLock?: CallableFunction }).webkitRequestPointerLock;
                canvas.requestPointerLock();
            });
        }

        if (this.requireMouseDown) {
            if (this.mouseButtonIndex == 2) {
                canvas.addEventListener(
                    'contextmenu',
                    (e) => {
                        e.preventDefault();
                    },
                    false
                );
            }
            canvas.addEventListener(this.listenToPointerInsteadOfMouse ? 'pointerdown' : 'mousedown', (e): false | void => {
                if (e.button == this.mouseButtonIndex && this.active) {
                    this.mouseDown = true;
                    this.setCursorStyle('grabbing');
                    if (e.button == 1) {
                        e.preventDefault();
                        /* Prevent scrolling */
                        return false;
                    }
                }
            });
            canvas.addEventListener(this.listenToPointerInsteadOfMouse ? 'pointerup' : 'mouseup', (e) => {
                if (e.button == this.mouseButtonIndex) {
                    this.mouseUp();
                }
            });
            canvas.addEventListener(this.listenToPointerInsteadOfMouse ? 'pointerleave' : 'mouseleave', (_e) => {
                this.mouseUp();
            });
        }
    }

    override onDeactivate(): void {
        super.onDeactivate();
        this.mouseUp();
    }

    private mouseUp() {
        if (!this.mouseDown) return;
        this.mouseDown = false;
        if (this.requireMouseDown) this.setCursorStyle(null);
    }
}