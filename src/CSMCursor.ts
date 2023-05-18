import { Property, Emitter } from '@wonderlandengine/api';
import { HitTestLocation } from '@wonderlandengine/components';
import { vec3, mat4 } from 'gl-matrix';

import type { Object3D, InputComponent, ViewComponent, WonderlandEngine, RayHit } from '@wonderlandengine/api';
import type { Cursor, CursorTarget, EventTypes } from '@wonderlandengine/components';
import { CSMComponent } from './CSMComponent';

const tempVec = new Float32Array(3);

/** Global target for Cursor */
class CursorTargetEmitters<T> {
    /** Emitter for events when the target is hovered */
    onHover = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the target is unhovered */
    onUnhover = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the target is clicked */
    onClick = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the cursor moves on the target */
    onMove = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the user pressed the select button on the target */
    onDown = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the user unpressed the select button on the target */
    onUp = new Emitter<[T, Cursor, EventTypes?]>();
    /** Emitter for events when the user scrolls on the target */
    onScroll = new Emitter<[T, Cursor, EventTypes?]>();
}

/**
 * 3D cursor for desktop/mobile/VR.
 *
 * Implements a ray-casting cursor into the scene. To react to
 * clicking/hover/unhover/cursor down/cursor up/move use a
 * [cursor-target](#cursor-target).
 *
 * For VR, the ray is cast in direction of
 * [this.object.getForward()](/jsapi/object/#getforward). For desktop and mobile, the
 * forward vector is inverse-projected to account for where on screen the user clicked.
 *
 * `.globalTarget` can be used to call callbacks for all objects, even those that
 * do not have a cursor target attached, but match the collision group.
 *
 * `.hitTestTarget` can be used to call callbacks WebXR hit test results,
 *
 * See [Animation Example](/showcase/animation).
 */
export class CSMCursor extends CSMComponent {
    static override TypeName = 'csm-cursor';
    static override Properties = {
        ...CSMComponent.Properties,
        /**
         * Collision group for the ray cast. Only objects in this group will be
         * affected by this cursor.
         */
        collisionGroup: Property.int(1),
        /** (optional) Object that visualizes the cursor's ray. */
        cursorRayObject: Property.object(),
        /** Axis along which to scale the `cursorRayObject`. */
        cursorRayScalingAxis: Property.enum(['x', 'y', 'z', 'none'], 'z'),
        /** (optional) Object that visualizes the cursor's hit location. */
        cursorObject: Property.object(),
        /**
         * Handedness for VR cursors to accept trigger events only from
         * respective controller.
         */
        handedness: Property.enum(['input component', 'left', 'right', 'none'], 'input component'),
        /**
         * Mode for raycasting, whether to use PhysX or simple collision
         * components
         */
        rayCastMode: Property.enum(['collision', 'physx'], 'collision'),
        /** Whether to set the CSS style of the mouse cursor on desktop */
        styleCursor: Property.bool(true),
        /**
         * Use WebXR hit-test if available.
         *
         * Attaches a hit-test-location component to the cursorObject, which
         * will be used by the cursor to send events to the hitTestTarget with
         * HitTestResult.
         */
        useWebXRHitTest: Property.bool(false),
        /**
         * Object with view component. If not set, then the object of this
         * component is used
         */
        viewObject: Property.object(),
    };

    static override onRegister(engine: WonderlandEngine) {
        engine.registerComponent(HitTestLocation);
    }

    private _collisionMask = 0;
    private _onDeactivateCallbacks: (() => void)[] = [];
    private _input: InputComponent | null = null;
    private _origin = new Float32Array(3);
    private _cursorObjScale = new Float32Array(3);
    private _direction = new Float32Array(3);
    private _projectionMatrix = new Float32Array(16);
    private _viewComponent: ViewComponent | null = null;
    private _isDown = false;
    private _lastIsDown = false;
    private _arTouchDown = false;

    private _lastPointerPos = new Float32Array(2);

    private _lastCursorPosOnTarget = new Float32Array(3);
    private _cursorRayScale = new Float32Array(3);

