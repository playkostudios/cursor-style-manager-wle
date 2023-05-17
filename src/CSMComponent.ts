import { Component, Type } from '@wonderlandengine/api';

import type { Object3D } from '@wonderlandengine/api';
import { ICursorStyleManager } from './ICursorStyleManager';

/**
 * A Wonderland Engine component that uses a cursor style manager
 */
export abstract class CSMComponent extends Component {
    static override Properties = {
        /** Object with cursor style manager */
        cursorStyleManagerObject: { type: Type.Object },
        /** Component name for cursor style manager */
        cursorStyleManagerName: { type: Type.String, default: 'cursor-style-manager' },
    };

    cursorStyleManagerObject!: Object3D | null;
    cursorStyleManagerName!: string;
    cursorStyleManager!: ICursorStyleManager | null;

    override init() {
        if (this.cursorStyleManagerObject) {
            this.cursorStyleManager = this.cursorStyleManagerObject.getComponent(this.cursorStyleManagerName) as ICursorStyleManager;
        } else {
            this.cursorStyleManager = null;
        }
    }

    setCursorStyle(style: string | null, key?: unknown) {
        if (this.cursorStyleManager) {
            if (key === undefined) {
                key = this;
            }

            if (style) {
                this.cursorStyleManager.setStyle(this, style);
            } else {
                this.cursorStyleManager.clearStyle(this);
            }
        } else {
            if (style) {
                this.engine.canvas.style.cursor = style;
            } else {
                this.engine.canvas.style.cursor = 'initial';
            }
        }
    }
}