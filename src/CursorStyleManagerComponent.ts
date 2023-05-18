import { Component, Property } from '@wonderlandengine/api';

import type { ICursorStyleManager } from './ICursorStyleManager';

const ALLOWED_CURSOR_STYLES = [
    'wait',
    'not-allowed',
    'no-drop',
    'copy',
    'alias',
    'move',
    'grabbing',
    'pointer',
    'text',
    'vertical-text',
    'cell',
    'crosshair',
    'col-resize',
    'row-resize',
    'grab',
    'nesw-resize',
    'nwse-resize',
    'ne-resize',
    'nw-resize',
    'se-resize',
    'sw-resize',
    'ew-resize',
    'ns-resize',
    'n-resize',
    'e-resize',
    's-resize',
    'w-resize',
    'progress',
    'context-menu',
    'help',
    'zoom-in',
    'zoom-out',
    'all-scroll',
    'none',
    'default',
    'auto'
];

/**
 * The default cursor style manager implementation. Note that you can create
 * your own manager class, so long as it implements the ICursorStyleManager
 * interface.
 */
export class CursorStyleManagerComponent extends Component implements ICursorStyleManager {
    static override TypeName = 'cursor-style-manager';
    static override Properties = {
        defaultCursorStyle: Property.string('default'),
    };

    requestedPointerStyles!: Array<string>;
    requestedPointerStyleKeys!: Array<unknown>;
    defaultCursorStyle!: string;

    override init() {
        this.requestedPointerStyles = [];
        this.requestedPointerStyleKeys = [];
    }

    cursorStyleHandler(style: string): void {
        this.engine.canvas.style.cursor = style;
    }

    getStyle(key: unknown): string | null {
        const oldIdx = this.requestedPointerStyleKeys.indexOf(key);
        if (oldIdx === -1) {
            return null;
        } else {
            return this.requestedPointerStyles[oldIdx];
        }
    }

    setStyle(key: unknown, style: string): void {
        // remove old pointer style requested by key (unless it's the same or
        // missing)
        let needsUpdate = false;
        const oldStyle = this.requestedPointerStyles[0];
        const oldIdx = this.requestedPointerStyleKeys.indexOf(key);
        if (oldIdx !== -1) {
            if (this.requestedPointerStyles[oldIdx] === style) {
                // already requested
                return;
            }

            this.requestedPointerStyles.splice(oldIdx, 1);
            this.requestedPointerStyleKeys.splice(oldIdx, 1);

            if (oldIdx === 0 && oldStyle !== this.requestedPointerStyles[0]) {
                needsUpdate = true;
            }
        }

        // get priority of wanted pointer style
        const priority = ALLOWED_CURSOR_STYLES.indexOf(style);
        if (priority === -1) {
            console.warn(`Ignored disallowed/invalid cursor style: "${style}"`);
        } else {
            // insert into list before first index with lower priority (lower
            // number means higher priority)
            const len = this.requestedPointerStyles.length;
            let i = 0;
            while (i < len) {
                const oStyle = this.requestedPointerStyles[i];
                const oPriority = ALLOWED_CURSOR_STYLES.indexOf(oStyle);

                if (oPriority > priority) {
                    // lower priority, insert before this index
                    break;
                } else {
                    // higher priority, skip indices until a different pointer
                    // style is found
                    i++;
                    for (; i < len; i++) {
                        if (this.requestedPointerStyles[i] !== oStyle) {
                            break;
                        }
                    }
                }
            }

            this.requestedPointerStyles.splice(i, 0, style);
            this.requestedPointerStyleKeys.splice(i, 0, key);

            if (i === 0 && oldStyle !== this.requestedPointerStyles[0]) {
                needsUpdate = true;
            }
        }

        // update pointer style
        if (needsUpdate) {
            this.cursorStyleHandler(style);
        }
    }

    clearStyle(key: unknown): void {
        const oldStyle = this.requestedPointerStyles[0];

        let idx;
        let hadZeroIdx = false;
        while ((idx = this.requestedPointerStyleKeys.indexOf(key)) !== -1) {
            this.requestedPointerStyles.splice(idx, 1);
            this.requestedPointerStyleKeys.splice(idx, 1);

            if (idx === 0) {
                hadZeroIdx = true;
            }
        }

        const newStyle = this.requestedPointerStyles[0];
        if (hadZeroIdx && oldStyle !== newStyle) {
            this.cursorStyleHandler(newStyle ?? this.defaultCursorStyle);
        }
    }
}