    private _hitTestLocation: HitTestLocation | null = null;
    private _hitTestObject: Object3D | null = null;

    private _onSessionStartCallback: ((s: XRSession) => void) | null = null;

    /**
     * Whether the cursor (and cursorObject) is visible, i.e. pointing at an object
     * that matches the collision group
     */
    visible = true;

    /** Maximum distance for the cursor's ray cast */
    maxDistance = 100;

    /** Currently hovered object */
    hoveringObject: Object3D | null = null;

    /** CursorTarget component of the currently hovered object */
    hoveringObjectTarget: CursorTarget | null = null;

    /** Whether the cursor is hovering reality via hit-test */
    hoveringReality = false;

    /**
     * Global target lets you receive global cursor events on any object.
     */
    globalTarget = new CursorTargetEmitters<Object3D>();

    /**
     * Hit test target lets you receive cursor events for "reality", if
     * `useWebXRHitTest` is set to `true`.
     *
     * @example
     * ```js
     * cursor.hitTestTarget.onClick.add((hit, cursor) => {
     *     // User clicked on reality
     * });
     * ```
     */
    hitTestTarget = new CursorTargetEmitters<XRHitTestResult | null>();

    /** World position of the cursor */
    cursorPos = new Float32Array(3);

    collisionGroup!: number;
    cursorRayObject!: Object3D | null;
    cursorRayScalingAxis!: number;
    cursorObject!: Object3D | null;
    handedness!: string;
    rayCastMode!: number;
    styleCursor!: boolean;
    useWebXRHitTest!: boolean;
    viewObject!: Object3D | null;

    _onViewportResize = () => {
        if (!this._viewComponent) {
            return;
        }

        /* Projection matrix will change if the viewport is resized, which will affect the
         * projection matrix because of the aspect ratio. */
        mat4.invert(this._projectionMatrix, this._viewComponent.projectionMatrix);
    };

    override start() {
        this._collisionMask = 1 << this.collisionGroup;

        if (this.handedness as unknown as number == 0) {
            const inputComp = this.object.getComponent('input');
            if (!inputComp) {
                console.warn(
                    'cursor component on object',
                    this.object.name,
                    'was configured with handedness "input component", ' +
                        'but object has no input component.'
                );
            } else {
                this.handedness = inputComp.handedness || 'none';
                this._input = inputComp;
            }
        } else {
            this.handedness = ['left', 'right', 'none'][(this.handedness as unknown as number) - 1];
        }

        if (this.viewObject) {
            this._viewComponent = this.viewObject.getComponent('view');
        } else {
            this._viewComponent = this.object.getComponent('view');
        }

        if (this.useWebXRHitTest) {
            this._hitTestObject = this.engine.scene.addObject(this.object);
            this._hitTestLocation =
                this._hitTestObject.addComponent(HitTestLocation, {
                    scaleObject: false,
                }) ?? null;
        }

        this._onSessionStartCallback = this.setupVREvents.bind(this);
    }

    override onActivate() {
        this.engine.onXRSessionStart.add(this._onSessionStartCallback!);
        this.engine.onResize.add(this._onViewportResize);

        this._setCursorVisibility(true);

        /* If this object also has a view component, we will enable inverse-projected mouse clicks,
         * otherwise just use the objects transformation */
        if (this._viewComponent != null) {
            const canvas = this.engine.canvas;

            const onClick = this.onClick.bind(this);
            const onPointerMove = this.onPointerMove.bind(this);
            const onPointerDown = this.onPointerDown.bind(this);
            const onPointerUp = this.onPointerUp.bind(this);

            canvas.addEventListener('click', onClick);
            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('pointerup', onPointerUp);

            this._onDeactivateCallbacks.push(() => {
                canvas.removeEventListener('click', onClick);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointerup', onPointerUp);
            });
        }

        this._onViewportResize();
    }

    _setCursorRayTransform(hitPosition: vec3) {
        if (!this.cursorRayObject) {
            return;
        }

        const dist = vec3.dist(this._origin, hitPosition);
        this.cursorRayObject.setPositionLocal([0.0, 0.0, -dist / 2]);
        if (this.cursorRayScalingAxis != 4) {
            this.cursorRayObject.resetScaling();
            this._cursorRayScale[this.cursorRayScalingAxis] = dist / 2;
            this.cursorRayObject.scaleLocal(this._cursorRayScale);
        }
    }

