import { Type } from '@wonderlandengine/api';
import { vec3 } from 'gl-matrix';
import { CSMComponent } from './CSMComponent.js';

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
    };

    // property values
    sensitivity!: number;
    requireMouseDown!: number;
    mouseButtonIndex!: number;
    pointerLockOnClick!: number;
    // working values
    currentRotationX!: number;
    currentRotationY!: number;
    origin!: Float32Array;
    parentOrigin!: Float32Array;
    rotationX!: number;
    rotationY!: number;
    mouseDown!: boolean;

    override init() {
        super.init();
        this.currentRotationY = 0;
        this.currentRotationX = 0;
        this.origin = new Float32Array(3);
        this.parentOrigin = new Float32Array(3);
        this.rotationX = 0;
        this.rotationY = 0;
        this.mouseDown = false;
    }

    override start() {
        document.addEventListener('mousemove', (e) => {
            if (this.active && (this.mouseDown || !this.requireMouseDown)) {
                this.rotationY = (-this.sensitivity * e.movementX) / 100;
                this.rotationX = (-this.sensitivity * e.movementY) / 100;

                this.currentRotationX += this.rotationX;
                this.currentRotationY += this.rotationY;

                /* 1.507 = PI/2 = 90° */
                this.currentRotationX = Math.min(1.507, this.currentRotationX);
                this.currentRotationX = Math.max(-1.507, this.currentRotationX);

                this.object.getPositionWorld(this.origin);

                const parent = this.object.parent;
                if (parent !== null) {
                    parent.getPositionWorld(this.parentOrigin);
                    vec3.sub(this.origin, this.origin, this.parentOrigin);
                }

                this.object.resetPositionRotation();
                this.object.rotateAxisAngleRadLocal([1, 0, 0], this.currentRotationX);
                this.object.rotateAxisAngleRadLocal([0, 1, 0], this.currentRotationY);
                this.object.translateLocal(this.origin);
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
            canvas.addEventListener('mousedown', (e): false | void => {
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
            canvas.addEventListener('mouseup', (e) => {
                if (e.button == this.mouseButtonIndex) {
                    this.mouseDown = false;
                    this.setCursorStyle(null);
                }
            });
        }
    }

     override onDeactivate(): void {
         super.onDeactivate();

         this.mouseDown = false;
     }
}