    _setCursorVisibility(visible: boolean) {
        if (this.visible == visible) {
            return;
        }

        this.visible = visible;
        if (!this.cursorObject) {
            return;
        }

        if (visible) {
            this.cursorObject.setScalingWorld(this._cursorObjScale);
        } else {
            this.cursorObject.getScalingLocal(this._cursorObjScale);
            this.cursorObject.scaleLocal([0, 0, 0]);
        }
    }

    override update() {
        /* If in VR, set the cursor ray based on object transform */
        /* Since Google Cardboard tap is registered as arTouchDown without a gamepad, we need to check for gamepad presence */
        if (
            this.engine.xr &&
            this._arTouchDown &&
            this._input &&
            this.engine.xr.session.inputSources[0].handedness === 'none' &&
            this.engine.xr.session.inputSources[0].gamepad
        ) {
            /* WebXR AR input */
            const p = this.engine.xr.session.inputSources[0].gamepad.axes;
            /* Screenspace Y is inverted */
            this._direction[0] = p[0];
            this._direction[1] = -p[1];
            this._direction[2] = -1.0;
            this.applyTransformAndProjectDirection();
        } else if (this.engine.xr && this._input && this._input.xrInputSource) {
            /* WebXR VR input */
            this._direction[0] = 0;
            this._direction[1] = 0;
            this._direction[2] = -1.0;
            this.applyTransformToDirection();
        } else if (this._viewComponent) {
            /* Apply potentially changed transform to last stored pointer
             * position */
            this.updateDirection();
        }

        this.rayCast(null, this.engine.xr?.frame);

        if (this.cursorObject) {
            if (
                this.hoveringObject &&
                (this.cursorPos[0] != 0 || this.cursorPos[1] != 0 || this.cursorPos[2] != 0)
            ) {
                this._setCursorVisibility(true);
                this.cursorObject.setPositionWorld(this.cursorPos);
                this._setCursorRayTransform(this.cursorPos);
            } else {
                this._setCursorVisibility(false);
            }
        }
    }

    /* Returns the hovered cursor target, if available */
    private notify(
        event: 'onHover' | 'onUnhover' | 'onClick' | 'onUp' | 'onDown' | 'onMove',
        originalEvent: EventTypes | null
    ) {
        const target = this.hoveringObject;
        if (target) {
            const cursorTarget = this.hoveringObjectTarget;
            if (cursorTarget) {
                cursorTarget[event].notify(target, this as unknown as Cursor, originalEvent ?? undefined);
            }

            this.globalTarget[event].notify(target, this as unknown as Cursor, originalEvent ?? undefined);
        }
    }

    private hoverBehaviour(
        rayHit: RayHit,
        hitTestResult: XRHitTestResult | null,
        doClick: boolean,
        originalEvent: EventTypes | null
    ) {
        /* Old API version does not return null for objects[0] if no hit */
        const hit = !this.hoveringReality && rayHit.hitCount > 0 ? rayHit.objects[0] : null;
        if (hit) {
            if (!this.hoveringObject || !this.hoveringObject.equals(hit)) {
                /* Unhover previous, if exists */
                if (this.hoveringObject) {
                    this.notify('onUnhover', originalEvent);
                }

                /* Hover new object */
                this.hoveringObject = hit;
                this.hoveringObjectTarget = this.hoveringObject.getComponent('cursor-target') as CursorTarget;

                if (this.styleCursor) {
                    this.setCursorStyle('pointer');
                }
                this.notify('onHover', originalEvent);
            }
        } else if (this.hoveringObject) {
            /* Previously hovering object, now hovering nothing */
            this.notify('onUnhover', originalEvent);
            this.hoveringObject = null;
            this.hoveringObjectTarget = null;
            if (this.styleCursor) {
                this.setCursorStyle(null);
            }
        }

        if (this.hoveringObject) {
            /* onDown/onUp for object */
            if (this._isDown !== this._lastIsDown) {
                this.notify(this._isDown ? 'onDown' : 'onUp', originalEvent);
            }

            /* onClick for object */
            if (doClick) {
                this.notify('onClick', originalEvent);
            }
        } else if (this.hoveringReality) {
            /* onDown/onUp for hit test */
            if (this._isDown !== this._lastIsDown) {
                (this._isDown ? this.hitTestTarget.onDown : this.hitTestTarget.onUp).notify(
                    hitTestResult,
                    this as unknown as Cursor,
                    originalEvent ?? undefined
                );
            }

            /* onClick for hit test */
            if (doClick) {
                this.hitTestTarget.onClick.notify(
                    hitTestResult,
                    this as unknown as Cursor,
                    originalEvent ?? undefined
                );
            }
        }

        /* onMove */
        if (hit) {
            if (this.hoveringObject) {
                this.hoveringObject.transformPointInverseWorld(tempVec, this.cursorPos);
            } else {
                tempVec.set(this.cursorPos);
            }

            if (!vec3.equals(this._lastCursorPosOnTarget, tempVec)) {
                this.notify('onMove', originalEvent);
                this._lastCursorPosOnTarget.set(tempVec);
            }
        } else if (this.hoveringReality) {
            if (!vec3.equals(this._lastCursorPosOnTarget, this.cursorPos)) {
                this.hitTestTarget.onMove.notify(
                    hitTestResult,
                    this as unknown as Cursor,
                    originalEvent ?? undefined
                );
                this._lastCursorPosOnTarget.set(this.cursorPos);
            }
        } else {
            this._lastCursorPosOnTarget.set(this.cursorPos);
        }

        this._lastIsDown = this._isDown;
    }

    /**
     * Setup event listeners on session object
     * @param s - WebXR session
     *
     * Sets up 'select' and 'end' events.
     */
    setupVREvents(s: XRSession) {
        if (!s) {
            console.error('setupVREvents called without a valid session');
            return;
        }

        /* If in VR, one-time bind the listener */
        const onSelect = this.onSelect.bind(this);
        s.addEventListener('select', onSelect);
        const onSelectStart = this.onSelectStart.bind(this);
        s.addEventListener('selectstart', onSelectStart);
        const onSelectEnd = this.onSelectEnd.bind(this);
        s.addEventListener('selectend', onSelectEnd);

        this._onDeactivateCallbacks.push(() => {
            if (!this.engine.xr?.session) {
                return;
            }

            s.removeEventListener('select', onSelect);
            s.removeEventListener('selectstart', onSelectStart);
            s.removeEventListener('selectend', onSelectEnd);
        });

        /* After AR session was entered, the projection matrix changed */
        this._onViewportResize();
    }

    override onDeactivate() {
        super.onDeactivate();

        this.engine.onXRSessionStart.remove(this._onSessionStartCallback!);
        this.engine.onResize.remove(this._onViewportResize);

        this._setCursorVisibility(false);
        if (this.hoveringObject) {
            this.notify('onUnhover', null);
        }
        if (this.cursorRayObject) {
            this.cursorRayObject.scaleLocal([0, 0, 0]);
        }

        /* Ensure all event listeners are removed */
        for (const f of this._onDeactivateCallbacks) {
            f();
        }
        this._onDeactivateCallbacks.length = 0;
    }

    override onDestroy() {
        this._hitTestObject?.destroy();
    }

    /** 'select' event listener */
    onSelect(e: XRInputSourceEvent) {
        if (e.inputSource.handedness != this.handedness) {
            return;
        }

        this.rayCast(e, e.frame, true);
    }

    /** 'selectstart' event listener */
    onSelectStart(e: XRInputSourceEvent) {
        this._arTouchDown = true;
        if (e.inputSource.handedness == this.handedness) {
            this._isDown = true;
            this.rayCast(e, e.frame);
        }
    }

    /** 'selectend' event listener */
    onSelectEnd(e: XRInputSourceEvent) {
        this._arTouchDown = false;
        if (e.inputSource.handedness == this.handedness) {
            this._isDown = false;
            this.rayCast(e, e.frame);
        }
    }

    /** 'pointermove' event listener */
    onPointerMove(e: PointerEvent) {
        /* Don't care about secondary pointers */
        if (!e.isPrimary) {
            return;
        }
        this.updateMousePos(e);

        this.rayCast(e, null);
    }

    /** 'click' event listener */
    onClick(e: MouseEvent) {
        this.updateMousePos(e);
        this.rayCast(e, null, true);
    }

    /** 'pointerdown' event listener */
    onPointerDown(e: PointerEvent) {
        /* Don't care about secondary pointers or non-left clicks */
        if (!e.isPrimary || e.button !== 0) {
            return;
        }
        this.updateMousePos(e);
        this._isDown = true;

        this.rayCast(e);
    }

    /** 'pointerup' event listener */
    onPointerUp(e: PointerEvent) {
        /* Don't care about secondary pointers or non-left clicks */
        if (!e.isPrimary || e.button !== 0) {
            return;
        }
        this.updateMousePos(e);
        this._isDown = false;

        this.rayCast(e);
    }

    /**
     * Update mouse position in non-VR mode and raycast for new position
     * @returns @ref WL.RayHit for new position.
     */
    private updateMousePos(e: PointerEvent | MouseEvent) {
        this._lastPointerPos[0] = e.clientX;
        this._lastPointerPos[1] = e.clientY;

        this.updateDirection();
    }

    private updateDirection() {
        const bounds = this.engine.canvas.getBoundingClientRect();
        /* Get direction in normalized device coordinate space from mouse position */
        const left = this._lastPointerPos[0] / bounds.width;
        const top = this._lastPointerPos[1] / bounds.height;
        this._direction[0] = left * 2 - 1;
        this._direction[1] = -top * 2 + 1;
        this._direction[2] = -1.0;

        this.applyTransformAndProjectDirection();
    }

    private applyTransformAndProjectDirection() {
        /* Reverse-project the direction into view space */
        vec3.transformMat4(this._direction, this._direction, this._projectionMatrix);
        vec3.normalize(this._direction, this._direction);
        this.applyTransformToDirection();
    }

    private applyTransformToDirection() {
        vec3.transformQuat(this._direction, this._direction, this.object.getTransformWorld());

        this.object.getPositionWorld(this._origin);
    }

    private rayCast(
        originalEvent: EventTypes | null,
        frame: XRFrame | null = null,
        doClick = false
    ) {
        const rayHit =
            this.rayCastMode == 0
                ? this.engine.scene.rayCast(
                    this._origin,
                    this._direction,
                    this._collisionMask
                )
                : this.engine.physics!.rayCast(
                    this._origin,
                    this._direction,
                    this._collisionMask,
                    this.maxDistance
                );

        let hitResultDistance = Infinity;
        let hitTestResult = null;
        if (this._hitTestLocation?.visible) {
            this._hitTestObject!.getPositionWorld(this.cursorPos);
            hitResultDistance = vec3.distance(
                this.object.getPositionWorld(tempVec),
                this.cursorPos
            );

            hitTestResult = this._hitTestLocation?.getHitTestResults(frame)[0];
        }

        let hoveringReality = false;
        if (rayHit.hitCount > 0) {
            const d = rayHit.distances[0];
            if (hitResultDistance >= d) {
                /* Override cursorPos set by hit test location */
                this.cursorPos.set(rayHit.locations[0]);
            } else {
                hoveringReality = true;
            }
        } else if (hitResultDistance < Infinity) {
            /* cursorPos already set */
        } else {
            this.cursorPos.fill(0);
        }

        if (hoveringReality && !this.hoveringReality) {
            this.hitTestTarget.onHover.notify(hitTestResult, this as unknown as Cursor);
        } else if (!hoveringReality && this.hoveringReality) {
            this.hitTestTarget.onUnhover.notify(hitTestResult, this as unknown as Cursor);
        }
        this.hoveringReality = hoveringReality;

        this.hoverBehaviour(rayHit, hitTestResult, doClick, originalEvent);

        return rayHit;
    }
}
